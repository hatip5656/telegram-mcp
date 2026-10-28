import { test } from "node:test";
import assert from "node:assert/strict";
import { parseAllowedUsers, isUserAllowed } from "./access.js";

test("unset allowlist rejects everyone", () => {
  const policy = parseAllowedUsers(undefined);
  assert.equal(policy.allowAll, false);
  assert.equal(isUserAllowed(policy, 123), false);
  assert.equal(isUserAllowed(policy, undefined), false);
});

test("parses comma and space separated user IDs", () => {
  const policy = parseAllowedUsers("123, 456 789");
  assert.deepEqual([...policy.userIds], [123, 456, 789]);
  assert.equal(isUserAllowed(policy, 456), true);
  assert.equal(isUserAllowed(policy, 999), false);
});

test("wildcard allows everyone", () => {
  const policy = parseAllowedUsers("*");
  assert.equal(isUserAllowed(policy, 999), true);
});

test("rejects usernames and other non-numeric entries", () => {
  assert.throws(() => parseAllowedUsers("123,@alice"), /Invalid entry "@alice"/);
});
