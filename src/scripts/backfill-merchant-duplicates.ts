import {Merchant, MerchantMapping, MerchantMappingSource, Prisma,} from "@prisma/client";

import {prisma} from "../database/prisma";
import {normalizeMerchantName} from "../modules/merchant/merchant.normalizer";

/* -------------------------------------------------------------------------- */
/*                                  Types                                     */
/* -------------------------------------------------------------------------- */

type MerchantWithRelations = Merchant & {
    aliases: {
        id: string;
        alias: string;
        merchantId: string;
        createdAt: Date;
        updatedAt: Date;
    }[];
    _count: {
        transactions: number;
        merchantMappings: number;
    };
};

type MerchantGroup = {
    canonical: MerchantWithRelations;
    duplicates: MerchantWithRelations[];
    reason: string;
};

type MappingCandidate = MerchantMapping & {
    merchantName: string;
};

type BackfillPlan = {
    groups: MerchantGroup[];
};

/* -------------------------------------------------------------------------- */
/*                              Configuration                                 */
/* -------------------------------------------------------------------------- */

const APPLY = process.argv.includes("--apply");

const sourcePriority: Record<
    MerchantMappingSource,
    number
> = {
    USER: 3,
    RULE: 2,
    AI: 1,
};

/*
 * These are legacy merchant values produced by the old UPI parser.
 *
 * Examples:
 *
 *   P2A 624047309652 Deepanshu Sbin Upi
 *   P2A 623545792613 Bajarangi Kumar
 *   P2M 623542742387 Neeraj S
 *   P2M 660615862577 Shakila Thapa
 *
 * We only use this pattern to find an existing canonical merchant.
 * We do NOT create a merchant from the extracted value.
 */
const LEGACY_UPI_PATTERN =
    /^P2[AM]\s+\d{6,}\s+(.+)$/i;

/*
 * QR references such as qr722hgc and q959743413 were previously
 * persisted as merchant names.
 *
 * These are safe to consolidate only when the same exact value
 * already exists as an alias of another merchant.
 */
const QR_REFERENCE_PATTERN =
    /^q(?:r)?\d+[a-z0-9]*$/i;

/* -------------------------------------------------------------------------- */
/*                              Helper Functions                              */
/* -------------------------------------------------------------------------- */

const getMerchantScore = (
    merchant: MerchantWithRelations,
) => {
    const normalized =
        normalizeMerchantName(
            merchant.name,
        );

    const canonicalNameMatch =
        merchant.name === normalized
            ? 1
            : 0;

    const aliasCount =
        merchant.aliases.length;

    const transactionCount =
        merchant._count.transactions;

    const mappingCount =
        merchant._count.merchantMappings;

    return {
        canonicalNameMatch,
        aliasCount,
        transactionCount,
        mappingCount,
        createdAt:
            merchant.createdAt.getTime(),
    };
};

const compareMerchantScore = (
    a: MerchantWithRelations,
    b: MerchantWithRelations,
) => {
    const aScore =
        getMerchantScore(a);

    const bScore =
        getMerchantScore(b);

    if (
        aScore.canonicalNameMatch !==
        bScore.canonicalNameMatch
    ) {
        return (
            bScore.canonicalNameMatch -
            aScore.canonicalNameMatch
        );
    }

    if (
        aScore.aliasCount !==
        bScore.aliasCount
    ) {
        return (
            bScore.aliasCount -
            aScore.aliasCount
        );
    }

    if (
        aScore.transactionCount !==
        bScore.transactionCount
    ) {
        return (
            bScore.transactionCount -
            aScore.transactionCount
        );
    }

    if (
        aScore.mappingCount !==
        bScore.mappingCount
    ) {
        return (
            bScore.mappingCount -
            aScore.mappingCount
        );
    }

    return (
        aScore.createdAt -
        bScore.createdAt
    );
};

