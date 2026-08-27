import {afterAll, afterEach, beforeAll} from "vitest";
import {
    cleanupDatabase,
    cleanupTestUsers,
} from "./src/tests/helpers/cleanup";
import {prisma} from "./src/database/prisma";

// beforeAll(async () => {
//     await cleanupDatabase();
// });
//
// afterEach(async () => {
//     await cleanupTestUsers();
// });
//
// afterAll(async () => {
//     await cleanupDatabase();
//     await prisma.$disconnect();
// });
