import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bestVoice, chooseVoice, rankVoices, voiceQuality } from '../../src/lib/speech.ts';
import { defaultSettings, mergeSettings } from '../../src/lib/defaults.ts';
import { deviceOnlySettings, fromRecords, sharedSettings } from '../../src/lib/google/driveSync.ts';

const voice = (name: string, o: Partial<SpeechSynthesisVoice> = {}) =>
  ({ name, voiceURI: o.voiceURI ?? `uri:${name}`, lang: o.lang ?? 'en-US', localService: o.localService ?? true, default: o.default ?? false }) as SpeechSynthesisVoice;

// Names as real devices report them (iPadOS Safari, Android Chrome, desktop Chrome).
const ipad = [
  voice('Fred', { voiceURI: 'com.apple.speech.synthesis.voice.Fred' }),
  voice('Eddy (English (US))', { voiceURI: 'com.apple.eloquence.en-US.Eddy' }),
  voice('Samantha', { voiceURI: 'com.apple.voice.compact.en-US.Samantha', default: true }),
  voice('Ava (Enhanced)', { voiceURI: 'com.apple.voice.enhanced.en-US.Ava' }),
  voice('Zoe (Premium)', { voiceURI: 'com.apple.voice.premium.en-US.Zoe' }),
  voice('Bubbles', { voiceURI: 'com.apple.speech.synthesis.voice.Bubbles' }),
];

test('voice quality: Enhanced/Premium/Natural first, novelty and robotic voices last', () => {
  assert.equal(voiceQuality(ipad[3]), 'natural');
  assert.equal(voiceQuality(ipad[4]), 'natural');
  assert.equal(voiceQuality(voice('Google US English', { localService: false })), 'natural');
  assert.equal(voiceQuality(voice('Microsoft Aria Online (Natural) - English (United States)', { localService: false })), 'natural');
  assert.equal(voiceQuality(ipad[0]), 'robotic');
  assert.equal(voiceQuality(ipad[1]), 'robotic');
  assert.equal(voiceQuality(ipad[5]), 'robotic');
  const ranked = rankVoices(ipad, 'en-US').map((v) => v.name);
  assert.deepEqual(ranked.slice(0, 2).sort(), ['Ava (Enhanced)', 'Zoe (Premium)']);
  assert.ok(ranked.indexOf('Samantha') < ranked.indexOf('Fred'));
  assert.ok(['Fred', 'Eddy (English (US))', 'Bubbles'].every((n) => ranked.indexOf(n) >= 3), 'robotic voices last');
});

test('automatic voice: the most natural one, never an unnaturally pitched novelty voice', () => {
  assert.match(bestVoice(ipad, 'en-US', true)!.name, /Enhanced|Premium/);
  // With no voice chosen, every word uses that same voice.
  const a = chooseVoice(ipad, undefined, 'en-US', true);
  assert.equal(a.voice?.name, bestVoice(ipad, 'en-US', true)!.name);
  assert.equal(a.reason, undefined);
});

test('automatic voice offline: a natural on-device voice beats a cloud voice', () => {
  const android = [
    voice('Google US English', { localService: false }),
    voice('English United States', { voiceURI: 'en-us-x-sfg-local', localService: true }),
    voice('English United States 2', { voiceURI: 'en-us-x-tpf-network', localService: false }),
  ];
  assert.equal(bestVoice(android, 'en-US', true)!.name, 'Google US English');
  assert.equal(bestVoice(android, 'en-US', false)!.voiceURI, 'en-us-x-sfg-local');
});

test('the chosen voice is used for everything, found again by name if its URI changes', () => {
  assert.equal(chooseVoice(ipad, 'com.apple.voice.compact.en-US.Samantha', 'en-US', true).voice?.name, 'Samantha');
  const renamedUri = chooseVoice(ipad, 'old-uri', 'en-US', true, { voiceName: 'Samantha' });
  assert.equal(renamedUri.voice?.name, 'Samantha');
  assert.equal(renamedUri.reason, undefined);
});

test('a voice picked on another device is used here when installed, explained when it is not', () => {
  const same = chooseVoice(ipad, undefined, 'en-US', true, { sharedVoiceName: 'Zoe (Premium)' });
  assert.equal(same.voice?.name, 'Zoe (Premium)');
  const tablet = [voice('English United States', { voiceURI: 'en-us-x-sfg-local' }), voice('Google US English', { localService: false })];
  const other = chooseVoice(tablet, undefined, 'en-US', true, { sharedVoiceName: 'Zoe (Premium)' });
  assert.equal(other.reason, 'other-device');
  assert.equal(other.voice?.name, 'Google US English', 'falls back to the most natural voice here');
  // A replacement chosen on this device wins from then on.
  assert.equal(chooseVoice(tablet, 'en-us-x-sfg-local', 'en-US', true, { voiceName: 'English United States', sharedVoiceName: 'Zoe (Premium)' }).voice?.voiceURI, 'en-us-x-sfg-local');
  // This device's own choice disappearing is reported as missing.
  assert.equal(chooseVoice(tablet, 'gone', 'en-US', true, { voiceName: 'Gone' }).reason, 'missing');
});

test('friendly defaults: 0.9× speed and a gentle 1.1 pitch; older untouched settings are upgraded, choices kept', () => {
  const d = defaultSettings();
  assert.equal(d.speechRate, 0.9);
  assert.equal(d.speechPitch, 1.1);
  const upgraded = mergeSettings({ speechPitch: 1, speechRate: 1 });
  assert.equal(upgraded.speechPitch, 1.1);
  assert.equal(upgraded.speechRate, 0.9);
  const kept = mergeSettings({ speechPitch: 0.9, speechRate: 1.2 });
  assert.equal(kept.speechPitch, 0.9);
  assert.equal(kept.speechRate, 1.2);
  // Once upgraded, a grown-up setting pitch back to 1 is respected.
  assert.equal(mergeSettings({ ...upgraded, speechPitch: 1 }).speechPitch, 1);
});

test('sync: each device keeps its own voice; the shared preference travels', () => {
  const s = { ...defaultSettings(), voiceURI: 'uri:Zoe (Premium)', voiceName: 'Zoe (Premium)', sharedVoiceName: 'Zoe (Premium)', pin: 'x' };
  const shared = sharedSettings(s) as Record<string, unknown>;
  assert.equal(shared.voiceURI, undefined);
  assert.equal(shared.voiceName, undefined);
  assert.equal(shared.sharedVoiceName, 'Zoe (Premium)');
  const keep = deviceOnlySettings({ ...defaultSettings(), voiceURI: 'tablet-uri', voiceName: 'Tablet Voice' });
  const state = fromRecords([{ store: 'kv', id: 'settings', updatedAt: 1, value: shared }] as never, keep);
  assert.equal(state.settings.voiceURI, 'tablet-uri');
  assert.equal(state.settings.voiceName, 'Tablet Voice');
  assert.equal(state.settings.sharedVoiceName, 'Zoe (Premium)');
});
