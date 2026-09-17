import jwt from "jsonwebtoken";
import {gmail_v1, google} from "googleapis";

import {prisma} from "../../../database/prisma";

const JWT_SECRET = process.env.JWT_SECRET!;

export const GMAIL_QUERY = "{from:alerts@axis.bank.in from:alerts@hdfcbank.bank.in}";

export const GOOGLE_SCOPES = [
    "openid",
    "email",
    "profile",
    "https://www.googleapis.com/auth/gmail.readonly",
];

const GOOGLE_STATE_PURPOSE = "gmail-connect";
const GOOGLE_STATE_EXPIRATION = "10m";

const GMAIL_BACKFILL_OVERLAP_MS =
    24 * 60 * 60 * 1000;

interface GoogleStatePayload {
    userId: string;
    purpose: string;
}

/**
 * Builds the Gmail search query used for transaction imports.
 *
 * When `since` is provided, Gmail messages from slightly before
 * that timestamp are included to avoid missing transactions that
 * sit exactly on the sync boundary.
 */
export const buildGmailQuery = (
    since?: Date | null,
): string => {
    if (!since) {
        return GMAIL_QUERY;
    }

    const backfillFrom = new Date(
        since.getTime() -
        GMAIL_BACKFILL_OVERLAP_MS,
    );

    const unixTimestamp = Math.floor(
        backfillFrom.getTime() / 1000,
    );

    return `${GMAIL_QUERY} after:${unixTimestamp}`;
};

export const generateGoogleState = (
    userId: string,
): string =>
    jwt.sign(
        {
            userId,
            purpose: GOOGLE_STATE_PURPOSE,
        },
        JWT_SECRET,
        {
            expiresIn:
            GOOGLE_STATE_EXPIRATION,
        },
    );

export const verifyGoogleState = (
    state: string,
): GoogleStatePayload => {
    const payload = jwt.verify(
        state,
        JWT_SECRET,
    ) as GoogleStatePayload;

    if (
        payload.purpose !==
        GOOGLE_STATE_PURPOSE
    ) {
        throw new Error(
            "Invalid Google OAuth state",
        );
    }

    if (!payload.userId) {
        throw new Error(
            "Invalid Google OAuth state",
        );
    }

    return payload;
};

export const createGoogleClient = () =>
    new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID!,
        process.env.GOOGLE_CLIENT_SECRET!,
        process.env.GOOGLE_REDIRECT_URI!,
    );

export const createGmailClient = (
    refreshToken: string,
): gmail_v1.Gmail => {
    console.info("[Gmail] Creating client", {
        hasRefreshToken:
            Boolean(refreshToken),
    });

    const client = createGoogleClient();

    client.setCredentials({
        refresh_token: refreshToken,
    });

    return google.gmail({
        version: "v1",
        auth: client,
    });
};

export const getConnectedGmailAccount =
    async (userId: string) => {
        const account =
            await prisma.gmailAccount.findUnique({
                where: {
                    userId,
                },
            });

        if (!account) {
            throw new Error(
                "Gmail account not connected",
            );
        }

        return account;
    };