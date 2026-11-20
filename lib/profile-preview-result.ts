export type ProfilePreviewResult = {
  headline: string;
  about: string;
  highlights: string[];
  people: { name: string; why: string }[];
};

export function parseProfilePreview(value: unknown): ProfilePreviewResult | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (row.error || typeof row.headline !== "string" || !row.headline.trim() || typeof row.about !== "string" || !row.about.trim()) return null;
  const people: ProfilePreviewResult["people"] = [];
  for (const item of Array.isArray(row.people) ? row.people.slice(0, 5) : []) {
    if (!item || typeof item !== "object" || typeof item.name !== "string" || item.name.trim().length < 2) continue;
    people.push({ name: item.name.trim().slice(0, 60), why: typeof item.why === "string" ? item.why.slice(0, 80) : "" });
  }
  return {
    headline: row.headline.trim().slice(0, 160),
    about: row.about.trim().slice(0, 600),
    highlights: (Array.isArray(row.highlights) ? row.highlights : []).filter((item): item is string => typeof item === "string" && !!item.trim()).slice(0, 4).map(item => item.trim().slice(0, 160)),
    people,
  };
}
