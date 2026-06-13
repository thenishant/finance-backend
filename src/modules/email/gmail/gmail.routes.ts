import {Router} from "express";
import {getGmailStatus, googleCallback, processExistingEmails, syncGmail, testParser} from "./gmail.controller";
import {authenticate} from "../../../shared/middleware/auth.middleware";
import {getGoogleUrl} from "../../auth/auth.controller";

const router = Router();
router.get("/google/url", authenticate, getGoogleUrl);
router.get("/google/callback", googleCallback);
router.get("/status", authenticate, getGmailStatus);
router.post("/sync", authenticate, syncGmail);
router.post("/process-existing", authenticate, processExistingEmails);
router.get("/test-parser/:gmailMessageId", authenticate, testParser);
export default router;