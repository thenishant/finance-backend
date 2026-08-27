import {Prisma} from "@prisma/client";

export const serialize = <T>(obj: T): T =>
    JSON.parse(
        JSON.stringify(obj, (_, v) =>
            v instanceof Prisma.Decimal ? v.toNumber() : v
        )
    ) as T;
