# Testing Mimzi

## Automated

| Suite | Command | Covers |
| --- | --- | --- |
| Unit | `npm run test:unit` | Vocabulary integrity (≥100 words, unique stable ids, all symbols exist, quick words, required phrases), sentence builder, grid paging & fixed positions, tile reordering, photo crop maths, settings migration, backup round-trip incl. binary media, backup validation, PIN hashing. |
| End-to-end | `npm run test:e2e` | Opens straight to board; one-tap speech; sentence across groups; hold + PIN for Parent Mode, wrong PIN rejected; add photo tile → speaks → survives reload; rename / reorder / delete / restore; 2×2 grid & paging; backup export (with photo) → restore into a fresh browser; offline reload via service worker; iPad-landscape and Galaxy-portrait layouts fit with no sideways scroll. |

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

### Accessibility
- [ ] VoiceOver (iPad) and TalkBack (Galaxy) read tile names and buttons.
- [ ] High contrast and larger text remain readable; nothing overlaps at 160% text.
