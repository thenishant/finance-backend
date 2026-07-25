import swaggerJsdoc from "swagger-jsdoc";

const options: swaggerJsdoc.Options = {
    definition: {
        openapi: "3.0.3",
        info: {
            title: "Finance API",
            version: "1.0.0",
            description: "Finance App Backend API",
        },
    },
    apis: [
        "./src/docs/**/*.docs.ts",
    ]
};

export const specs = swaggerJsdoc(options);