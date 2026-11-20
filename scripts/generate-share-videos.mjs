import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawn } from "node:child_process";
import { once } from "node:events";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import * as icons from "lucide-react";
import sharp from "sharp";

const scenes = {
  "/guides": ["flow", "BookOpen", "MessagesSquare", "Compass"],
  "/guides/linkedin-connection-request": ["flow", "Link2", "SquarePen", "Send"],
  "/guides/networking-follow-up": ["flow", "MessageSquareText", "Timer", "ArrowUpRight"],
  "/guides/ai-networking": ["merge", "Bot", "MessagesSquare", "UserRoundCheck"],
  "/guides/networking-goals": ["merge", "Target", "ListChecks", "CircleCheck"],
  "/guides/warm-introduction": ["merge", "UsersRound", "ShieldCheck", "Handshake"],
  "/about": ["flow", "Fingerprint", "Bot", "Compass"],
  "/alternatives/linkedin": ["fork", "ContactRound", "Network", "MessagesSquare"],
  "/vs/linkedin-dms": ["fork", "MessageSquareText", "Mail", "Bot"],
  "/vs/clay": ["fork", "Search", "ChartNoAxesColumnIncreasing", "MessagesSquare"],
  "/vs/lemlist": ["fork", "Target", "Mail", "UserRoundCheck"],
  "/faq": ["flow", "CircleHelp", "BookOpenText", "ShieldCheck"],
  "/founders-cofounder": ["merge", "Lightbulb", "Blocks", "Handshake"],
  "/founders-vc": ["flow", "BriefcaseBusiness", "FileText", "Handshake"],
  "/ai-knows-me": ["flow", "FileText", "Bot", "UserRoundCheck"],
  "/generate-free-portfolio": ["flow", "SquarePen", "PanelTop", "ClipboardCheck"],
  "/for/linkme": ["flow", "Link2", "ScanLine", "ContactRound"],
  "/article": ["flow", "Lightbulb", "MessagesSquare", "Handshake"],
  "/blog": ["fork", "LibraryBig", "BookOpenText", "Route"],
  "/hypernetwork": ["merge", "Waypoints", "ChartNetwork", "Globe"],
  "/wins": ["flow", "Handshake", "ReceiptText", "BadgeCheck"],
};

const width = 1072, height = 104, fps = 24, duration = 5;
const blue = "#305ce5", green = "#117c59", rail = "#c8d3e9";
const smooth = t => 0.5 - 0.5 * Math.cos(Math.PI * Math.min(1, Math.max(0, t)));
const pulse = (t, center, radius) => (1 - smooth(Math.abs(t - center) / radius));
const lerp = (a, b, t) => a + (b - a) * t;
const hash = bytes => crypto.createHash("sha256").update(bytes).digest("hex");

