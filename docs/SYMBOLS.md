# AAC symbols in Mimzi

Mimzi shows a real AAC symbol on every word. Grown-ups can pick a different symbol for any single word, or use a photo instead.

## Libraries

| Library | How Mimzi gets it | Licence | Author / owner | Default? |
| --- | --- | --- | --- | --- |
| **ARASAAC** | Searched online at `api.arasaac.org`. The chosen PNGs (`api.arasaac.org/v1/pictograms/<id>`, which allows normal CORS downloads) are saved by the service worker for offline use. | CC BY-NC-SA 4.0 (**non-commercial**) | Sergio Palao for ARASAAC, Government of Aragón (Spain) | ✅ Default style |
| **Mulberry Symbols** | Bundled with Mimzi (`public/symbols/mulberry`, about 3,400 SVGs) | CC BY-SA 4.0 | Steve Lee | Built-in fallback and alternative style |
| **Mimzi originals** | Bundled in the code (`src/data/symbols.tsx`) | Original Mimzi artwork | Mimzi project | For core words the libraries lack |
| **OpenSymbols** (Sclera, Tawasol and other open sets) | Searched through the site's own `/api/symbols` function | Per symbol, shown on every result | Per symbol | Optional; needs a free key |

Licence attribution for ARASAAC, as ARASAAC requires:

> Pictograms' author: Sergio Palao. Origin: ARASAAC (https://arasaac.org). License: CC (BY-NC-SA). Owner: Government of Aragón (Spain).

The same credit appears in **Parent Mode → Symbol Library → Credits & licences**. That list shows every library used on the board, how many words use it, and its author and licence.

## How starter words get their pictures

- Each starter word has a bundled picture (Mulberry or Mimzi original) and is marked as *Mimzi-chosen* (`symbolAuto`).
- When the device is online, Mimzi looks up an ARASAAC pictogram for each one in the background, a few at a time (`src/lib/arasaac.ts`).
  - It tries a short list of better search words first for a few words (for example, "all done" → "finished"; folders → "food", "family", …).
  - Then it tries the word itself, then the bundled symbol's concept.
  - It never uses a pictogram that ARASAAC flags as sexual or violent.
- A few words are pinned to a pictogram that was checked against the live service, because ARASAAC's best match isn't the toddler meaning. For example, "crackers" first matched a firework and "who" first matched the WHO logo. Those two pictograms, and acronym matches in general, are skipped (`ARASAAC_SKIP` and `STARTER_PICTOS` in `src/lib/arasaac.ts`).
- **Every automatic pick was then reviewed by eye on the live service.** Words whose best match had the wrong meaning are pinned to the right pictogram: stop (a bus stop → a raised hand), break (rock-breaking → a rest), catch (a police arrest → catching a ball), mine (a coal mine → "my"), park (car parking → a playground), out/outside (a candle → going out a door), on, draw, brush (→ brushing teeth), wash (→ washing hands), and the Places folder. "cereal" and "safe" keep their Mulberry picture because ARASAAC has no picture with the right meaning. Food "chicken" shows a live chicken; change it in Parent Mode if you'd prefer a photo.
- A November 2026 check on the live preview found an ARASAAC picture for 219 of 242 words. After the fixes above, another 18 words have search terms that ARASAAC matches. The rest keep their built-in picture, for example "your turn", "pull", "too bright" and "no thank you".
- Only the picture changes. The word, what it says, its recording and its place on the board stay the same.
- Words ARASAAC has no match for keep their bundled picture. Symbol Library lists how many there are and has a **Try again** button.
- Offline, or before a picture has downloaded, the bundled picture shows instead. Nothing is ever blank.
- The found pictogram id is saved on the word (`autoArasaac`), and it syncs and backs up with it, so other devices don't need to search again.

## Choosing a different symbol

In **Parent Mode → Edit AAC board → (word)**, or **Symbol Library**:

1. Search by word or idea. The editor starts with the word's own label.
2. Filter by library: All, ARASAAC, Mulberry, Mimzi originals, or More (OpenSymbols).
3. Each result shows its library and licence. Non-commercial ones are marked.
4. Pick one and save. The choice belongs to the grown-up (`symbolAuto: false`), and changing the default style never changes it. **Use Mimzi's default picture** hands the word back to Mimzi.

A **photo** always shows instead of the symbol. Remove the photo and the symbol comes back.

Each symbol keeps its source, author, licence, licence link and image URL (`tile.symbolInfo`). Backups and Google Drive sync carry them too.

## Licence rules Mimzi enforces (`src/lib/symbols.ts`)

- Symbols with a missing or unrecognised licence are never offered.
- Mimzi is for personal, non-commercial use by default (`VITE_COMMERCIAL_USE` unset or `false`), and non-commercial (NC) symbols such as ARASAAC are allowed.
- **For any commercial deployment set `VITE_COMMERCIAL_USE=true`.** Then:
  - ARASAAC and every other NC-licensed symbol are switched off.
  - Words fall back to their bundled picture.
  - The default style becomes Mulberry.
- ShareAlike: symbols are shown unmodified. If you build something from them, share it under the same licence.

## Offline

The service worker (`public/sw.js`) keeps every symbol the board uses in its `mimzi-symbols-v1` cache:

- The app sends it the list of symbol URLs whenever words or the style change.
- Pictures are fetched with CORS when the host allows it, which ARASAAC's image API does. Otherwise an opaque copy is stored, which still displays but takes more storage space.
- Symbols picked for visual schedules are saved the same way.
- A word whose picture isn't saved yet shows its bundled picture.

## Privacy

Looking up and downloading symbols sends only the search word to ARASAAC, with no cookies and no referrer. No information about the child is sent. OpenSymbols searches go through your own site's function, so the browser never contacts OpenSymbols directly for searches.

## Setting up OpenSymbols (optional)

OpenSymbols needs a **shared secret**, and it must never be in the app or in Git.

1. Request a free shared secret at https://www.opensymbols.org/api (Organization, Email, Purpose: "personal AAC app for my child").
2. In **Netlify → mimzi-aac → Project configuration → Environment variables**, add `OPENSYMBOLS_SECRET` with the secret. (On Cloudflare Pages, add it as an encrypted variable.)
3. Redeploy. "More (OpenSymbols)" results then appear in the picker.

Without the secret, `/api/symbols` answers `503 not-configured` and the picker says the libraries aren't set up yet. Everything else works.

The function (`server/openSymbols.ts`):
- swaps the secret for a short-lived token and searches with safe search on,
- returns only results with a licence and an https image,
- stores and logs nothing.
