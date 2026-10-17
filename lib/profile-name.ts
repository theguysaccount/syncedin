const NAME = new RegExp("^[\\p{L}\\p{M}][\\p{L}\\p{M} .,'\\u2019-]{0,79}$", "u");

function candidate(value: string, minimumWords = 1): string | null {
  const name = value.trim().replace(/\s+/g, " ");
  const words = name.split(" ");
  return NAME.test(name) && words.length >= minimumWords && words.length <= 6
    ? name
    : null;
}

/** Read identity fields, never location, employer, or biography values. */
export function extractProfileName(scrapeText: string): string | null {
  const lines = scrapeText.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  const fields = new Map<string, string>();
  for (const line of lines) {
    const field = line.match(/^([\w ]+)\s*:\s*(.*)$/);
    if (field) {
      const key = field[1].replace(/[\s_]/g, "").toLowerCase();
      if (!fields.has(key)) fields.set(key, field[2]);
    }
  }

  for (const key of ["fullname", "displayname", "personname", "profilename", "name"]) {
    const name = candidate(fields.get(key) || "");
    // An identical URL-derived name is still a successful identity match.
    if (name) return name;
  }

  const first = fields.get("firstname");
  const last = fields.get("lastname");
  if (first && last) {
    const name = candidate(`${first} ${last}`);
    if (name) return name;
  }

  // A raw page heading can carry the name; labelled metadata cannot.
  const heading = lines[0];
  if (!heading || heading.includes(":")) return null;
  return candidate(heading.replace(/^#{1,6}\s+/, "").split(/\s+[|\u00b7\u2013\u2014-]\s+/)[0], 2);
}
