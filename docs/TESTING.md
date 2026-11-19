# Testing Mimzi

## Automated

| Suite | Command | Covers |
| --- | --- | --- |
| Unit (82) | `npm run test:unit` | Vocabulary integrity, Food & Drink starts empty, sentence builder, grid paging and fixed positions, reordering, crop maths, settings migration, backup v2 round-trip including media, My Day and My Words, v1 backup compatibility, backup validation, PIN hashing, First/Then sentence, token rules (1–10, never removed by adding), routine current step and Now/Next/Later, schedule pictures, My Words CSV (quoting, formula-injection safety) and therapist summary, sync conflict rules, media reference tracking, recording format choice, WCAG AA contrast of every tile colour. **Google:** two-device Drive sync (new device gets photos; per-word newest-wins; deletes spread; My Day/settings; unused media cleaned up; PIN and voice stay per device), photo pass-through security (Google-only URLs, Bearer required, images only), Google Photos picker flow. |
| End-to-end (54) | `npm run test:e2e` | **Phase 1:** opens straight to the board; one-tap speech; sentence across groups; hold + PIN, wrong PIN refused; photo tile survives reload; rename / reorder / delete / restore; 2×2 grid; backup → restore into a fresh browser; offline reload. **Phase 2:** recorded voice replaces text-to-speech (fake microphone); sign video only plays after "See sign"; quick-word picker. **Phase 3:** First/Then speak, hold to mark done, reset; tokens (3 default, quick tap ignored, hold adds, celebration, saved across reload, no remove button); routine edit + Now/Next/Later switch; templates. **Phase 4:** My Words note + CSV/summary export; Food & Drink empty state and private notes; sync status and no outside network requests. **Google (simulated):** sign in on one device, sign in on a second and get photos and notes, delete on one and see it removed on the other; pick a photo from Google Photos into a tile. **Phase 5:** iPad-landscape and Galaxy-portrait layouts (Talk and My Day) fit without sideways scrolling; every child-screen control has an accessible name and a ≥ 44 px touch target. |

**V3 (unit):** every Mulberry symbol name resolves to a bundled file, Home has core words plus folders, every folder opens a page, colour coding by word type, voice choice and offline fallback, pronunciation override, Grow My Words scheduling (daily/weekly, overdue, pause, approve/skip), vocabulary migration that keeps caregiver edits, backup v3 round-trip.

**V3 acceptance (e2e):** More speaks with the built-in voice and shows an AAC symbol (T1); a full sentence speaks (T2); a new word "Trampoline" speaks with no recording (T3); changing the voice and speed is used, and offline the on-device voice takes over with an explanation (T4/T10); Words on My Board shows 6 words in their own slots (T5); 2 words every Monday are planned, wait for approval on Monday (fake clock), then appear, while next week's word still waits (T6); hide and restore keeps the slot, picture and speech, and the history records it (T7); a photo on "drink" still says "drink" (T8); Help speaks and See sign shows the ASL drawing without speaking (T9); pronunciation override; folders, Back and Home keep the message.

**Voice (unit + e2e):** voices are ranked by naturalness (Enhanced, Premium and Natural first; novelty and robotic voices last). The automatic voice runs at 0.9× with pitch 1.1. A chosen voice is saved through a reload and used for words, sentences and new words. A voice missing on another device is explained and can be replaced. Sync keeps the voice per device.

