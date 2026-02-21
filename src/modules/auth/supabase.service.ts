import jwt from "jsonwebtoken";
import jwksClient from "jwks-rsa";

const client = jwksClient({
    jwksUri: `${process.env.SUPABASE_URL}/auth/v1/.well-known/jwks.json`,
});

function getKey(header: any, callback: any) {
    client.getSigningKey(header.kid, function (err, key) {
        if (err) {
            return callback(err);
        }

        const signingKey = key?.getPublicKey();
        callback(null, signingKey);
    });
}

export const verifySupabaseToken = (token: string): Promise<any> => {
    return new Promise((resolve, reject) => {
        jwt.verify(
            token,
            getKey,
            {algorithms: ["ES256"]},
            (err, decoded) => {
                if (err) return reject(err);
                resolve(decoded);
            }
        );
    });
};