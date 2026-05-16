import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { Bot } from "grammy";
import { MessageStore, SessionState, buildSessionPrefix } from "../telegram/store.js";

export function registerSendMessage(server: McpServer, bot: Bot, store: MessageStore, sessionState: SessionState): void {
  server.tool(
    "send_message",
    "Send a text message to a Telegram chat. chat_id is optional — defaults to the most recent known chat.",
    {
      chat_id: z.union([z.number(), z.string()]).optional().describe("Telegram chat ID or @username (optional — defaults to most recent chat)"),
      text: z.string().describe("Message text to send"),
      parse_mode: z.enum(["HTML", "Markdown", "MarkdownV2"]).optional().describe("Text formatting mode"),
      reply_to_message_id: z.number().optional().describe("Message ID to reply to"),
    },
    async ({ chat_id, text, parse_mode, reply_to_message_id }) => {
      const resolvedChatId = chat_id ?? store.getDefaultChatId();
      if (!resolvedChatId) {
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ success: false, error: "No known chats yet. The user needs to message the bot first." }) }],
          isError: true,
        };
      }

      try {
        const prefix = buildSessionPrefix(sessionState);
        const prefixedText = prefix ? `${prefix} ${text}` : text;

        const result = await bot.api.sendMessage(resolvedChatId, prefixedText, {
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
