import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { MessageStore } from "../telegram/store.js";

export function registerResources(server: McpServer, store: MessageStore): void {
  // Per-chat message resource
  server.resource(
    "chat-messages",
    "telegram://chat/{chatId}/messages",
    { description: "Messages from a specific Telegram chat" },
    async (uri) => {
      const match = uri.href.match(/telegram:\/\/chat\/(-?\d+)\/messages/);
      if (!match) {
        return { contents: [{ uri: uri.href, text: "Invalid chat URI" }] };
      }
      const chatId = parseInt(match[1], 10);
      const messages = store.getMessages(chatId, 50);
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: "application/json",
            text: JSON.stringify({ chatId, messages, count: messages.length }),
          },
        ],
      };
    }
  );

  // Global recent updates resource
  server.resource(
    "recent-updates",
    "telegram://updates/recent",
    { description: "Recent messages across all Telegram chats" },
    async (uri) => {
      const messages = store.getRecentUpdates(50);
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: "application/json",
            text: JSON.stringify({
              messages,
              cursor: store.getCurrentCursor(),
              count: messages.length,
            }),
          },
        ],
      };
    }
  );

  // Notify subscribers when new messages arrive
  store.onNewMessage((msg) => {
    server.server.sendResourceUpdated({
      uri: `telegram://chat/${msg.chatId}/messages`,
    });
    server.server.sendResourceUpdated({
      uri: "telegram://updates/recent",
    });
  });

  // Notify about new chat resource availability
  store._emitNewChat = (_chatId: number) => {
    server.server.sendResourceListChanged();
  };
}
