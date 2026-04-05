import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { Bot } from "grammy";
import { MessageStore } from "../telegram/store.js";

export function registerSendPhoto(server: McpServer, bot: Bot, store: MessageStore, sessionState: { id: string; name: string | null; emoji: string | null }): void {
  server.tool(
    "send_photo",
    "Send a photo to a Telegram chat by URL or file ID, with an optional caption. If this session has claimed the chat, the caption is prefixed with the session name.",
    {
      chat_id: z.union([z.number(), z.string()]).describe("Telegram chat ID or @username"),
      photo: z.string().describe("Photo URL or Telegram file_id"),
      caption: z.string().optional().describe("Photo caption"),
      parse_mode: z.enum(["HTML", "Markdown", "MarkdownV2"]).optional().describe("Caption formatting mode"),
    },
    async ({ chat_id, photo, caption, parse_mode }) => {
      try {
        const prefix = sessionState.name
          ? sessionState.emoji
            ? `${sessionState.emoji} [${sessionState.name}]`
            : `[${sessionState.name}]`
          : null;
        const prefixedCaption = caption
          ? prefix ? `${prefix} ${caption}` : caption
          : prefix ?? undefined;

        const result = await bot.api.sendPhoto(chat_id, photo, {
          caption: prefixedCaption,
          parse_mode,
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
          text: prefixedCaption ?? "[photo]",
          media: { type: "photo", fileId: result.photo?.[0]?.file_id ?? "" },
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
    },
  );
}
