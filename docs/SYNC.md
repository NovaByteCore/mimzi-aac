# Optional cross-device sync — design & provider research

**Status: built using Google Drive's hidden app folder** (see `docs/GOOGLE_SETUP.md`). The owner asked for Google sign-in, so sync stores data in the family's own Google Drive app-data folder. That needs no extra service, account or subscription. The provider comparison below is kept for reference.

## Requirements (from the brief)

- Local-first: the board never waits for the network; IndexedDB stays the source of truth on each device.
- Optional parent account; no subscription required.
- Private photos and recordings of a young child: never public, never used for anything else.
- Conflict handling and visible sync status.

## Design

```
 iPad (IndexedDB) ──┐                       ┌── Galaxy (IndexedDB)
                    │  changed records       │
                    ├──► provider (private) ◄┤
                    │  media by content id   │
```

1. **Change log.** Each write to `tiles`, `categories`, `observations`, `settings` and `myday` becomes a `SyncRecord` (`store`, `id`, `updatedAt`, `deviceId`, `deleted?`, `value`) — see `src/lib/sync.ts`.
2. **Push / pull in the background** when online and the app is open; never during a tap.
3. **Conflicts:** last writer wins *per record*, ties broken by device id so both devices pick the same winner (`resolveConflict`, unit-tested). Deletes are tombstones so an old copy can't resurrect a deleted word.
4. **Media** (photos, recordings, sign videos) is uploaded once per media id and downloaded on demand; blobs are immutable, so they never conflict.
5. **Device-only settings** stay local: the Parent PIN, chosen voice (voices differ between iPad and Android), and grid size if the caregiver prefers different layouts per device.
6. **Status:** Parent Mode shows the sync state ("This device only — sync is off" today).
7. **Privacy:** storage rules allow access only to the signed-in parent's own folder; nothing is public; no analytics.

## Provider research (checked November 2026 — re-check before choosing)

| Option | What's free | Catches for Mimzi |
| --- | --- | --- |
| **Supabase** (Postgres + Auth + Storage) | 2 active projects, 500 MB database, 1 GB file storage, 5 GB egress per month | Free projects **pause after 1 week of inactivity**. 1 GB holds roughly 10,000 of Mimzi's 640 px photos, but sign videos use it up much faster. No downloadable backups on the free plan. |
| **Firebase** (Firestore + Auth + Cloud Storage) | Spark plan has no-cost Firestore/Auth quotas | **Cloud Storage for Firebase requires the pay-as-you-go Blaze plan** (a billing account) — even for small amounts. Photos/recordings would need billing enabled. |
| **Cloudflare** (R2 files + D1 database + Workers) | R2: 10 GB-month storage, 1M writes, 10M reads per month, free egress. D1: 5 GB. Workers: 100k requests/day | Needs a small Worker written and deployed for auth and access control. R2 may require a payment method on file even within the free tier. More setup work. |
| **No server: backup file via the device's own cloud** | Uses what the family already has (iCloud Drive / Google Drive via Files) | Manual, not automatic — but it already works today (Parent Mode → Backup). |

## Recommendation

1. **Now:** keep using Backup → save to iCloud Drive / Google Drive → Restore on the other device. Zero cost, zero new accounts, already built and tested.
2. **If automatic sync is wanted:** Supabase is the quickest to build and fits within the free limits for one family's words and photos. The weekly inactivity pause is the main risk: a paused project has to be restored from the Supabase dashboard before sync resumes. Mimzi itself keeps working offline either way, because sync is never on the tap path. Keep sign videos device-only, or compress them, to stay under 1 GB.
3. Avoid Firebase for this app: storing photos needs a billing account.

**Decision needed from the owner** before any of this is built: which provider (if any), and approval to create that account.
