import fs from "node:fs";
import vm from "node:vm";
import crypto from "node:crypto";
import ts from "typescript";

const source = ts.transpileModule(fs.readFileSync("lib/launch-article.ts", "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const exports = {};
vm.runInNewContext(source, { exports });
const markdown = exports.launchArticleMarkdown();
fs.writeFileSync("public/articles/syncedin-launch.md", markdown);
fs.writeFileSync("verification/article-export-manifest.json", JSON.stringify({
  path: "/article.md",
  sha256: crypto.createHash("sha256").update(markdown).digest("hex"),
  bytes: Buffer.byteLength(markdown),
}, null, 2) + "\n");
console.log("Synchronized the article's plain-text export and expected response hash.");
