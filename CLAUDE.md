# Telegram MCP - Project Instructions

## Overview

This is a Telegram MCP server that enables two-way messaging between Claude Code and Telegram via a bot. It supports multi-session management with emoji-prefixed messages.

## Architecture

- **Runtime**: Node.js + TypeScript
- **Bot framework**: grammY (Telegram Bot API)
- **MCP transport**: stdio
- **Storage**: In-memory (no persistence across restarts)

## Key Files

- `src/index.ts` — Entry point, wires everything together
- `src/telegram/bot.ts` — Telegram bot setup and message handling
- `src/telegram/store.ts` — Message store, session claims, event system
- `src/tools/` — MCP tool implementations (send_message, get_updates, list_chats, claim_chat)
- `src/resources/messages.ts` — MCP resource subscriptions

## Code Conventions

- ES modules (`"type": "module"` in package.json)
- `.js` extensions in imports (required for ESM)
- Zod for tool parameter validation
- Functional style for tool registration (`registerXxx(server, store, ...)`)
- Console output redirected to stderr (stdout reserved for MCP JSON-RPC)

## Build & Run

```bash
npm install
npm run build          # tsc
npm run dev            # tsx src/index.ts (no build needed)
TELEGRAM_BOT_TOKEN=... node dist/index.js
```

## Git

- Repo-level git config only (no --global)
- User: Hatip Aksunger <hatip.aksunger@gmail.com>
- Co-author Claude in commits

## When Using as MCP Server

When this MCP server is connected to a Claude Code session:

1. **Always set up polling** — Use `/loop 1m` to check for new Telegram messages automatically
2. **Claim the chat** — On first message from a user, call `claim_chat` with a session name
3. **Track cursor** — Use `since_cursor` to avoid replying to the same message twice
4. **Session prefix** — All outgoing messages are automatically prefixed with `[session_name]` or `emoji [session_name]`
