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

test("every deck carries the theater and its player's patches", () => {
  for (const f of files.filter((f) => /\/[^/]+\/index\.html$/.test(f) && !f.endsWith("public/index.html"))) {
    const html = readFileSync(f, "utf8");
    const player = (html.match(/<html data-player="(motion|simple)"/) || [])[1];
    assert.ok(player, `${f}: no recognised data-player`);
    assert.match(html, /<link rel="stylesheet" href="\/assets\/theater\.[0-9a-f]{10}\.css">/, `${f}: theater css`);
    assert.match(html, /<script src="\/assets\/theater\.[0-9a-f]{10}\.js"><\/script>\n<\/body>/, `${f}: theater js last`);
    const js = html.match(/<script src="(\/[^"]+\/deck\.[0-9a-f]{10}\.js)">/)[1];
    const body = readFileSync(join(OUT, js), "utf8");
    assert.match(body, /--theater-bar/, `${js}: scale patch`);
    if (player === "motion") assert.doesNotMatch(body, /max-aspect-ratio: 1\/1/, `${js}: stage patch`);
    if (player === "simple") assert.match(body, /window\.__deckShow=show;/, `${js}: show() exposed`);
  }
});

test("no deck CSS still selects on style attributes (they became classes)", () => {
  for (const f of files.filter((f) => /\/deck\.[0-9a-f]{10}\.css$/.test(f))) {
    assert.doesNotMatch(readFileSync(f, "utf8"), /\[style\b/, f);
  }
});
