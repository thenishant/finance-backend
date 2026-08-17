import {addHours} from "date-fns";

import {prisma} from "../../database/prisma";
import {startGmailWatch} from "../../modules/email/gmail/watch/watch.service";

export const renewExpiringGmailWatches = async () => {

    const renewBefore =
        addHours(new Date(), 24);

    console.info("[Gmail] Renewing watches expiring before", {
        renewBefore,
    });

    const accounts =
        await prisma.gmailAccount.findMany({
            where: {
                watchExpiresAt: {
                    lte: renewBefore,
                },
            },
            orderBy: {
                watchExpiresAt: "asc",
            },
        });

    console.info(
        `[Gmail] Found ${accounts.length} watch(s) to renew`,
    );

    if (accounts.length === 0) {
        return;
    }

    await Promise.allSettled(
        accounts.map(async account => {

            console.info("[Gmail] Renewing watch", {
                email: account.email,
                expiresAt: account.watchExpiresAt,
            });

            try {

                await startGmailWatch(account);

                console.info("[Gmail] Watch renewed", {
                    email: account.email,
                });

            } catch (error) {

                console.error("[Gmail] Failed to renew watch", {
                    email: account.email,
                    error,
                });

            }

        }),
    );

};