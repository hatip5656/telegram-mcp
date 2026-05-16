import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { homedir } from "os";

export interface SessionState {
  name: string | null;
  emoji: string | null;
}

export interface ActiveSession {
  name: string;
  emoji: string | null;
  pid: number;
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
  targetSession?: string;
}

export function buildSessionPrefix(session: SessionState): string | null {
  if (!session.name) return null;
  return session.emoji ? `${session.emoji} [${session.name}]` : `[${session.name}]`;
}

export function toCommandName(sessionName: string): string {
  return sessionName.toLowerCase().replace(/[^a-z0-9_]/g, "_").slice(0, 32);
}

export function parseCommand(text: string): string | null {
  if (!text.startsWith("/")) return null;
  return text.split(/\s|@/)[0].slice(1);
}

type StoreEvent = {
  newMessage: (msg: StoredMessage) => void;
  newChat: (chatId: number) => void;
  sessionsChanged: (sessions: ActiveSession[]) => void;
};

const MAX_MESSAGES_PER_CHAT = 1000;
const MAX_TOTAL_MESSAGES = 5000;
const MAX_SEEN_MESSAGES = 10000;
const PERSIST_DEBOUNCE_MS = 2000;

function isProcessRunning(pid: number): boolean {
  try { process.kill(pid, 0); return true; } catch { return false; }
}

export class MessageStore {
  private messages: StoredMessage[] = [];
  private chatMessages = new Map<number, StoredMessage[]>();
  private chats = new Map<number, ChatInfo>();
  private currentCursor = 0;
  private seenMessages = new Set<string>();
  private chatsFilePath: string;
  private sessionsFilePath: string;
  private targetsFilePath: string;
  private persistTimer: ReturnType<typeof setTimeout> | null = null;
  private chatTargets = new Map<number, string>();
  private cachedSessions: ActiveSession[] | null = null;
  private listeners: { [K in keyof StoreEvent]: StoreEvent[K][] } = {
    newMessage: [],
    newChat: [],
    sessionsChanged: [],
  };

  constructor(dataDir?: string) {
    const dir = dataDir ?? join(homedir(), ".telegram-mcp");
    mkdirSync(dir, { recursive: true });
    this.chatsFilePath = join(dir, "chats.json");
    this.sessionsFilePath = join(dir, "sessions.json");
    this.targetsFilePath = join(dir, "targets.json");
    this.loadChats();
    this.loadTargets();
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

  private loadTargets(): void {
    try {
      const data = readFileSync(this.targetsFilePath, "utf-8");
      const targets: Record<string, string> = JSON.parse(data);
      for (const [chatId, session] of Object.entries(targets)) {
        this.chatTargets.set(Number(chatId), session);
      }
    } catch {
      // No file yet
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

  private persistSessions(sessions: ActiveSession[]): void {
    this.cachedSessions = sessions;
    writeFileSync(this.sessionsFilePath, JSON.stringify(sessions, null, 2));
    for (const cb of this.listeners.sessionsChanged) cb(sessions);
  }

  on<K extends keyof StoreEvent>(event: K, callback: StoreEvent[K]): void {
    this.listeners[event].push(callback);
  }

  // --- Session registry (shared across processes via file) ---

  registerSession(name: string, emoji: string | null): ActiveSession[] {
    const sessions = this.getActiveSessions();
    const existing = sessions.findIndex((s) => s.name === name);
    if (existing !== -1) sessions.splice(existing, 1);
    sessions.push({ name, emoji, pid: process.pid });
    this.persistSessions(sessions);
    return sessions;
  }

  unregisterSession(name: string): void {
    const sessions = this.getActiveSessions().filter((s) => s.name !== name);
    this.persistSessions(sessions);
  }

  getActiveSessions(): ActiveSession[] {
    if (this.cachedSessions) return [...this.cachedSessions];
    try {
      const data = readFileSync(this.sessionsFilePath, "utf-8");
      const sessions: ActiveSession[] = JSON.parse(data);
      this.cachedSessions = sessions.filter((s) => isProcessRunning(s.pid));
      return [...this.cachedSessions];
    } catch {
      return [];
    }
  }

  // --- Chat targeting ---

  setTarget(chatId: number, sessionName: string): void {
    this.chatTargets.set(chatId, sessionName);
    const obj: Record<string, string> = {};
    for (const [id, name] of this.chatTargets) obj[String(id)] = name;
    writeFileSync(this.targetsFilePath, JSON.stringify(obj, null, 2));
  }

  getTarget(chatId: number): string | undefined {
    return this.chatTargets.get(chatId);
  }

  // --- Messages ---

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

    const targetSession = msg.direction === "incoming"
      ? this.chatTargets.get(msg.chatId)
      : undefined;

    const stored: StoredMessage = { ...msg, cursor: ++this.currentCursor, targetSession };

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

  getMessages(chatId: number, limit = 50, session?: string): StoredMessage[] {
    let msgs = this.chatMessages.get(chatId) ?? [];
    if (session) {
      msgs = msgs.filter((m) => !m.targetSession || m.targetSession === session);
    }
    return msgs.slice(-limit);
  }

  getRecentUpdates(limit = 20, sinceCursor?: number, session?: string): StoredMessage[] {
    let msgs = sinceCursor !== undefined
      ? this.messages.filter((m) => m.cursor > sinceCursor)
      : this.messages;

    if (session) {
      msgs = msgs.filter((m) => !m.targetSession || m.targetSession === session);
    }

    return msgs.slice(-limit);
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
