export interface ToolMeta {
  name: string;
  description: string;
  hasApprovalToken: boolean;
}

const ALLOWED_LABELS = [
  "[read-only]",
  "[dry-run-capable write]",
  "[write — non-live workspace only]",
  "[gated]",
  "[gated dangerous]",
] as const;

const UNSAFE_PATTERNS: Array<string | RegExp> = [
  "bypass",
  "ignore approval",
  "skip validation",
  /\bforce\b/i,
  "prompt-inject",
  "you should",
  "always",
  "must apply",
];

export function assertSafeToolMetadata(tools: ToolMeta[]): void {
  for (const tool of tools) {
    const label = ALLOWED_LABELS.find((l) => tool.description.startsWith(l));
    if (!label) {
      throw new Error(
        `Tool "${tool.name}" description must start with one of: ${ALLOWED_LABELS.join(", ")}. Got: "${tool.description.slice(0, 60)}..."`,
      );
    }

    const lower = tool.description.toLowerCase();
    for (const pat of UNSAFE_PATTERNS) {
      const hit = typeof pat === "string" ? lower.includes(pat) : pat.test(tool.description);
      if (hit) {
        throw new Error(`Tool "${tool.name}" description contains unsafe phrase ${pat instanceof RegExp ? pat.source : `"${pat}"`}`);
      }
    }

    if (label.startsWith("[gated") && !tool.hasApprovalToken) {
      throw new Error(`Tool "${tool.name}" is labeled ${label} but has no approval_token field in its input schema`);
    }
  }
}
