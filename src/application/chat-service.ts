import { runTier1Synthesis, runTier2AuditStream } from "../ai/groq";
import { MAX_HISTORY_MESSAGES, MAX_PROMPT_CHARS, MODE_CONFIG } from "../core/config";
import { sanitizeInput } from "../security/guardrails";
import { runPythonSandbox } from "../tools/sandbox";
import { webSearch } from "../tools/search";
import { sseEvent } from "../http/sse";
import type { ChatMessage, Env, ModeKey } from "../types";

const PYTHON_BLOCK = /```python\s*([\s\S]*?)```/i;

export interface ChatInput {
  prompt: string;
  messages: ChatMessage[];
  mode: ModeKey;
}

function emit(controller: ReadableStreamDefaultController<Uint8Array>, event: string, data: unknown, encoder: TextEncoder): void {
  controller.enqueue(encoder.encode(sseEvent(event, data)));
}

function rateLimitMessage(error: unknown): boolean {
  const text = String(error instanceof Error ? error.message : error).toLowerCase();
  return text.includes("429") || text.includes("rate") || text.includes("quota") || text.includes("limit");
}

function extractGroqStreamContent(frame: string): { text: string; done: boolean } {
  let text = "";
  let done = false;
  for (const line of frame.split(/\r?\n/)) {
    if (!line.startsWith("data:")) continue;
    const payload = line.slice(5).trim();
    if (!payload) continue;
    if (payload === "[DONE]") {
      done = true;
      continue;
    }
    try {
      const parsed = JSON.parse(payload);
      const delta = parsed?.choices?.[0]?.delta?.content;
      if (typeof delta === "string") text += delta;
    } catch {
      // Ignore malformed/non-JSON SSE frames; the upstream stream may include keepalive data.
    }
  }
  return { text, done };
}

export function streamChat(env: Env, input: ChatInput, signal?: AbortSignal): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const heartbeat = setInterval(() => {
        try { emit(controller, "ping", { ts: Date.now() }, encoder); } catch { /* stream closed */ }
      }, 15000);

      try {
        if (signal?.aborted) throw new Error("Request cancelled.");
        const cleanPrompt = sanitizeInput(input.prompt);
        if (!cleanPrompt) throw new Error("Prompt is empty.");
        if (cleanPrompt.length > MAX_PROMPT_CHARS) {
          throw new Error(`Prompt exceeds the ${MAX_PROMPT_CHARS}-character limit.`);
        }

        const history = input.messages
          .filter((message) => message.role === "user" || message.role === "assistant")
          .slice(-MAX_HISTORY_MESSAGES)
          .map((message) => ({ role: message.role, content: String(message.content).slice(0, 12000) })) as ChatMessage[];
        const mode = MODE_CONFIG[input.mode] || MODE_CONFIG.auto;

        emit(controller, "phase", { phase: "initializing", label: "Initializing AskMoina Engine" }, encoder);
        emit(controller, "phase", { phase: "searching", label: "Indexing Real-Time Knowledge Base" }, encoder);
        const searchContext = await webSearch(cleanPrompt, 3);

        if (signal?.aborted) throw new Error("Request cancelled.");
        emit(controller, "phase", { phase: "synthesizing", label: "Synthesizing Neural Reasoning" }, encoder);
        const draft = await runTier1Synthesis(env, searchContext, history, mode);

        let sandboxFeedback = "";
        const codeMatch = draft.match(PYTHON_BLOCK);
        if (codeMatch) {
          emit(controller, "phase", { phase: "sandbox", label: "Performing Sandbox Verification" }, encoder);
          const sandbox = await runPythonSandbox(codeMatch[1].trim(), env.E2B_API_KEY);
          if (sandbox.status === "success") {
            if (sandbox.stdout) sandboxFeedback = `\n\n[SANDBOX RUNTIME OUTPUT]:\n${sandbox.stdout}`;
          } else {
            sandboxFeedback = `\n\n[CRITICAL SANDBOX ERROR]: The code threw an exception during execution:\n${sandbox.stderr}\nPlease rewrite and fix the code.`;
          }
        }

        if (signal?.aborted) throw new Error("Request cancelled.");
        emit(controller, "phase", { phase: "auditing", label: "Executing Precision Audit" }, encoder);
        let audit: Response | null = null;
        try {
          audit = await runTier2AuditStream(env, cleanPrompt, draft, sandboxFeedback);
          if (!audit.ok) throw new Error(`Groq Tier 2 error (${audit.status})`);
        } catch (error) {
          if (rateLimitMessage(error)) throw error;
          audit = null;
        }

        let emittedDelta = false;
        if (audit?.body) {
          const reader = audit.body.getReader();
          const decoder = new TextDecoder();
          let sseBuffer = "";
          try {
            while (true) {
              if (signal?.aborted) {
                await reader.cancel();
                throw new Error("Request cancelled.");
              }
              const { value, done } = await reader.read();
              if (done) break;
              if (!value) continue;

              sseBuffer += decoder.decode(value, { stream: true });
              while (true) {
                const boundary = /\r?\n\r?\n/.exec(sseBuffer);
                if (!boundary || boundary.index == null) break;
                const frame = sseBuffer.slice(0, boundary.index);
                sseBuffer = sseBuffer.slice(boundary.index + boundary[0].length);
                const parsed = extractGroqStreamContent(frame);
                if (parsed.text) {
                  emittedDelta = true;
                  emit(controller, "delta", { text: parsed.text }, encoder);
                }
                if (parsed.done) break;
              }
            }
            sseBuffer += decoder.decode();
            if (sseBuffer.trim()) {
              const parsed = extractGroqStreamContent(sseBuffer);
              if (parsed.text) {
                emittedDelta = true;
                emit(controller, "delta", { text: parsed.text }, encoder);
              }
            }
          } catch (error) {
            if (rateLimitMessage(error)) throw error;
            emittedDelta = false;
          } finally {
            reader.releaseLock();
          }
        }

        if (!emittedDelta) {
          emit(controller, "replace", { text: draft }, encoder);
        }

        emit(controller, "complete", { fallback: !emittedDelta }, encoder);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const status = message.toLowerCase().includes("rate") || message.includes("429") ? 429 : 500;
        emit(controller, "error", { message, status }, encoder);
      } finally {
        clearInterval(heartbeat);
        try { controller.close(); } catch { /* already closed */ }
      }
    },
  });
}
