import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { homedir } from "os";

export interface SessionState {
  name: string | null;
  emoji: string | null;
}

export interface ChatInfo {
  id: number;
  type: string;
  title?: string;
  username?: string;
  firstName?: string;
  lastName?: string;
  lastMessageAt: number;
}

export interface MediaInfo {
  type: "photo" | "video" | "document" | "voice" | "audio" | "sticker" | "location" | "contact";
  fileId?: string;
  fileName?: string;
  mimeType?: string;
  fileSize?: number;
}

export interface StoredMessage {
  messageId: number;
  chatId: number;
  from?: {
    id: number;
    firstName: string;
    username?: string;
    isBot: boolean;
  };
  text?: string;
  media?: MediaInfo;
  date: number;
  direction: "incoming" | "outgoing";
  cursor: number;
}

export function buildSessionPrefix(session: SessionState): string | null {
  if (!session.name) return null;
  return session.emoji ? `${session.emoji} [${session.name}]` : `[${session.name}]`;
}

type StoreEvent = {
  newMessage: (msg: StoredMessage) => void;
  newChat: (chatId: number) => void;
};

const MAX_MESSAGES_PER_CHAT = 1000;
const MAX_TOTAL_MESSAGES = 5000;
const MAX_SEEN_MESSAGES = 10000;
const PERSIST_DEBOUNCE_MS = 2000;

export class MessageStore {
  private messages: StoredMessage[] = [];
  private chatMessages = new Map<number, StoredMessage[]>();
  private chats = new Map<number, ChatInfo>();
  private currentCursor = 0;
  private seenMessages = new Set<string>();
  private chatsFilePath: string;
  private persistTimer: ReturnType<typeof setTimeout> | null = null;
  private listeners: { [K in keyof StoreEvent]: StoreEvent[K][] } = {
    newMessage: [],
    newChat: [],
  };

  constructor(dataDir?: string) {
    const dir = dataDir ?? join(homedir(), ".telegram-mcp");
    mkdirSync(dir, { recursive: true });
    this.chatsFilePath = join(dir, "chats.json");
    this.loadChats();
  }

  private loadChats(): void {
    try {
      const data = readFileSync(this.chatsFilePath, "utf-8");
      const chats: ChatInfo[] = JSON.parse(data);
      for (const chat of chats) {
        this.chats.set(chat.id, chat);
      }
      console.error(`Loaded ${chats.length} chats from ${this.chatsFilePath}`);
    } catch {
      // No file yet — first run
    }
  }

  private schedulePersist(): void {
    if (this.persistTimer) return;
    this.persistTimer = setTimeout(() => {
      this.persistTimer = null;
      const chats = Array.from(this.chats.values());
      writeFileSync(this.chatsFilePath, JSON.stringify(chats, null, 2));
    }, PERSIST_DEBOUNCE_MS);
  }

  on<K extends keyof StoreEvent>(event: K, callback: StoreEvent[K]): void {
    this.listeners[event].push(callback);
  }

  addMessage(msg: Omit<StoredMessage, "cursor">): StoredMessage | null {
    const key = `${msg.chatId}:${msg.messageId}`;
    if (this.seenMessages.has(key)) {
      return null;
    }
    this.seenMessages.add(key);

    if (this.seenMessages.size > MAX_SEEN_MESSAGES) {
      const iter = this.seenMessages.values();
      for (let i = 0; i < MAX_SEEN_MESSAGES / 2; i++) {
        this.seenMessages.delete(iter.next().value!);
      }
    }

    const stored: StoredMessage = { ...msg, cursor: ++this.currentCursor };

    this.messages.push(stored);
    if (this.messages.length > MAX_TOTAL_MESSAGES) {
      this.messages = this.messages.slice(-MAX_TOTAL_MESSAGES);
    }

    const chatMsgs = this.chatMessages.get(msg.chatId) ?? [];
    chatMsgs.push(stored);
    if (chatMsgs.length > MAX_MESSAGES_PER_CHAT) {
      chatMsgs.splice(0, chatMsgs.length - MAX_MESSAGES_PER_CHAT);
    }
    this.chatMessages.set(msg.chatId, chatMsgs);

    for (const cb of this.listeners.newMessage) cb(stored);
    return stored;
  }

  updateChat(chat: ChatInfo): boolean {
    const isNew = !this.chats.has(chat.id);
    this.chats.set(chat.id, chat);
    this.schedulePersist();
    if (isNew) {
      for (const cb of this.listeners.newChat) cb(chat.id);
    }
    return isNew;
  }

  getChats(type?: string): ChatInfo[] {
    const all = Array.from(this.chats.values());
    const filtered = type && type !== "all" ? all.filter((c) => c.type === type) : all;
    return filtered.sort((a, b) => b.lastMessageAt - a.lastMessageAt);
  }

  getMessages(chatId: number, limit = 50): StoredMessage[] {
    const msgs = this.chatMessages.get(chatId) ?? [];
    return msgs.slice(-limit);
  }

  getRecentUpdates(limit = 20, sinceCursor?: number): StoredMessage[] {
    if (sinceCursor !== undefined) {
      const filtered = this.messages.filter((m) => m.cursor > sinceCursor);
      return filtered.slice(-limit);
    }
    return this.messages.slice(-limit);
  }

  getMinCursor(): number {
    return this.messages.length > 0 ? this.messages[0].cursor : this.currentCursor;
  }

  getCurrentCursor(): number {
    return this.currentCursor;
  }

  getDefaultChatId(): number | null {
    const chats = this.getChats();
    return chats.length > 0 ? chats[0].id : null;
  }
}
