import { streamChat } from "./application/chat-service";
import { SSE_HEADERS } from "./http/sse";
import type { ChatRequest, Env, ModeKey } from "./types";

function json(data: unknown, status = 200, extraHeaders: HeadersInit = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...extraHeaders },
  });
}

function allowedOrigin(request: Request): string | null {
  const origin = request.headers.get("Origin");
  if (!origin) return null;
  const requestOrigin = new URL(request.url).origin;
  if (origin === requestOrigin) return origin;
  const allowList = ["http://localhost:4173", "http://127.0.0.1:4173", "http://localhost:8787", "http://127.0.0.1:8787"];
  return allowList.includes(origin) ? origin : null;
}

function corsHeaders(request: Request): HeadersInit {
  const origin = allowedOrigin(request);
  return origin
    ? { "Access-Control-Allow-Origin": origin, "Access-Control-Allow-Methods": "GET,POST,OPTIONS", "Access-Control-Allow-Headers": "Content-Type", Vary: "Origin" }
    : {};
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
    const cors = corsHeaders(request);
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
        return new Response(stream, { status: 200, headers: { ...SSE_HEADERS, ...cors, "Access-Control-Allow-Credentials": "true" } });
      } catch (error) {
        return json({ error: error instanceof Error ? error.message : String(error) }, 400, cors);
      }
    }

    if (url.pathname.startsWith("/api/")) return json({ error: "Not Found" }, 404, cors);

    return env.ASSETS.fetch(request);
  },
};
