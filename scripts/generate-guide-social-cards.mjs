import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import React from "react";
import { ImageResponse } from "next/og.js";

const h = React.createElement;
const mark = "data:image/png;base64," + fs.readFileSync("public/syncedin-wordmark-tight.png").toString("base64");
const specs = [
  { route: "/guides", title: "Better conversations.\nBetter context.", subtitle: "Practical networking guides from SyncedIn.", labels: ["A thoughtful opener", "A useful follow-up", "Your judgment"],
    alt: "SyncedIn networking guides: thoughtful connection notes, useful follow-ups, and human-reviewed AI twins." },
  { route: "/guides/linkedin-connection-request", title: "A reason to connect.\nNot another pitch.", subtitle: "Connection notes, examples, and a private length checker.", labels: ["Shared context", "Your actual reason", "A short invitation"],
    alt: "SyncedIn connection-note guide: a specific shared context, an honest reason to connect, and a short invitation." },
  { route: "/guides/networking-follow-up", title: "Pick up the conversation.\nLeave the pressure out.", subtitle: "Follow-ups for events, introductions, and unanswered notes.", labels: ["Remember the context", "Add something useful", "One next step"],
    alt: "SyncedIn follow-up guide: remember the conversation, add something useful, and leave one clear next step." },
  { route: "/guides/ai-networking", title: "Your context. Their context.\nA clearer conversation.", subtitle: "AI networking, with human review at the center.", labels: ["Context you choose", "A twin-to-twin draft", "Human review"],
    alt: "SyncedIn AI-networking guide: your context, a twin-to-twin draft, and a proposal for human review." },
  { route: "/alternatives/linkedin", title: "A network to find people.\nContext to go further.", subtitle: "LinkedIn and SyncedIn: different jobs, different workflows.", labels: ["Professional identity", "A relevant introduction", "Human choice"],
    alt: "LinkedIn and SyncedIn comparison: professional identity, context-led introductions, and human choice." },
  { route: "/guides/networking-goals", title: "One conversation.\nOne clear purpose.", subtitle: "A private goal brief for a useful next step.", labels: ["Your purpose", "What you can offer", "Clear boundaries"],
    alt: "SyncedIn networking-goal guide: a specific purpose, something useful to offer, and clear boundaries." },
  { route: "/about", title: "Better introductions.\nWith your judgment intact.", subtitle: "The purpose, people, and review behind SyncedIn.", labels: ["Context you choose", "An editable twin", "Your next step"],
    alt: "About SyncedIn: context-led introductions, editable digital twins, and human judgment." },
  { route: "/vs/clay", title: "SyncedIn and Clay.\nChoose the workflow.", subtitle: "Networking conversations, data enrichment, and GTM research.", labels: ["The work you need", "Accurate context", "A useful outcome"],
    alt: "SyncedIn and Clay comparison: networking-twin conversations and data-driven GTM workflows." },
  { route: "/vs/lemlist", title: "SyncedIn and lemlist.\nConversation or campaign?", subtitle: "Human-reviewed twins and AI-assisted outbound workflows.", labels: ["A relevant introduction", "Campaign operations", "Human review"],
    alt: "SyncedIn and lemlist comparison: a relevant introduction, campaign operations, and human review." },
  { route: "/vs/linkedin-dms", title: "A message. A conversation.\nChoose what helps.", subtitle: "LinkedIn DMs and shareable SyncedIn twin conversations.", labels: ["An honest opener", "Useful context", "The person's choice"],
    alt: "SyncedIn and LinkedIn DMs comparison: an honest opener, useful context, and the recipient's choice." },
  { route: "/faq", category: "SyncedIn FAQ", title: "Questions about SyncedIn.\nAnswers, without the guesswork.", subtitle: "Accounts, AI twins, privacy, and messaging choices.", labels: ["Your account", "Your context", "Your choices"],
    alt: "SyncedIn FAQ: answers about your account, AI-twin context, privacy, and messaging choices." },
  { route: "/founders-cofounder", category: "For founders and builders", title: "A cofounder conversation.\nStart with the actual work.", subtitle: "Explore the overlap. Review the fit. Choose a next step.", labels: ["A shared problem", "Complementary work", "A real conversation"],
    alt: "SyncedIn cofounder conversations: a shared problem, complementary work, and a real conversation." },
  { route: "/founders-vc", category: "Founder introductions", title: "An investor introduction.\nWith a clearer purpose.", subtitle: "Relevant context and a twin draft for human review.", labels: ["A specific reason", "Accurate context", "Their choice"],
    alt: "SyncedIn founder and investor introductions: a specific reason, accurate context, and the recipient's choice." },
];
const requested = new Set(process.argv.slice(2));
for (const route of requested) if (!specs.some(spec => spec.route === route)) throw new Error(`Unknown social-card route: ${route}`);
const manifestPath = "verification/social-card-manifest.json";
const existing = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const copyPath = "verification/social-card-copy.json";
const copy = JSON.parse(fs.readFileSync(copyPath, "utf8"));
for (const spec of specs) {
  if (requested.size && !requested.has(spec.route)) continue;
  const image = new ImageResponse(h("div", { style: { width: "100%", height: "100%", display: "flex", flexDirection: "column", background: "#f8fafc", color: "#20232b", padding: "44px 64px", borderBottom: "10px solid #305ce5", fontFamily: "sans-serif" } },
    h("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between" } }, h("img", { src: mark, width: 248, height: 60 }), h("span", { style: { fontSize: 19, color: "#117c59" } }, spec.category || (spec.route === "/about" ? "About SyncedIn" : spec.route.startsWith("/guides") ? "SyncedIn guides" : "SyncedIn comparisons"))),
    h("div", { style: { display: "flex", flexDirection: "column", marginTop: 44, fontSize: spec.route.includes("ai-networking") ? 53 : 56, lineHeight: 1.15, fontWeight: 700 } }, ...spec.title.split("\n").map(line => h("span", { key: line }, line))),
    h("div", { style: { fontSize: 23, lineHeight: 1.5, marginTop: 20, color: "#586174", display: "flex" } }, spec.subtitle),
    h("div", { style: { display: "flex", alignItems: "center", gap: 16, marginTop: 34 } }, ...spec.labels.flatMap((label, index) => [
      ...(index ? [h("span", { key: `arrow-${index}`, style: { color: "#8c98aa", fontSize: 26 } }, "\u2192")] : []),
      h("div", { key: label, style: { display: "flex", alignItems: "center", gap: 10, padding: "12px 15px", border: `1px solid ${index === 2 ? "#a3d6c4" : "#d5dce9"}`, borderRadius: 6, fontSize: 19, color: index === 2 ? "#117c59" : "#305ce5", background: "#fff" } }, label),
    ])),
    h("div", { style: { display: "flex", marginTop: "auto", fontSize: 18, color: "#586174" } }, `syncedin.org${spec.route}`),
  ), { width: 1200, height: 630 });
  const bytes = Buffer.from(await image.arrayBuffer());
  const directory = `app${spec.route}`;
  fs.mkdirSync(directory, { recursive: true });
  for (const name of ["opengraph-image", "twitter-image"]) {
    fs.writeFileSync(path.join(directory, `${name}.png`), bytes);
    fs.writeFileSync(path.join(directory, `${name}.alt.txt`), spec.alt);
  }
  const entry = { path: spec.route, file: `${directory}/opengraph-image.png`, twitterFile: `${directory}/twitter-image.png`, sha256: crypto.createHash("sha256").update(bytes).digest("hex"), alt: spec.alt };
  const index = existing.findIndex(item => item.path === spec.route);
  if (index === -1) existing.push(entry);
  else existing[index] = entry;
  const copyEntry = { path: spec.route, key: spec.route.slice(1).replaceAll("/", "--"), title: spec.title.replace("\n", " "), heading: spec.title.replace("\n", " "), description: spec.subtitle, caption: spec.subtitle, alt: spec.alt };
  const copyIndex = copy.findIndex(item => item.path === spec.route);
  if (copyIndex === -1) copy.push(copyEntry);
  else copy[copyIndex] = copyEntry;
  console.log(`${spec.route}: ${bytes.length} bytes`);
}
fs.writeFileSync(manifestPath, JSON.stringify(existing, null, 2) + "\n");
fs.writeFileSync(copyPath, JSON.stringify(copy, null, 2) + "\n");
