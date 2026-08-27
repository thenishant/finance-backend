
export default {
    test: {
        globals: true,
        environment: "node",
        fileParallelism: false,
        setupFiles: [
            "./vitest.setup.ts",
        ],
        include: [
            "src/**/*.test.ts",
        ],
        coverage: {
            provider: "v8",
            reporter: [
                "text",
                "html",
            ],
        },
    },
};
