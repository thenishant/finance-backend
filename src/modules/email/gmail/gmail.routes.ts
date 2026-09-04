import {Router} from "express";
import {
    disconnectGmail,
    getGmailStatus,
    getGoogleUrl,
    getRecentImports,
    googleCallback,
    startWatch,
    syncGmail,
} from "./gmail.controller";
import {authenticate} from "../../../shared/middleware/auth.middleware";
import {gmailWebhook} from "./webhook/webhook.controller";

const router = Router();

// Public routes
router.get("/callback", googleCallback);
router.post("/webhook", gmailWebhook);

// Protected routes
router.use(authenticate);
router.post("/connect", getGoogleUrl);
router.get("/status", getGmailStatus);
router.post("/sync", syncGmail);
router.delete("/disconnect", disconnectGmail);
router.post("/watch", startWatch);
router.get("/recentImport", getRecentImports);

export default router;