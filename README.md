# Telegram MCP Server

A Model Context Protocol (MCP) server that connects to a Telegram bot, enabling **two-way messaging** between AI assistants and Telegram. Supports multi-session management with emoji-prefixed messages.

---

## Features

| Tool | Description |
|------|-------------|
| `send_message` | Send text messages to any Telegram chat |
| `send_photo` | Send photos by URL or file ID with optional caption |
| `get_updates` | Read recent messages with cursor-based pagination |
| `list_chats` | List all chats with claim status |
| `claim_chat` | Claim a chat for this session (with emoji identifier) |
| `release_chat` | Release your claim on a chat |
| `list_sessions` | View all active session claims |

**Session management** — Multiple Claude Code sessions can connect to the same bot. Each session claims a chat with a unique name and emoji prefix for visual identification.

**Real-time notifications** — The server pushes resource update notifications when new messages arrive.

**Message deduplication** — Duplicate messages from Telegram retries are automatically filtered.

**Media metadata** — Photos, videos, documents preserve their file IDs for downstream use.

**In-memory message store** — Keeps up to 1,000 messages per chat (5,000 total) for the session lifetime. No database required.

---

## Quick Start

### 1. Create a Telegram Bot

1. Open Telegram and message [@BotFather](https://t.me/BotFather)
2. Send `/newbot` and follow the prompts
3. Copy the bot token you receive

### 2. Install & Build

```bash
git clone git@github.com:hatip5656/telegram-mcp.git
cd telegram-mcp
npm install
npm run build
```

### 3. Configure Your MCP Client

**Claude Code** (recommended):
```bash
claude mcp add telegram -s user -e TELEGRAM_BOT_TOKEN=your-token-here -- node /path/to/telegram-mcp/dist/index.js
```

Or manually create a `.mcp.json` in your project root:
```json
{
  "mcpServers": {
    "telegram": {
      "command": "node",
      "args": ["/path/to/telegram-mcp/dist/index.js"],
      "env": {
        "TELEGRAM_BOT_TOKEN": "123456:ABC-DEF..."
      }
    }
  }
}
```

**Claude Desktop** (`claude_desktop_config.json`):
```json
{
  "mcpServers": {
    "telegram": {
      "command": "node",
      "args": ["/path/to/telegram-mcp/dist/index.js"],
      "env": {
        "TELEGRAM_BOT_TOKEN": "123456:ABC-DEF..."
      }
    }
  }
}
```

### 4. Start Chatting

1. Open Telegram and send `/start` to your bot
2. Ask Claude to claim your chat: *"claim my Telegram chat as 'my-project' with emoji blue circle"*
3. Send messages from Telegram — Claude picks them up automatically!

---

## Session Management

When multiple Claude Code sessions share the same bot, sessions are identified by name and emoji:

```
🔵 [backend-refactor] Fixing the API endpoint...
🟢 [debug-api] Found the bug in auth middleware
🔴 [deploy-monitor] Deploy failed on staging!
```

- **`claim_chat`** — Claim a chat by username, chat ID, or auto-pick the latest. Set a session name and optional emoji.
- **`release_chat`** — Release your claim so another session can take over.
- **`list_sessions`** — See which sessions have claimed which chats.
- Claims are automatically released when the MCP server shuts down.

---

## MCP Resources

The server exposes resources that clients can subscribe to for real-time updates:

| Resource URI | Description |
|---|---|
| `telegram://chat/{chatId}/messages` | Message history for a specific chat |
| `telegram://updates/recent` | Recent messages across all chats |

When a new message arrives, subscribed clients receive a `notifications/resources/updated` notification automatically.

---

## Tool Reference

### `send_message`

| Parameter | Type | Required | Description |
|---|---|---|---|
| `chat_id` | `number \| string` | Yes | Telegram chat ID or @username |
| `text` | `string` | Yes | Message text (auto-prefixed with session name if claimed) |
| `parse_mode` | `string` | No | `HTML`, `Markdown`, or `MarkdownV2` |
| `reply_to_message_id` | `number` | No | Message ID to reply to |

### `send_photo`

| Parameter | Type | Required | Description |
|---|---|---|---|
| `chat_id` | `number \| string` | Yes | Telegram chat ID or @username |
| `photo` | `string` | Yes | Photo URL or Telegram file_id |
| `caption` | `string` | No | Photo caption (auto-prefixed with session name if claimed) |
| `parse_mode` | `string` | No | `HTML`, `Markdown`, or `MarkdownV2` |

### `get_updates`

| Parameter | Type | Required | Description |
|---|---|---|---|
| `chat_id` | `number` | No | Filter to a specific chat |
| `limit` | `number` | No | Max messages (1-100, default 20) |
| `since_cursor` | `number` | No | Only messages after this cursor |

### `list_chats`

| Parameter | Type | Required | Description |
|---|---|---|---|
| `type` | `string` | No | Filter: `all`, `private`, `group`, `supergroup`, `channel` |

Returns chats with claim status (claimed/unclaimed, session name, emoji).

### `claim_chat`

| Parameter | Type | Required | Description |
|---|---|---|---|
| `chat_id` | `number` | No | Telegram chat ID (optional) |
| `username` | `string` | No | Telegram username to resolve (optional) |
| `session_name` | `string` | Yes | Name for this session |
| `emoji` | `string` | No | Emoji prefix for messages |

If neither `chat_id` nor `username` is provided, claims the most recently active chat.

### `release_chat`

| Parameter | Type | Required | Description |
|---|---|---|---|
| `chat_id` | `number` | Yes | Telegram chat ID to release |

### `list_sessions`

No parameters. Returns all active session claims with chat details.

---

## Tech Stack

- **[@modelcontextprotocol/sdk](https://github.com/modelcontextprotocol/typescript-sdk)** — MCP server framework (stdio transport)
- **[grammY](https://grammy.dev/)** — Telegram Bot API framework
- **TypeScript** — Type-safe implementation
- **Zod** — Runtime input validation

---

## Development

```bash
# Run in dev mode (no build step)
TELEGRAM_BOT_TOKEN=your-token npm run dev

# Build for production
npm run build

# Test with MCP Inspector
TELEGRAM_BOT_TOKEN=your-token npx @modelcontextprotocol/inspector node dist/index.js
```

---

## License

MIT
