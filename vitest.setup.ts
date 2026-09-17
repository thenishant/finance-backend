import {afterAll, afterEach,} from "vitest";

import {cleanupDatabase, cleanupTestUsers,} from "./src/tests/helpers/cleanup";

import {prisma,} from "./src/database/prisma";

afterEach(async () => {
    await cleanupTestUsers();
});

afterAll(async () => {
    await cleanupDatabase();
    await prisma.$disconnect();
});