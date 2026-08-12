export const cleanEmailBody = (body: string): string => {

    return body
        // Remove style/script completely
        .replace(/<style[\s\S]*?<\/style>/gi, " ")
        .replace(/<script[\s\S]*?<\/script>/gi, " ")

        // Remove HTML comments
        .replace(/<!--[\s\S]*?-->/g, " ")

        // Remove CSS @media blocks that Gmail sometimes inlines
        .replace(/@media[\s\S]*?\}/gi, " ")

        // Remove all remaining HTML tags
        .replace(/<\/(?:p|div|tr|td|li|br|h[1-6])\s*>/gi, " ")
        .replace(/<br\s*\/?>/gi, " ")
        .replace(/<[^>]+>/g, " ")

        // Decode common entities
        .replace(/&nbsp;/gi, " ")
        .replace(/&amp;/gi, "&")
        .replace(/&lt;/gi, "<")
        .replace(/&gt;/gi, ">")
        .replace(/&#39;/gi, "'")
        .replace(/&quot;/gi, '"')

        // Remove CSS leftovers
        .replace(/\{[^}]*\}/g, " ")

        // Collapse whitespace
        .replace(/\r/g, " ")
        .replace(/\n/g, " ")
        .replace(/\t/g, " ")
        .replace(/\s+/g, " ")
        .trim();
};