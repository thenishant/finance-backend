import OpenAI from "openai";

// export const openai = new OpenAI({
//     apiKey: process.env.OPENAI_API_KEY,
// });

console.log("GROQ_API_KEY:", process.env.GROQ_API_KEY ? "FOUND" : "MISSING");

export const openai = new OpenAI({
    apiKey: process.env.GROQ_API_KEY,
    baseURL: "https://api.groq.com/openai/v1",
});