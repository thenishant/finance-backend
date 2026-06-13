export enum BankProvider {
    AXIS = "AXIS", HDFC = "HDFC", SBI = "SBI", UNKNOWN = "UNKNOWN"
}

export const detectBankProvider = (sender?: string | null): BankProvider => {

    const from = sender?.toLowerCase() ?? "";

    if (from.includes("alerts@axis.bank.in")) {
        return BankProvider.AXIS;
    }

    if (from.includes("hdfcbank.bank.in")) {
        return BankProvider.HDFC;
    }

    if (from.includes("alerts.sbi.bank.in")) {
        return BankProvider.SBI;
    }

    return BankProvider.UNKNOWN;
};