function diagram([layout, ...names]) {
  const xy = layout === "merge" ? [[111, 29], [111, 75], [922, 52]]
    : layout === "fork" ? [[111, 52], [922, 29], [922, 75]]
    : [[111, 52], [516, 52], [922, 52]];
  const pairs = layout === "merge" ? [[0, 2], [1, 2]]
    : layout === "fork" ? [[0, 1], [0, 2]] : [[0, 1], [1, 2]];
  const branches = pairs.map(([a, b]) => {
    const [x1, y1] = xy[a], [x2, y2] = xy[b];
    const elbowX = layout === "merge" ? 377 : 650;
    return {
      d: layout === "flow" ? `M${x1} ${y1}H${x2}`
        : `M${x1} ${y1}H${elbowX - 102}C${elbowX - 30} ${y1} ${elbowX + 30} ${y2} ${elbowX + 102} ${y2}H${x2}`,
      x1, y1, x2, y2, elbowX
    };
  });
  const glyphs = names.map((name, i) => {
    if (!icons[name]) throw new Error("Missing icon: " + name);
    const [x, y] = xy[i], size = layout === "flow" ? 38 : 27;
    return renderToStaticMarkup(React.createElement(icons[name], { x: x - size / 2, y: y - size / 2, width: size, height: size, size, color: i === 2 ? green : blue, strokeWidth: 1.8 }));
  });
  return frame => {
    const t = frame / (fps * duration);
    const base = branches.map(b => `<path d="${b.d}" stroke="${rail}" stroke-width="2" fill="none"/>`).join("");
    const traces = branches.map((b, i) => {
      const start = layout === "flow" ? 0.03 + i * 0.37 : 0.04 + i * 0.105;
      const progress = smooth((t - start) / (layout === "flow" ? 0.36 : 0.59));
      const opacity = smooth((t - start) / 0.08) * (1 - smooth((t - 0.79) / 0.19));
      if (progress <= 0 || opacity <= 0) return "";
      const x = lerp(b.x1, b.x2, progress);
      const y = lerp(b.y1, b.y2, smooth((x - (b.elbowX - 102)) / 204));
      const ink = i === 1 ? green : blue;
      return `<clipPath id="trace-${i}"><rect width="${x}" height="${height}"/></clipPath><path d="${b.d}" clip-path="url(#trace-${i})" stroke="${ink}" stroke-width="3" stroke-opacity="${0.34 * opacity}" fill="none"/><circle cx="${x}" cy="${y}" r="5" fill="${ink}" opacity="${opacity}"/>`;
    }).join("");
    const nodes = xy.map(([x, y], i) => {
      const ink = i === 2 ? green : blue;
      const lit = pulse(t, [0.15, 0.44, 0.77][i], 0.135);
      const r = layout === "flow" ? 29 : 20;
      return `<circle cx="${x}" cy="${y}" r="${r + 5 + 3 * lit}" fill="${ink}" opacity="${lit * 0.1}"/><circle cx="${x}" cy="${y}" r="${r}" fill="white" stroke="${ink}" stroke-width="1.5" stroke-opacity="${0.32 + 0.58 * lit}"/>${glyphs[i]}`;
    }).join("");
    return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${base}${traces}${nodes}</svg>`);
  };
}

async function encode(card, scene, output) {
  const draw = diagram(scene);
  // Only the lower diagram moves; the approved poster is the fixed base.
  const ffmpeg = spawn("ffmpeg", ["-y", "-hide_banner", "-loglevel", "error", "-loop", "1", "-framerate", String(fps), "-i", card.file,
    "-f", "rawvideo", "-pixel_format", "rgba", "-video_size", `${width}x${height}`, "-framerate", String(fps), "-i", "pipe:0",
    "-filter_complex", "[0:v][1:v]overlay=64:430:shortest=1,setsar=1", "-frames:v", String(duration * fps),
    "-c:v", "libx264", "-preset", "medium", "-crf", "17", "-pix_fmt", "yuv420p", "-an", "-movflags", "+faststart", output],
    { stdio: ["pipe", "ignore", "inherit"] });
  const finished = once(ffmpeg, "close");
  try {
    for (let n = 0; n < duration * fps; n++) {
      const pixels = await sharp(draw(n)).ensureAlpha().raw().toBuffer();
      if (!ffmpeg.stdin.write(pixels)) await once(ffmpeg.stdin, "drain");
    }
    ffmpeg.stdin.end();
    const [code] = await finished;
    if (code !== 0) throw new Error("Encoding failed: " + card.path);
  } catch (error) {
    ffmpeg.stdin.destroy();
    ffmpeg.kill();
    await finished.catch(() => {});
    throw error;
  }
}

const cards = JSON.parse(fs.readFileSync("verification/social-card-manifest.json", "utf8"));
const sample = process.argv[2] === "--sample" ? process.argv[3] : null;
if (process.argv.length !== 2 && (!sample || !scenes[sample] || !process.argv[4] || process.argv.length !== 5)) {
  throw new Error("Usage: node scripts/generate-share-videos.mjs [--sample /route output-dir]");
}
const dir = sample ? process.argv[4] : "public/social/previews";
fs.mkdirSync(dir, { recursive: true });
const manifest = [];
for (const [route, scene] of Object.entries(scenes)) {
  if (sample && route !== sample) continue;
  const card = cards.find(item => item.path === route);
  if (!card || hash(fs.readFileSync(card.file)) !== card.sha256) throw new Error("Reviewed still missing or outdated: " + route);
  const output = path.join(dir, route.slice(1).replaceAll("/", "--") + ".mp4");
  await encode(card, scene, output);
  const bytes = fs.readFileSync(output);
  if (bytes.length > 1_000_000) throw new Error("Preview exceeds size budget: " + route);
  manifest.push({ path: route, urlPath: "/" + output.replace(/^public\//, ""), sha256: hash(bytes), stillSha256: card.sha256, width: 1200, height: 630, duration });
  console.log(`${route}: ${bytes.length} bytes`);
}
if (!sample) fs.writeFileSync("verification/social-video-manifest.json", JSON.stringify(manifest, null, 2) + "\n");
