import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { SessionState } from "../telegram/store.js";

export function registerSetSession(server: McpServer, sessionState: SessionState): void {
  server.tool(
    "set_session",
    "Set or update the session name and emoji used to prefix outgoing messages. Overrides SESSION_NAME and SESSION_EMOJI env vars for the current session.",
    {
      session_name: z.string().describe("A name for this session (e.g., 'backend-refactor', 'debug-api')"),
      emoji: z.string().optional().describe("An emoji to prefix messages from this session (e.g., '🔵', '🟢', '🔴')"),
    },
    async ({ session_name, emoji }) => {
      sessionState.name = session_name;
      sessionState.emoji = emoji ?? null;

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              success: true,
              session_name,
              emoji: sessionState.emoji,
            }),
          },
        ],
      };
    }
  );
}
