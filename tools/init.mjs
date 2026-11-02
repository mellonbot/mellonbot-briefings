#!/usr/bin/env node
// One-time setup after "Use this template":
//   node tools/init.mjs <subdomain> "<Display Name>"
// Replaces the template-app / Template App placeholders, deletes the .template marker,
// and prints the entry to add to melltron.build/content/lab.json.
//
//   node tools/init.mjs --verify   (CI) fail if an initialised repo still has placeholders
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";

const FILES = ["wrangler.jsonc", "package.json", "package-lock.json", "src/index.js", "public/index.html", "public/404.html"];
const MARKER = ".template";
const SLUG = /^[a-z][a-z0-9-]{1,30}[a-z0-9]$/;
const RESERVED = new Set(["template-app", "www", "api", "mail", "lab", "admin", "static", "cdn"]);

const [arg, ...rest] = process.argv.slice(2);

if (arg === "--verify") {
  if (existsSync(MARKER)) process.exit(0); // the template itself
  const left = FILES.filter((f) => /template-app|Template App/.test(readFileSync(f, "utf8")));
  if (left.length) {
    console.error(`placeholders remain in: ${left.join(", ")} — run: node tools/init.mjs <subdomain> "<Name>"`);
    process.exit(1);
  }
  process.exit(0);
}

const slug = arg;
const name = rest.join(" ").trim() || slug;
if (!existsSync(MARKER)) exit("already initialised (no .template marker)");
if (!slug || !SLUG.test(slug)) exit("subdomain must be 3-32 chars: lowercase letters, digits, hyphens");
if (RESERVED.has(slug)) exit(`"${slug}" is reserved`);
if (/[<>"&]/.test(name)) exit("display name must not contain < > \" &");

for (const f of FILES) {
  writeFileSync(f, readFileSync(f, "utf8").replaceAll("Template App", name).replaceAll("template-app", slug));
}
rmSync(MARKER);

console.log(`initialised ${slug}.melltron.build (Worker: lab-${slug})

Next:
  1. npm ci && npm test && npm run dev
  2. Commit + push, then connect the repo in Cloudflare (Workers → Create → Import repo).
  3. Register in melltron.build/content/lab.json (append, never reorder):
     { "name": ${JSON.stringify(name)}, "subdomain": "${slug}", "status": "building", "summary": "One line." }`);

function exit(msg) {
  console.error(msg);
  process.exit(1);
}
