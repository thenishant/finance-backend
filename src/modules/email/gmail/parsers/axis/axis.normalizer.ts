export const normalizeAxisText = (
    value?: string | null,
): string => {
    if (!value) {
        return "";
    }

    return value
        .replace(/\r/g, "")
        .replace(/\u00a0/g, " ")
        .replace(/\u200B/g, "")
        .replace(/\t/g, " ")
        .replace(/[ ]+/g, " ")
        .trim();
};

export const normalizeAxisSubject = (
    value?: string | null,
): string => {
    return normalizeAxisText(value)
        .toLowerCase();
};