#!/usr/bin/env node
// site/ + decks/ + fonts/  ->  public/   (deterministic; public/ is committed and deployed as-is)
//
// Decks arrive as single-file HTML exports: inline <script>, inline <style>, hundreds of
// style="" attributes, data: fonts, Google Fonts links and their own meta CSP. The domain CSP
// (src/edge.js) is same-origin only with no inline anything, so each deck is rewritten to
// load the same bytes as same-origin files instead:
//
//   <style> blocks        -> /<slug>/deck.<hash>.css, wrapped in @layer deck
//   style="" attributes   -> one class per distinct value, UNLAYERED in the same file.
//                            Unlayered beats layered regardless of specificity, so these keep
//                            the precedence an inline style had over the deck's own rules;
//                            JS-set el.style still wins, and deck !important still wins.
//   data: fonts           -> /<slug>/f.<hash>.<ext>
//   Google Fonts links    -> /fonts.<hash>.css (vendored IBM Plex + Yellowtail, OFL)
//   inline <script>       -> /<slug>/deck.<hash>.js, same position. setAttribute("style",v)
//                            becomes style.cssText=v (CSSOM writes are allowed by CSP).
//   meta CSP              -> removed (it would intersect with, and block, 'self').
//
// Theater (site/theater.{css,js}) is injected into every deck: a control bar around the deck's
// own player. Two PATCHES make the player cooperate; each must match exactly once, so a
// re-export that changes the player fails the build instead of shipping a half-working bar.
//
// New or updated deck: drop the export at decks/<slug>.html, run `npm run build`, commit.

