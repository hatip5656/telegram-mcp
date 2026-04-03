export interface ChatInfo {
  id: number;
  type: string;
  title?: string;
  username?: string;
  firstName?: string;
  lastName?: string;
  lastMessageAt: number;
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
  date: number;
  direction: "incoming" | "outgoing";
  cursor: number;
}

const MAX_MESSAGES_PER_CHAT = 1000;
const MAX_TOTAL_MESSAGES = 5000;

export class MessageStore {
  private messages: StoredMessage[] = [];
  private chatMessages = new Map<number, StoredMessage[]>();
  private chats = new Map<number, ChatInfo>();
  private currentCursor = 0;
  private onNewMessageCallback?: (msg: StoredMessage) => void;
  _emitNewChat?: (chatId: number) => void;

  addMessage(msg: Omit<StoredMessage, "cursor">): StoredMessage {
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

    this.onNewMessageCallback?.(stored);
    return stored;
  }

  updateChat(chat: ChatInfo): boolean {
    const isNew = !this.chats.has(chat.id);
    this.chats.set(chat.id, chat);
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

  getCurrentCursor(): number {
    return this.currentCursor;
  }

  onNewMessage(callback: (msg: StoredMessage) => void): void {
    this.onNewMessageCallback = callback;
  }
}
