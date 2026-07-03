import OpenAI from "openai";
import { COMPANY_SYSTEM_PROMPT } from "@/lib/system-prompt";

let _openai: OpenAI | null = null;

function getOpenAI() {
  if (!_openai) {
    _openai = new OpenAI({
      baseURL: "https://openrouter.ai/api/v1",
      apiKey: process.env.OPENROUTER_API_KEY || process.env.OPENAI_API_KEY,
    });
  }
  return _openai;
}

export async function getAIResponse(
  messages: { role: "user" | "assistant"; content: string }[]
) {
  const completion = await getOpenAI().chat.completions.create({
    model: process.env.AI_MODEL || "anthropic/claude-sonnet-4-20250514",
    messages: [
      {
        role: "system",
        content: COMPANY_SYSTEM_PROMPT,
      },
      ...messages,
    ],
  });

  return completion.choices[0]?.message?.content || "Sorry, I couldn't generate a response.";
}
