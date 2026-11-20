// Runs in GitHub Actions after `npx cap add android`. Adds what Mimzi needs to the
// generated Android project: camera and microphone permissions (for grown-ups'
// photos and recordings), text-to-speech visibility, app icons and the version.
import { readFile, writeFile, readdir, rm, mkdir } from 'node:fs/promises';
import sharp from 'sharp';

const run = Number(process.env.BUILD_NUMBER || '1');
const res = 'android/app/src/main/res';

// Permissions + package visibility for the tablet's speech engine (Android 11+).
const manifestPath = 'android/app/src/main/AndroidManifest.xml';
let manifest = await readFile(manifestPath, 'utf8');
const perms = ['android.permission.CAMERA', 'android.permission.RECORD_AUDIO', 'android.permission.MODIFY_AUDIO_SETTINGS'];
for (const p of perms) {
  if (!manifest.includes(`"${p}"`)) manifest = manifest.replace('</manifest>', `    <uses-permission android:name="${p}" />\n</manifest>`);
}
if (!manifest.includes('android.intent.action.TTS_SERVICE')) {
  manifest = manifest.replace(
    '</manifest>',
    '    <queries>\n        <intent>\n            <action android:name="android.intent.action.TTS_SERVICE" />\n        </intent>\n    </queries>\n</manifest>',
  );
}
await writeFile(manifestPath, manifest);

// Version: every build gets a higher number so Android accepts it as an update.
const gradlePath = 'android/app/build.gradle';
let gradle = await readFile(gradlePath, 'utf8');
gradle = gradle.replace(/versionCode \d+/, `versionCode ${run}`).replace(/versionName "[^"]*"/, `versionName "0.1.${run}"`);
await writeFile(gradlePath, gradle);

// Icons: Mimzi's own icon at every density (replaces the Capacitor placeholder).
const sizes = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 };
for (const [dpi, px] of Object.entries(sizes)) {
  for (const name of ['ic_launcher.png', 'ic_launcher_round.png']) {
    await sharp('public/icons/icon-512.png').resize(px, px).png().toFile(`${res}/mipmap-${dpi}/${name}`);
  }
  await rm(`${res}/mipmap-${dpi}/ic_launcher_foreground.png`, { force: true });
}
// Use the plain icons above instead of the template's adaptive placeholder.
await rm(`${res}/mipmap-anydpi-v26`, { recursive: true, force: true });
const values = await readdir(`${res}/values`);
if (values.includes('ic_launcher_background.xml')) await rm(`${res}/values/ic_launcher_background.xml`);
// Google sign-in: the sign-in plugin needs the app's main screen to hand back Google's answer.
const mainDir = 'android/app/src/main/java/io/github/novabytecore/mimzi';
await mkdir(mainDir, { recursive: true });
await writeFile(
  `${mainDir}/MainActivity.java`,
  `package io.github.novabytecore.mimzi;

import android.content.Intent;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginHandle;
import ee.forgr.capacitor.social.login.GoogleProvider;
import ee.forgr.capacitor.social.login.ModifiedMainActivityForSocialLoginPlugin;
import ee.forgr.capacitor.social.login.SocialLoginPlugin;

public class MainActivity extends BridgeActivity implements ModifiedMainActivityForSocialLoginPlugin {
    @Override
    public void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode >= GoogleProvider.REQUEST_AUTHORIZE_GOOGLE_MIN && requestCode < GoogleProvider.REQUEST_AUTHORIZE_GOOGLE_MAX) {
            PluginHandle handle = getBridge().getPlugin("SocialLogin");
            if (handle == null) return;
            Plugin plugin = handle.getInstance();
            if (plugin instanceof SocialLoginPlugin) ((SocialLoginPlugin) plugin).handleGoogleLoginIntent(requestCode, data);
        }
    }

    @Override
    public void IHaveModifiedTheMainActivityForTheUseWithSocialLoginPlugin() {}
}
`,
);
if (!manifest.includes('android.permission.INTERNET')) {
  manifest = manifest.replace('</manifest>', '    <uses-permission android:name="android.permission.INTERNET" />\n</manifest>');
  await writeFile(manifestPath, manifest);
}
console.log('Prepared Android project, build', run);