const describeMerchant = (
    merchant: MerchantWithRelations,
) => {
    return {
        id: merchant.id,
        name: merchant.name,
        normalized:
            normalizeMerchantName(
                merchant.name,
            ),
        aliases:
            merchant.aliases.map(
                alias => alias.alias,
            ),
        transactions:
        merchant._count.transactions,
        mappings:
        merchant._count.merchantMappings,
        createdAt:
            merchant.createdAt.toISOString(),
    };
};

const getMappingRank = (
    mapping: MappingCandidate,
) => {
    return {
        source:
            sourcePriority[
                mapping.source
                ] ?? 0,

        confidence:
            mapping.confidence ?? 0,

        updatedAt:
            mapping.updatedAt.getTime(),
    };
};

const compareMappings = (
    a: MappingCandidate,
    b: MappingCandidate,
) => {
    const aRank =
        getMappingRank(a);

    const bRank =
        getMappingRank(b);

    if (
        aRank.source !==
        bRank.source
    ) {
        return (
            bRank.source -
            aRank.source
        );
    }

    if (
        aRank.confidence !==
        bRank.confidence
    ) {
        return (
            bRank.confidence -
            aRank.confidence
        );
    }

    return (
        bRank.updatedAt -
        aRank.updatedAt
    );
};

/* -------------------------------------------------------------------------- */
/*                         Legacy UPI Helpers                                 */
/* -------------------------------------------------------------------------- */

const extractLegacyUPICounterparty = (
    merchantName: string,
) => {
    const match =
        merchantName
            .trim()
            .match(
                LEGACY_UPI_PATTERN,
            );

    if (!match) {
        return null;
    }

    const counterparty =
        match[1]
            .replace(
                /\bSBIN\b/gi,
                " ",
            )
            .replace(
                /\bSBN\b/gi,
                " ",
            )
            .replace(
                /\bUPI\b/gi,
                " ",
            )
            .replace(
                /\s+/g,
                " ",
            )
            .trim();

    if (!counterparty) {
        return null;
    }

    return counterparty;
};

const findCanonicalForLegacyUPI = (
    merchant: MerchantWithRelations,
    merchants: MerchantWithRelations[],
) => {
    const counterparty =
        extractLegacyUPICounterparty(
            merchant.name,
        );

    if (!counterparty) {
        return null;
    }

    const normalizedCounterparty =
        normalizeMerchantName(
            counterparty,
        );

    if (!normalizedCounterparty) {
        return null;
    }

    /*
     * Exact normalized match only.
     *
     * This intentionally does not use:
     *
     *   includes()
     *   startsWith()
     *   fuzzy matching
     *   token containment
     */
    return (
        merchants.find(
            candidate => {
                if (
                    candidate.id ===
                    merchant.id
                ) {
                    return false;
                }

                return (
                    normalizeMerchantName(
                        candidate.name,
                    ) ===
                    normalizedCounterparty
                );
            },
        ) ?? null
    );
};

const isSafeQRReferenceAlias = (
    merchant: MerchantWithRelations,
    alias: string,
) => {
    /*
     * Never treat aliases belonging to "Unknown" as
     * deterministic identity evidence.
     */
    if (
        merchant.name
            .trim()
            .toLowerCase() ===
        "unknown"
    ) {
        return false;
    }

    return QR_REFERENCE_PATTERN.test(
        alias.trim(),
    );
};

/* -------------------------------------------------------------------------- */
/*                           Load Merchants                                   */
/* -------------------------------------------------------------------------- */

const loadMerchants =
    async (): Promise<
        MerchantWithRelations[]
    > => {
        return prisma.merchant.findMany({
            include: {
                aliases: true,

                _count: {
                    select: {
                        transactions: true,
                        merchantMappings: true,
                    },
                },
            },

            orderBy: {
                createdAt: "asc",
            },
        });
    };

/* -------------------------------------------------------------------------- */
/*                     Build Normalization Groups                             */
/* -------------------------------------------------------------------------- */

