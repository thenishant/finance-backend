import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import {prisma} from "../../database/prisma";
import {LoginDTO, RegisterDTO} from "./auth.dto";
import {Prisma, TransactionType} from "@prisma/client";

const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
    throw new Error("JWT_SECRET is not defined in environment variables");
}

/* =====================================================
   REGISTER
===================================================== */

export const registerUser = async (data: RegisterDTO) => {
    return prisma.$transaction(async (tx) => {

        const existing = await tx.user.findUnique({
            where: {email: data.email}
        });

        if (existing) {
            throw {status: 400, message: "Email already registered"};
        }

        const passwordHash = await bcrypt.hash(data.password, 10);

        const user = await tx.user.create({
            data: {
                email: data.email,
                passwordHash
            }
        });

        await createDefaultCategories(tx, user.id);

        return generateToken(user.id);
    });
};

/* =====================================================
   LOGIN
===================================================== */

export const loginUser = async (data: LoginDTO) => {
    const user = await prisma.user.findUnique({
        where: {email: data.email}
    });

    if (!user || !user.passwordHash) {
        throw {status: 400, message: "Invalid credentials"};
    }

    const isMatch = await bcrypt.compare(
        data.password,
        user.passwordHash
    );

    if (!isMatch) {
        throw {status: 400, message: "Invalid credentials"};
    }

    return generateToken(user.id);
};

/* =====================================================
   JWT
===================================================== */

const generateToken = (userId: string) => {
    return jwt.sign(
        {userId},
        JWT_SECRET as string,
        {expiresIn: "7d"}
    );
};

/* =====================================================
   DEFAULT CATEGORY CREATION
===================================================== */

const createDefaultCategories = async (
    tx: Prisma.TransactionClient,
    userId: string
) => {

    const defaultCategories: Record<
        TransactionType,
        { name: string; children: string[] }[]
    > = {
        EXPENSE: [
            {name: "Food", children: ["Groceries", "Dining Out"]},
            {name: "Housing", children: ["Rent", "Maintenance"]},
            {name: "Transport", children: ["Fuel", "Taxi"]},
            {name: "Utilities", children: ["Electricity", "Internet"]},
            {name: "Entertainment", children: ["Movies", "Subscriptions"]}
        ],
        INCOME: [
            {name: "Income", children: ["Salary", "Bonus", "Freelance"]}
        ],
        TRANSFER: [],
        INVESTMENT: []
    };

    for (const type of Object.keys(defaultCategories) as TransactionType[]) {

        const categories = defaultCategories[type];

        for (const cat of categories) {

            const parent = await tx.category.create({
                data: {
                    userId,
                    name: cat.name,
                    type
                }
            });

            if (cat.children.length > 0) {
                await tx.category.createMany({
                    data: cat.children.map(child => ({
                        userId,
                        name: child,
                        type,
                        parentId: parent.id
                    })),
                    skipDuplicates: true
                });
            }
        }
    }
};