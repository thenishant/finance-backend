export enum BankProvider {
    AXIS = "AXIS",
    HDFC = "HDFC",
    SBI = "SBI",
    UNKNOWN = "UNKNOWN",
}

const BANK_SENDERS = {
    AXIS: "alerts@axis.bank.in",
    HDFC: "hdfcbank.bank.in",
    SBI: "alerts.sbi.bank.in",
} as const;

export const detectBankProvider = (
    sender?: string | null,
): BankProvider => {
    const normalizedSender = sender?.toLowerCase() ?? "";

    if (normalizedSender.includes(BANK_SENDERS.AXIS)) {
        return BankProvider.AXIS;
    }

    if (normalizedSender.includes(BANK_SENDERS.HDFC)) {
        return BankProvider.HDFC;
    }

    if (normalizedSender.includes(BANK_SENDERS.SBI)) {
        return BankProvider.SBI;
    }

    return BankProvider.UNKNOWN;
};