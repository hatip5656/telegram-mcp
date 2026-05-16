# telegram-mcp-bot

[![npm version](https://img.shields.io/npm/v/telegram-mcp-bot)](https://www.npmjs.com/package/telegram-mcp-bot)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A Model Context Protocol (MCP) server that connects Claude Code to Telegram via a bot.

---

## Setup

1. Create a bot via [@BotFather](https://t.me/BotFather) and copy the token
2. Add the MCP server:

```bash
claude mcp add telegram -s user -e TELEGRAM_BOT_TOKEN=your-token -- npx -y telegram-mcp-bot@latest
```

3. Message the bot once from Telegram — it remembers you from then on

That's it. Claude can now send and receive messages through the bot.

---

## How It Works

The bot persists known chats to `~/.telegram-mcp/chats.json`. After a user messages the bot once, their chat is remembered across restarts. Send tools default to the most recent chat, so `chat_id` is usually not needed.

## Tools

| Tool | Description |
|------|-------------|
| `send_message` | Send a text message |
| `send_photo` | Send a photo (URL, file ID, or local path) |
| `get_updates` | Read incoming messages (cursor-based, session-filtered) |
| `list_chats` | List all known chats |
| `set_session` | Set a name/emoji prefix and register a Telegram command for this session |

All send tools default `chat_id` to the most recent known chat.

## Multi-Session Support

Multiple Claude Code sessions can share the same bot. Each session registers itself with a name and emoji:

```
claude mcp add telegram -s user \
  -e TELEGRAM_BOT_TOKEN=your-token \
  -e SESSION_NAME=debug-api \
  -e SESSION_EMOJI=🟢 \
  -- npx -y telegram-mcp-bot@latest
```

The bot automatically registers Telegram commands per session. In Telegram, tap `/debug_api` to direct your messages to that session. Use `/setup` to see all active sessions and your current target.

Messages are routed: each session only receives messages targeted at it (or untargeted messages if no session is selected).

## Telegram Commands

| Command | Description |
|---------|-------------|
| `/setup` | Show chat ID, active sessions, and current target |
| `/<session_name>` | Switch message target to that session |

Commands are registered dynamically when sessions connect/disconnect.

## Optional Environment Variables

| Variable | Description |
|---|---|
| `SESSION_NAME` | Session name — registers a Telegram command and prefixes outgoing messages |
| `SESSION_EMOJI` | Emoji prefix (e.g. `🔵`) |
| `DATA_DIR` | Override data directory (default: `~/.telegram-mcp`) |

---

## MCP Resources

| Resource URI | Description |
|---|---|
| `telegram://chat/{chatId}/messages` | Messages from a specific chat |
| `telegram://updates/recent` | Recent messages across all chats |

---

## Development

```bash
git clone git@github.com:hatip5656/telegram-mcp.git
cd telegram-mcp
npm install
npm run build
TELEGRAM_BOT_TOKEN=your-token npm run dev
```

---

## License

MIT
