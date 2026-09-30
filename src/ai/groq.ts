import type { ChatMessage, Env, ModeConfig } from "../types";
import { getAuditPrompt, getSystemPrompt } from "../prompts/system-prompts";
import { getModel } from "../core/config";

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";

function headers(env: Env): HeadersInit {
  return {
    Authorization: `Bearer ${env.GROQ_API_KEY}`,
    "Content-Type": "application/json",
  };
}

async function postGroq(env: Env, body: unknown): Promise<Response> {
  return fetch(GROQ_URL, {
    method: "POST",
    headers: headers(env),
    body: JSON.stringify(body),
  });
}

function extractContent(payload: any): string {
  return String(payload?.choices?.[0]?.message?.content || "");
}

export async function runTier1Synthesis(
  env: Env,
  searchContext: string,
  history: ChatMessage[],
  mode: ModeConfig,
): Promise<string> {
  const messages: ChatMessage[] = [{ role: "system", content: getSystemPrompt() }];
  if (searchContext) {
    messages.push({ role: "system", content: `Live Web Grounding Context:\n${searchContext}` });
  }
  messages.push(...history.filter((m) => m.role === "user" || m.role === "assistant"));

  const response = await postGroq(env, {
    model: getModel(env),
    messages,
    temperature: mode.temp,
    reasoning_effort: mode.effort,
    top_p: 0.9,
    max_tokens: 4096,
    stream: false,
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Groq Tier 1 error (${response.status}): ${detail.slice(0, 500)}`);
  }

  return extractContent(await response.json());
}

export async function runTier2AuditStream(
  env: Env,
  prompt: string,
  draft: string,
  sandboxFeedback: string,
): Promise<Response> {
  return postGroq(env, {
    model: getModel(env),
    messages: [
      { role: "system", content: getAuditPrompt() },
      {
        role: "user",
        content: `User Prompt: ${prompt}\n\nDraft Answer:\n${draft}${sandboxFeedback}`,
      },
    ],
    temperature: 0.1,
    max_tokens: 4096,
    stream: true,
  });
}
