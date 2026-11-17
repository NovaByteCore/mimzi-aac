# Deploying Mimzi

Mimzi is a static site. `npm run build` produces `dist/`; upload that folder to any HTTPS static host.
**Nothing deploys automatically.** Connecting a hosting account or enabling billing needs the owner's approval.

## Requirements

- **HTTPS** — required by browsers for installation, service workers and the Web Crypto PIN.
- `index.html`, `sw.js` and `manifest.webmanifest`: `Cache-Control: no-cache` so updates are picked up.
- `assets/*`: may be cached long-term (`Cache-Control: public, max-age=31536000, immutable`) — names are content-hashed.
- No server-side code, database or secrets are needed.

## Example: Cloudflare Pages or Netlify (Git integration)

| Setting | Value |
| --- | --- |
| Build command | `npm run build` |
| Output directory | `dist` |
| Node version | 22 (`NODE_VERSION=22`) |
| Environment | Optional `VITE_*` values from `.env.example` |

Optional headers file (`public/_headers`, understood by both):

```
/index.html
  Cache-Control: no-cache
/sw.js
  Cache-Control: no-cache
/manifest.webmanifest
  Cache-Control: no-cache
/assets/*
  Cache-Control: public, max-age=31536000, immutable
```

## Sub-folder hosting

Set `VITE_BASE_PATH=/your-folder/` before building. The manifest and service worker use relative paths.

## Updating

Deploy a new build. Devices download the new version in the background on their next launch and use it from the launch after that. The service worker only switches once every file of the new version is cached, so an interrupted update can't break offline use.
