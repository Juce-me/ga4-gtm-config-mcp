import { readFile } from "node:fs/promises";
import { parse } from "yaml";
import { MCPError } from "../utils/errors.js";
import { McpExecutionSpec } from "./mcpExecutionSpec.schema.js";

export async function readSpec(path: string): Promise<McpExecutionSpec> {
  let raw: string;
  try {
    raw = await readFile(path, "utf8");
  } catch (e) {
    throw new MCPError("SPEC_INVALID", `Could not read spec at ${path}`, { cause: String(e) });
  }

  let parsed: unknown;
  try {
    parsed = parse(raw);
  } catch (e) {
    throw new MCPError("SPEC_INVALID", `Spec YAML failed to parse: ${String(e)}`, { path });
  }

  const result = McpExecutionSpec.safeParse(parsed);
  if (!result.success) {
    throw new MCPError("SPEC_INVALID", "Spec failed schema validation", {
      issues: result.error.issues,
    });
  }
  return result.data;
}