const buildNormalizedGroups = (
    merchants: MerchantWithRelations[],
) => {
    const groups =
        new Map<
            string,
            MerchantWithRelations[]
        >();

    for (const merchant of merchants) {
        const normalized =
            normalizeMerchantName(
                merchant.name,
            );

        if (!normalized) {
            continue;
        }

        const existing =
            groups.get(normalized);

        if (existing) {
            existing.push(merchant);
        } else {
            groups.set(
                normalized,
                [merchant],
            );
        }
    }

    return [...groups.entries()]
        .filter(
            ([, merchants]) =>
                merchants.length > 1,
        )
        .map(
            ([
                 normalized,
                 merchants,
             ]) => ({
                normalized,
                merchants,
            }),
        );
};

/* -------------------------------------------------------------------------- */
/*                Build Safe Alias-Name Collision Groups                      */
/* -------------------------------------------------------------------------- */

const buildAliasCollisionGroups = (
    merchants: MerchantWithRelations[],
) => {
    const merchantByName =
        new Map<
            string,
            MerchantWithRelations
        >();

    for (const merchant of merchants) {
        merchantByName.set(
            merchant.name
                .trim()
                .toLowerCase(),
            merchant,
        );
    }

    const groups =
        new Map<
            string,
            Set<string>
        >();

    for (const merchant of merchants) {
        for (const alias of merchant.aliases) {
            const matched =
                merchantByName.get(
                    alias.alias
                        .trim()
                        .toLowerCase(),
                );

            if (
                !matched ||
                matched.id ===
                merchant.id
            ) {
                continue;
            }

            /*
             * Only QR-style machine references are
             * deterministic enough to merge automatically.
             *
             * This prevents:
             *
             *   Unknown -> Vaishali Kaloniya
             *
             * from being merged.
             */
            if (
                !isSafeQRReferenceAlias(
                    merchant,
                    alias.alias,
                )
            ) {
                continue;
            }

            const ids =
                groups.get(
                    merchant.id,
                ) ??
                new Set<string>();

            ids.add(
                matched.id,
            );

            groups.set(
                merchant.id,
                ids,
            );
        }
    }

    return groups;
};

/* -------------------------------------------------------------------------- */
/*                 Build Legacy UPI Artifact Groups                           */
/* -------------------------------------------------------------------------- */

const buildLegacyUPIGroups = (
    merchants: MerchantWithRelations[],
) => {
    const groups =
        new Map<
            string,
            Set<string>
        >();

    for (const merchant of merchants) {
        const canonical =
            findCanonicalForLegacyUPI(
                merchant,
                merchants,
            );

        if (!canonical) {
            continue;
        }

        /*
         * Never merge into Unknown.
         */
        if (
            canonical.name
                .trim()
                .toLowerCase() ===
            "unknown"
        ) {
            continue;
        }

        const duplicateIds =
            groups.get(
                canonical.id,
            ) ??
            new Set<string>();

        duplicateIds.add(
            merchant.id,
        );

        groups.set(
            canonical.id,
            duplicateIds,
        );
    }

    return groups;
};

/* -------------------------------------------------------------------------- */
/*                         Build Migration Plan                               */
/* -------------------------------------------------------------------------- */

