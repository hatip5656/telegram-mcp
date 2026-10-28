import { Bot, InlineKeyboard } from "grammy";
import { MessageStore, MediaInfo, ActiveSession, toCommandName, parseCommand } from "./store.js";
import { AccessPolicy, isUserAllowed } from "./access.js";

export function createBot(token: string, store: MessageStore, policy: AccessPolicy): Bot {
  const bot = new Bot(token);

  // Gate every update before any other handler runs. Rejected users get their
  // user ID back once (private chats only) so the owner can allowlist them.
  const notifiedUsers = new Set<number>();
  bot.use(async (ctx, next) => {
    const userId = ctx.from?.id;
    if (isUserAllowed(policy, userId)) {
      await next();
      return;
    }

    console.error(`[telegram-mcp] ignored update from unauthorized user ${userId ?? "unknown"}`);
    if (userId === undefined || ctx.chat?.type !== "private" || notifiedUsers.has(userId)) return;
    notifiedUsers.add(userId);
    await ctx.reply(
      `⛔ You are not authorized to use this bot.\n\n` +
      `Your Telegram user ID is \`${userId}\`. If this is your bot, add it to ` +
      `\`TELEGRAM_ALLOWED_USERS\` in the MCP server config and restart.`,
      { parse_mode: "Markdown" },
    ).catch((err) => console.error("Failed to send unauthorized notice:", err));
  });

  let syncTimer: ReturnType<typeof setTimeout> | null = null;
  const debouncedSyncCommands = (sessions: ActiveSession[]) => {
    if (syncTimer) clearTimeout(syncTimer);
    syncTimer = setTimeout(() => {
      syncTimer = null;
      syncCommands(bot, sessions);
    }, 500);
  };

  syncCommands(bot, store.getActiveSessions());

  store.on("sessionsChanged", debouncedSyncCommands);

  // Handle callback queries from inline keyboard buttons
  bot.on("callback_query:data", async (ctx) => {
    const data = ctx.callbackQuery.data;
    const chatId = ctx.callbackQuery.message?.chat.id;
    if (!chatId) return;

    if (data.startsWith("switch:")) {
      const sessionName = data.slice("switch:".length);
      const sessions = store.getActiveSessions();
      const matched = sessions.find((s) => s.name === sessionName);
      if (matched) {
        store.setTarget(chatId, matched.name);
        const label = matched.emoji ? `${matched.emoji} ${matched.name}` : matched.name;
        await ctx.answerCallbackQuery({ text: `Switched to ${label}` });
        await ctx.editMessageText(
          `✅ Messages are now directed to: *${label}*\n\nJust type your message below.`,
          { parse_mode: "Markdown" },
        );
      } else {
        await ctx.answerCallbackQuery({ text: "Session not found" });
      }
      return;
    }

    if (data === "clear_target") {
      store.clearTarget(chatId);
      await ctx.answerCallbackQuery({ text: "Target cleared" });
      await ctx.editMessageText(
        "✅ Target cleared — messages go to all sessions.\n\nJust type your message below.",
      );
      return;
    }

    await ctx.answerCallbackQuery();
  });

  bot.on("message", (ctx) => {
    const msg = ctx.message;
    const chat = ctx.chat;
    const cmd = parseCommand(msg.text ?? "");

    if (cmd === "setup" || cmd === "start") {
      sendSessionPicker(ctx, store);
      return;
    }

    if (cmd) {
      const sessions = store.getActiveSessions();
      const matched = sessions.find((s) => toCommandName(s.name) === cmd);
      if (matched) {
        store.setTarget(chat.id, matched.name);
        const label = matched.emoji ? `${matched.emoji} ${matched.name}` : matched.name;
        ctx.reply(
          `✅ Messages are now directed to: *${label}*\n\nJust type your message below.`,
          { parse_mode: "Markdown" },
        );
        return;
      }
    }

    store.updateChat({
      id: chat.id,
      type: chat.type,
      title: "title" in chat ? chat.title : undefined,
      username: "username" in chat ? chat.username : undefined,
      firstName: "first_name" in chat ? chat.first_name : undefined,
      lastName: "last_name" in chat ? chat.last_name : undefined,
      lastMessageAt: msg.date,
      lastSenderId: msg.from?.id,
    });

    const media = extractMedia(msg);

    store.addMessage({
      messageId: msg.message_id,
      chatId: chat.id,
      from: msg.from
        ? {
            id: msg.from.id,
            firstName: msg.from.first_name,
            username: msg.from.username,
            isBot: msg.from.is_bot,
          }
        : undefined,
      text: msg.text ?? msg.caption ?? (media ? `[${media.type}]` : "[unsupported message type]"),
      media,
      date: msg.date,
      direction: "incoming",
    });
  });

  return bot;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function sendSessionPicker(ctx: any, store: MessageStore): void {
  const sessions = store.getActiveSessions();
  const chatId = ctx.chat.id;
  const currentTarget = store.getTarget(chatId);

  if (sessions.length === 0) {
    ctx.reply(
      `Chat ID: \`${chatId}\`\n\nNo active sessions. Start a Claude Code session with \`set_session\` first.`,
      { parse_mode: "Markdown" },
    );
    return;
  }

  const keyboard = new InlineKeyboard();
  for (const s of sessions) {
    const label = s.emoji ? `${s.emoji} ${s.name}` : s.name;
    const isCurrent = currentTarget === s.name;
    keyboard.text(isCurrent ? `✅ ${label}` : label, `switch:${s.name}`).row();
  }
  keyboard.text("🔄 Clear target (all sessions)", "clear_target").row();

  const targetLabel = currentTarget
    ? sessions.find((s) => s.name === currentTarget)?.emoji
      ? `${sessions.find((s) => s.name === currentTarget)!.emoji} ${currentTarget}`
      : currentTarget
    : "none";

  ctx.reply(
    `📡 *Session Manager*\n\n` +
    `Chat ID: \`${chatId}\`\n` +
    `Current target: *${targetLabel}*\n\n` +
    `Tap a session below, then type your message:`,
    { parse_mode: "Markdown", reply_markup: keyboard },
  );
}

function syncCommands(bot: Bot, sessions: ActiveSession[]): void {
  const commands = [
    { command: "setup", description: "📡 Session manager — pick a session" },
    { command: "start", description: "📡 Session manager — pick a session" },
    ...sessions.map((s) => ({
      command: toCommandName(s.name),
      description: `Switch to: ${s.emoji ? `${s.emoji} ` : ""}${s.name}`,
    })),
  ];
  bot.api.setMyCommands(commands).catch((err) =>
    console.error("Failed to sync bot commands:", err)
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractMedia(msg: any): MediaInfo | undefined {
  if (msg.photo && Array.isArray(msg.photo) && msg.photo.length > 0) {
    const largest = msg.photo[msg.photo.length - 1] as { file_id: string; file_size?: number };
    return { type: "photo", fileId: largest.file_id, fileSize: largest.file_size };
  }
  if (msg.video && typeof msg.video === "object") {
    const v = msg.video as { file_id: string; file_name?: string; mime_type?: string; file_size?: number };
    return { type: "video", fileId: v.file_id, fileName: v.file_name, mimeType: v.mime_type, fileSize: v.file_size };
  }
  if (msg.document && typeof msg.document === "object") {
    const d = msg.document as { file_id: string; file_name?: string; mime_type?: string; file_size?: number };
    return { type: "document", fileId: d.file_id, fileName: d.file_name, mimeType: d.mime_type, fileSize: d.file_size };
  }
  if (msg.voice && typeof msg.voice === "object") {
    const v = msg.voice as { file_id: string; mime_type?: string; file_size?: number };
    return { type: "voice", fileId: v.file_id, mimeType: v.mime_type, fileSize: v.file_size };
  }
  if (msg.audio && typeof msg.audio === "object") {
    const a = msg.audio as { file_id: string; file_name?: string; mime_type?: string; file_size?: number };
    return { type: "audio", fileId: a.file_id, fileName: a.file_name, mimeType: a.mime_type, fileSize: a.file_size };
  }
  if (msg.sticker && typeof msg.sticker === "object") {
    const s = msg.sticker as { file_id: string; file_size?: number };
    return { type: "sticker", fileId: s.file_id, fileSize: s.file_size };
  }
  if (msg.location) {
    return { type: "location" };
  }
  if (msg.contact) {
    return { type: "contact" };
  }
  return undefined;
}
