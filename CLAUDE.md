# Telegram MCP - Project Instructions

## Overview

Telegram MCP server — two-way messaging between Claude Code and Telegram via a bot. Chats are persisted to disk, so the bot remembers users across restarts. Multiple sessions can share the same bot with message routing.

## Architecture

- **Runtime**: Node.js + TypeScript
- **Bot framework**: grammY (Telegram Bot API)
- **MCP transport**: stdio
- **Storage**: Chats persisted to `~/.telegram-mcp/chats.json`, sessions to `sessions.json`, targets to `targets.json`, messages in-memory

## Key Files

- `src/index.ts` — Entry point
- `src/telegram/bot.ts` — Bot setup, message handling, dynamic command registration
- `src/telegram/store.ts` — Message store, chat/session/target persistence, shared types (`SessionState`, `ActiveSession`, `buildSessionPrefix`, `toCommandName`, `parseCommand`)
- `src/tools/` — MCP tools: `send_message`, `send_photo`, `get_updates`, `list_chats`, `set_session`
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

1. **Set up polling** — Use `/loop 1m` to check for new Telegram messages automatically
2. **Track cursor** — Use `since_cursor` in `get_updates` to avoid replying to the same message twice
3. **chat_id is optional** — Send tools default to the most recent known chat
4. **Session routing** — When `SESSION_NAME` is set, `get_updates` auto-filters to messages targeted at this session
