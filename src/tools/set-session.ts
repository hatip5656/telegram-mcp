import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { MessageStore, SessionState } from "../telegram/store.js";

export function registerSetSession(server: McpServer, store: MessageStore, sessionState: SessionState): void {
  server.tool(
    "set_session",
    "Set or update the session name and emoji. Registers a Telegram command so users can direct messages to this session.",
    {
      session_name: z.string().describe("A name for this session (e.g., 'backend-refactor', 'debug-api')"),
      emoji: z.string().optional().describe("An emoji to prefix messages from this session (e.g., '🔵', '🟢', '🔴')"),
    },
    async ({ session_name, emoji }) => {
      sessionState.name = session_name;
      sessionState.emoji = emoji ?? null;

      const sessions = store.registerSession(session_name, emoji ?? null);

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              success: true,
              session_name,
              emoji: sessionState.emoji,
              active_sessions: sessions.map((s) => s.name),
            }),
          },
        ],
      };
    }
  );
}
