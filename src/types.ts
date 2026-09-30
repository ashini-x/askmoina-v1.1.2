export type ModeKey = "logical" | "auto" | "creative";
export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

export interface Env {
  ASSETS: { fetch(request: Request): Promise<Response> };
  GROQ_API_KEY: string;
  E2B_API_KEY: string;
  PRIMARY_MODEL?: string;
  LIVE_SEARCH_ALWAYS_ON?: string;
  SANDBOX_ALWAYS_ON?: string;
}

export interface ChatRequest {
  prompt: string;
  mode?: ModeKey;
  messages?: Array<{ role: "user" | "assistant"; content: string }>;
}

export interface ModeConfig {
  temp: number;
  effort: "low" | "medium" | "high";
}
