import { CONNECTION_NOTE_LIMIT, parseOutreachContext, type OutreachContext } from "@/lib/outreach-context";

export type ConnectionDraft = {
  context: OutreachContext;
  shortText: string;
  originalShortText: string;
  generating: boolean;
  error: string;
  updatedAt: number;
};

const MAX_DRAFTS = 50;
const DRAFT_TTL = 7 * 24 * 60 * 60 * 1000;

export function connectionDraftKey(context: OutreachContext): string {
  const { person_url, search_query, connection_reason } = parseOutreachContext(context);
  return JSON.stringify([person_url, search_query, connection_reason]);
}

export function connectionDraftStorageKey(userId: string): string {
  return `syncedin.connectionDrafts.v1:${userId}`;
}

export function restoreConnectionDrafts(raw: string | null, now = Date.now()): Map<string, ConnectionDraft> {
  const drafts = new Map<string, ConnectionDraft>();
  try {
    const items: unknown = JSON.parse(raw || "[]");
    if (!Array.isArray(items)) return drafts;
    for (const item of items.slice(0, MAX_DRAFTS)) {
      if (!item || typeof item !== "object" || !item.context || typeof item.context !== "object") continue;
      if (typeof item.updatedAt !== "number" || item.updatedAt > now || now - item.updatedAt > DRAFT_TTL) continue;
      if (typeof item.shortText !== "string" || item.shortText.length > CONNECTION_NOTE_LIMIT) continue;
      if (typeof item.originalShortText !== "string" || item.originalShortText.length > CONNECTION_NOTE_LIMIT) continue;
      const context = parseOutreachContext(item.context);
      if (!context.person_title || !/^https?:\/\//i.test(context.person_url)) continue;
      drafts.set(connectionDraftKey(context), {
        context,
        shortText: item.shortText,
        originalShortText: item.originalShortText,
        generating: false,
        error: item.generating ? "Drafting was interrupted. Your previous note is still here." : "",
        updatedAt: item.updatedAt
      });
    }
  } catch { /* Ignore invalid or expired browser data. */ }
  return drafts;
}

export function serializeConnectionDrafts(drafts: Map<string, ConnectionDraft>, now = Date.now()): string {
  return JSON.stringify(Array.from(drafts.values())
    .filter((draft) => now - draft.updatedAt <= DRAFT_TTL)
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, MAX_DRAFTS)
    .map(({ error: _error, ...draft }) => draft));
}
