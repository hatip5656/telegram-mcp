// Access control: only Telegram users listed in TELEGRAM_ALLOWED_USERS can talk
// to the bot. Anything they send ends up in an agent's context, so an open bot
// is a prompt-injection channel for anyone who finds its username.

export interface AccessPolicy {
  allowAll: boolean;
  userIds: Set<number>;
}

// Accepts a comma/space separated list of numeric user IDs, or "*" to allow
// everyone. Usernames are deliberately not supported — they can be changed and
// re-registered by someone else, user IDs cannot.
export function parseAllowedUsers(raw: string | undefined): AccessPolicy {
  const tokens = (raw ?? "").split(/[\s,]+/).filter(Boolean);
  if (tokens.includes("*")) {
    return { allowAll: true, userIds: new Set() };
  }

  const userIds = new Set<number>();
  for (const token of tokens) {
    if (!/^\d+$/.test(token)) {
      throw new Error(
        `Invalid entry "${token}" in TELEGRAM_ALLOWED_USERS — expected numeric Telegram user IDs or "*"`
      );
    }
    userIds.add(Number(token));
  }
  return { allowAll: false, userIds };
}

export function isUserAllowed(policy: AccessPolicy, userId: number | undefined): boolean {
  if (policy.allowAll) return true;
  return userId !== undefined && policy.userIds.has(userId);
}
