import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { Bot } from "grammy";
import { MessageStore } from "../telegram/store.js";

export function registerSendMessage(server: McpServer, bot: Bot, store: MessageStore, sessionState: { id: string; name: string | null; emoji: string | null }): void {
  server.tool(
    "send_message",
    "Send a text message to a Telegram chat. If this session has claimed the chat, the message is prefixed with the session name.",
    {
      chat_id: z.union([z.number(), z.string()]).describe("Telegram chat ID or @username"),
      text: z.string().describe("Message text to send"),
      parse_mode: z.enum(["HTML", "Markdown", "MarkdownV2"]).optional().describe("Text formatting mode"),
      reply_to_message_id: z.number().optional().describe("Message ID to reply to"),
    },
    async ({ chat_id, text, parse_mode, reply_to_message_id }) => {
      try {
        const prefix = sessionState.name
          ? sessionState.emoji
            ? `${sessionState.emoji} [${sessionState.name}]`
            : `[${sessionState.name}]`
          : null;
        const prefixedText = prefix ? `${prefix} ${text}` : text;

        const result = await bot.api.sendMessage(chat_id, prefixedText, {
          parse_mode,
          reply_parameters: reply_to_message_id
            ? { message_id: reply_to_message_id }
            : undefined,
        });

        store.addMessage({
          messageId: result.message_id,
          chatId: result.chat.id,
          from: result.from
            ? {
                id: result.from.id,
                firstName: result.from.first_name,
                username: result.from.username ?? undefined,
                isBot: result.from.is_bot,
              }
            : undefined,
          text: prefixedText,
          date: result.date,
          direction: "outgoing",
        });

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                success: true,
                message_id: result.message_id,
                chat_id: result.chat.id,
                session_name: sessionState.name,
              }),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                success: false,
                error: error instanceof Error ? error.message : String(error),
              }),
            },
          ],
          isError: true,
        };
      }
    }
  );
}