const buildPlan = (
    merchants: MerchantWithRelations[],
): BackfillPlan => {
    const groupsByCanonical =
        new Map<
            string,
            MerchantGroup
        >();

    const merchantById =
        new Map(
            merchants.map(
                merchant => [
                    merchant.id,
                    merchant,
                ],
            ),
        );

    const addDuplicateGroup = (
        canonical: MerchantWithRelations,
        duplicateIds: Set<string>,
        reason: string,
    ) => {
        /*
         * A canonical merchant must never be included
         * as its own duplicate.
         */
        duplicateIds.delete(
            canonical.id,
        );

        if (
            duplicateIds.size ===
            0
        ) {
            return;
        }

        const duplicates =
            [...duplicateIds]
                .map(id =>
                    merchantById.get(id),
                )
                .filter(
                    (
                        merchant,
                    ): merchant is MerchantWithRelations =>
                        Boolean(merchant),
                );

        if (
            duplicates.length ===
            0
        ) {
            return;
        }

        const existing =
            groupsByCanonical.get(
                canonical.id,
            );

        if (!existing) {
            groupsByCanonical.set(
                canonical.id,
                {
                    canonical,
                    duplicates,
                    reason,
                },
            );

            return;
        }

        const existingIds =
            new Set(
                existing.duplicates.map(
                    merchant =>
                        merchant.id,
                ),
            );

        for (const duplicate of duplicates) {
            if (
                duplicate.id !==
                canonical.id &&
                !existingIds.has(
                    duplicate.id,
                )
            ) {
                existing.duplicates.push(
                    duplicate,
                );
            }
        }

        existing.reason +=
            `; ${reason}`;
    };

    /*
     * 1. Merchants that normalize to the same
     * canonical name.
     */
    const normalizedGroups =
        buildNormalizedGroups(
            merchants,
        );

    for (const group of normalizedGroups) {
        const sorted =
            [...group.merchants].sort(
                compareMerchantScore,
            );

        addDuplicateGroup(
            sorted[0],
            new Set(
                sorted
                    .slice(1)
                    .map(
                        merchant =>
                            merchant.id,
                    ),
            ),
            `same normalized name: "${group.normalized}"`,
        );
    }

    /*
     * 2. Safe QR-reference alias collisions.
     *
     * Example:
     *
     *   Paytm
     *     alias: qr722hgc
     *
     *   Qr722hgc
     *
     * Qr722hgc is therefore redundant.
     */
    const aliasCollisionGroups =
        buildAliasCollisionGroups(
            merchants,
        );

    for (
        const [
            merchantId,
            duplicateIds,
        ] of aliasCollisionGroups
        ) {
        const canonical =
            merchantById.get(
                merchantId,
            );

        if (!canonical) {
            continue;
        }

        addDuplicateGroup(
            canonical,
            duplicateIds,
            "safe QR-reference alias collision",
        );
    }

    /*
     * 3. Legacy UPI parser artifacts.
     *
     * Example:
     *
     *   P2A 623545792613 Bajarangi Kumar
     *
     * becomes:
     *
     *   Bajarangi Kumar
     *
     * only when that exact canonical merchant already exists.
     */
    const legacyUPIGroups =
        buildLegacyUPIGroups(
            merchants,
        );

    for (
        const [
            canonicalId,
            duplicateIds,
        ] of legacyUPIGroups
        ) {
        const canonical =
            merchantById.get(
                canonicalId,
            );

        if (!canonical) {
            continue;
        }

        addDuplicateGroup(
            canonical,
            duplicateIds,
            "legacy UPI merchant artifact",
        );
    }

    return {
        groups:
            [...groupsByCanonical.values()]
                .filter(
                    group =>
                        group.duplicates
                            .length > 0,
                ),
    };
};

/* -------------------------------------------------------------------------- */
/*                         Validate Migration Plan                            */
/* -------------------------------------------------------------------------- */

