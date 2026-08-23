import {prisma} from "../database/prisma";
import {resolveTransactionMerchant} from "../modules/merchant/merchant.service";

async function main() {
    const transactions = await prisma.transaction.findMany({
        where: {
            merchantRaw: {
                not: null,
            },
        },
        orderBy: {
            createdAt: "asc",
        },
    });

    console.log(`Found ${transactions.length} transactions`);

    let updated = 0;
    let skipped = 0;
    let failed = 0;

    for (const transaction of transactions) {
        try {
            console.log(
                `Processing ${transaction.id} -> ${transaction.merchantRaw}`,
            );

            const result = await resolveTransactionMerchant({
                userId: transaction.userId,
                merchantRaw: transaction.merchantRaw,
                transactionType: transaction.type,
                shouldCategorize: transaction.categoryId == null,
            });

            await prisma.transaction.update({
                where: {
                    id: transaction.id,
                },
                data: {
                    merchantId: result.merchantId,

                    categoryId:
                        transaction.categoryId ??
                        result.categoryId,

                    categoryAssignmentSource:
                        transaction.categoryId
                            ? transaction.categoryAssignmentSource
                            : result.categoryAssignmentSource,

                    aiCategoryConfidence:
                        transaction.aiCategoryConfidence ??
                        result.confidence,
                },
            });

            updated++;

            console.log(
                `✓ ${transaction.merchantRaw} -> ${result.merchant?.name}`,
            );
        } catch (error) {
            failed++;

            console.error(
                `✗ Failed ${transaction.id}`,
                error,
            );
        }
    }

    console.log("");

    console.log("========== DONE ==========");

    console.log(`Updated : ${updated}`);
    console.log(`Skipped : ${skipped}`);
    console.log(`Failed  : ${failed}`);
}

main()
    .catch(console.error)
    .finally(async () => {
        await prisma.$disconnect();
    });