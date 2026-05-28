import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

export function buildServer() {
  const server = new McpServer({
    name: "ga4-gtm-config-mcp",
    version: "0.1.0",
  });

  const toolNames: string[] = [];

  server.registerTool(
    "ping",
    {
      description: "[read-only] Returns pong. Placeholder used during scaffolding; remove once real tools land.",
      inputSchema: {},
    },
    async () => ({ content: [{ type: "text", text: "pong" }] }),
  );
  toolNames.push("ping");

  return { server, toolNames };
}

async function main() {
  const { server } = buildServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}
