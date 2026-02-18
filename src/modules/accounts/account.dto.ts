import {z} from 'zod';

export const createAccountSchema = z.object({
    name: z.string().min(1),
    type: z.enum(['SAVING', 'CURRENT', 'INVESTMENT']),
    balance: z.number().nonnegative()
});

export type CreateAccountDTO = z.infer<typeof createAccountSchema>;