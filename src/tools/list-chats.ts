import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { MessageStore } from "../telegram/store.js";

export function registerListChats(server: McpServer, store: MessageStore): void {
  server.tool(
    "list_chats",
    "List all Telegram chats the bot has interacted with",
    {
      type: z
        .enum(["all", "private", "group", "supergroup", "channel"])
        .default("all")
        .describe("Filter by chat type"),
    },
    async ({ type }) => {
      const chats = store.getChats(type);
      const enriched = chats.map((chat) => {
        const claim = store.getSessionForChat(chat.id);
        return {
          ...chat,
          claimed: !!claim,
          claimedBy: claim ? { sessionName: claim.sessionName, emoji: claim.emoji } : null,
        };
      });
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ chats: enriched, count: enriched.length }),
          },
        ],
      };
    }
  );
}
