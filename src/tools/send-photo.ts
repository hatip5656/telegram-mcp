import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { Bot, InputFile } from "grammy";
import { existsSync } from "fs";
import { extname, resolve } from "path";
import { MessageStore, SessionState, buildSessionPrefix } from "../telegram/store.js";

// Local paths are limited to image files so a prompt-injected call can't be
// used to ship arbitrary files (keys, .env) off the machine.
const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp"]);

export function registerSendPhoto(server: McpServer, bot: Bot, store: MessageStore, sessionState: SessionState): void {
  server.tool(
    "send_photo",
    "Send a photo to a Telegram chat by URL, file ID, or local file path. chat_id is optional — defaults to the most recent known chat.",
    {
      chat_id: z.union([z.number(), z.string()]).optional().describe("Telegram chat ID or @username (optional — defaults to most recent chat)"),
      photo: z.string().describe("Photo URL, Telegram file_id, or absolute local path to an image file"),
      caption: z.string().optional().describe("Photo caption"),
      parse_mode: z.enum(["HTML", "Markdown", "MarkdownV2"]).optional().describe("Caption formatting mode"),
    },
    async ({ chat_id, photo, caption, parse_mode }) => {
      const resolvedChatId = store.resolveChatId(chat_id);
      if (!resolvedChatId) {
        const error = chat_id === undefined
          ? "No known chats yet. An allowed user (TELEGRAM_ALLOWED_USERS) needs to message the bot first."
          : `Unknown chat ${chat_id}. Messages can only be sent to chats where an allowed user has messaged the bot.`;
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ success: false, error }) }],
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
        if (resolvedPath && !IMAGE_EXTENSIONS.has(extname(resolvedPath).toLowerCase())) {
          throw new Error(`Only image files can be sent from a local path (${[...IMAGE_EXTENSIONS].join(", ")})`);
        }
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
