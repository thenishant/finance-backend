import {Category, MerchantMappingSource, TransactionType,} from "@prisma/client";

export interface MerchantCategoryTreeNode {
    id: string;
    name: string;
    type: TransactionType;
    children: MerchantCategoryTreeNode[];
}

export interface MerchantAIResult {
    categoryId: string;
    confidence: number;
    reasoning: string;
}

export interface MerchantCategorizationResult {
    category: Category;
    confidence: number;
    reasoning: string;
    fromCache: boolean;
}

export interface CategorizeMerchantInput {
    userId: string;
    merchantName: string;
    transactionType: TransactionType;
}

export interface UpsertMerchantMappingInput {
    userId: string;
    normalizedName: string;
    displayName?: string | null;
    categoryId: string;
    source: MerchantMappingSource;
    confidence?: number | null;
}