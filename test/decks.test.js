// Every built page must be servable under the strict CSP in src/edge.js.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const OUT = new URL("../public", import.meta.url).pathname;
const walk = (d) => readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)]));
const files = walk(OUT);

test("built HTML has nothing the CSP would block", () => {
  for (const f of files.filter((f) => f.endsWith(".html"))) {
    const html = readFileSync(f, "utf8").replace(/<script type="application\/json"[\s\S]*?<\/script>/g, "");
    assert.doesNotMatch(html, /<style\b/, `${f}: inline <style>`);
    assert.doesNotMatch(html, /<script(?![^>]*\ssrc=)[^>]*>/, `${f}: inline <script>`);
    assert.doesNotMatch(html, /\sstyle="/, `${f}: style attribute`);
    assert.doesNotMatch(html, /\son[a-z]+="/, `${f}: event handler attribute`);
    assert.doesNotMatch(html, /http-equiv="Content-Security-Policy"/, `${f}: meta CSP`);
    assert.doesNotMatch(html, /(src|href)="https?:\/\/(?!melltron\.build)/, `${f}: third-party resource`);
  }
});

test("every local reference resolves to a built file", () => {
  for (const f of files.filter((f) => /\.(html|css)$/.test(f))) {
    const text = readFileSync(f, "utf8");
    for (const [, ref] of text.matchAll(/(?:src|href)="(\/[^"#?]+\.[a-z0-9]+)"|url\((\/[^)]+)\)/g)) {
      if (ref) assert.ok(files.includes(join(OUT, ref)), `${f} -> ${ref} missing`);
    }
    for (const [, ref] of text.matchAll(/url\((\/[^)]+)\)/g)) assert.ok(files.includes(join(OUT, ref)), `${f} -> ${ref} missing`);
  }
});

test("deck JS never writes style attributes (CSP blocks them)", () => {
  for (const f of files.filter((f) => f.endsWith(".js"))) assert.doesNotMatch(readFileSync(f, "utf8"), /setAttribute\("style"/, f);
});