const validatePlan = (
    plan: BackfillPlan,
) => {
    const duplicateIds =
        new Set<string>();

    for (const group of plan.groups) {
        if (
            duplicateIds.has(
                group.canonical.id,
            )
        ) {
            throw new Error(
                `Merchant ${group.canonical.id} appears as a duplicate in another group.`,
            );
        }

        for (const duplicate of group.duplicates) {
            if (
                duplicate.id ===
                group.canonical.id
            ) {
                throw new Error(
                    `Merchant ${duplicate.id} cannot be both canonical and duplicate.`,
                );
            }

            if (
                duplicateIds.has(
                    duplicate.id,
                )
            ) {
                throw new Error(
                    `Merchant ${duplicate.id} appears in multiple migration groups.`,
                );
            }

            duplicateIds.add(
                duplicate.id,
            );
        }
    }

    const canonicalIds =
        new Set(
            plan.groups.map(
                group =>
                    group.canonical.id,
            ),
        );

    for (const duplicateId of duplicateIds) {
        if (
            canonicalIds.has(
                duplicateId,
            )
        ) {
            throw new Error(
                `Merchant ${duplicateId} is both canonical and duplicate. Migration would be ambiguous.`,
            );
        }
    }
};

/* -------------------------------------------------------------------------- */
/*                         Candidate Reporting                                */
/* -------------------------------------------------------------------------- */

type MerchantCandidate = {
    merchant: MerchantWithRelations;
    matchedMerchant: MerchantWithRelations;
    reason: string;
};

const getNormalizedTokens = (
    merchant: MerchantWithRelations,
) =>
    normalizeMerchantName(
        merchant.name,
    )
        .split(" ")
        .filter(Boolean);

const containsTokenSequence = (
    shorter: string[],
    longer: string[],
) => {
    if (
        shorter.length === 0 ||
        shorter.length >= longer.length
    ) {
        return false;
    }

    for (
        let index = 0;
        index <=
        longer.length -
        shorter.length;
        index++
    ) {
        if (
            shorter.every(
                (
                    token,
                    offset,
                ) =>
                    token ===
                    longer[
                    index +
                    offset
                        ],
            )
        ) {
            return true;
        }
    }

    return false;
};

const buildNameContainmentCandidates = (
    merchants: MerchantWithRelations[],
) => {
    const candidates: MerchantCandidate[] =
        [];

    for (
        let index = 0;
        index < merchants.length;
        index++
    ) {
        const first =
            merchants[index];

        const firstNormalized =
            normalizeMerchantName(
                first.name,
            );

        const firstTokens =
            getNormalizedTokens(
                first,
            );

        if (
            firstNormalized.length <
            4
        ) {
            continue;
        }

        for (
            let otherIndex =
                index + 1;
            otherIndex <
            merchants.length;
            otherIndex++
        ) {
            const second =
                merchants[
                    otherIndex
                    ];

            const secondNormalized =
                normalizeMerchantName(
                    second.name,
                );

            const secondTokens =
                getNormalizedTokens(
                    second,
                );

            if (
                secondNormalized.length <
                4
            ) {
                continue;
            }

            if (
                containsTokenSequence(
                    firstTokens,
                    secondTokens,
                )
            ) {
                candidates.push({
                    merchant: first,
                    matchedMerchant:
                    second,
                    reason:
                        "normalized merchant name is contained in another merchant name",
                });
            } else if (
                containsTokenSequence(
                    secondTokens,
                    firstTokens,
                )
            ) {
                candidates.push({
                    merchant: second,
                    matchedMerchant:
                    first,
                    reason:
                        "normalized merchant name is contained in another merchant name",
                });
            }
        }
    }

    return candidates;
};

const buildAliasCandidates = (
    merchants: MerchantWithRelations[],
) => {
    const merchantByName =
        new Map<
            string,
            MerchantWithRelations
        >();

    for (const merchant of merchants) {
        merchantByName.set(
            merchant.name
                .toLowerCase(),
            merchant,
        );
    }

    const candidates: MerchantCandidate[] =
        [];

    for (const merchant of merchants) {
        for (const alias of merchant.aliases) {
            const matched =
                merchantByName.get(
                    alias.alias
                        .toLowerCase(),
                );

            if (
                !matched ||
                matched.id ===
                merchant.id
            ) {
                continue;
            }

            candidates.push({
                merchant,
                matchedMerchant:
                matched,
                reason:
                    `alias "${alias.alias}" exactly matches another merchant name`,
            });
        }
    }

    return candidates;
};

