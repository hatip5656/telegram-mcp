import { Bot } from "grammy";
import { MessageStore } from "./store.js";

export function createBot(token: string, store: MessageStore): Bot {
  const bot = new Bot(token);

  bot.on("message", (ctx) => {
    const msg = ctx.message;
    const chat = ctx.chat;

    const isNewChat = store.updateChat({
      id: chat.id,
      type: chat.type,
      title: "title" in chat ? chat.title : undefined,
      username: "username" in chat ? chat.username : undefined,
      firstName: "first_name" in chat ? chat.first_name : undefined,
      lastName: "last_name" in chat ? chat.last_name : undefined,
      lastMessageAt: msg.date,
    });

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
      text: msg.text ?? msg.caption ?? `[${getMessageType(msg)}]`,
      date: msg.date,
      direction: "incoming",
    });

    // Notify about new chat discovery separately
    if (isNewChat) {
      store._emitNewChat?.(chat.id);
    }
  });

  return bot;
}

function getMessageType(msg: { photo?: unknown; video?: unknown; document?: unknown; voice?: unknown; audio?: unknown; sticker?: unknown; location?: unknown; contact?: unknown }): string {
  if (msg.photo) return "photo";
  if (msg.video) return "video";
  if (msg.document) return "document";
  if (msg.voice) return "voice";
  if (msg.audio) return "audio";
  if (msg.sticker) return "sticker";
  if (msg.location) return "location";
  if (msg.contact) return "contact";
  return "unsupported message type";
}
