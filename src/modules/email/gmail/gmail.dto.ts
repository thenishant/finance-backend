import {z} from "zod";

export const syncGmailSchema = z.object({
    maxResults: z.coerce.number().int().min(1).max(100).optional(),
    pageToken: z.string().trim().min(1).optional()
});

export type SyncGmailDTO = z.infer<typeof syncGmailSchema>;