const getCandidateKey = (
    candidate: MerchantCandidate,
) =>
    [
        candidate.merchant.id,
        candidate.matchedMerchant.id,
    ]
        .sort()
        .join(":");

const printCandidateReport = (
    merchants: MerchantWithRelations[],
    deterministicPlan: BackfillPlan,
) => {
    const deterministicIds =
        new Set<string>();

    for (const group of deterministicPlan.groups) {
        deterministicIds.add(
            group.canonical.id,
        );

        for (const duplicate of group.duplicates) {
            deterministicIds.add(
                duplicate.id,
            );
        }
    }

    const candidates = new Map<
        string,
        MerchantCandidate
    >();

    for (const candidate of buildAliasCandidates(
        merchants,
    )) {
        if (
            deterministicIds.has(
                candidate.merchant.id,
            ) &&
            deterministicIds.has(
                candidate.matchedMerchant
                    .id,
            )
        ) {
            continue;
        }

        candidates.set(
            getCandidateKey(candidate),
            candidate,
        );
    }

    for (const candidate of buildNameContainmentCandidates(
        merchants,
    )) {
        if (
            deterministicIds.has(
                candidate.merchant.id,
            ) &&
            deterministicIds.has(
                candidate.matchedMerchant
                    .id,
            )
        ) {
            continue;
        }

        candidates.set(
            getCandidateKey(candidate),
            candidate,
        );
    }

    console.log("");
    console.log(
        "============================================================",
    );
    console.log(
        "MERCHANT DUPLICATE CANDIDATES — REVIEW ONLY",
    );
    console.log(
        "============================================================",
    );

    if (candidates.size === 0) {
        console.log(
            "No additional conservative duplicate candidates found.",
        );
        return;
    }

    console.log(
        `Found ${candidates.size} additional candidate pair(s).`,
    );

    console.log(
        "These candidates are NOT automatically applied.",
    );

    let index = 1;

    for (const candidate of candidates.values()) {
        console.log("");
        console.log(
            `Candidate ${index}: ${candidate.reason}`,
        );

        console.log(
            "  Merchant A:",
        );

        console.log(
            JSON.stringify(
                describeMerchant(
                    candidate.merchant,
                ),
                null,
                2,
            ),
        );

        console.log(
            "  Merchant B:",
        );

        console.log(
            JSON.stringify(
                describeMerchant(
                    candidate.matchedMerchant,
                ),
                null,
                2,
            ),
        );

        index++;
    }
};

/* -------------------------------------------------------------------------- */
/*                           Dry-Run Reporting                                */
/* -------------------------------------------------------------------------- */

const printPlan = (
    plan: BackfillPlan,
) => {
    console.log("");
    console.log(
        "============================================================",
    );

    console.log(
        APPLY
            ? "MERCHANT BACKFILL — APPLY MODE"
            : "MERCHANT BACKFILL — DRY RUN",
    );

    console.log(
        "============================================================",
    );

    if (plan.groups.length === 0) {
        console.log(
            "No deterministic duplicate merchant groups found.",
        );

        return;
    }

    console.log(
        `Found ${plan.groups.length} merchant group(s) to consolidate.`,
    );

    for (
        const [
            index,
            group,
        ] of plan.groups.entries()
        ) {
        console.log("");
        console.log(
            `Group ${index + 1}: ${group.reason}`,
        );

        console.log(
            "  Canonical:",
        );

        console.log(
            JSON.stringify(
                describeMerchant(
                    group.canonical,
                ),
                null,
                2,
            ),
        );

        console.log(
            "  Duplicates:",
        );

        for (const duplicate of group.duplicates) {
            console.log(
                JSON.stringify(
                    describeMerchant(
                        duplicate,
                    ),
                    null,
                    2,
                ),
            );
        }
    }

    console.log("");

    console.log(
        `Canonical merchants: ${plan.groups.length}`,
    );

    console.log(
        `Duplicate merchants: ${plan.groups.reduce(
            (count, group) =>
                count +
                group.duplicates
                    .length,
            0,
        )}`,
    );

    console.log("");

    if (!APPLY) {
        console.log(
            "DRY RUN ONLY — no database changes were made.",
        );

        console.log(
            "Run with --apply to execute this plan.",
        );
    }
};

