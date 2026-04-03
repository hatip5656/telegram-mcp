#!/usr/bin/env node

// Redirect all console output to stderr — stdout is reserved for MCP JSON-RPC
const originalLog = console.log;
console.log = (...args: unknown[]) => console.error(...args);

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { MessageStore } from "./telegram/store.js";
import { createBot } from "./telegram/bot.js";
import { registerSendMessage } from "./tools/send-message.js";
import { registerGetUpdates } from "./tools/get-updates.js";
import { registerListChats } from "./tools/list-chats.js";
import { registerResources } from "./resources/messages.js";

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) {
  console.error("TELEGRAM_BOT_TOKEN environment variable is required");
  process.exit(1);
}

const store = new MessageStore();
const bot = createBot(token, store);

const server = new McpServer(
  {
    name: "telegram-mcp",
    version: "1.0.0",
  },
  {
    instructions:
      "Telegram bot MCP server. Use send_message to send messages, get_updates to read incoming messages, and list_chats to see available chats. Users must first message the bot in Telegram before the bot can interact with them.",
  }
);

// Register tools
registerSendMessage(server, bot, store);
registerGetUpdates(server, store);
registerListChats(server, store);

// Register resources and subscriptions
registerResources(server, store);

// Start bot polling (runs in background, does not block)
bot.start({
  onStart: () => console.error("Telegram bot polling started"),
});

// Connect MCP server via stdio
const transport = new StdioServerTransport();
await server.connect(transport);
console.error("Telegram MCP server connected");

// Graceful shutdown
const shutdown = async () => {
  console.error("Shutting down...");
  bot.stop();
  await server.close();
  process.exit(0);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
