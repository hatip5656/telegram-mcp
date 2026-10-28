import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { MessageStore, ChatInfo, parseCommand, toCommandName } from "./store.js";

function storeWith(chats: ChatInfo[]): MessageStore {
  const store = new MessageStore(mkdtempSync(join(tmpdir(), "telegram-mcp-test-")));
  for (const chat of chats) store.updateChat(chat);
  return store;
}

const alice: ChatInfo = { id: 111, type: "private", username: "Alice", lastMessageAt: 2 };
const group: ChatInfo = { id: -500, type: "group", title: "Team", lastMessageAt: 1, lastSenderId: 111 };

test("resolveChatId only returns known chats", () => {
  const store = storeWith([alice, group]);
  assert.equal(store.resolveChatId(), 111);
  assert.equal(store.resolveChatId(-500), -500);
  assert.equal(store.resolveChatId("-500"), -500);
  assert.equal(store.resolveChatId("@alice"), 111);
  assert.equal(store.resolveChatId(999), null);
  assert.equal(store.resolveChatId("@mallory"), null);
});

test("retainChats drops chats that fail the predicate", () => {
  const store = storeWith([alice, group, { id: 222, type: "private", lastMessageAt: 3 }]);
  store.retainChats((c) => (c.type === "private" ? c.id : c.lastSenderId) === 111);
  assert.deepEqual(store.getChats().map((c) => c.id), [111, -500]);
  assert.equal(store.resolveChatId(222), null);
});

test("parseCommand strips slash and bot mention", () => {
  assert.equal(parseCommand("/setup"), "setup");
  assert.equal(parseCommand("/debug_api@my_bot hello"), "debug_api");
  assert.equal(parseCommand("hello"), null);
});

test("toCommandName normalizes session names", () => {
  assert.equal(toCommandName("Debug-API"), "debug_api");
});
