import jwt from "jsonwebtoken";
import {gmail_v1, google} from "googleapis";
import {prisma} from "../../../database/prisma";

const JWT_SECRET = process.env.JWT_SECRET!;
export const GMAIL_QUERY = "from:alerts@axis.bank.in newer_than:30d";
export const GOOGLE_SCOPES: string[] = [
    "openid",
    "email",
    "profile",
    "https://www.googleapis.com/auth/gmail.readonly",
];

export const generateGoogleState = (userId: string,) => {
    return jwt.sign({
            userId,
            purpose: "gmail-connect",
        },
        JWT_SECRET, {
            expiresIn: "10m",
        },
    );
};

export const verifyGoogleState = (state: string) => {
    return jwt.verify(state, JWT_SECRET) as {
        userId: string;
        purpose: string;
    };
};

export const createGoogleClient = () => {
    return new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID!,
        process.env.GOOGLE_CLIENT_SECRET!,
        process.env.GOOGLE_REDIRECT_URI!,
    );
};

export const createGmailClient = (refreshToken: string,): gmail_v1.Gmail => {
    console.info("[Gmail] Creating client", {
        hasRefreshToken: !!refreshToken,
        refreshTokenPrefix: refreshToken?.slice(0, 12),
        refreshTokenLength: refreshToken?.length,
    });

    const client = createGoogleClient();
    client.setCredentials({
        refresh_token: refreshToken,
    });

    console.info("[Google] Credentials set", {
        credentials: {
            hasRefreshToken: !!client.credentials.refresh_token,
            hasAccessToken: !!client.credentials.access_token,
        },
    });

    client.on("tokens", (tokens) => {
        console.info("[Google] Tokens refreshed", {
            hasAccessToken: !!tokens.access_token,
            hasRefreshToken: !!tokens.refresh_token,
            expiry: tokens.expiry_date,
        });

        // Optional:
        // Persist new access token / refresh token here if Google rotates them.
    });

    return google.gmail({
        version: "v1",
        auth: client,
    });
};

export const getConnectedGmailAccount = async (userId: string,) => {
    const account =
        await prisma.gmailAccount.findUnique({
            where: {
                userId,
            },
        });

    if (!account) {
        throw new Error("Gmail account not connected",);
    }

    return account;
};