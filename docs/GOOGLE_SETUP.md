# Setting up Google sign-in, Drive sync and Google Photos

Do this **once**, in your own Google account, in about 10–15 minutes. It's free. Mimzi needs one public value from it: a **Client ID**. You never need a "client secret".

What it enables:
- **Sign in with Google** (Parent Mode → Google & sync).
- **Sync between devices.** Everything is saved in a hidden Mimzi folder in your own Google Drive (the "app data folder"). Only Mimzi can open that folder, and it doesn't show up in your Drive file list. It counts toward your normal Google storage.
- **From Google Photos** when you edit a picture.

> You need Mimzi's web address first (for example `https://mimzi-yourname.netlify.app`) — see [Hosting](#5-hosting-needed-for-google-photos) below. You can add more addresses later.

## 1. Create a Google Cloud project
1. Go to <https://console.cloud.google.com/> and sign in with the Google account you'll use for Mimzi.
2. Top bar → project picker → **New project**. Name it `Mimzi`. Create, then make sure it's selected.

## 2. Turn on the two APIs
**APIs & Services → Library**, then search for and **Enable** both of these:
- **Google Drive API**
- **Google Photos Picker API**

## 3. Set up the sign-in screen
**Google Auth Platform** (also labelled "OAuth consent screen"):
1. **Branding:** App name `Mimzi`; your email as the support and developer contact.
2. **Audience:** User type **External**. Leave it in **Testing**, then under **Test users** add every Google account that will sign in (yours, your partner's).
3. **Data access → Add or remove scopes**, and add:
   - `.../auth/drive.appdata` (see and manage its own configuration data in your Google Drive)
   - `.../auth/photospicker.mediaitems.readonly` (view photos you select)
   - `openid`, `.../auth/userinfo.email`, `.../auth/userinfo.profile`

Because this is a private family app that Google hasn't reviewed, the sign-in window may say **"Google hasn't verified this app."** That's expected for your own test app. Choose **Continue**. Google limits apps in Testing to 100 test users and may ask you to approve again after 7 days.

## 4. Create the Client ID
**Clients → Create client:**
- Application type: **Web application**, name `Mimzi web`
- **Authorized JavaScript origins**:
  - your Mimzi address, e.g. `https://mimzi-yourname.netlify.app`
  - `http://localhost:5173` (only if you'll run it on a computer for testing)
- Leave redirect URIs empty.

Copy the **Client ID** (it ends in `.apps.googleusercontent.com`).

## 5. Hosting (needed for Google Photos)
Google doesn't let a web page download a picked Google Photos picture directly. Mimzi ships a tiny pass-through function (`/api/photo`) that runs on the host, forwards *only* the photo you picked using your own short-lived sign-in, and stores nothing. It works on:
- **Netlify:** uses `netlify.toml` and `netlify/functions/photo.mts` automatically.
- **Cloudflare Pages:** uses `functions/api/photo.ts` automatically.

Both have free plans; check their current terms before connecting. Sign-in and Drive sync work on any HTTPS host. Only the Google Photos button needs the function.

## 6. Give Mimzi the Client ID
In the host's settings, add the environment variable below, then redeploy:

```
VITE_GOOGLE_CLIENT_ID = 1234567890-abc...apps.googleusercontent.com
```

For a local test, put the same line in `.env.local`. The Client ID is public by design. It's fine for it to be in the web page.

## 7. Use it
- **First device (iPad):** Parent Mode → **Google & sync** → **Sign in with Google**. Mimzi uploads everything.
- **Next device (Galaxy):** install Mimzi → Parent Mode (create a PIN for this device) → Google & sync → sign in with the **same** account. Everything comes down: words, photos, recordings, sign videos, My Day and My Words.
- After that, Mimzi syncs whenever you open or close Parent Mode (within an hour of signing in) or tap **Sync now**.

## Good to know
- Each device keeps its own **Parent PIN** and **voice** choice. Everything else is shared.
- **Conflicts:** if the same word is changed on both devices before syncing, the most recent change wins. Different words changed on different devices are both kept. Deleting a word on one device deletes it on the other.
- **Offline:** the board never waits for Google. Changes made offline sync the next time you sync.
- **Sign out** (Google & sync) stops syncing on that device; nothing is deleted. To remove Mimzi's Drive data, go to Google Drive → Settings → **Manage apps** → Mimzi → **Delete hidden app data**.
- **Backups** (Parent Mode → Backup) still work and are a good extra copy.
