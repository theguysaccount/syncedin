import assert from "node:assert/strict";
import { DOMParser } from "@xmldom/xmldom";

export function inspectPublicPage(html) {
  const doc = new DOMParser({ onError(level, message) { if (level !== "warning") throw new Error(message); } }).parseFromString(html, "text/html");
  const all = tag => Array.from(doc.getElementsByTagName(tag)).filter(node => {
    if (node.namespaceURI !== "http://www.w3.org/1999/xhtml") return false;
    // Inline SVG without an explicit xmlns still has non-document titles.
    for (let parent = node.parentNode; parent; parent = parent.parentNode) if (["svg", "math"].includes(parent.localName?.toLowerCase())) return false;
    return true;
  });
  const meta = (attribute, name) => all("meta").filter(node => node.getAttribute(attribute) === name).map(node => node.getAttribute("content"));
  function contentText(node) {
    if (node.nodeType === 3) return node.nodeValue || "";
    if (node.nodeType !== 1 && node.nodeType !== 9) return "";
    if (["head", "script", "style", "svg", "math", "template"].includes(node.localName?.toLowerCase()) || node.hasAttribute?.("hidden") || node.getAttribute?.("aria-hidden") === "true") return "";
    return Array.from(node.childNodes || []).map(contentText).join(" ");
  }
  return {
    contentText: contentText(doc).replace(/\s+/g, " ").trim(),
    title: all("title").map(node => node.textContent),
    descriptions: meta("name", "description"),
    canonical: all("link").filter(node => node.getAttribute("rel") === "canonical").map(node => node.getAttribute("href")),
    robots: meta("name", "robots"),
    headings: all("h1").map(node => node.textContent.trim()),
    links: all("a").map(node => ({ href: node.getAttribute("href"), text: node.textContent.trim() })),
    openGraphImages: meta("property", "og:image"),
    twitterImages: meta("name", "twitter:image"),
    twitterCards: meta("name", "twitter:card"),
    imageWidths: meta("property", "og:image:width"),
    imageHeights: meta("property", "og:image:height"),
    imageTypes: meta("property", "og:image:type"),
    schemas: all("script").filter(node => node.getAttribute("type") === "application/ld+json").map(node => JSON.parse(node.textContent)),
  };
}

export function verifyPublicPage(page, path, canonicalOrigin = "https://syncedin.org") {
  assert.equal(page.title.length, 1, `${path}: one title required`);
  assert(page.title[0].trim(), `${path}: title is empty`);
  assert.equal(page.descriptions.length, 1, `${path}: one description required`);
  assert(page.descriptions[0].trim(), `${path}: description is empty`);
  assert.deepEqual(page.canonical, [canonicalOrigin + path], `${path}: canonical must identify this page`);
  assert.equal(page.headings.length, 1, `${path}: one H1 required`);
  assert(page.headings[0], `${path}: H1 is empty`);
  assert(!page.robots.some(value => /\bnoindex\b|\bnone\b/i.test(value)), `${path}: public page is noindex`);
  assert(page.openGraphImages.includes(`${canonicalOrigin}${path}/opengraph-image.png`), `${path}: own Open Graph image missing`);
  assert(page.twitterImages.includes(`${canonicalOrigin}${path}/twitter-image.png`), `${path}: own Twitter image missing`);
  assert(page.twitterCards.includes("summary_large_image"), `${path}: large-image fallback missing`);
  assert(page.imageWidths.includes("1200") && page.imageHeights.includes("630"), `${path}: incorrect share-image dimensions`);
  assert(page.imageTypes.includes("image/png"), `${path}: actual share-image type missing`);
  assert(page.schemas.length, `${path}: structured data missing`);
  return page;
}

export function inspectSitemap(xml) {
  const namespace = "http://www.sitemaps.org/schemas/sitemap/0.9";
  const doc = new DOMParser({ onError(_level, message) { throw new Error(message); } }).parseFromString(xml, "application/xml");
  assert.equal(doc.documentElement.localName, "urlset", "Expected a canonical URL sitemap");
  assert.equal(doc.documentElement.namespaceURI, namespace, "Incorrect sitemap namespace");
  return Array.from(doc.getElementsByTagNameNS(namespace, "url")).map(node => ({
    url: node.getElementsByTagNameNS(namespace, "loc")[0]?.textContent.trim(),
    lastModified: node.getElementsByTagNameNS(namespace, "lastmod")[0]?.textContent.trim() || null,
  }));
}
