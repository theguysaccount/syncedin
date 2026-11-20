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
const homeResponse = await fetch(new URL("/", base), { headers: { cookie: "syncedin_landing_ab=a" }, redirect: "manual", signal: AbortSignal.timeout(20000) });
assert.equal(homeResponse.status, 200, "Homepage variant A must remain reachable");
assert(!/\bnoindex\b|\bnone\b/i.test(homeResponse.headers.get("x-robots-tag") || ""));
const homeHTML = await homeResponse.text();
const home = inspectPublicPage(homeHTML);
assert.equal(home.title.length, 1);
assert.equal(home.descriptions.length, 1);
assert.equal(home.canonical.length, 1);
assert.equal(new URL(home.canonical[0]).href, "https://syncedin.org/");
assert.equal(home.headings.length, 1);
assert(home.headings[0].includes("AI networking."));
assert(!home.robots.some(value => /\bnoindex\b|\bnone\b/i.test(value)));
assert(home.schemas.length > 0);
assert(!/4\.9\s+(?:average|avg|rating)|40\+ founders|94%|~0 sec|everything wipes|unlimited conversations/.test(home.contentText));
assert(homeHTML.includes('id="signup-profile-handle"') && homeHTML.includes('data-clarity-mask="True"'));
assert.equal(home.links.filter(link => link.href.startsWith("/login?next=")).length, 4, "Keep all four audience signup destinations");
const approvedHomeGIF = fs.readFileSync("public/social/syncedin-preview.gif");
const approvedHomeHash = crypto.createHash("sha256").update(approvedHomeGIF).digest("hex");
assert(home.openGraphImages.length && home.twitterImages.length);
for (const imageURL of new Set([...home.openGraphImages, ...home.twitterImages])) {
  const image = new URL(imageURL);
  assert.equal(image.origin, "https://syncedin.org");
  const response = await fetch(new URL(image.pathname + image.search, base), { signal: AbortSignal.timeout(20000) });
  assert.equal(response.status, 200);
  assert(response.headers.get("content-type")?.includes("image/gif"));
  const bytes = Buffer.from(await response.arrayBuffer());
  assert.equal(bytes.subarray(0, 6).toString(), "GIF89a");
  assert.equal(bytes.readUInt16LE(6), 600);
  assert.equal(bytes.readUInt16LE(8), 338);
  assert.equal(crypto.createHash("sha256").update(bytes).digest("hex"), approvedHomeHash, "Preserve the actual approved homepage animation, not a transparent fallback");
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
// Verify this release's reference before touching the legacy notification
// path: older deployments used a mutating GET there.
for (const expected of JSON.parse(fs.readFileSync("verification/product-reference-manifest.json", "utf8"))) {
  const path = expected.path;
  const reference = await fetch(new URL(path, base), { signal: AbortSignal.timeout(20000) });
  assert.equal(reference.status, 200);
  assert(reference.headers.get("content-type")?.includes("text/plain"));
  const text = await reference.text();
  assert.equal(crypto.createHash("sha256").update(text).digest("hex"), expected.sha256, path + " published reference drifted");
  assert.equal(Buffer.byteLength(text), expected.bytes);
  assert(text.includes("This reference describes the current web workflow"), path + " still serves the old reference");
  assert(text.includes("do not retrain the underlying model"));
  assert(!/\$20M|Founded:\s*2025|unlimited outbound|100% replicable/.test(text), path + " unsupported product claims");
}
const articleExport = JSON.parse(fs.readFileSync("verification/article-export-manifest.json", "utf8"));
const articleDownload = await fetch(new URL(articleExport.path, base), { signal: AbortSignal.timeout(20000) });
assert.equal(articleDownload.status, 200);
assert(articleDownload.headers.get("content-type")?.includes("text/markdown"));
assert.equal(articleDownload.headers.get("link"), '<https://syncedin.org/article>; rel="canonical"');
assert(articleDownload.headers.get("x-robots-tag")?.includes("noindex"));
const articleText = await articleDownload.text();
assert.equal(crypto.createHash("sha256").update(articleText).digest("hex"), articleExport.sha256, "Article export must match the reviewed HTML source");
assert.equal(Buffer.byteLength(articleText), articleExport.bytes);
const legacyArticle = await fetch(new URL("/articles/syncedin-launch.md", base), { redirect: "manual", signal: AbortSignal.timeout(20000) });
assert.equal(legacyArticle.status, 308);
assert.equal(new URL(legacyArticle.headers.get("location"), base).pathname, "/article");
const notificationRead = await fetch(new URL("/api/indexnow?url=https%3A%2F%2Fsyncedin.org%2Fguides", base), { signal: AbortSignal.timeout(20000) });
assert.equal(notificationRead.status, 405, "Public reads must not submit IndexNow notifications");
assert.equal(notificationRead.headers.get("allow"), "POST");
assert(notificationRead.headers.get("cache-control")?.includes("no-store"));
const notificationWrite = await fetch(new URL("/api/indexnow", base), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ urls: [] }), signal: AbortSignal.timeout(20000) });
assert.equal(notificationWrite.status, 401, "Anonymous users must not submit IndexNow notifications");
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
console.log(`Public release verified at ${base.origin}: ${cards.length} unique public page/card pairs plus homepage identity, controls and original GIF bytes; canonical sitemap; reviewed references and article export; non-mutating and owner-only IndexNow; private-route protection, agent resources, and actual MCP tool discovery.`);
