# Mimzi

**Every way to communicate matters.**

Mimzi is a personal Augmentative and Alternative Communication (AAC) app for a toddler (ages ~2–3, growing with the child). It runs as an installable Progressive Web App on iPad (Safari) and Samsung Galaxy phones (Chrome), works offline, and keeps every photo and recording **on the device**.

> Status: **V3 AAC system built and tested in Chromium** (89 automated tests). It has not been tested on the physical onn tablet, iPad or Galaxy yet (see `docs/TESTING.md`). It is not deployed.

---

## Features

### Talk (AAC board)
- Opens straight to a **Home page of core words** (I, want, more, help, stop, all done, you, go, play, eat, drink, no, yes, open, look, get, again, wait) plus **folder buttons** for 13 fringe pages: Food & Drinks, People, Toys & Play, Feelings, Needs, Questions, Actions, Body, Places, Social, Safety & Comfort, Describing, Phrases. The vocabulary has 242 words, phrases and folders.
- **Back** and **Home** buttons. The sentence bar keeps the message while you move between pages.
- **Built-in voice for every word.** You don't need to record anything: new words speak as soon as they are saved. A caregiver recording, if added, plays instead.
- **Mimzi Voice:** pick any voice the device reports (with ▶ Preview), plus speed, pitch and volume. Words can have a **pronunciation override**, so the word shown and the word spoken can differ. Offline, a voice that "needs internet" automatically falls back to an on-device voice, and the panel says so. Other settings: speak on tap, speak folder names, interrupt or finish the current word, and a repeat guard against double taps.
- **Real AAC symbols:** [Mulberry Symbols](https://mulberrysymbols.org) (3,436 symbols, CC BY-SA 4.0, © Steve Lee) are bundled, searchable in Parent Mode, and cached for offline use. Original Mimzi symbols cover core words Mulberry lacks. Real photos can replace any picture. No emoji.
- **Fitzgerald-style colour coding** by word type: people/pronouns yellow, actions green, describing blue, things orange, social pink, questions purple, important red, little words white, folders grey. Custom colours are also available.
- **ASL is separate from the picture.** The main button always shows the AAC picture. A small 🤟 **See sign** button opens a verified ASL drawing (17 signs, each with a how-to and source) or a parent-provided video. Mimzi never invents signs.
- **Stable positions:** words keep fixed slots. Hidden words leave a gap and nothing shifts. Grids from 2×2 to 5×6 are available.

### Words on My Board
Show only some words: presets for 4, 6, 8, 12, 16, 20, 24, 30, 40 or all words, or tick words one at a time. Hidden words keep their spot and come back to it. Mimzi warns before you hide important words such as help, stop, no or all done.

### Grow My Words
Plan new words daily or weekly (for example, 2 every Monday) with a start date, a calendar and a history of when words were added, hidden or restored.
- **A grown-up approves new words by default.** Adding them automatically is a separate opt-in.
- Plans can be paused, resumed, edited and skipped, and words can be added early.
- Words that came due while the tablet was off wait for approval the next time Mimzi opens.

### My Day (visual supports)
First/Then, I'm Working For (tokens are never taken away), My Three Steps and Now/Next/Later, with templates. Done, tokens and reset are press-and-hold grown-up actions.

### Parent Mode (press-and-hold 1.5 s + PIN)
| Tab | What it does |
| --- | --- |
| Edit AAC board | Add, edit, move, hide, delete and restore words. Each word has a symbol search, photo, pronunciation, word type, the page it opens, voice language, recording, sign and private note. |
| Words on My Board | Choose which words are visible. |
| Grow My Words | Word schedule, approvals, calendar and history. |
| Pages | Add, rename, hide and reorder pages. |
| Mimzi Voice | Voice, preview, speed, pitch, volume, pronunciations, offline fallback status. |
| Symbol / Photo / ASL Library | Browse everything that is available. |
| Visual schedules | My Day setup. |
| My Words | Private notebook with CSV and therapist-summary export (no scores). |
| Board & accessibility | Grid, colour coding, text size, spacing, contrast, motion, quick words, PIN. |
| Google & sync | Optional Google sign-in. Everything syncs through a hidden folder in your own Drive, and Google Photos can be used for pictures. |
| Backup | One file with everything (v3; older backups still load). |
| Recently deleted | Restore deleted words. |

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
| `VITE_GOOGLE_CLIENT_ID` | empty | Google OAuth **Client ID** (public, not a secret) for sign-in, Drive sync and Google Photos. Empty = those features show setup help. See `docs/GOOGLE_SETUP.md`. |
| `VITE_PHOTOS_PROXY_URL` | `/api/photo` | Path of the Google Photos pass-through function (`netlify/functions/photo.mts` or `functions/api/photo.ts`). |

---

## Installing on devices

Mimzi must be opened from an **HTTPS** address to install and to work offline (localhost is the only exception, for development).

- **iPad (Safari):** open the Mimzi address → Share → **Add to Home Screen**. Open it from the Home Screen icon once while online so it saves itself for offline use.
- **Samsung Galaxy (Chrome):** open the address → ⋮ menu → **Add to Home screen / Install app**. (Samsung Internet also works: menu → Add page to → Home screen.)
- Sign in with the same Google account on each device (Parent Mode → Google & sync) to share words and photos, or copy a setup with **Backup**.

- **onn kids tablet (Android):** open the address in Chrome → ⋮ → **Add to Home screen / Install app**. Use the tablet's normal (parent) profile for Chrome. To keep your child inside Mimzi, turn on **App pinning** (Settings → Security → App pinning) and pin Mimzi. The layout is tested at the tablet's 1280×800 screen in both landscape and portrait.

Tips: on the iPad, **Guided Access** (Settings → Accessibility) keeps a child inside Mimzi. In Parent Mode → Mimzi Voice, pick a voice *without* “needs internet” so speech works offline.

---

## Deployment

The build is static files (`dist/`), so any HTTPS static host works. Nothing is deployed automatically and no paid service is connected.

Free-tier candidates (check each provider's current terms before connecting an account):

- **Cloudflare Pages** or **Netlify** — connect the repo, build command `npm run build`, output `dist`. Both work with private repositories.
- **GitHub Pages** — note that publishing Pages from a *private* repository requires a paid GitHub plan.

Host settings: serve `sw.js` and `index.html` with no long-term caching (`Cache-Control: no-cache`); `assets/*` can be cached forever (file names are hashed). See `docs/DEPLOYMENT.md`.

---

## Privacy & data

- No ads, analytics or tracking. Until a grown-up taps **Sign in with Google**, the app makes no network calls except loading itself.
- Google sign-in is optional. When it's on, data goes only to the hidden Mimzi folder in **your own** Google Drive. Google Photos only ever sends the photos you pick, through a pass-through on your own site that stores nothing.
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
| 4 Caregiver tools (My Words, food boards, sync) | ✅ Built and tested in Chromium |
| V3 AAC system (voice, Mulberry, folders, colour coding, Words on My Board, Grow My Words) | ✅ Built and tested in Chromium |
| Google sign-in, Drive sync, Google Photos | ✅ Built and tested in Chromium against a simulated Google. ⏳ Needs the one-time Google Cloud setup and a real-account test. |
| 5 Testing & deployment | ✅ Automated tests, accessibility checks, offline test, deployment docs. ⏳ Physical iPad/Galaxy testing and hosting setup are still to do, and hosting needs the owner's permission. |

## Credits

- **Mulberry Symbols** © Steve Lee, [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/), from mulberrysymbols.org (`public/symbols/mulberry/LICENSE.txt`). The symbols are unchanged.
- The ASL drawings are original illustrations of standard signs. Each one links to the reference it was checked against.
- No artwork, layouts or audio from Proloquo2Go, TouchChat, TD Snap or other commercial AAC apps are used.