import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync, copyFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const OUT = join(ROOT, "public");
const hash = (buf) => createHash("sha256").update(buf).digest("hex").slice(0, 10);
const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const unesc = (s) =>
  s.replace(/&(quot|amp|lt|gt|apos|#39|#x27);/g, (_, e) => ({ quot: '"', amp: "&", lt: "<", gt: ">", apos: "'", "#39": "'", "#x27": "'" })[e]);
const fail = (msg) => { console.error(`build: ${msg}`); process.exit(1); };

const PATCHES = [
  {
    why: "use the one-slide stage on every aspect ratio (export falls back to scrolling in portrait)",
    re: /window\.matchMedia\("\(max-aspect-ratio: 1\/1\)"\)/g,
    to: () => "null",
  },
  {
    why: "fit slides above the theater bar: scale from viewport height minus --theater-bar",
    re: /Math\.min\((\w+)\.clientWidth\/(\w+)\.w,\1\.clientHeight\/\2\.h\)/g,
    to: (_, n, e) =>
      `Math.min(${n}.clientWidth/${e}.w,(${n}.clientHeight-(parseFloat(getComputedStyle(${n}).getPropertyValue("--theater-bar"))||0))/${e}.h)`,
  },
];
function patchPlayer(slug, js) {
  for (const p of PATCHES) {
    const hits = js.match(p.re)?.length ?? 0;
    if (hits !== 1) fail(`${slug}: player patch matched ${hits}x (want 1): ${p.why}`);
    js = js.replace(p.re, p.to);
  }
  return js;
}

function emit(rel, data) {
  const p = join(OUT, rel);
  mkdirSync(join(p, ".."), { recursive: true });
  writeFileSync(p, data);
}

function hashed(dir, base, ext, data) {
  const name = `${dir}/${base}.${hash(data)}.${ext}`;
  emit(name, data);
  return `/${name}`;
}

// ---- fonts: one stylesheet for every deck -------------------------------------------
function buildFonts() {
  const FAMILIES = {
    "ibm-plex-sans": "IBM Plex Sans",
    "ibm-plex-sans-condensed": "IBM Plex Sans Condensed",
    "ibm-plex-mono": "IBM Plex Mono",
    yellowtail: "Yellowtail",
  };
  // Same ranges Google Fonts serves for these subsets.
  const RANGES = {
    latin:
      "U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD",
    "latin-ext":
      "U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF",
  };
  const re = /^(.+)-(latin-ext|latin)-(\d{3})-(normal|italic)\.woff2$/;
  const rules = [];
  for (const file of readdirSync(join(ROOT, "fonts")).filter((f) => f.endsWith(".woff2")).sort()) {
    const m = file.match(re);
    if (!m || !FAMILIES[m[1]]) fail(`unexpected font file fonts/${file}`);
    const [, fam, sub, weight, style] = m;
    const url = hashed("fonts", file.replace(/\.woff2$/, ""), "woff2", readFileSync(join(ROOT, "fonts", file)));
    rules.push(
      `@font-face{font-family:'${FAMILIES[fam]}';font-style:${style};font-weight:${weight};font-display:swap;` +
        `src:url(${url}) format('woff2');unicode-range:${RANGES[sub]}}`,
    );
  }
  return hashed("fonts", "fonts", "css", rules.join("\n") + "\n");
}

// ---- one deck --------------------------------------------------------------------------
function buildDeck(slug, fontsCss, theater) {
  let html = readFileSync(join(ROOT, "decks", `${slug}.html`), "utf8");
  const title = unesc((html.match(/<title>([^<]*)<\/title>/) || fail(`${slug}: no <title>`))[1].trim());

  // Mask scripts so tag rewriting below can't touch their text.
  const scripts = [];
  html = html.replace(/<script\b([^>]*)>([\s\S]*?)<\/script>/g, (_, attrs, body) => {
    scripts.push({ attrs, body });
    return `\u0000S${scripts.length - 1}\u0000`;
  });

  html = html.replace(/<meta http-equiv="Content-Security-Policy"[^>]*>\s*/i, "");
  html = html.replace(/<link\b[^>]*href="https:\/\/fonts\.(googleapis|gstatic)\.com[^>]*>\s*/g, "");

  // <style> blocks -> one layered stylesheet
  const blocks = [];
  html = html.replace(/<style\b[^>]*>([\s\S]*?)<\/style>\s*/g, (_, css) => { blocks.push(css); return ""; });
  let deckCss = blocks.join("\n");
  if (/@import|@charset/.test(deckCss)) fail(`${slug}: @import/@charset can't be wrapped in a layer`);
  deckCss = deckCss.replace(/url\((["']?)data:(font\/[\w+.-]+|application\/(?:x-)?font-[\w+.-]+);base64,([A-Za-z0-9+/=]+)\1\)/g,
    (_, _q, mime, b64) => {
      const ext = (mime.split("/")[1].replace(/^(x-)?font-/, "") || "woff2").replace("+", "");
      return `url(${hashed(slug, "f", ext, Buffer.from(b64, "base64"))})`;
    });
  if (/url\(["']?data:font/.test(deckCss)) fail(`${slug}: unconverted data: font`);

  // style="" -> classes (deterministic: class name is a hash of the declaration text)
  const classes = new Map();
  html = html.replace(/<([a-zA-Z][\w:-]*)(\s[^<>]*?)?(\/?)>/g, (tag, name, attrs = "", selfClose) => {
    const sm = attrs.match(/\sstyle="([^"]*)"/);
    if (!sm) return tag;
    const decl = unesc(sm[1]).trim();
    let a = attrs.replace(sm[0], "");
    if (decl) {
      const cls = `s${hash(decl).slice(0, 7)}`;
      classes.set(cls, decl);
      a = /\sclass="/.test(a) ? a.replace(/\sclass="([^"]*)"/, (_, c) => ` class="${c ? c + " " : ""}${cls}"`) : `${a} class="${cls}"`;
    }
    return `<${name}${a}${selfClose}>`;
  });
  const attrCss = [...classes].sort(([a], [b]) => (a < b ? -1 : 1)).map(([c, d]) => `.${c}{${d}}`).join("\n");
  const cssUrl = hashed(slug, "deck", "css", `@layer deck{\n${deckCss}\n}\n${attrCss}\n`);

  html = html.replace(/<\/title>/, `</title>\n<link rel="stylesheet" href="${fontsCss}">\n<link rel="stylesheet" href="${cssUrl}">\n<link rel="stylesheet" href="${theater.css}">`);

  // Unmask scripts: data blocks stay inline (never executed, so CSP doesn't apply); code moves out.
  html = html.replace(/\u0000S(\d+)\u0000/g, (_, i) => {
    const { attrs, body } = scripts[+i];
    if (/type="application\/(ld\+)?json"/.test(attrs)) return `<script${attrs}>${body}</script>`;
    if (/\ssrc=/.test(attrs)) fail(`${slug}: external <script src> not supported`);
    const js = patchPlayer(slug, body.replace(/(\w+)\.setAttribute\("style",/g, "$1.style.cssText=("));
    return `<script src="${hashed(slug, "deck", "js", js)}"></script>`;
  });

  // Anything CSP would still block is a build failure, not a broken page in production.
  const stripped = html.replace(/<script type="application\/json"[\s\S]*?<\/script>/g, "");
  for (const [re, what] of [
    [/<style\b/, "inline <style>"], [/<script(?![^>]*\ssrc=)[^>]*>/, "inline <script>"],
    [/\sstyle="/, "style attribute"], [/\son[a-z]+="/, "event-handler attribute"],
    [/(src|href)="(https?:)?\/\/(?!melltron\.build)/, "third-party resource"], [/javascript:/, "javascript: URL"],
  ]) if (re.test(stripped)) fail(`${slug}: ${what} survived conversion`);

  if (!/<\/body>/.test(html)) fail(`${slug}: no </body> to attach the theater to`);
  html = html.replace(/<\/body>/, `<script src="${theater.js}"></script>\n</body>`);
  emit(`${slug}/index.html`, html);
  return { slug, title, slides: (html.match(/class="[^"]*\bdeck-slide\b/g) || []).length };
}

// ---- site ------------------------------------------------------------------------------
rmSync(OUT, { recursive: true, force: true });
const fontsCss = buildFonts();
const theater = {
  css: hashed("assets", "theater", "css", readFileSync(join(ROOT, "site", "theater.css"))),
  js: hashed("assets", "theater", "js", readFileSync(join(ROOT, "site", "theater.js"))),
};
const decks = readdirSync(join(ROOT, "decks")).filter((f) => f.endsWith(".html")).sort().map((f) => buildDeck(f.slice(0, -5), fontsCss, theater));

const appCss = hashed("assets", "app", "css", readFileSync(join(ROOT, "site", "app.css")));
for (const page of ["index.html", "404.html"]) {
  const list = decks.map((d) => `<li><a href="/${d.slug}/">${esc(d.title)}</a> <span>${d.slides} slides</span></li>`).join("\n");
  emit(page, readFileSync(join(ROOT, "site", page), "utf8").replaceAll("{{css}}", appCss).replaceAll("{{decks}}", list));
}
console.log(`built ${decks.length} decks -> public/ (${decks.map((d) => `${d.slug}:${d.slides}`).join(", ")})`);