**Visual schedules (unit + e2e):**
- Editing FIRST and THEN: words, spoken words, an ARASAAC symbol picked without a board word, a photo upload, card colour, and the live preview. The changes survive a reload.
- First / Then templates: save, rename, switch, delete, and quick switching from Parent Mode.
- Reward: name, symbol, goal, 1–10 tokens, all five token styles, and the completion message. Reward templates can be saved and switched. Tokens are only ever added.
- Routines of 1 to 5 steps: reorder, the three views (numbered, Now/Next/Later, one at a time with previews), and saving, duplicating and restoring templates. Progress is kept while editing.
- "Edit schedule" needs the PIN (a wrong PIN doesn't open it), and Cancel warns before discarding changes.
- Schedule symbols and photos still show offline.
- My Day and the editor fit on phone, onn landscape, onn portrait and iPad, with no sideways scrolling, every picture visible and the preview on screen.
- Older saved schedules load: caregiver data is kept, routines are trimmed to 5 steps, and the example templates are added only once.
- The board's word positions and speech are unchanged after editing schedules.

**Professional board (e2e):** no emoji anywhere on the child screen, and the ASL tag sits outside the AAC picture, at four screen sizes. Quick words stay available when hidden on their page.

**Symbols (unit + e2e):**
- ARASAAC and OpenSymbols are simulated so tests never depend on outside services.
- Licence rules: unknown licences are rejected, and non-commercial ones are blocked when `VITE_COMMERCIAL_USE=true`.
- Every starter word has a picture and none uses emoji. ARASAAC pictures appear automatically without moving any word, and curated search terms are used.
- Each word's picture can be changed (ARASAAC alternative, Mulberry, OpenSymbols) while its label, speech, ASL sign and place stay the same. Switching the default style never touches a grown-up's choice.
- A photo replaces a symbol, and removing the photo brings the symbol back.
- ARASAAC pictures still show offline after a reload.
- Words with no match keep their built-in picture.
- Older devices are upgraded without moving anything.
- Backups keep each picture's source, author and licence.
- The OpenSymbols function keeps its secret server-side, refreshes its token, and validates input.

Text-to-speech is stubbed in e2e tests (headless browsers have no voices), so they check *what* is spoken, not how it sounds.

## Manual checklist — physical devices

Automated tests run in desktop Chromium. They are **not** a substitute for these checks on the real iPad and Galaxy. Record date, device, OS and browser version for each run.

### Speech
- [ ] First tap after opening speaks (iPadOS needs a tap before any sound).
- [ ] Rapid taps: each new tap cuts off the previous word, no queue build-up.
- [ ] Speech works in Airplane Mode with a voice not marked “needs internet”.
- [ ] Speed slider changes speed; chosen voice is remembered.
- [ ] Mimzi Voice lists the tablet's voices; ▶ Preview plays each one.
- [ ] My Day → Edit schedule → Photo → **Take a photo** opens the onn tablet's camera, and the photo appears on the card.
- [ ] A First / Then board with two real photos is easy for your child to follow at arm's length.
- [ ] ARASAAC pictures appear on the starter words after the first online launch, and still show in Airplane Mode.
- [ ] onn tablet: Home page and folders fit at 1280×800 in landscape and portrait; the case doesn't block the edge buttons.
- [ ] Silent switch / volume at zero: toast or visible words still show the message.

### Install & offline
- [ ] Add to Home Screen works; icon and name look right; opens full-screen.
- [ ] After one online launch, Airplane Mode → open from Home Screen → board appears with all photos.
- [ ] Rotate iPad: landscape layout ↔ portrait layout without losing the sentence.

### Camera & photos
- [ ] “Take photo” opens the rear camera (iPad Safari, Galaxy Chrome).
- [ ] “Choose photo” opens the photo library; HEIC photos from iPhone/iPad load.
- [ ] Portrait photos are the right way up after saving.
- [ ] Drag and zoom feel natural with a finger.

### Parent Mode
- [ ] Quick taps on “Hold for grown-ups” never open the PIN pad.
- [ ] Holding 1.5 s opens it; wrong PIN is refused.

### Backup
- [ ] iPad: backup file can be saved to Files; restoring on the Galaxy brings over words and photos.

### Voice recording & signs
- [ ] iPad: "Record your voice" asks for the microphone, records, and plays back. The recording plays when the tile is tapped, including in Airplane Mode.
- [ ] Galaxy: same.
- [ ] A sign video recorded on the iPad camera (MOV/HEVC) plays on the iPad. Note: an iPad MOV may not play on Android. Export as MP4 (H.264) if it will be restored on the Galaxy.
- [ ] The See sign button is easy for a grown-up to hit but doesn't interfere with tapping the tile.

### My Day
- [ ] Holding "Add token" for about a second adds exactly one token. Quick toddler taps never do.
- [ ] Celebration sound/visual can be switched off.
- [ ] Rotate the iPad on each My Day screen: panels stay readable.

### My Words
- [ ] CSV opens correctly in Numbers / Google Sheets; the summary .txt can be shared by email from Files.

### Google (real account — needed once setup is done)
- [ ] iPad Home Screen app: "Sign in with Google" window opens and returns to Mimzi. (Pop-ups from installed iPad web apps can behave differently from Safari; if it fails, sign in from Safari first.)
- [ ] Galaxy: sign in with the same account → words, photos, recordings and My Day appear.
- [ ] Change a word on each device, sync both, and check that both changes are kept.
- [ ] "From Google Photos" opens Google Photos, the chosen photo appears in the cropper.

### Accessibility
- [ ] VoiceOver (iPad) and TalkBack (Galaxy) read tile names and buttons.
- [ ] High contrast and larger text remain readable; nothing overlaps at 160% text.
