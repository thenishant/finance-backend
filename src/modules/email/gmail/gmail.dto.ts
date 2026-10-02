import {z} from "zod";

export const syncGmailSchema = z.object({
    maxResults: z.coerce.number().int().min(1).max(100).optional(),
    pageToken: z.string().trim().min(1).optional(),
    days: z.coerce.number().int().min(1).max(30).optional(),
});

export interface RecentImportDTO {
    id: string;
    merchant: string;
    category: string | null;
    amount: number;
    date: string;
}

export type SyncGmailDTO = z.infer<typeof syncGmailSchema>;
