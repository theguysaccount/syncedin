import assert from "node:assert/strict";
import fs from "node:fs";
import crypto from "node:crypto";
import { inspectPublicPage, inspectSitemap, verifyPublicPage } from "./public-page.mjs";

const base = new URL(process.argv[2] || "https://syncedin.org");
assert.equal(base.protocol, "https:", "Public release verification requires HTTPS.");
const cards = JSON.parse(fs.readFileSync("verification/social-card-manifest.json", "utf8"));
const titles = new Set();
for (const card of cards) {
  const page = await fetch(new URL(card.path, base), { signal: AbortSignal.timeout(20000) });
  assert.equal(page.status, 200, card.path);
  assert(page.headers.get("content-type")?.includes("text/html"), card.path + " did not return HTML");
  assert(!/\bnoindex\b|\bnone\b/i.test(page.headers.get("x-robots-tag") || ""), card.path + " is blocked by response headers");
  const html = await page.text();
  const document = verifyPublicPage(inspectPublicPage(html), card.path);
  assert(!titles.has(document.title[0]), card.path + " duplicate public title");
  titles.add(document.title[0]);
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
const sitemap = await fetch(new URL("/sitemap.xml", base), { signal: AbortSignal.timeout(20000) });
assert.equal(sitemap.status, 200);
assert(sitemap.headers.get("content-type")?.includes("xml"));
const sitemapXML = await sitemap.text();
assert(Buffer.byteLength(sitemapXML) <= 50_000_000, "Sitemap exceeds the uncompressed file limit");
const sitemapRows = inspectSitemap(sitemapXML);
assert(sitemapRows.length <= 50_000, "Sitemap exceeds the URL limit");
const sitemapURLs = new Set(sitemapRows.map(row => row.url));
assert.equal(sitemapURLs.size, sitemapRows.length, "Duplicate canonical sitemap URL");
for (const card of cards) assert(sitemapURLs.has("https://syncedin.org" + card.path), card.path + " missing from canonical sitemap");
for (const row of sitemapRows) {
  const url = new URL(row.url);
  assert.equal(url.origin, "https://syncedin.org");
  assert(!url.search && !url.hash, "Sitemap must contain canonical URLs without query or fragment");
  assert(!/^\/(?:login|dashboard|onboarding|settings|messages|conversations|admin|agent|poll)(?:\/|$)/.test(url.pathname), "Private sitemap route: " + url.pathname);
  if (row.lastModified) assert(!Number.isNaN(Date.parse(row.lastModified)) && Date.parse(row.lastModified) <= Date.now(), "Invalid or future sitemap date");
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
const guide=await fetch(new URL('/join.md',base),{signal:AbortSignal.timeout(20000)});
assert.equal(guide.status,200);assert(guide.headers.get('content-type').includes('text/markdown'));
assert((await guide.text()).includes('PRIVATE DRAFT'));
const discovery=await fetch(new URL('/.well-known/agent.json',base),{signal:AbortSignal.timeout(20000)});
assert.equal(discovery.status,200);
const protocol=await discovery.json();
assert.equal(protocol.humanReview,'required');assert.equal(protocol.tokenLifetimeHours,24);
assert.deepEqual(protocol.scopes,['read_profile','find_matches','draft_introductions']);
const client=await fetch(new URL('/syncedin.mjs',base),{signal:AbortSignal.timeout(20000)});
assert.equal(client.status,200);assert((await client.text()).includes('redirect: "error"'));
for(const path of ['/api/agent/me','/api/agent/matches','/api/agent/access']){
  const response=await fetch(new URL(path,base),{signal:AbortSignal.timeout(20000)});
  assert.equal(response.status,401,path);assert(response.headers.get('cache-control').includes('no-store'));
}
const review=await fetch(new URL('/agent/review',base),{signal:AbortSignal.timeout(20000)});
assert.equal(review.status,200);const reviewHtml=await review.text();
assert(reviewHtml.includes('noindex, nofollow'));assert(reviewHtml.includes('name="referrer" content="no-referrer"'));
const mcp=await fetch(new URL('/api/mcp',base),{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json, text/event-stream'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/list'}),signal:AbortSignal.timeout(20000)});
assert.equal(mcp.status,200);
const wire=await mcp.text(),tools=JSON.parse(wire.startsWith('data:')?wire.trim().slice(5):wire.match(/^data: (.+)$/m)?.[1]||wire);
assert.deepEqual(tools.result.tools.map(t=>t.name).sort(),['draft_introduction','find_matches','get_my_profile','prepare_signup','signup_status']);
console.log(`Public release verified at ${base.origin}: ${cards.length} unique titles, H1s, canonical pages and share-card pairs; canonical sitemap; private-route protection, agent resources, and actual MCP tool discovery.`);
