import {Category, CategoryAssignmentSource, Merchant, TransactionType,} from "@prisma/client";

/* -------------------------------------------------------------------------- */
/*                             Merchant Resolution                            */

/* -------------------------------------------------------------------------- */

export interface MerchantAIResponse {
    merchant: string;
    confidence: number;
}

export interface MerchantResolveResult {
    merchant: Merchant;
    normalizedName: string;
    confidence: number;
    fromCache: boolean;
}

/* -------------------------------------------------------------------------- */
/*                           Merchant Categorization                          */

/* -------------------------------------------------------------------------- */

export interface MerchantCategoryTreeNode {
    id: string;
    name: string;
    type: TransactionType;
    children: MerchantCategoryTreeNode[];
}

export interface MerchantCategoryOption {
    id: string;
    name: string;
    path: string;
    type: TransactionType;
}

export interface MerchantAIResult {
    categoryId: string;
    confidence: number;
    reasoning: string;
}

export interface MerchantCategorizationResult {
    merchant: Merchant;
    category: Category;
    confidence: number;
    reasoning: string;
    fromCache: boolean;
    categoryAssignmentSource: CategoryAssignmentSource;
}

/* -------------------------------------------------------------------------- */
/*                                   Inputs                                   */

/* -------------------------------------------------------------------------- */

export interface CategorizeMerchantInput {
    userId: string;
    merchant: Merchant;
    transactionType: TransactionType;
}
