import {Router} from "express";
import {
    getGmailStatus,
    getGoogleUrl,
    googleCallback,
    processExistingEmails,
    purgeStoredEmails,
    syncGmail
} from "./gmail.controller";
import {authenticate} from "../../../shared/middleware/auth.middleware";

const router = Router();
router.get("/url", authenticate, getGoogleUrl);
router.get("/callback", googleCallback);
router.get("/status", authenticate, getGmailStatus);
router.post("/sync", authenticate, syncGmail);
router.post("/process-existing", authenticate, processExistingEmails);
router.delete("/stored-messages", authenticate, purgeStoredEmails);
export default router;
