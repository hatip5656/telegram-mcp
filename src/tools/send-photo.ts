import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { Bot, InputFile } from "grammy";
import { existsSync } from "fs";
import { resolve } from "path";
import { MessageStore, SessionState, buildSessionPrefix } from "../telegram/store.js";

export function registerSendPhoto(server: McpServer, bot: Bot, store: MessageStore, sessionState: SessionState): void {
  server.tool(
    "send_photo",
    "Send a photo to a Telegram chat by URL, file ID, or local file path. chat_id is optional — defaults to the most recent known chat.",
    {
      chat_id: z.union([z.number(), z.string()]).optional().describe("Telegram chat ID or @username (optional — defaults to most recent chat)"),
      photo: z.string().describe("Photo URL, Telegram file_id, or absolute local file path"),
      caption: z.string().optional().describe("Photo caption"),
      parse_mode: z.enum(["HTML", "Markdown", "MarkdownV2"]).optional().describe("Caption formatting mode"),
    },
    async ({ chat_id, photo, caption, parse_mode }) => {
      const resolvedChatId = chat_id ?? store.getDefaultChatId();
      if (!resolvedChatId) {
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ success: false, error: "No known chats yet. The user needs to message the bot first." }) }],
          isError: true,
        };
      }

      try {
        const prefix = buildSessionPrefix(sessionState);
        const prefixedCaption = caption
          ? prefix ? `${prefix} ${caption}` : caption
          : prefix ?? undefined;

        const resolvedPath = photo.startsWith("/") || photo.startsWith("~")
          ? resolve(photo.replace(/^~/, process.env.HOME || "~"))
          : null;
        const photoInput = resolvedPath && existsSync(resolvedPath)
          ? new InputFile(resolvedPath)
          : photo;

        const result = await bot.api.sendPhoto(resolvedChatId, photoInput, {
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
