# Briefings — briefings.melltron.build

Rankine Operating Company / AC Services decks, published full-screen on the melltron.build lab.
Built from `melltron-lab-template`; the lifecycle and edge contract below still apply.

## Decks

```
decks/<slug>.html ──tools/build.mjs──▶ public/<slug>/  ──push main──▶ Workers Builds ──▶ briefings.melltron.build/<slug>/
 (raw export,         (CSP rewrite,       (committed)
  source of truth)     deterministic)
```

Add or update a deck: drop the single-file HTML export at `decks/<slug>.html`, then `npm run build`, commit `decks/` and `public/` together, push. The slug is the URL. The index page lists every deck automatically.

The exports carry inline scripts, inline styles, data: fonts, Google Fonts and their own meta CSP. The domain CSP allows none of that, so `tools/build.mjs` moves the same bytes into same-origin files instead of loosening the policy (header comment has the details). Verified pixel-identical to the originals on every slide of both decks, zero CSP violations.

### Theater

Every deck opens in a theater: the slide fitted above a control bar with a home link, the deck title, a clickable track (one segment per slide, hover for its headline), previous/next, a slide counter, and full screen. Full screen is present mode: the bar overlays and hides after 2s idle, along with the cursor. Keys: ←/→, space, Home/End, 1–9, F. Click either half of the slide or swipe to step. `#N` deep-links a slide.

The exported deck already has a one-slide player but no visible controls, and it falls back to vertical scrolling on portrait screens. `site/theater.{css,js}` drives that player through the inputs it already handles (keydown, hashchange) and reads its state from the DOM (`data-off`). Two guarded patches in `tools/build.mjs` (`PATCHES`) make it use the stage at every aspect ratio and leave room for the bar. If a future export changes the player, the build fails instead of shipping a half-working bar.

- `fonts/` vendors IBM Plex Sans / Sans Condensed / Mono (OFL) and Yellowtail (Apache-2.0), latin + latin-ext woff2, replacing Google Fonts.
- The build fails if anything CSP would block survives; `test/decks.test.js` checks the same on `public/`.
- `npm run check` rebuilds and fails if `public/` drifted from what's committed (Cloudflare runs no build).

---

# Lab app template notes

Starting point for every `<name>.melltron.build` app. One repo, one Worker, one subdomain per app, so a broken experiment can't take down the root or another app.

## Lifecycle

```
 Use this template ─▶ init ─▶ build ─▶ connect to Cloudflare ─▶ register in root ─▶ … ─▶ retire
   (new repo)       (once)   (PRs)     (Workers Builds)        (content/lab.json)
```

### 1. Create
GitHub → this repo → **Use this template** → new repo under `mellonbot` (personal account, never a company org). Name it after the subdomain, e.g. `part-tracker`.

### 2. Initialise
```
git clone … && cd part-tracker
node tools/init.mjs part-tracker "Part Tracker"
npm ci && npm run check
git commit -am "init part-tracker" && git push
```
`init` rewrites the `template-app` / `Template App` placeholders, deletes `.template`, and prints the `lab.json` entry. It rejects bad or reserved subdomains (`www`, `api`, `lab`, …) and refuses to run twice. CI fails if an initialised repo still contains placeholders.

### 3. Deploy
Cloudflare dashboard → Workers & Pages → Create → **Import a repository** → pick the repo. Defaults are correct: no build command, deploy `npx wrangler deploy`. Production branch `main`; other branches get preview URLs. The custom domain in `wrangler.jsonc` is created on first deploy.

### 4. Register
In `melltron.build`, append to `content/lab.json` (append only; IDs are array position), then rebuild:
```json
{ "name": "Part Tracker", "subdomain": "part-tracker", "status": "building", "summary": "One line." }
```
Set `"status": "live"` when it's usable. Only `live` entries link out.

### 5. Retire
Set `"status": "retired"` in `lab.json` (never delete; that renumbers every later ID). Then either delete the Worker (its subdomain stops resolving) or replace `public/` with a tombstone page. Archive the repo.

## Layout

```
src/index.js        request flow: /_health → /api/* → static assets
src/api.js          app routes: "METHOD /path" → handler
src/edge.js         shared edge contract: security headers + cache policy
decks/              raw deck exports (source of truth)
fonts/              vendored woff2 + licenses
site/               index + 404 templates, app.css
tools/build.mjs     decks/ + site/ + fonts/ -> public/
public/             GENERATED · committed · served as-is
test/               node --test, no Workers runtime needed
tools/init.mjs      one-time setup
wrangler.jsonc      Worker config, custom domain, bindings
```

## Edge contract

Every response passes through `finalize()` in `src/edge.js`:

| Response | Cache-Control |
| --- | --- |
| Static HTML | `max-age=300, must-revalidate` |
| Static file named `*.<hash>.<ext>` (8+ hex chars) | `max-age=31536000, immutable` |
| Other static files | asset server default (revalidate) |
| `/api/*`, `/_health` | `no-store` (set by `json()`) |

The security headers match `melltron.build/src/worker.js` exactly, so the whole domain has one posture. The CSP is same-origin only, with no inline `<script>`/`<style>`. Adding a third-party origin (analytics, fonts, an external API from the browser) means editing the CSP on purpose.

The copy is the weak point: two repos holding the same headers will drift. When there are three or more apps, move `edge.js` into a shared package, or have the root's CI diff it.

`/_health` returns `{ app, version, deployed }` from the Worker version metadata. Use it for uptime checks and to confirm which build is live.

## Extending

**Routes:** add to `routes` in `src/api.js`: `"POST /api/parts": async (req, env) => json(...)`.

**Storage / bindings:** declare in `wrangler.jsonc` (`d1_databases`, `kv_namespaces`, `r2_buckets`), access via `env.<BINDING>`. Bindings are per-app; never share a database between lab apps, because shared state removes the isolation.

**Secrets:** local in `.dev.vars` (gitignored); production via `npx wrangler secret put NAME`. Never in `wrangler.jsonc` `vars`, which is committed.

**Hashed assets:** for long-cached CSS/JS, name files `app.<hash>.css` (e.g. first 10 hex of SHA-256) and update the reference. Unhashed names stay safe by default.

## Commands
```
npm run dev      # wrangler dev at :8787, real Workers runtime
npm test         # unit tests on Node 22
npm run check    # placeholders gone + tests + wrangler config/bundle dry-run (what CI runs)
```

## License
Code MIT, content all rights reserved. See [LICENSE](LICENSE).
