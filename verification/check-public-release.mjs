import assert from "node:assert/strict";
import fs from "node:fs";
import crypto from "node:crypto";

const base = new URL(process.argv[2] || "https://syncedin.org");
assert.equal(base.protocol, "https:", "Public release verification requires HTTPS.");
const cards = JSON.parse(fs.readFileSync("verification/social-card-manifest.json", "utf8"));
for (const card of cards) {
  const page = await fetch(new URL(card.path, base), { signal: AbortSignal.timeout(20000) });
  assert.equal(page.status, 200, card.path);
  const html = await page.text();
  assert(html.includes('property="og:image"'), card.path + " Open Graph metadata missing");
  assert(html.includes('name="twitter:image"'), card.path + " Twitter metadata missing");
  for (const name of ["opengraph-image.png", "twitter-image.png"]) {
    assert(html.includes(card.path + "/" + name), card.path + " must reference its own card");
    const response = await fetch(new URL(card.path + "/" + name, base), { signal: AbortSignal.timeout(20000) });
    assert.equal(response.status, 200, card.path + "/" + name);
    assert(response.headers.get("content-type")?.includes("image/png"));
    const bytes = Buffer.from(await response.arrayBuffer());
    assert.equal(crypto.createHash("sha256").update(bytes).digest("hex"), card.sha256);
  }
}
const login = await fetch(new URL("/login", base), { signal: AbortSignal.timeout(20000) });
assert.equal(login.status, 200);
const loginHtml = await login.text();
assert(loginHtml.includes("auth-screen"));
assert(loginHtml.includes("noindex"));
assert(loginHtml.includes('data-clarity-mask="True"'), "Replay text masking is missing.");
const privacy = await fetch(new URL("/privacy", base), { signal: AbortSignal.timeout(20000) });
assert.equal(privacy.status, 200);
const privacyHtml = await privacy.text();
assert(privacyHtml.includes("Claw Messenger"));
assert(privacyHtml.includes("we do not promise zero retention"));
const safety = await fetch(new URL("/admin/safety", base), { signal: AbortSignal.timeout(20000) });
const safetyHtml = await safety.text();
assert(safety.status === 404 || (safety.status === 200 && safetyHtml.includes("auth-screen")), "Anonymous users cannot enter the founder queue.");
console.log(`Public release verified at ${base.origin}: ${cards.length} page-specific cards, both social formats, login and private safety-route protection.`);
