import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

export interface IllustratorMcpConfig {
  url: string;
  token?: string;
}

export class McpConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "McpConfigError";
  }
}

export function getIllustratorMcpConfig(overrides: Partial<IllustratorMcpConfig> = {}): IllustratorMcpConfig {
  const url = overrides.url ?? process.env.ILLUSTRATOR_MCP_URL ?? process.env.ADOBE_ILLUSTRATOR_MCP_URL;
  const token =
    overrides.token ??
    process.env.ILLUSTRATOR_MCP_TOKEN ??
    process.env.ILLUSTRATOR_MCP_AUTH_TOKEN ??
    process.env.ADOBE_ILLUSTRATOR_MCP_TOKEN;

  if (!url) {
    throw new McpConfigError("Set ILLUSTRATOR_MCP_URL to the Illustrator Beta MCP server URL.");
  }

  return { url, token };
}

export async function listIllustratorTools(config: IllustratorMcpConfig): Promise<unknown[]> {
  return withIllustratorClient(config, async (client) => {
    const tools: unknown[] = [];
    let cursor: string | undefined;

    do {
      const page = await client.listTools(cursor ? { cursor } : undefined);
      tools.push(...page.tools);
      cursor = page.nextCursor;
    } while (cursor);

    return tools;
  });
}

export async function callIllustratorTool(
  config: IllustratorMcpConfig,
  name: string,
  args: Record<string, unknown>
): Promise<unknown> {
  return withIllustratorClient(config, async (client) => {
    return client.callTool({
      name,
      arguments: args
    });
  });
}

async function withIllustratorClient<T>(
  config: IllustratorMcpConfig,
  callback: (client: Client) => Promise<T>
): Promise<T> {
  const client = new Client({
    name: "illustrator-agent-bridge",
    version: "0.1.0"
  });

  const transport = new StreamableHTTPClientTransport(
    new URL(config.url),
    config.token
      ? {
          requestInit: {
            headers: {
              Authorization: `Bearer ${config.token}`
            }
          }
        }
      : undefined
  );

  await client.connect(transport);

  try {
    return await callback(client);
  } finally {
    await maybeTerminateSession(transport);
    await client.close();
  }
}

async function maybeTerminateSession(transport: StreamableHTTPClientTransport): Promise<void> {
  if (typeof transport.terminateSession === "function") {
    await transport.terminateSession();
  }
}
