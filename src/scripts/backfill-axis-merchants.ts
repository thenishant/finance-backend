import {
    CategoryAssignmentSource,
    PrismaClient,
    TransactionType,
} from "@prisma/client";

import {categorizeMerchant} from "../modules/merchant/merchant.service";

const prisma = new PrismaClient();

const DRY_RUN = process.argv.includes("--dry-run");

async function main() {
    console.log(
        DRY_RUN
            ? "Running Gmail category backfill in DRY-RUN mode..."
            : "Running Gmail category backfill...",
    );

    /*
     * Find Gmail transactions that:
     *
     * - are Gmail imported
     * - are not transfers
     * - don't have a category yet
     * - have a merchant
     *
     * These are the transactions that should have gone through
     * merchant categorization during ingestion.
     */
    const transactions = await prisma.transaction.findMany({
        where: {
            source: "GMAIL",

            type: {
                not: TransactionType.TRANSFER,
            },

            categoryId: null,

            merchantId: {
                not: null,
            },
        },

        select: {
            id: true,
            userId: true,
            type: true,
            merchantId: true,
            merchantRaw: true,
            merchantNormalized: true,
            categoryId: true,
            categoryAssignmentSource: true,
            aiCategoryConfidence: true,
            gmailMessageId: true,
        },

        orderBy: {
            createdAt: "asc",
        },
    });

    console.log(
        `Found ${transactions.length} Gmail transactions without a category.`,
    );

    if (transactions.length === 0) {
        console.log("Nothing to backfill.");
        return;
    }

    let updated = 0;
    let skipped = 0;
    let failed = 0;

    for (const transaction of transactions) {
        console.log("\n----------------------------------------");
        console.log(`Transaction: ${transaction.id}`);
        console.log(`Gmail message: ${transaction.gmailMessageId}`);
        console.log(`Type: ${transaction.type}`);
        console.log(`Merchant RAW: ${transaction.merchantRaw}`);
        console.log(
            `Merchant normalized: ${transaction.merchantNormalized}`,
        );
        console.log(`Current categoryId: ${transaction.categoryId}`);

        if (!transaction.merchantId) {
            console.log("SKIP: No merchantId.");
            skipped++;
            continue;
        }

        /*
         * Load the merchant.
         */
        const merchant = await prisma.merchant.findUnique({
            where: {
                id: transaction.merchantId,
            },
        });

        if (!merchant) {
            console.log(
                "SKIP: Merchant record no longer exists.",
            );
            skipped++;
            continue;
        }

        console.log(`Merchant: ${merchant.name}`);

        /*
         * Ask the existing categorization system to determine
         * the correct category.
         *
         * This will:
         *
         * 1. Check an existing user merchant mapping.
         * 2. Otherwise call AI.
         * 3. Validate the returned category.
         * 4. Save the merchant mapping.
         */
        try {
            const categorization =
                await categorizeMerchant({
                    userId: transaction.userId,
                    merchant,
                    transactionType: transaction.type,
                });

            if (!categorization.category) {
                console.log(
                    "SKIP: Categorization returned no category.",
                );
                skipped++;
                continue;
            }

            console.log(
                `CATEGORY: ${categorization.category.name}`,
            );

            console.log(
                `CATEGORY ID: ${categorization.category.id}`,
            );

            console.log(
                `SOURCE: ${categorization.categoryAssignmentSource}`,
            );

            console.log(
                `CONFIDENCE: ${categorization.confidence}`,
            );

            if (DRY_RUN) {
                console.log(
                    "DRY-RUN: no database changes made.",
                );

                updated++;
                continue;
            }

            await prisma.transaction.update({
                where: {
                    id: transaction.id,
                },

                data: {
                    categoryId:
                    categorization.category.id,

                    categoryAssignmentSource:
                    categorization.categoryAssignmentSource,

                    aiCategoryConfidence:
                    categorization.confidence,
                },
            });

            console.log(
                "UPDATED: category assigned successfully.",
            );

            updated++;
        } catch (error) {
            failed++;

            console.error(
                "FAILED: Could not categorize transaction.",
            );

            console.error(error);
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