const FORBIDDEN_PATTERNS = [
  /ignore all previous instructions/i,
  /you are now DAN/i,
  /override system prompt/i,
  /bypass security filters/i,
];

export function sanitizeInput(prompt: string): string {
  for (const pattern of FORBIDDEN_PATTERNS) {
    if (pattern.test(prompt)) {
      throw new Error("Security Guardrail Triggered: Adversarial prompt input flagged.");
    }
  }
  return prompt.trim();
}
