import { Sandbox } from "@e2b/code-interpreter";

export interface SandboxResult {
  status: "success" | "error";
  stdout: string;
  stderr: string;
}

export async function runPythonSandbox(code: string, apiKey: string): Promise<SandboxResult> {
  if (!apiKey) {
    return { status: "error", stdout: "", stderr: "E2B_API_KEY missing from Worker secrets." };
  }

  let sandbox: Sandbox | null = null;
  try {
    sandbox = await Sandbox.create({ apiKey });
    const execution = await sandbox.runCode(code);
    let stdout = "";
    if (execution.logs?.stdout?.length) stdout += execution.logs.stdout.join("\n");
    if (execution.text) stdout += `${stdout ? "\n" : ""}${execution.text}`;
    for (const result of execution.results || []) {
      if (result?.text) stdout += `${stdout ? "\n" : ""}${result.text}`;
    }
    if (execution.error) {
      return {
        status: "error",
        stdout: stdout.trim(),
        stderr: `${execution.error.name || "ExecutionError"}: ${execution.error.value || "Unknown error"}`,
      };
    }
    return { status: "success", stdout: stdout.trim(), stderr: "" };
  } catch (error) {
    return { status: "error", stdout: "", stderr: `E2B Client Error: ${error instanceof Error ? error.message : String(error)}` };
  } finally {
    try { await sandbox?.kill(); } catch { /* best effort */ }
  }
}
