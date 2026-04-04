import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { MessageStore } from "../telegram/store.js";

export function registerGetUpdates(server: McpServer, store: MessageStore): void {
  server.tool(
    "get_updates",
    "Get recent messages from Telegram chats",
    {
      chat_id: z.number().optional().describe("Filter to a specific chat ID"),
      limit: z.number().min(1).max(100).default(20).describe("Max messages to return"),
      since_cursor: z.number().optional().describe("Only return messages after this cursor position"),
    },
    async ({ chat_id, limit, since_cursor }) => {
      let messages = chat_id
        ? store.getMessages(chat_id, limit)
        : store.getRecentUpdates(limit, since_cursor);

      if (chat_id && since_cursor !== undefined) {
        messages = messages.filter((m) => m.cursor > since_cursor).slice(-limit);
      }

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              messages,
              cursor: store.getCurrentCursor(),
              minCursor: store.getMinCursor(),
              count: messages.length,
            }),
          },
        ],
      };
    }
  );
}
