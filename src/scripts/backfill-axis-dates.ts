import {PrismaClient} from "@prisma/client";

const prisma = new PrismaClient();

const DRY_RUN = process.argv.includes("--dry-run");

const fixes = [
    {
        transactionId:
            "xxx",
        correctDate:
            new Date("2026-08-30T17:21:42+05:30"),
    }
];

async function main() {
    console.log(
        DRY_RUN
            ? "Running Axis date backfill in DRY-RUN mode..."
            : "Running Axis date backfill...",
    );

    for (const fix of fixes) {
        const transaction =
            await prisma.transaction.findUnique({
                where: {
                    id: fix.transactionId,
                },
                select: {
                    id: true,
                    userId: true,
                    source: true,
                    gmailMessageId: true,
                    date: true,
                    year: true,
                    month: true,
                },
            });

        if (!transaction) {
            console.log(
                `SKIP: Transaction not found: ${fix.transactionId}`,
            );
            continue;
        }

        console.log("\n----------------------------------------");
        console.log(`Transaction: ${transaction.id}`);
        console.log(`Gmail message: ${transaction.gmailMessageId}`);
        console.log(`Source: ${transaction.source}`);
        console.log(`OLD DATE: ${transaction.date.toISOString()}`);
        console.log(
            `OLD YEAR/MONTH: ${transaction.year}/${transaction.month}`,
        );
        console.log(
            `NEW DATE: ${fix.correctDate.toISOString()}`,
        );
        console.log("NEW YEAR/MONTH: 2026/8");

        if (transaction.source !== "GMAIL") {
            console.log("SKIP: Transaction is not Gmail sourced.");
            continue;
        }

        if (DRY_RUN) {
            console.log(
                "DRY-RUN: no database changes made.",
            );
            continue;
        }

        await prisma.transaction.update({
            where: {
                id: transaction.id,
            },
            data: {
                date: fix.correctDate,
                year: fix.correctDate.getFullYear(),
                month: fix.correctDate.getMonth() + 1,
            },
        });

        console.log("UPDATED.");
    }

    console.log("\nDate backfill complete.");
}

main()
    .catch(error => {
        console.error("Date backfill failed:");
        console.error(error);
        process.exitCode = 1;
    })
    .finally(async () => {
        await prisma.$disconnect();
    });