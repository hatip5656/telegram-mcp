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

3. Message the bot — it replies with **your Telegram user ID** and refuses everything else (see [Security](#security))
4. Re-add the server with that ID allowlisted and restart Claude Code:

```bash
claude mcp remove telegram -s user
claude mcp add telegram -s user \
  -e TELEGRAM_BOT_TOKEN=your-token \
  -e TELEGRAM_ALLOWED_USERS=123456789 \
  -- npx -y telegram-mcp-bot@latest
```

5. Message the bot again — it remembers your chat from then on

That's it. Claude can now send and receive messages through the bot.

### Other agents

Any MCP client works. For JSON-configured agents (Cursor, Windsurf, Copilot, …):

```json
{
  "mcpServers": {
    "telegram": {
      "command": "npx",
      "args": ["-y", "telegram-mcp-bot@latest"],
      "env": {
        "TELEGRAM_BOT_TOKEN": "your-token",
        "TELEGRAM_ALLOWED_USERS": "123456789"
      }
    }
  }
}
```

### Agent skill

[`skills/telegram-mcp/SKILL.md`](skills/telegram-mcp/SKILL.md) teaches the agent when and how to use the tools: notifying you, asking questions and waiting for answers, the polling loop, and multi-session routing. Copy the folder into your agent's skills directory (e.g. `~/.claude/skills/`).

---

## Security

Everything an allowed user sends goes into your agent's context, and that agent can usually run commands on your machine. So the server is locked down by default:

- **Allowlist by default** — only Telegram user IDs in `TELEGRAM_ALLOWED_USERS` get through. If it isn't set, every message is rejected. Unknown users are told their ID once (in private chats) and otherwise ignored. Usernames aren't accepted because they can be changed and re-registered by someone else. `TELEGRAM_ALLOWED_USERS=*` opens the bot to everyone — don't, unless you understand the risk.
- **Known chats only** — send tools refuse chats that no allowed user has messaged, so an injected instruction can't redirect output to an attacker's chat. Saved chats from users who are no longer allowed are dropped at startup.
- **Images only from disk** — `send_photo` only reads local files with image extensions.
- **Network** — the server only talks to the Telegram Bot API (`api.telegram.org`).

> **Upgrading from 1.x:** 2.0 rejects all messages until `TELEGRAM_ALLOWED_USERS` is set. Message the bot to get your ID, then add it.

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
  -e TELEGRAM_ALLOWED_USERS=123456789 \
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

## Environment Variables

| Variable | Description |
|---|---|
| `TELEGRAM_ALLOWED_USERS` | Comma-separated Telegram user IDs allowed to use the bot (required in practice — unset rejects everyone; `*` allows anyone) |
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
TELEGRAM_BOT_TOKEN=your-token TELEGRAM_ALLOWED_USERS=your-id npm run dev
npm test
npm run skill:zip      # packages skills/telegram-mcp into a zip for skill marketplaces
```

---

## License

MIT
