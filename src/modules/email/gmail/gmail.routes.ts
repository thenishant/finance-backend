import {Router} from "express";
import {
    disconnectGmail,
    getGmailStatus,
    getGoogleUrl,
    googleCallback,
    processExistingEmails,
    purgeStoredEmails,
    startWatch,
    syncGmail
} from "./gmail.controller";
import {authenticate} from "../../../shared/middleware/auth.middleware";
import {gmailWebhook} from "./webhook/webhook.controller";

const router = Router();
router.get("/url", authenticate, getGoogleUrl);
router.get("/callback", googleCallback);
router.get("/status", authenticate, getGmailStatus);
router.post("/sync", authenticate, syncGmail);
router.post("/process-existing", authenticate, processExistingEmails);
router.delete("/stored-messages", authenticate, purgeStoredEmails);
router.delete("/disconnect", authenticate, disconnectGmail);
router.post("/watch", authenticate, startWatch);
router.post("/webhook", authenticate, gmailWebhook);
export default router;
