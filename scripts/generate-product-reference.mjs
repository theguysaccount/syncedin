import fs from "node:fs";
import vm from "node:vm";
import crypto from "node:crypto";
import assert from "node:assert/strict";
import ts from "typescript";

const source = ts.transpileModule(fs.readFileSync("lib/product-reference.ts", "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const values = {};
vm.runInNewContext(source, { exports: values });
const routes = [
  ["/llms.txt", values.PRODUCT_REFERENCE_SHORT],
  ["/llms-full.txt", values.PRODUCT_REFERENCE_FULL],
];
for (const [, text] of routes) assert.equal(typeof text, "string");
fs.writeFileSync("public/llms.txt", values.PRODUCT_REFERENCE_SHORT);
fs.writeFileSync("verification/product-reference-manifest.json", JSON.stringify(routes.map(([path, text]) => ({
  path,
  sha256: crypto.createHash("sha256").update(text).digest("hex"),
  bytes: Buffer.byteLength(text),
})), null, 2) + "\n");
console.log("Synchronized the static reference fallback and both expected response hashes.");
