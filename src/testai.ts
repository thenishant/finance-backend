import {getOpenAI} from "./lib/openai";

async function main() {
    console.log("Testing Groq...");

    const response =
        await getOpenAI().chat.completions.create({
            model:
                process.env.OPENAI_MODEL ??
                "llama-3.3-70b-versatile",

            temperature: 0,

            response_format: {
                type: "json_object",
            },

            messages: [
                {
                    role: "system",
                    content:
                        'Return JSON only: {"merchant":"...","confidence":0.99}',
                },
                {
                    role: "user",
                    content: "MOURYA WINE",
                },
            ],
        });

    console.log(
        response.choices[0]?.message?.content,
    );
}

main().catch(console.error);