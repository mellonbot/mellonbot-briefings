import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { ROOT_PULSE, pulseFor } from "../tools/pulse.mjs";

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const svg = read("site/favicon.svg");

test("favicon passes the strict CSP (SMIL only, no inline style/script)", () => {
  assert.doesNotMatch(svg, /<style|<script|\sstyle=|on[a-z]+=/i);
});

test("favicon carries this app's pulse, not the root's", () => {
  assert.ok(!svg.includes(ROOT_PULSE));
  assert.ok(svg.includes(pulseFor("briefings")));
});

test("every page links the hashed favicon", () => {
  const icon = readdirSync(new URL("../public/assets/", import.meta.url)).find((f) => /^favicon\.[0-9a-f]{10}\.svg$/.test(f));
  assert.ok(icon, "no hashed favicon in public/assets");
  for (const p of ["index.html", "404.html", "rollout-1/index.html", "scope/index.html"]) {
    assert.ok(read(`public/${p}`).includes(`rel="icon" href="/assets/${icon}"`), p);
  }
});
