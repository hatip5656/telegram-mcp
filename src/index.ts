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
import { registerSendPhoto } from "./tools/send-photo.js";
import { registerResources } from "./resources/messages.js";

// Global safety nets. Without these, any unhandled async error in the bot
// polling loop (network blip, Telegram 409 from another instance polling the
// same token, laptop sleep/wake closing the long-poll socket) kills the
// process — and since MCP runs in the same process, the host (e.g. Claude
// Code) sees the server as "disconnected." Logging instead of dying keeps
// the stdio transport alive so the host stays connected.
process.on("unhandledRejection", (reason) => {
  console.error("[telegram-mcp] unhandledRejection:", reason);
});
process.on("uncaughtException", (err) => {
  console.error("[telegram-mcp] uncaughtException:", err);
});

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
registerSendPhoto(server, bot, store, sessionState);

// Register resources and subscriptions
registerResources(server, store);

// Start bot polling with retry + backoff, in a separate async context so
// polling errors don't take down the MCP transport. Common failure modes:
//
//  • Telegram 409 "Conflict: terminated by other getUpdates request" —
//    happens when more than one process polls the same bot token (e.g. two
//    Claude Code sessions open at once). Back off for 30s so we don't
//    hammer the API while the other instance is the legitimate owner.
//
//  • Transient network errors / DNS hiccups / TCP RST — back off with a
//    short exponential delay and retry.
//
//  • Laptop sleep/wake — the long-poll socket is dead on wake; Grammy
//    throws on the next tick. We just retry.
//
// In all cases the MCP server keeps running, so the host never sees us
// disconnect. Tools that need the bot (send_message, send_photo) will fail
// while polling is down; once the loop reconnects, they recover.
const POLL_BACKOFF_MAX_MS = 60_000;
const POLL_BACKOFF_409_MS = 30_000;

let shuttingDown = false;

const startPolling = async (): Promise<void> => {
  let attempt = 0;
  while (!shuttingDown) {
    attempt++;
    try {
      await bot.start({
        onStart: () =>
          console.error(
            `[telegram-mcp] bot polling started (attempt ${attempt})`
          ),
      });
      // bot.start() resolves when polling stops cleanly (e.g. bot.stop()
      // during shutdown). Exit the retry loop.
      return;
    } catch (err) {
      if (shuttingDown) return;
      const msg = err instanceof Error ? err.message : String(err);
      const is409 = /409|Conflict|terminated by other getUpdates/i.test(msg);
      const backoff = is409
        ? POLL_BACKOFF_409_MS
        : Math.min(POLL_BACKOFF_MAX_MS, 2_000 * Math.min(attempt, 10));
      console.error(
        `[telegram-mcp] bot polling failed (${msg}); retrying in ${backoff}ms`
      );
      await new Promise((resolve) => setTimeout(resolve, backoff));
    }
  }
};

// Fire-and-forget. Errors inside startPolling are caught above; this top-level
// promise should never reject, but attach a logger anyway for belt+suspenders.
startPolling().catch((err) => {
  console.error("[telegram-mcp] polling supervisor crashed:", err);
});

// Connect MCP server via stdio
const transport = new StdioServerTransport();
await server.connect(transport);
console.error(`Telegram MCP server connected (session: ${sessionState.id})`);

// Graceful shutdown — release all claims for this session
const shutdown = async () => {
  shuttingDown = true;
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
