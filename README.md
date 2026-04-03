# Telegram MCP Server

A Model Context Protocol (MCP) server that connects to a Telegram bot, enabling **two-way messaging** between AI assistants and Telegram.

---

## Features

| Tool | Description |
|------|-------------|
| `send_message` | Send text messages to any Telegram chat |
| `get_updates` | Read recent messages with cursor-based pagination |
| `list_chats` | List all chats the bot has interacted with |

**Real-time notifications** — The server pushes resource update notifications when new messages arrive, so your AI assistant stays in the loop.

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

Add the server to your MCP client configuration:

**Claude Code** (`~/.claude/settings.json`):
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

1. Open Telegram and send `/start` to your bot (this lets the bot discover your chat)
2. Ask your AI assistant to check for Telegram messages or send one!

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
| `text` | `string` | Yes | Message text |
| `parse_mode` | `string` | No | `HTML`, `Markdown`, or `MarkdownV2` |
| `reply_to_message_id` | `number` | No | Message ID to reply to |

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
