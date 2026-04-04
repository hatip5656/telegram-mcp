#!/usr/bin/env node

// Redirect all console output to stderr — stdout is reserved for MCP JSON-RPC
const originalLog = console.log;
console.log = (...args: unknown[]) => console.error(...args);

import { randomUUID } from "crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { MessageStore } from "./telegram/store.js";
import { createBot } from "./telegram/bot.js";
import { registerSendMessage } from "./tools/send-message.js";
import { registerGetUpdates } from "./tools/get-updates.js";
import { registerListChats } from "./tools/list-chats.js";
import { registerClaimChat } from "./tools/claim-chat.js";
import { registerResources } from "./resources/messages.js";

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) {
  console.error("TELEGRAM_BOT_TOKEN environment variable is required");
  process.exit(1);
}

const store = new MessageStore();
const bot = createBot(token, store);

// Each MCP connection gets a unique session ID
const sessionState = { id: randomUUID(), name: null as string | null, emoji: null as string | null };

const server = new McpServer(
  {
    name: "telegram-mcp",
    version: "1.0.0",
  },
  {
    instructions:
      "Telegram bot MCP server. Use claim_chat to claim a chat for this session (with a session name), send_message to send messages, get_updates to read incoming messages, list_chats to see available chats, and list_sessions to see active claims. Users must first message the bot in Telegram before the bot can interact with them.",
  }
);

// Register tools
registerSendMessage(server, bot, store, sessionState);
registerGetUpdates(server, store);
registerListChats(server, store);
registerClaimChat(server, store, sessionState);

// Register resources and subscriptions
registerResources(server, store);

// Start bot polling (runs in background, does not block)
bot.start({
  onStart: () => console.error("Telegram bot polling started"),
});

// Connect MCP server via stdio
const transport = new StdioServerTransport();
await server.connect(transport);
console.error(`Telegram MCP server connected (session: ${sessionState.id})`);

// Graceful shutdown — release all claims for this session
const shutdown = async () => {
  console.error("Shutting down...");
  for (const claim of store.getAllSessions()) {
    if (claim.sessionId === sessionState.id) {
      store.releaseChat(claim.chatId, sessionState.id);
    }
  }
  bot.stop();
  await server.close();
  process.exit(0);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
