// src/server.ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerReadTools } from "./tools/readTools.js";
import { registerValidateTools } from "./tools/validateTools.js";
import { assertSafeToolMetadata, type ToolMeta } from "./safety/toolMetadataGuards.js";
import { logger } from "./utils/logger.js";

export function buildServer() {
  const server = new McpServer({
    name: "ga4-gtm-config-mcp",
    version: "0.1.0",
  });

  const tools: ToolMeta[] = [];
  registerReadTools(server, tools);
  registerValidateTools(server, tools);

  assertSafeToolMetadata(tools);
  for (const t of tools) logger.info("tool_registered", { name: t.name });

  return { server, tools };
}

async function main() {
  const { server } = buildServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}
