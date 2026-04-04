import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { MessageStore } from "../telegram/store.js";
import { randomUUID } from "crypto";

export function registerClaimChat(server: McpServer, store: MessageStore, sessionState: { id: string; name: string | null; emoji: string | null }): void {
  server.tool(
    "claim_chat",
    "Claim a Telegram chat for this session. You can specify a chat_id, a username, or omit both to claim the most recent chat. Provides a session name and optional emoji to visually identify this session in messages.",
    {
      chat_id: z.number().optional().describe("Telegram chat ID to claim (optional — can use username or omit to claim latest)"),
      username: z.string().optional().describe("Telegram username to find the chat (e.g., 'haksunger')"),
      session_name: z.string().describe("A name for this session (e.g., 'backend-refactor', 'debug-api')"),
      emoji: z.string().optional().describe("An emoji to prefix messages from this session (e.g., '🔵', '🟢', '🔴')"),
    },
    async ({ chat_id, username, session_name, emoji }) => {
      if (!sessionState.id) {
        sessionState.id = randomUUID();
      }

      let resolvedChatId = chat_id;

      if (!resolvedChatId && username) {
        const chats = store.getChats();
        const found = chats.find((c) => c.username?.toLowerCase() === username.toLowerCase());
        if (!found) {
          return {
            content: [{ type: "text" as const, text: JSON.stringify({ success: false, error: `No chat found with username "${username}". Make sure they've messaged the bot first.` }) }],
            isError: true,
          };
        }
        resolvedChatId = found.id;
      }

      if (!resolvedChatId) {
        const chats = store.getChats();
        if (chats.length === 0) {
          return {
            content: [{ type: "text" as const, text: JSON.stringify({ success: false, error: "No chats available. Someone needs to message the bot first." }) }],
            isError: true,
          };
        }
        resolvedChatId = chats[0].id;
      }

      sessionState.name = session_name;
      sessionState.emoji = emoji ?? null;

      const result = store.claimChat(resolvedChatId, sessionState.id, session_name, emoji);

      const chat = store.getChats().find((c) => c.id === resolvedChatId);
      const chatLabel = chat?.firstName ?? chat?.username ?? chat?.title ?? String(resolvedChatId);

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              ...result,
              session_id: sessionState.id,
              session_name,
              emoji: emoji ?? null,
              chat_id: resolvedChatId,
              chat_name: chatLabel,
            }),
          },
        ],
        isError: !result.success,
      };
    }
  );

  server.tool(
    "release_chat",
    "Release your claim on a Telegram chat, allowing other sessions to claim it.",
    {
      chat_id: z.number().describe("Telegram chat ID to release"),
    },
    async ({ chat_id }) => {
      const result = store.releaseChat(chat_id, sessionState.id);

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ ...result, chat_id }),
          },
        ],
        isError: !result.success,
      };
    }
  );

  server.tool(
    "list_sessions",
    "List all active session claims across all chats.",
    {},
    async () => {
      const sessions = store.getAllSessions();
      const chats = store.getChats();

      const enriched = sessions.map((s) => {
        const chat = chats.find((c) => c.id === s.chatId);
        return {
          ...s,
          chatTitle: chat?.title ?? chat?.firstName ?? chat?.username ?? String(s.chatId),
        };
      });

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              sessions: enriched,
              count: enriched.length,
              current_session: { id: sessionState.id, name: sessionState.name },
            }),
          },
        ],
      };
    }
  );
}
