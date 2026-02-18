import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import {prisma} from '../../database/prisma';
import {LoginDTO, RegisterDTO} from './auth.dto';

const JWT_SECRET = process.env.JWT_SECRET as string;

export const registerUser = async (data: RegisterDTO) => {
    return prisma.$transaction(async (tx) => {
        const existing = await tx.user.findUnique({
            where: {email: data.email}
        });
        if (existing) {
            throw {status: 400, message: 'Email already registered'};
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

export const loginUser = async (data: LoginDTO) => {
    const user = await prisma.user.findUnique({
        where: {email: data.email}
    });

    if (!user) {
        throw {status: 400, message: 'Invalid credentials'};
    }

    const isMatch = await bcrypt.compare(data.password, user.passwordHash);

    if (!isMatch) {
        throw {status: 400, message: 'Invalid credentials'};
    }

    return generateToken(user.id);
};

const generateToken = (userId: string) => {
    return jwt.sign({userId}, JWT_SECRET, {expiresIn: '7d'});
};

const createDefaultCategories = async (
    tx: any,
    userId: string
) => {

    const expenseCategories = [
        {
            name: "Food",
            children: ["Groceries", "Dining Out"]
        },
        {
            name: "Housing",
            children: ["Rent", "Maintenance"]
        },
        {
            name: "Transport",
            children: ["Fuel", "Taxi"]
        },
        {
            name: "Utilities",
            children: ["Electricity", "Internet"]
        },
        {
            name: "Entertainment",
            children: ["Movies", "Subscriptions"]
        }
    ];

    const incomeCategories = [
        {
            name: "Income",
            children: ["Salary", "Bonus", "Freelance"]
        }
    ];

    for (const cat of expenseCategories) {
        const parent = await tx.category.create({
            data: {
                userId,
                name: cat.name,
                type: "EXPENSE"
            }
        });

        for (const child of cat.children) {
            await tx.category.create({
                data: {
                    userId,
                    name: child,
                    type: "EXPENSE",
                    parentId: parent.id
                }
            });
        }
    }

    for (const cat of incomeCategories) {
        const parent = await tx.category.create({
            data: {
                userId,
                name: cat.name,
                type: "INCOME"
            }
        });

        for (const child of cat.children) {
            await tx.category.create({
                data: {
                    userId,
                    name: child,
                    type: "INCOME",
                    parentId: parent.id
                }
            });
        }
    }
};