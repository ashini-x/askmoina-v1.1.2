import { streamChat } from "./application/chat-service";
import { SSE_HEADERS } from "./http/sse";
import type { ChatRequest, Env, ModeKey } from "./types";

function json(data: unknown, status = 200, extraHeaders: HeadersInit = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...extraHeaders },
  });
}

function corsHeaders(): HeadersInit {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
  };
}

async function readChatRequest(request: Request): Promise<ChatRequest> {
  const body = await request.json() as Record<string, unknown>;
  const prompt = typeof body.prompt === "string" ? body.prompt : "";
  const rawMode = typeof body.mode === "string" ? body.mode : "auto";
  const mode = (["logical", "auto", "creative"] as const).includes(rawMode as ModeKey) ? rawMode as ModeKey : "auto";
  const messages = Array.isArray(body.messages) ? body.messages : [];
  return {
    prompt,
    mode,
    messages: messages.slice(-40).map((item: any) => ({
      role: item?.role === "assistant" ? "assistant" : "user",
      content: String(item?.content || "").slice(0, 12000),
    })),
  };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const cors = corsHeaders();
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });

    const url = new URL(request.url);

    if (url.pathname === "/api/v1/health" && request.method === "GET") {
      return json({ status: "ok", service: "askmoina", model: env.PRIMARY_MODEL || "openai/gpt-oss-120b" }, 200, cors);
    }

    if (url.pathname === "/api/v1/chat/stream" && request.method === "POST") {
      try {
        const body = await readChatRequest(request);
        const stream = streamChat(env, {
          prompt: body.prompt,
          mode: body.mode || "auto",
          messages: [
            ...(body.messages || []).map((m) => ({ role: m.role, content: m.content })),
            { role: "user", content: body.prompt },
          ],
        }, request.signal);
        return new Response(stream, {
          status: 200,
          headers: {
            ...SSE_HEADERS,
            ...cors,
          },
        });
      } catch (error) {
        return json({ error: error instanceof Error ? error.message : String(error) }, 400, cors);
      }
    }

    if (url.pathname.startsWith("/api/")) return json({ error: "Not Found" }, 404, cors);

    return env.ASSETS.fetch(request);
  },
};
