export const cleanEmailBody = (body: string): string => {

    return body
        .replace(/\r/g, " ")
        .replace(/\n/g, " ")
        .replace(/\t/g, " ")
        .replace(/\s+/g, " ")
        .trim();
};