/* -------------------------------------------------------------------------- */
/*                      Mapping Consolidation                                */
/* -------------------------------------------------------------------------- */

const consolidateMappings = async (
    tx: Prisma.TransactionClient,
    canonical: MerchantWithRelations,
    duplicateIds: string[],
) => {
    const mappings =
        await tx.merchantMapping.findMany({
            where: {
                merchantId: {
                    in: [
                        canonical.id,
                        ...duplicateIds,
                    ],
                },
            },
        });

    if (mappings.length === 0) {
        return;
    }

    const userIds = [
        ...new Set(
            mappings.map(
                mapping =>
                    mapping.userId,
            ),
        ),
    ];

    for (const userId of userIds) {
        const candidates =
            mappings
                .filter(
                    mapping =>
                        mapping.userId ===
                        userId,
                )
                .map(mapping => ({
                    ...mapping,
                    merchantName:
                        mapping.merchantId ===
                        canonical.id
                            ? canonical.name
                            : "duplicate",
                }));

        candidates.sort(
            compareMappings,
        );

        const winner =
            candidates[0];

        if (!winner) {
            continue;
        }

        await tx.merchantMapping.deleteMany(
            {
                where: {
                    merchantId: {
                        in: duplicateIds,
                    },
                    userId,
                },
            },
        );

        await tx.merchantMapping.upsert({
            where: {
                userId_merchantId: {
                    userId,
                    merchantId:
                    canonical.id,
                },
            },

            update: {
                categoryId:
                winner.categoryId,

                source:
                winner.source,

                confidence:
                winner.confidence,
            },

            create: {
                userId,

                merchantId:
                canonical.id,

                categoryId:
                winner.categoryId,

                source:
                winner.source,

                confidence:
                winner.confidence,
            },
        });
    }
};

/* -------------------------------------------------------------------------- */
/*                         Alias Consolidation                                */
/* -------------------------------------------------------------------------- */

const consolidateAliases = async (
    tx: Prisma.TransactionClient,
    canonical: MerchantWithRelations,
    duplicates: MerchantWithRelations[],
) => {
    const duplicateIds =
        duplicates.map(
            merchant =>
                merchant.id,
        );

    const duplicateAliases =
        await tx.merchantAlias.findMany({
            where: {
                merchantId: {
                    in: duplicateIds,
                },
            },
        });

    if (
        duplicateAliases.length ===
        0
    ) {
        return;
    }

    const canonicalAliases =
        await tx.merchantAlias.findMany({
            where: {
                merchantId:
                canonical.id,
            },
        });

    const canonicalAliasNames =
        new Set(
            canonicalAliases.map(
                alias =>
                    alias.alias,
            ),
        );

    for (const alias of duplicateAliases) {
        if (
            alias.alias ===
            canonical.name
        ) {
            await tx.merchantAlias.delete({
                where: {
                    id: alias.id,
                },
            });

            continue;
        }

        if (
            canonicalAliasNames.has(
                alias.alias,
            )
        ) {
            await tx.merchantAlias.delete({
                where: {
                    id: alias.id,
                },
            });

            continue;
        }

        await tx.merchantAlias.update({
            where: {
                id: alias.id,
            },

            data: {
                merchantId:
                canonical.id,
            },
        });

        canonicalAliasNames.add(
            alias.alias,
        );
    }
};

/* -------------------------------------------------------------------------- */
/*                       Transaction Consolidation                            */
/* -------------------------------------------------------------------------- */

