import cron from "node-cron";

import {renewExpiringGmailWatches} from "./gmail-watch.job";

export const startGmailWatchScheduler = () => {

    console.info("[Gmail] Watch scheduler started");
    //
    // Run once on startup.
    //
    void renewExpiringGmailWatches();
    //
    // Run every day at 03:00 server time.
    //
    cron.schedule("0 3 * * *", () => {
        console.info("[Gmail] Running scheduled watch renewal");
        void renewExpiringGmailWatches();
    });
};