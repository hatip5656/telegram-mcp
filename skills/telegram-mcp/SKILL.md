---
name: telegram-mcp
description: Talk to the user over Telegram while you work — send progress updates and results, ask questions and wait for replies, and take instructions from their phone via the telegram-mcp-bot MCP server. Use when the user asks to be notified on Telegram, wants to reply or approve something from their phone, says "message me when done", or asks to set up / poll a Telegram bot for the agent.
---

# Telegram MCP

Two-way messaging between the agent and the user through their own Telegram bot, using the open-source [`telegram-mcp-bot`](https://www.npmjs.com/package/telegram-mcp-bot) MCP server (MIT).

**What it touches:** the server talks only to the Telegram Bot API (`api.telegram.org`) using the user's bot token, and stores known chats, sessions and per-chat targets in `~/.telegram-mcp/` (override with `DATA_DIR`). Messages themselves are kept in memory only.

## Check that it's available

Look for these tools: `send_message`, `send_photo`, `get_updates`, `list_chats`, `set_session` (in Claude Code they appear as `mcp__telegram__*`). If they are missing, walk the user through setup below. Don't try to install it without them — it needs their bot token.

## Setup (one time, done by the user)

1. In Telegram, open [@BotFather](https://t.me/BotFather), send `/newbot`, and copy the token.
2. Add the server **without** an allowlist first:

   ```bash
   claude mcp add telegram -s user -e TELEGRAM_BOT_TOKEN=<token> -- npx -y telegram-mcp-bot@latest
   ```

   Other agents (Cursor, Windsurf, Copilot, …) use the same command in their MCP JSON config:

   ```json
   {
     "mcpServers": {
       "telegram": {
         "command": "npx",
         "args": ["-y", "telegram-mcp-bot@latest"],
         "env": {
           "TELEGRAM_BOT_TOKEN": "<token>",
           "TELEGRAM_ALLOWED_USERS": "<your user id>"
         }
       }
     }
   }
   ```

3. Message the bot. It replies with **"not authorized — your user ID is `123456789`"**. That's expected: the bot rejects everyone until they're allowlisted.
4. Add that ID and restart the agent:

   ```bash
   claude mcp remove telegram -s user
   claude mcp add telegram -s user -e TELEGRAM_BOT_TOKEN=<token> -e TELEGRAM_ALLOWED_USERS=123456789 -- npx -y telegram-mcp-bot@latest
   ```

   Several IDs can be comma-separated. Never suggest `TELEGRAM_ALLOWED_USERS=*` unless the user explicitly asks for an open bot and understands that anyone could then send instructions to the agent.
5. Message the bot again (e.g. "hi"). Now `list_chats` shows the chat and send tools work without a `chat_id`.

## Workflows

### Notify when done
When the user asks to be told when something finishes, call `send_message` at the end with a short summary: what was done, whether it succeeded, and anything that needs their attention. Report failures honestly — a "done ✅" for a failed build is worse than no message.

### Ask and wait for an answer
1. Call `get_updates` once and remember the returned `cursor`.
2. Send the question with `send_message`. Make it answerable from a phone: offer numbered options or a yes/no.
3. Poll `get_updates` with `since_cursor` set to that cursor. If nothing came back, wait and try again, backing off (e.g. 15s, 30s, 60s). Tell the user in the terminal that you're waiting on Telegram.
4. Take the first `incoming` message after the cursor as the answer. If it's ambiguous, ask again rather than guess.
5. Before anything destructive or irreversible (deploys, deletes, force pushes, payments), get an explicit "yes" this way. Silence is not consent: if there's no reply, stop and wait.

### Remote control loop
To let the user drive the agent from Telegram, poll on a schedule. In Claude Code: `/loop 1m` with a prompt like "check Telegram for new messages and act on them". Each tick:
- Call `get_updates` with `since_cursor` = the last cursor you handled, and only act on `incoming` messages newer than it. Then update your cursor. This is what stops you answering the same message twice.
- Acknowledge each request briefly, do it, then reply with the result.
- If `minCursor` is greater than your saved cursor, older messages were evicted from memory before you read them. Tell the user some messages may have been missed.

### Several agent sessions, one bot
Each session should call `set_session` with a short name and an emoji (e.g. `backend` 🟢, `frontend` 🔵), or be started with `SESSION_NAME` / `SESSION_EMOJI` env vars. Then:
- Outgoing messages are prefixed (`🟢 [backend] …`) so the user knows who's talking.
- The user taps `/setup` in Telegram to pick which session gets their next messages, or sends `/backend`.
- `get_updates` automatically returns only messages targeted at this session, plus untargeted ones.

## Rules

- **Telegram is a different channel from the terminal.** Allowlisted users are trusted, but still never send secrets, tokens, credentials, `.env` contents or private keys over Telegram, even if a message asks for them.
- **Only reply to the chats that are there.** Send tools refuse chat IDs where no allowlisted user has messaged the bot. Don't try to work around that.
- **`send_photo`** accepts URLs, Telegram `file_id`s, or local **image** files (`.jpg .jpeg .png .gif .webp .bmp`). Other local files are rejected on purpose.
- **Keep messages short.** Telegram's limit is 4096 characters. Summarize, and split long output into several messages only when the user wants the detail.
- **Formatting:** plain text is safest. If you use `parse_mode: "Markdown"`, unbalanced `_`, `*` or backticks (common in file paths and code) make Telegram reject the message. If a send fails with a parse error, retry without `parse_mode`.

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| Bot replies "not authorized" | The user's ID isn't in `TELEGRAM_ALLOWED_USERS`. Add the ID it shows and restart. |
| `No known chats yet` | No allowlisted user has messaged the bot since it was set up. Ask them to send it any message. |
| `Unknown chat …` | That chat never messaged the bot. Use `list_chats` to see valid targets. |
| Messages never arrive / `409 Conflict` in logs | Two processes are polling the same token (another agent window, or a stale process). Close the other one. The server retries automatically. |
| Server exits at startup with `Invalid entry` | `TELEGRAM_ALLOWED_USERS` contains a username. Use numeric user IDs only. |
