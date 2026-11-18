# Testing Mimzi

## Automated

| Suite | Command | Covers |
| --- | --- | --- |
| Unit (33) | `npm run test:unit` | Vocabulary integrity, Food & Drink starts empty, sentence builder, grid paging and fixed positions, reordering, crop maths, settings migration, backup v2 round-trip including media, My Day and My Words, v1 backup compatibility, backup validation, PIN hashing, First/Then sentence, token rules (1–10, never removed by adding), routine current step and Now/Next/Later, schedule pictures, My Words CSV (quoting, formula-injection safety) and therapist summary, sync conflict rules, media reference tracking, recording format choice, WCAG AA contrast of every tile colour. |
| End-to-end (23) | `npm run test:e2e` | **Phase 1:** opens straight to the board; one-tap speech; sentence across groups; hold + PIN, wrong PIN refused; photo tile survives reload; rename / reorder / delete / restore; 2×2 grid; backup → restore into a fresh browser; offline reload. **Phase 2:** recorded voice replaces text-to-speech (fake microphone); sign video only plays after "See sign"; quick-word picker. **Phase 3:** First/Then speak, hold to mark done, reset; tokens (3 default, quick tap ignored, hold adds, celebration, saved across reload, no remove button); routine edit + Now/Next/Later switch; templates. **Phase 4:** My Words note + CSV/summary export; Food & Drink empty state and private notes; sync status and no outside network requests. **Phase 5:** iPad-landscape and Galaxy-portrait layouts (Talk and My Day) fit without sideways scrolling; every child-screen control has an accessible name and a ≥ 44 px touch target. |

Text-to-speech is stubbed in e2e tests (headless browsers have no voices), so they check *what* is spoken, not how it sounds.

## Manual checklist — physical devices

Automated tests run in desktop Chromium. They are **not** a substitute for these checks on the real iPad and Galaxy. Record date, device, OS and browser version for each run.

### Speech
- [ ] First tap after opening speaks (iPadOS needs a tap before any sound).
- [ ] Rapid taps: each new tap cuts off the previous word, no queue build-up.
- [ ] Speech works in Airplane Mode with a voice not marked “needs internet”.
- [ ] Speed slider changes speed; chosen voice is remembered.
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

### Accessibility
- [ ] VoiceOver (iPad) and TalkBack (Galaxy) read tile names and buttons.
- [ ] High contrast and larger text remain readable; nothing overlaps at 160% text.
