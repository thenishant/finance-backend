import {FinancialAccountType} from "@prisma/client";
import {z} from "zod";

export const createFinancialAccountSchema = z.object({
    name: z.string().min(1),
    nickname: z.string().optional(),
    institutionName: z.string().optional(),
    type: z.nativeEnum(FinancialAccountType),
    provider: z.string().optional(),
    last4: z.string().regex(/^\d{4}$/),
    currentBalance: z.number().default(0),
    availableBalance: z.number().optional(),
    creditLimit: z.number().optional()
});

export const updateFinancialAccountSchema = createFinancialAccountSchema.partial();
export type CreateFinancialAccountDTO = z.infer<typeof createFinancialAccountSchema>;
export type UpdateFinancialAccountDTO = z.infer<typeof updateFinancialAccountSchema>;