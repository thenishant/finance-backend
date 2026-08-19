export class GmailReconnectRequiredError extends Error {
    constructor() {
        super("Gmail authorization has expired. Please reconnect your Gmail account.",);
        this.name = "GmailReconnectRequiredError";
    }
}