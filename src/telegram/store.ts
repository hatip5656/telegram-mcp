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

export interface SessionClaim {
  sessionId: string;
  sessionName: string;
  emoji?: string;
  chatId: number;
  claimedAt: number;
}

type StoreEvent = {
  newMessage: (msg: StoredMessage) => void;
  newChat: (chatId: number) => void;
};

const MAX_MESSAGES_PER_CHAT = 1000;
const MAX_TOTAL_MESSAGES = 5000;

export class MessageStore {
  private messages: StoredMessage[] = [];
  private chatMessages = new Map<number, StoredMessage[]>();
  private chats = new Map<number, ChatInfo>();
  private currentCursor = 0;
  private seenMessages = new Set<string>();
  private claims = new Map<number, SessionClaim>();
  private listeners: { [K in keyof StoreEvent]: StoreEvent[K][] } = {
    newMessage: [],
    newChat: [],
  };

  on<K extends keyof StoreEvent>(event: K, callback: StoreEvent[K]): void {
    this.listeners[event].push(callback);
  }

  addMessage(msg: Omit<StoredMessage, "cursor">): StoredMessage | null {
    const key = `${msg.chatId}:${msg.messageId}`;
    if (this.seenMessages.has(key)) {
      return null;
    }
    this.seenMessages.add(key);

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

  claimChat(chatId: number, sessionId: string, sessionName: string, emoji?: string): { success: boolean; error?: string } {
    const existing = this.claims.get(chatId);
    if (existing && existing.sessionId !== sessionId) {
      const label = existing.emoji ? `${existing.emoji} ${existing.sessionName}` : existing.sessionName;
      return { success: false, error: `Chat already claimed by session "${label}"` };
    }
    this.claims.set(chatId, { sessionId, sessionName, emoji, chatId, claimedAt: Date.now() });
    return { success: true };
  }

  releaseChat(chatId: number, sessionId: string): { success: boolean; error?: string } {
    const existing = this.claims.get(chatId);
    if (!existing) {
      return { success: false, error: "Chat is not claimed" };
    }
    if (existing.sessionId !== sessionId) {
      return { success: false, error: `Chat is claimed by session "${existing.sessionName}", not yours` };
    }
    this.claims.delete(chatId);
    return { success: true };
  }

  getSessionForChat(chatId: number): SessionClaim | undefined {
    return this.claims.get(chatId);
  }

  getAllSessions(): SessionClaim[] {
    return Array.from(this.claims.values());
  }

  isChatClaimedBy(chatId: number, sessionId: string): boolean {
    const claim = this.claims.get(chatId);
    return claim !== undefined && claim.sessionId === sessionId;
  }

  isChatClaimed(chatId: number): boolean {
    return this.claims.has(chatId);
  }
}
