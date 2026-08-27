import app from "./app";
import {startGmailWatchScheduler,} from "./job/gmail/gmail-watch.scheduler";

const PORT = Number(process.env.PORT) || 3000;
console.log(`[ENV] ${process.env.APP_ENV ?? "unknown"}`,);

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    startGmailWatchScheduler();
});