const consolidateTransactions = async (
    tx: Prisma.TransactionClient,
    canonical: MerchantWithRelations,
    duplicateIds: string[],
) => {
    if (duplicateIds.length === 0) {
        return 0;
    }

    const result =
        await tx.transaction.updateMany(
            {
                where: {
                    merchantId: {
                        in: duplicateIds,
                    },
                },

                data: {
                    merchantId:
                    canonical.id,
                },
            },
        );

    return result.count;
};

/* -------------------------------------------------------------------------- */
/*                         Merchant Consolidation                             */
/* -------------------------------------------------------------------------- */

const consolidateGroup = async (
    tx: Prisma.TransactionClient,
    group: MerchantGroup,
) => {
    const duplicateIds =
        group.duplicates.map(
            merchant =>
                merchant.id,
        );

    const transactionsMoved =
        await consolidateTransactions(
            tx,
            group.canonical,
            duplicateIds,
        );

    /*
     * MerchantMapping uses onDelete: NoAction,
     * therefore mappings must be consolidated before
     * duplicate merchants are deleted.
     */
    await consolidateMappings(
        tx,
        group.canonical,
        duplicateIds,
    );

    await consolidateAliases(
        tx,
        group.canonical,
        group.duplicates,
    );

    const deleted =
        await tx.merchant.deleteMany({
            where: {
                id: {
                    in: duplicateIds,
                },
            },
        });

    return {
        transactionsMoved,
        merchantsDeleted:
        deleted.count,
    };
};

/* -------------------------------------------------------------------------- */
/*                             Main Migration                                 */
/* -------------------------------------------------------------------------- */

const run = async () => {
    console.log(
        APPLY
            ? "Running merchant backfill in APPLY mode..."
            : "Running merchant backfill in DRY-RUN mode...",
    );

    const merchants =
        await loadMerchants();

    console.log(
        `Loaded ${merchants.length} merchants.`,
    );

    const plan =
        buildPlan(merchants);

    validatePlan(plan);

    printPlan(plan);

    /*
     * Always show conservative candidates during dry-run.
     *
     * These remain review-only unless a future migration rule
     * explicitly makes them deterministic.
     */
    if (!APPLY) {
        printCandidateReport(
            merchants,
            plan,
        );
    }

    if (
        !APPLY ||
        plan.groups.length === 0
    ) {
        return;
    }

    console.log("");
    console.log(
        "Applying merchant consolidation...",
    );

    let totalTransactionsMoved = 0;
    let totalMerchantsDeleted = 0;

    await prisma.$transaction(
        async tx => {
            for (const group of plan.groups) {
                console.log("");
                console.log(
                    `Consolidating "${group.canonical.name}"...`,
                );

                const result =
                    await consolidateGroup(
                        tx,
                        group,
                    );

                totalTransactionsMoved +=
                    result.transactionsMoved;

                totalMerchantsDeleted +=
                    result.merchantsDeleted;

                console.log(
                    `  Transactions moved: ${result.transactionsMoved}`,
                );

                console.log(
                    `  Merchants deleted: ${result.merchantsDeleted}`,
                );
            }
        },
        {
            maxWait: 10_000,
            timeout: 60_000,
        },
    );

    console.log("");
    console.log(
        "============================================================",
    );
    console.log(
        "MERCHANT BACKFILL COMPLETE",
    );
    console.log(
        "============================================================",
    );

    console.log(
        `Transactions moved: ${totalTransactionsMoved}`,
    );

    console.log(
        `Duplicate merchants deleted: ${totalMerchantsDeleted}`,
    );
};

/* -------------------------------------------------------------------------- */
/*                                Execute                                     */
/* -------------------------------------------------------------------------- */

run()
    .catch(error => {
        console.error("");
        console.error(
            "Merchant backfill failed.",
        );
        console.error(error);

        process.exitCode = 1;
    })
    .finally(async () => {
        await prisma.$disconnect();
    });