import { Bot } from "grammy";
import { MessageStore, MediaInfo, ActiveSession, toCommandName, parseCommand } from "./store.js";

export function createBot(token: string, store: MessageStore): Bot {
  const bot = new Bot(token);

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

  bot.on("message", (ctx) => {
    const msg = ctx.message;
    const chat = ctx.chat;
    const cmd = parseCommand(msg.text ?? "");

    if (cmd === "setup") {
      const sessions = store.getActiveSessions();
      const sessionList = sessions.length > 0
        ? sessions.map((s) => {
            const label = s.emoji ? `${s.emoji} ${s.name}` : s.name;
            return `  /${toCommandName(s.name)} — ${label}`;
          }).join("\n")
        : "  No active sessions";
      const target = store.getTarget(chat.id);
      ctx.reply(
        `Chat ID: \`${chat.id}\`\n\n` +
        `Active sessions:\n${sessionList}\n\n` +
        `Current target: ${target ? `\`${target}\`` : "none (all sessions receive messages)"}`,
        { parse_mode: "Markdown" },
      );
      return;
    }

    if (cmd) {
      const sessions = store.getActiveSessions();
      const matched = sessions.find((s) => toCommandName(s.name) === cmd);
      if (matched) {
        store.setTarget(chat.id, matched.name);
        const label = matched.emoji ? `${matched.emoji} ${matched.name}` : matched.name;
        ctx.reply(`Messages are now directed to session: ${label}`);
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

function syncCommands(bot: Bot, sessions: ActiveSession[]): void {
  const commands = [
    { command: "setup", description: "Show chat ID and active sessions" },
    ...sessions.map((s) => ({
      command: toCommandName(s.name),
      description: `Switch to session: ${s.emoji ? `${s.emoji} ` : ""}${s.name}`,
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
