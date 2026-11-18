# Mimzi

**Every way to communicate matters.**

Mimzi is a personal Augmentative and Alternative Communication (AAC) app for a toddler (ages ~2–3, growing with the child). It runs as an installable Progressive Web App on iPad (Safari) and Samsung Galaxy phones (Chrome), works offline, and keeps every photo and recording **on the device**.

> Status: **Phases 1–4 built; Phase 5 automated testing done.** Physical-device testing on the iPad and Galaxy is still to do (see `docs/TESTING.md`). Nothing is deployed.

---

## Features

### Talk (AAC board)
- Opens straight to the board: no login and no splash screen.
- 141 starter tiles (about 130 different words and phrases) in 12 editable groups: Core, Needs, Food & Drink, Feelings, My People, Play, Social, Actions, Body, Safety, Describe, Phrases. This is a starting point, not a limit, and nothing is locked behind levels.
- **One tap speaks immediately.** A caregiver's recording plays if the tile has one. Otherwise the device voice speaks. If sound fails, a message appears and the words stay on screen.
- **Quick words** (Help · Stop · No · More · All done by default, up to 6, caregiver-editable) are on every child screen.
- **Sentence bar.** Build "I want more bubbles" from several tiles, then speak, backspace or clear. Words are never changed or reordered, and selections stay when you switch groups. The bar can be hidden.
- **Stable positions.** Words move only when a caregiver moves them. Hidden words leave a blank space, and there is no frequency-based shuffling.
- **Grids** from 2×2 to 5×6, with big page arrows.
- **Three kinds of tile picture:** real photos (camera or library, with crop/zoom and a "show whole photo" option), 29 original Mimzi symbols for abstract words, or the device's emoji.
- **ASL "See sign".** Attach a parent-provided GIF/MP4/MOV/WebM to any tile. A small 🤟 button opens it in a player with play/pause/again. It never autoplays on the board. Loop and speed are adjustable. Mimzi ships no sign videos and never invents signs.

### My Day (visual supports)
- **First / Then:** two big panels. Tap to hear them, or tap "Say it" for "First brush teeth, then play cars".
- **I'm Working For:** a reward photo with 1–10 tokens (3 by default) and an optional gentle "You did it!" (visual and/or spoken). Tokens are **never removed**; only a deliberate "New board" clears them.
- **My Three Steps** and **Now / Next / Later:** the same routine shown two ways, with a highlighted current step and checkmarks. A parent chooses the layout.
- Marking done, adding tokens and resetting are **press-and-hold grown-up actions**, so toddler taps only speak.
- Every board can be **saved as a template** ("Bedtime", "Bath time") and reused.

### Favorites · My People · Food & Drink
- Favorites shows ⭐ tiles. My People shows the family group, ready for real photos.
- Food & Drink **starts empty**: the caregiver chooses every food. Use "Hide for now" for foods that aren't available today (they keep their spot). **Private notes** appear only in Parent Mode. Mimzi never suggests foods and never labels anything allergy-safe.

### Parent Mode (press-and-hold 1.5 s + PIN)
- **Words & pictures:** add, edit, reorder, hide, delete and restore tiles. Each tile can have a photo (camera/library), a recorded voice, a sign video and a private note.
- **Groups:** add, rename, hide, reorder and delete empty groups.
- **My Day:** set up all four tools, with templates.
- **My Words:** a private notebook with the target word, how the child said or showed it, the method (speech, approximation, gesture, sign, AAC, combined), the date, notes and an optional audio clip. Export as a **CSV spreadsheet** or a **plain-text summary for the speech-language pathologist**. No scores, levels or diagnostic wording.
- **Board & speech:**
  - Board: grid size, sentence bar on/off, quick words, text size, spacing, high contrast, reduced motion and vibration (Android).
  - Speech: speed and voice.
  - Signs and celebrations: their own controls.
  - Security: change the PIN.
- **Backup:** one file with everything, including photos, recordings, My Day and My Words. Restore asks before replacing anything. The PIN is never exported. This screen also shows storage use and asks the browser to protect Mimzi's data.
- **Sync status:** shows "This device only" (see `docs/SYNC.md`).

### Offline & install
- Hand-written service worker plus IndexedDB: after the first visit, everything works without internet.
- Installable PWA: manifest, original speech-bubble icon, standalone display and safe-area padding.

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
  components/MyDayView  First/Then, I'm Working For, steps, Now/Next/Later
  data/vocabulary.ts    starter words & groups
  data/symbols.tsx      original SVG symbols
  lib/                  db (IndexedDB), speech, sentence, grid, backup, pin, image crop,
                        myday, observations (My Words export), media, sync (design)
  parent/               Parent Mode screens
  state/MimziStore.tsx  in-memory store backed by IndexedDB
public/                 manifest, service worker, icons
tests/unit/             logic tests (no browser)
tests/e2e/              Chromium tests against a production build
docs/                   testing checklist, deployment, sync design & research
```

## Roadmap

| Phase | Status |
| --- | --- |
| 1 Foundation | ✅ Built and tested in Chromium |
| 2 Communication (recording, ASL media, quick-word picker) | ✅ Built and tested in Chromium |
| 3 My Day | ✅ Built and tested in Chromium |
| 4 Caregiver tools (My Words, food boards, sync design) | ✅ Built and tested in Chromium. Sync is designed but **not enabled**; it needs the owner's choice of provider. |
| 5 Testing & deployment | ✅ Automated tests, accessibility checks, offline test, deployment docs. ⏳ Physical iPad/Galaxy testing and hosting setup are still to do, and hosting needs the owner's permission. |
