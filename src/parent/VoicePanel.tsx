import { useEffect, useMemo, useState } from 'react';
import { useMimzi } from '../state/MimziStore';
import { bestVoice, chooseVoice, getVoices, lastVoiceUse, onVoiceUse, onVoicesChanged, rankVoices, speakText, speechSupported, voiceQuality, type VoiceUse } from '../lib/speech';
import { Icon } from '../components/Icon';

const QUALITY_LABEL = { natural: 'Natural quality', standard: 'Standard', robotic: 'Robotic / novelty' } as const;

const SAMPLE = 'I want more bubbles, please.';

/**
 * Mimzi Voice — every word speaks automatically with the device's built-in voices.
 * Voices are ranked by how natural they sound (from what the device reports: Enhanced,
 * Premium, Natural… in the name). Mimzi doesn't guess a voice's gender, age or accent;
 * a gentle pitch and a slightly slower speed make any voice friendlier for a toddler.
 */
export function VoicePanel() {
  const { settings, updateSettings, tiles, saveTile } = useMimzi();
  const [voices, setVoices] = useState(() => getVoices());
  const [use, setUse] = useState<VoiceUse | null>(lastVoiceUse());
  const [showAll, setShowAll] = useState(false);
  const [online, setOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine);
  const [pronWord, setPronWord] = useState('');
  const [pronText, setPronText] = useState('');

  useEffect(() => {
    setVoices(getVoices());
    const offV = onVoicesChanged(() => setVoices(getVoices()));
    const offU = onVoiceUse(setUse);
    const on = () => setOnline(navigator.onLine);
    window.addEventListener('online', on);
    window.addEventListener('offline', on);
    return () => {
      offV();
      offU();
      window.removeEventListener('online', on);
      window.removeEventListener('offline', on);
    };
  }, []);

  const names = { voiceName: settings.voiceName, sharedVoiceName: settings.sharedVoiceName };
  const opts = (voiceURI?: string, voiceName?: string) => ({
    rate: settings.speechRate,
    lang: settings.speechLang,
    voiceURI,
    voiceName,
    sharedVoiceName: voiceURI ? undefined : settings.sharedVoiceName,
    pitch: settings.speechPitch,
    volume: settings.speechVolume,
  });
  const current = () => opts(settings.voiceURI, settings.voiceName);

  const lang2 = settings.speechLang.slice(0, 2).toLowerCase();
  const ranked = useMemo(() => {
    const list = showAll ? voices : voices.filter((v) => v.lang?.toLowerCase().startsWith(lang2));
    return rankVoices(list, settings.speechLang, true);
  }, [voices, showAll, lang2, settings.speechLang]);

  const effective = chooseVoice(voices, settings.voiceURI, settings.speechLang, online, names);
  const auto = bestVoice(voices, settings.speechLang, online);
  const ownChoice = !!(settings.voiceURI || settings.voiceName);
  const chosen = ownChoice && effective.reason !== 'missing' ? chooseVoice(voices, settings.voiceURI, settings.speechLang, true, names).voice : undefined;
  const offlineVoice = chooseVoice(voices, settings.voiceURI, settings.speechLang, false, names).voice;
  const localCount = voices.filter((v) => v.localService && v.lang?.toLowerCase().startsWith(lang2)).length;
  const naturalCount = voices.filter((v) => v.lang?.toLowerCase().startsWith(lang2) && voiceQuality(v) === 'natural').length;
  const withPron = tiles.filter((t) => t.pronunciation && !t.deletedAt);
  const pronTile = tiles.find((t) => t.id === pronWord);
  const pick = (v: SpeechSynthesisVoice) =>
    updateSettings({ voiceURI: v.voiceURI, voiceName: v.name, sharedVoiceName: v.name, speechLang: v.lang || settings.speechLang });

  return (
    <section className="panel settings">
      <h2>Mimzi Voice</h2>
      <p className="muted">
        Every button speaks automatically with the voice below — no recordings needed, and every new word uses it too. Mimzi uses the voices built
        into this device, so an iPad and an Android tablet sound different. Voices marked <strong>on this device</strong> also work without internet.
      </p>

      {!speechSupported() && <p className="form-error">This browser has no built-in speech. Recorded words will still play, and words always show on screen.</p>}

      <div className="voice-status" data-testid="voice-status">
        <p>
          Mimzi is speaking with <strong data-testid="current-voice">{effective.voice?.name ?? 'the device’s default voice'}</strong>
          {effective.voice && (
            <span className="muted small">
              {' '}
              · {QUALITY_LABEL[voiceQuality(effective.voice)]} · {effective.voice.localService ? 'on this device' : 'needs internet'}
              {ownChoice ? ' · your choice' : ' · picked automatically (most natural)'}
            </span>
          )}
        </p>
        {effective.reason === 'missing' && voices.length > 0 && (
          <p className="form-error" data-testid="voice-missing">
            Your chosen voice “{settings.voiceName ?? settings.voiceURI}” isn’t on this device any more. Mimzi is using “{effective.voice?.name ?? 'the device default'}”
            instead — pick a replacement below.
          </p>
        )}
        {effective.reason === 'other-device' && voices.length > 0 && (
          <p className="notice-inline" data-testid="voice-other-device">
            On your other device Mimzi uses “{settings.sharedVoiceName}”, but that voice isn’t installed on this one (each device has its own voices).
            Here Mimzi is using the most natural voice it has, “{effective.voice?.name ?? 'the device default'}”. Pick a replacement below, or install
            more voices (see the tips at the bottom).
          </p>
        )}
        {chosen && !chosen.localService && (
          <p className="notice-inline">
            “{chosen.name}” needs the internet. {online ? 'It works now, but offline' : 'You’re offline, so right now'} Mimzi uses “
            {offlineVoice?.name ?? 'an on-device voice'}” instead.
          </p>
        )}
        {use?.reason === 'offline' && <p className="notice-inline">Last word used the offline backup voice “{use.usedName}”.</p>}
        <p className="muted small">
          {voices.length
            ? `${voices.length} voices found · ${naturalCount} natural-quality · ${localCount} work offline in this language.`
            : 'No voices reported yet (some browsers load them after the first word is spoken).'}
          {localCount === 0 && voices.length > 0 && ' No on-device voice was found — install one in the device’s text-to-speech settings for offline speech.'}
        </p>
      </div>

      <div className="row">
        <button type="button" className="btn btn-primary" onClick={() => void speakText(SAMPLE, current())}>
          <Icon name="speak" /> Hear Mimzi’s voice
        </button>
        <button
          type="button"
          className="btn btn-quiet"
          onClick={() => updateSettings({ voiceURI: undefined, voiceName: undefined, sharedVoiceName: undefined })}
          disabled={!ownChoice && !settings.sharedVoiceName}
        >
          Use the most natural voice automatically
        </button>
      </div>

      <h3>Choose Mimzi’s voice</h3>
      <p className="muted small">Most natural voices are listed first. Tap Preview to hear one, then choose it — every word and sentence will use it.</p>
      <label className="check">
        <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} /> Show voices in all languages
      </label>
      {ranked.length === 0 ? (
        <p className="muted">No voices for this language were reported by this browser.</p>
      ) : (
        <ul className="voice-list" data-testid="voice-list">
          {ranked.map((v) => {
            const q = voiceQuality(v);
            const on = effective.voice?.voiceURI === v.voiceURI && ownChoice;
            return (
              <li key={v.voiceURI} className={`voice-row${on ? ' voice-on' : ''}${q === 'robotic' ? ' voice-robotic' : ''}`} data-voice={v.voiceURI}>
                <label className="check">
                  <input type="radio" name="voice" checked={on} onChange={() => pick(v)} />
                  <span>
                    <strong>{v.name}</strong>
                    {auto?.voiceURI === v.voiceURI && <span className="voice-badge"> · Most natural</span>}{' '}
                    <span className="muted small">
                      · {QUALITY_LABEL[q]} · {v.lang} · {v.localService ? 'on this device' : 'needs internet'}
                      {v.default && ' · device default'}
                    </span>
                  </span>
                </label>
                <button
                  type="button"
                  className="btn small"
                  onClick={() => void speakText(SAMPLE, { ...opts(v.voiceURI, v.name), lang: v.lang || settings.speechLang })}
                  aria-label={`Preview ${v.name}`}
                >
                  <Icon name="play" /> Preview
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <h3>Speech settings</h3>
      <label className="field">
        <span>Speed ({settings.speechRate.toFixed(2)}×) — 0.9× is a little slower than normal, easier for toddlers to follow</span>
        <input type="range" min={0.5} max={1.5} step={0.05} value={settings.speechRate} onChange={(e) => updateSettings({ speechRate: Number(e.target.value) })} data-testid="speech-rate" />
      </label>
      <label className="field">
        <span>Pitch ({settings.speechPitch.toFixed(2)}) — 1.1 is a gentle, friendly lift; much higher starts to sound unnatural</span>
        <input type="range" min={0.8} max={1.4} step={0.05} value={settings.speechPitch} onChange={(e) => updateSettings({ speechPitch: Number(e.target.value) })} data-testid="speech-pitch" />
      </label>
      <label className="field">
        <span>Volume ({Math.round(settings.speechVolume * 100)}%) — the device volume buttons also apply</span>
        <input type="range" min={0.2} max={1} step={0.1} value={settings.speechVolume} onChange={(e) => updateSettings({ speechVolume: Number(e.target.value) })} />
      </label>
      <div className="row">
        <button
          type="button"
          className="btn btn-quiet"
          data-testid="voice-friendly-defaults"
          onClick={() => updateSettings({ speechRate: 0.9, speechPitch: 1.1, speechVolume: 1 })}
        >
          Reset to friendly toddler settings (0.9× speed, 1.1 pitch)
        </button>
      </div>
      <label className="check">
        <input type="checkbox" checked={settings.speakOnTap} onChange={(e) => updateSettings({ speakOnTap: e.target.checked })} data-testid="speak-on-tap" />
        Say each word when it’s tapped
      </label>
      <label className="check">
        <input type="checkbox" checked={settings.showSentenceBar} onChange={(e) => updateSettings({ showSentenceBar: e.target.checked })} />
        Message bar: collect words and say the whole message with the Speak button
      </label>
      <label className="check">
        <input type="checkbox" checked={settings.speakFolders} onChange={(e) => updateSettings({ speakFolders: e.target.checked })} />
        Say folder names when a folder opens
      </label>
      <label className="field">
        <span>When a new word is tapped while Mimzi is talking</span>
        <select value={settings.interruptMode} onChange={(e) => updateSettings({ interruptMode: e.target.value as 'interrupt' | 'finish' })}>
          <option value="interrupt">Stop and say the new word (recommended)</option>
          <option value="finish">Finish, then say the new word</option>
        </select>
      </label>
      <label className="field">
        <span>Repeated taps on the same word</span>
        <select value={settings.repeatGuardMs} onChange={(e) => updateSettings({ repeatGuardMs: Number(e.target.value) })} data-testid="repeat-guard">
          <option value={0}>Say it every time</option>
          <option value={500}>Ignore a second tap within ½ second</option>
          <option value={1000}>Ignore a second tap within 1 second</option>
          <option value={2000}>Ignore a second tap within 2 seconds</option>
        </select>
      </label>

      <h3>Pronunciation editor</h3>
      <p className="muted small">Fix how the voice says names and special words. The button still shows the normal spelling.</p>
      <div className="add-row">
        <label className="field inline">
          <span>Word</span>
          <select
            value={pronWord}
            onChange={(e) => {
              setPronWord(e.target.value);
              setPronText(tiles.find((t) => t.id === e.target.value)?.pronunciation ?? '');
            }}
            data-testid="pron-word"
          >
            <option value="">Choose a word…</option>
            {tiles
              .filter((t) => !t.deletedAt && !t.linkTo)
              .sort((a, b) => a.label.localeCompare(b.label))
              .map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
          </select>
        </label>
        <label className="field inline">
          <span>Say it like</span>
          <input value={pronText} onChange={(e) => setPronText(e.target.value)} placeholder="e.g. Ree-ah" data-testid="pron-text" />
        </label>
        <button type="button" className="btn" disabled={!pronTile} onClick={() => pronTile && void speakText(pronText || pronTile.speak, current())}>
          <Icon name="speak" /> Test
        </button>
        <button
          type="button"
          className="btn btn-primary"
          disabled={!pronTile}
          onClick={async () => {
            if (!pronTile) return;
            await saveTile({ ...pronTile, pronunciation: pronText.trim() || undefined });
            setPronWord('');
            setPronText('');
          }}
          data-testid="pron-save"
        >
          Save
        </button>
      </div>
      {withPron.length > 0 && (
        <ul className="grow-list">
          {withPron.map((t) => (
            <li key={t.id}>
              <strong>{t.label}</strong> → “{t.pronunciation}”
              <span className="spacer" />
              <button type="button" className="btn small" onClick={() => void speakText(t.pronunciation!, current())}>
                <Icon name="speak" />
              </button>
              <button type="button" className="btn btn-quiet small" onClick={() => saveTile({ ...t, pronunciation: undefined })}>
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}

      <h3>Getting a more natural voice</h3>
      <p className="muted small">
        Mimzi can only use voices installed on the device. Better voices are free to download, then they appear in the list above (most natural first):
      </p>
      <ul className="muted small">
        <li>
          <strong>onn tablet / Android:</strong> Settings → System → Languages → Text-to-speech output → choose <em>Speech Services by Google</em> → ⚙ →
          Install voice data → English (United States) → pick a voice and download it. Then reopen Mimzi.
        </li>
        <li>
          <strong>iPad:</strong> Settings → Accessibility → Spoken Content → Voices → English → download an <em>Enhanced</em> or <em>Premium</em> voice. Then
          reopen Mimzi.
        </li>
      </ul>
      <p className="muted small">Mimzi never copies voices or audio from other AAC apps; it uses only the device’s own voices and your optional recordings.</p>
    </section>
  );
}
