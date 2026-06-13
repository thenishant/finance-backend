import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET!;

export const generateGoogleState = (userId: string) => {
    return jwt.sign({
        userId, purpose: "gmail-connect",
    }, JWT_SECRET, {
        expiresIn: "10m",
    });
};

export const verifyGoogleState = (state: string) => {
    return jwt.verify(state, JWT_SECRET) as {
        userId: string; purpose: string;
    };
};