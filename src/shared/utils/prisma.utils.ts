import {Prisma} from "@prisma/client";

const serializeValue = (value: unknown): unknown => {
    if (value instanceof Prisma.Decimal) {
        return value.toNumber();
    }

    if (value instanceof Date) {
        return value.toISOString();
    }

    if (Array.isArray(value)) {
        return value.map(serializeValue);
    }

    if (value !== null && typeof value === "object") {
        return Object.fromEntries(
            Object.entries(value).map(([key, nestedValue]) => [
                key,
                serializeValue(nestedValue),
            ]),
        );
    }

    return value;
};

export const serialize = <T>(obj: T): T =>
    serializeValue(obj) as T;