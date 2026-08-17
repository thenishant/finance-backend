import app from "./app";
import {startGmailWatchScheduler} from "./job/gmail/gmail-watch.scheduler";

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    startGmailWatchScheduler();
});