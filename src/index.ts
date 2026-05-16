#!/usr/bin/env node

// Redirect all console output to stderr — stdout is reserved for MCP JSON-RPC
console.log = (...args: unknown[]) => console.error(...args);

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { MessageStore } from "./telegram/store.js";
import { createBot } from "./telegram/bot.js";
import { registerSendMessage } from "./tools/send-message.js";
import { registerGetUpdates } from "./tools/get-updates.js";
import { registerListChats } from "./tools/list-chats.js";
import { registerSetSession } from "./tools/set-session.js";
import { registerSendPhoto } from "./tools/send-photo.js";
import { registerResources } from "./resources/messages.js";

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) {
  console.error("TELEGRAM_BOT_TOKEN environment variable is required");
  process.exit(1);
}

const store = new MessageStore(process.env.DATA_DIR);
const bot = createBot(token, store);

const sessionState = {
  name: process.env.SESSION_NAME ?? null,
  emoji: process.env.SESSION_EMOJI ?? null,
};

const server = new McpServer(
  {
    name: "telegram-mcp",
    version: "1.0.0",
  },
  {
    instructions:
      "Telegram bot MCP server. Use send_message to send messages, get_updates to read incoming messages, list_chats to see available chats. chat_id is optional in send tools — defaults to the most recent known chat.",
  }
);

// Register tools
registerSendMessage(server, bot, store, sessionState);
registerGetUpdates(server, store);
registerListChats(server, store);
registerSetSession(server, sessionState);
registerSendPhoto(server, bot, store, sessionState);

// Register resources and subscriptions
registerResources(server, store);

// Start bot polling (runs in background, does not block)
bot.start({
  onStart: () => console.error("Telegram bot polling started"),
});

// Connect MCP server via stdio
const transport = new StdioServerTransport();
await server.connect(transport);
console.error(`Telegram MCP server connected`);

// Graceful shutdown
const shutdown = async () => {
  console.error("Shutting down...");
  bot.stop();
  await server.close();
  process.exit(0);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
