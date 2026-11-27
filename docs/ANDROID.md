# Getting Mimzi from GitHub

There are two free ways to get Mimzi straight from this repository.

| | GitHub Pages link | Android app (APK) |
|---|---|---|
| Works on | onn tablet, Galaxy, iPad, any browser | Android only (onn tablet, Galaxy) |
| How | Open the link → Add to Home screen | Download `Mimzi.apk` → open it → install |
| Updates | Automatic | Install the newer APK over the old one |
| Offline | Yes, after the first visit | Yes, everything is inside the app |

The iPad can't install apps from GitHub — Apple only allows the App Store or TestFlight
(which needs a paid Apple developer account). On the iPad, use the Pages link.

## GitHub Pages link

Address: `https://novabytecore.github.io/mimzi-aac/`

**One-time setup (repo owner):** GitHub → this repo → **Settings** → **Pages** →
Source **Deploy from a branch** → Branch **gh-pages**, folder **/ (root)** → **Save**.
The `GitHub Pages` workflow fills that branch on every push; the link works a minute after
setup.

Install on a tablet:
- **Android (Chrome):** open the link → **⋮** → **Install app** / **Add to Home screen**.
- **iPad (Safari):** open the link → **Share** → **Add to Home Screen**.
- Open it once on Wi-Fi so pictures and words are saved for offline use.

Not on Pages (no server there): OpenSymbols search (ARASAAC, Mulberry and Mimzi pictures all
work) and Google Photos import. Google sign-in/sync needs the repository variable
`VITE_GOOGLE_CLIENT_ID` and this address added to the Google client's authorised origins.

## Android app (APK)

Download: `https://github.com/NovaByteCore/mimzi-aac/releases/latest/download/Mimzi.apk`
(or the **Releases** section on the repo page).

Install on the tablet:
1. Open the download link in Chrome on the tablet.
2. Tap the downloaded file. Android asks to allow **Install unknown apps** for Chrome — allow
   it (you can turn it off again afterwards).
3. Tap **Install**, then **Open**.

The app is built by the `Android app` workflow (Capacitor wrapper around the same web app).
Speech uses the tablet's own text-to-speech engine; install Google's offline voice under
Android Settings → Text-to-speech for Airplane Mode.

Differences from the web version: the voice list in Mimzi Voice is the tablet's default
engine (no per-voice choice yet); Google sign-in, sync and Google Photos aren't available
inside the app (Google blocks sign-in in embedded app browsers); OpenSymbols search is off.

### Signing key (one-time, repo owner)

Android only installs an update if it's signed with the same key as the installed app. Add
two **repository secrets** (Settings → Secrets and variables → Actions → New repository
secret):

- `ANDROID_KEYSTORE_BASE64` — the long text from the signing file you were given
- `ANDROID_KEYSTORE_PASSWORD` — its password

Keep a private copy of that file: if it's lost, the next update needs Mimzi uninstalled
first, which clears its data (make a backup in Parent Mode before that).

Until the secrets exist, each build is signed with a temporary key and marked
**Test build** on its release page.

### Not yet tested on a real device

The APK is built and signed by CI, and the Android speech path is checked in a simulated web
view. Real-tablet checks still to do: install, speech (online and Airplane Mode), camera,
microphone recording, offline launch, and data surviving an update.
