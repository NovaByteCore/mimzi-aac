# AAC symbols in Mimzi

Mimzi shows a real AAC symbol on every word. Grown-ups can pick a different symbol for any single word, or use a photo instead.

## Libraries

| Library | How Mimzi gets it | Licence | Author / owner | Default? |
| --- | --- | --- | --- | --- |
| **ARASAAC** | Searched online at `api.arasaac.org`. The chosen PNGs (`api.arasaac.org/v1/pictograms/<id>`, which allows normal CORS downloads) are saved with the selected picture for offline use. | CC BY-NC-SA 4.0 (**non-commercial**) | Sergio Palao for ARASAAC, Government of Aragón (Spain) | ✅ Default style |
| **Mulberry Symbols** | Bundled with Mimzi (`public/symbols/mulberry`, about 3,400 SVGs) | CC BY-SA 4.0 | Steve Lee | Built-in fallback and alternative style |
| **Mimzi originals** | Bundled in the code (`src/data/symbols.tsx`) | Original Mimzi artwork | Mimzi project | For core words the libraries lack |
| **OpenSymbols** (Sclera, Tawasol and other open sets) | Searched through the site's own `/api/symbols` function | Per symbol, shown on every result | Per symbol | Optional; needs a free key |

Licence attribution for ARASAAC, as ARASAAC requires:

> Pictograms' author: Sergio Palao. Origin: ARASAAC (https://arasaac.org). License: CC (BY-NC-SA). Owner: Government of Aragón (Spain).

The same credit appears in **Parent Mode → Symbol Library → Credits & licences**. That list shows every library used on the board, how many words use it, and its author and licence.

## How starter words get their pictures

The app ships with the fixed starter mappings and WebP copies listed in `public/symbols/defaultPictures.json`. Original ARASAAC images were resized and converted to WebP. Words without a suitable ARASAAC match keep their bundled Mimzi or Mulberry picture. Startup and connectivity changes do not look up replacement pictures.

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

The Android app includes the starter pictures in its APK. The web app caches them when the service worker installs during the first online visit. Both use the same files.

When choosing a library picture outside the bundled set, Mimzi downloads and validates it before applying it. The local copy and credits are stored in the picture metadata along with the tile or schedule, and included in backups. If the picture cannot be downloaded, the picker keeps the previous picture and offers Retry.

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
