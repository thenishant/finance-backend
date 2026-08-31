import {CategoryAssignmentSource, PrismaClient, TransactionType,} from "@prisma/client";

import {resolveTransactionMerchant} from "../modules/merchant/merchant.service";

const prisma = new PrismaClient();

const DRY_RUN = process.argv.includes("--dry-run");

async function main() {
    console.log(
        DRY_RUN
            ? "Running Gmail category backfill in DRY-RUN mode..."
            : "Running Gmail category backfill...",
    );

    const transactions =
        await prisma.transaction.findMany({
            where: {
                source: "GMAIL",
                categoryId: null,
            },
            orderBy: {
                createdAt: "asc",
            },
            select: {
                id: true,
                userId: true,
                type: true,
                merchantRaw: true,
                merchantNormalized: true,
                categoryId: true,
                categoryAssignmentSource: true,
                aiCategoryConfidence: true,
                gmailMessageId: true,
            },
        });

    console.log(
        `Found ${transactions.length} Gmail transactions without a category.`,
    );

    let updated = 0;
    let skipped = 0;
    let failed = 0;

    for (const transaction of transactions) {
        console.log("\n----------------------------------------");
        console.log(
            `Transaction: ${transaction.id}`,
        );
        console.log(
            `Gmail message: ${transaction.gmailMessageId}`,
        );
        console.log(`Type: ${transaction.type}`);
        console.log(
            `Merchant RAW: ${transaction.merchantRaw}`,
        );
        console.log(
            `Merchant normalized: ${transaction.merchantNormalized}`,
        );
        console.log(
            `Assignment source: ${transaction.categoryAssignmentSource}`,
        );

        /*
         * Transfers intentionally do not have categories.
         */
        if (
            transaction.type ===
            TransactionType.TRANSFER
        ) {
            console.log(
                "SKIP: Transfer transactions do not have categories.",
            );
            skipped++;
            continue;
        }

        /*
         * Never override a USER assignment.
         *
         * This should normally not occur with categoryId = null,
         * but we preserve USER authority rather than asking AI.
         */
        if (
            transaction.categoryAssignmentSource ===
            CategoryAssignmentSource.USER
        ) {
            console.log(
                "SKIP: USER assignment source. Will investigate separately.",
            );
            skipped++;
            continue;
        }

        if (!transaction.merchantRaw) {
            console.log(
                "SKIP: No merchantRaw available.",
            );
            skipped++;
            continue;
        }

        try {
            const result =
                await resolveTransactionMerchant({
                    userId: transaction.userId,
                    merchantRaw:
                    transaction.merchantRaw,
                    transactionType:
                    transaction.type,
                    shouldCategorize: true,
                    requireCategory: true,
                });

            if (!result.categoryId) {
                console.log(
                    "SKIP: Merchant could not be categorized.",
                );
                skipped++;
                continue;
            }

            console.log(
                `MERCHANT: ${result.merchant?.name ?? "Unknown"}`,
            );

            console.log(
                `CATEGORY: ${result.category?.name ?? "Unknown"}`,
            );

            console.log(
                `CATEGORY ID: ${result.categoryId}`,
            );

            console.log(
                `SOURCE: ${result.categoryAssignmentSource}`,
            );

            console.log(
                `CONFIDENCE: ${result.confidence}`,
            );

            if (DRY_RUN) {
                console.log(
                    "DRY-RUN: no transaction changes made.",
                );
                updated++;
                continue;
            }

            await prisma.transaction.update({
                where: {
                    id: transaction.id,
                },
                data: {
                    merchantId:
                    result.merchantId,
                    merchantRaw:
                    result.merchantRaw,
                    merchantNormalized:
                    result.merchantNormalized,
                    categoryId:
                    result.categoryId,
                    categoryAssignmentSource:
                    result.categoryAssignmentSource,
                    aiCategoryConfidence:
                    result.confidence,
                },
            });

            console.log("UPDATED.");
            updated++;
        } catch (error) {
            failed++;

            console.error(
                "FAILED:",
                error instanceof Error
                    ? error.message
                    : error,
            );
        }
    }

    console.log("\n========================================");
    console.log("Backfill complete.");
    console.log(`Found:   ${transactions.length}`);
    console.log(`Updated: ${updated}`);
    console.log(`Skipped: ${skipped}`);
    console.log(`Failed:  ${failed}`);
    console.log("========================================");
}

main()
    .catch(error => {
        console.error("Backfill failed:");
        console.error(error);
        process.exitCode = 1;
    })
    .finally(async () => {
        await prisma.$disconnect();
    });