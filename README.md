# Mimzi

**Every way to communicate matters.**

Mimzi is a personal Augmentative and Alternative Communication (AAC) app for a toddler (ages ~2–3, growing with the child). It runs as an installable Progressive Web App on iPad (Safari) and Samsung Galaxy phones (Chrome), works offline, and keeps every photo and recording **on the device**.

> Status: **Phase 1 — Foundation** (feature branch `feature/phase-1-foundation`). See [Roadmap](#roadmap).

---

## What works now (Phase 1)

| Area | What it does |
| --- | --- |
| **Talk board** | Opens straight to the board — no login, no splash screen. 141 starter tiles (about 130 different words and phrases) in 11 editable groups (Core, Needs, Feelings, My People, Play, Social, Actions, Body, Safety, Describe, Phrases). |
| **One-tap speech** | Each tap speaks immediately using the device's text-to-speech. A caregiver recording, when a tile has one, plays instead (playback path is in; recording UI is Phase 2). If sound fails, a message appears and the words stay visible at the top. |
| **Quick words** | Help · Stop · No · More · All done are always on screen on every child page. |
| **Sentence bar** | Tap several tiles to build a message (“I want more bubbles”). Speak, backspace, clear. Words are never changed or reordered. Kept when switching groups. Can be hidden. |
| **Stable positions** | Words only move when a caregiver moves them. Hidden words leave a blank space so nothing shifts. No frequency-based reordering. |
| **Grid sizes** | 2×2, 2×3, 3×3, 3×4, 4×4, 4×5, 5×6, with big page arrows when a group has more words. |
| **Photo tiles** | Take a photo with the camera or choose one from the library, then position/zoom it (or “Show whole photo” to avoid cropping). Stored as a 640 px JPEG in IndexedDB. |
| **Symbol tiles** | 29 original Mimzi symbols for core/abstract words (more, help, stop, yes, no, want, go, open, all done, wait, again, break, safe, not safe, me/you, this/that, in/out, on/off …). Everyday nouns use the device's emoji. Any tile can switch to a photo. |
| **Favorites / My People** | Favorites shows tiles marked ⭐. My People shows the family group (add real photos in Parent Mode). |
| **Parent Mode** | Opened by **press-and-hold** (1.5 s) + **PIN** (4–8 digits, PBKDF2-hashed). Add / edit / hide / reorder / delete-with-restore tiles; add, rename, hide, reorder groups; grid size; sentence bar; speech speed & voice; text size; spacing; high contrast; reduced motion; vibration; change PIN. |
| **Backup & restore** | One JSON file including photos. Restore validates the file and asks before replacing anything. The PIN is never exported. Shows storage use and asks the browser for persistent storage. |
| **Offline** | Service worker caches the app; all words and photos are in IndexedDB. Tested: reload with the network switched off still shows the board and speaks. |
| **PWA** | Manifest, original speech-bubble icon (192/512/maskable/apple-touch), standalone display, safe-area padding for iPad/notched phones. |

**Not in Phase 1 (on purpose — no fake buttons):** My Day schedules, audio recording, ASL “See sign” media, My Words, food boards, cross-device sync. See [Roadmap](#roadmap).

---

## Getting started

Requirements: **Node.js 20.19+ (22 recommended)** and npm.

```bash
npm install          # first time; commit the generated package-lock.json
npm run dev          # http://localhost:5173 (also on your Wi-Fi network with --host)
```

### Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Vite dev server (no service worker in dev). |
| `npm run build` | Type-check + production build into `dist/`. |
| `npm run preview` | Serve the production build on port 4173. |
| `npm run lint` | ESLint. |
| `npm run typecheck` | TypeScript, no emit. |
| `npm test` / `npm run test:unit` | Unit tests (Node test runner via `tsx`). |
| `npm run test:e2e` | Browser tests (Playwright/Chromium) against a running build — see below. |
| `npm run icons` | Re-render PNG icons from `public/icons/icon.svg`. |

### Running the browser tests

```bash
npx playwright install chromium     # once
npm run build && npm run preview    # terminal 1
BASE_URL=http://localhost:4173 npm run test:e2e   # terminal 2
```

CI (`.github/workflows/ci.yml`) runs lint → type-check → unit tests → build → e2e on every push and pull request, and uploads iPad/phone screenshots as an artifact.

### Environment variables

Copy `.env.example` to `.env.local`. Only `VITE_*` variables reach the app and **all of them are public** — never put secrets there.

| Variable | Default | Meaning |
| --- | --- | --- |
| `VITE_APP_NAME` | `Mimzi` | Display name. |
| `VITE_BASE_PATH` | `/` | Set if hosted in a sub-folder, e.g. `/mimzi/`. |
| `VITE_DEFAULT_SPEECH_LANG` | `en-US` | Text-to-speech language. |
| `VITE_SYNC_PROVIDER`, `VITE_SYNC_URL` | empty | Reserved for optional sync (Phase 4). Nothing is enabled. |

---

## Installing on devices

Mimzi must be opened from an **HTTPS** address to install and to work offline (localhost is the only exception, for development).

- **iPad (Safari):** open the Mimzi address → Share → **Add to Home Screen**. Open it from the Home Screen icon once while online so it saves itself for offline use.
- **Samsung Galaxy (Chrome):** open the address → ⋮ menu → **Add to Home screen / Install app**. (Samsung Internet also works: menu → Add page to → Home screen.)
- Each device keeps its own words and photos. Use **Parent Mode → Backup** to copy a setup from the iPad to the phone until sync exists.

Tips: on the iPad, **Guided Access** (Settings → Accessibility) keeps a child inside Mimzi. In Parent Mode → Board & speech, pick a voice *without* “needs internet” so speech works offline.

---

## Deployment

The build is static files (`dist/`), so any HTTPS static host works. Nothing is deployed automatically and no paid service is connected.

Free-tier candidates (check each provider's current terms before connecting an account):

- **Cloudflare Pages** or **Netlify** — connect the repo, build command `npm run build`, output `dist`. Both work with private repositories.
- **GitHub Pages** — note that publishing Pages from a *private* repository requires a paid GitHub plan.

Host settings: serve `sw.js` and `index.html` with no long-term caching (`Cache-Control: no-cache`); `assets/*` can be cached forever (file names are hashed). See `docs/DEPLOYMENT.md`.

---

## Privacy & data

- No accounts, ads, analytics, tracking, or third-party requests. The app makes no network calls except loading itself.
- Photos, recordings and settings live in the browser's IndexedDB on that device only.
- **Data can be lost**: browsers may clear site data (storage pressure, clearing Safari website data, removing the Home Screen app). Mimzi requests persistent storage and shows whether the browser granted it — but **make backups**.
- Backup files contain the child's photos: store them privately.
- Never commit photos, recordings, backups or `.env` files — `.gitignore` blocks the common cases.
- The Parent PIN keeps a toddler out of editing screens; it is not encryption.

## Project structure

```
src/
  App.tsx               child screens: Talk, Favorites, My People
  components/           tiles, board, sentence bar, hold button
  data/vocabulary.ts    starter words & groups
  data/symbols.tsx      original SVG symbols
  lib/                  db (IndexedDB), speech, sentence, grid, backup, pin, image crop
  parent/               Parent Mode screens
  state/MimziStore.tsx  in-memory store backed by IndexedDB
public/                 manifest, service worker, icons
tests/unit/             logic tests (no browser)
tests/e2e/              Chromium tests against a production build
docs/                   testing checklist, deployment notes
```

## Roadmap

1. **Foundation** ← this branch
2. **Communication** — audio recording (MediaRecorder), ASL “See sign” with parent-provided GIF/MP4/WebM (no invented signs), richer photo editing, quick-word picker.
3. **My Day** — First/Then, I'm Working For (1–10 tokens, never removed as punishment), My Three Steps, Now/Next/Later.
4. **Caregiver tools** — My Words observation log + SLP export (no scoring), food & drink boards, sync architecture (local-first; provider chosen only after free-tier research and your approval).
5. **Testing & deployment** — accessibility audit, physical-device testing on iPad and Galaxy, hosting setup with your permission.
