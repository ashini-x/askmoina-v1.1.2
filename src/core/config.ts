import type { Env, ModeConfig, ModeKey } from "../types";

export const DEFAULT_MODEL = "openai/gpt-oss-120b";
export const MAX_PROMPT_CHARS = 2000;
export const MAX_HISTORY_MESSAGES = 40;

export const MODE_CONFIG: Record<ModeKey, ModeConfig> = {
  logical: { temp: 0.0, effort: "high" },
  auto: { temp: 0.3, effort: "medium" },
  creative: { temp: 0.7, effort: "low" },
};

export function getModel(env: Env): string {
  return env.PRIMARY_MODEL || DEFAULT_MODEL;
}

export function currentDateTime(): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    weekday: "long",
    month: "long",
    day: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
    timeZoneName: "short",
  }).format(new Date());
}
