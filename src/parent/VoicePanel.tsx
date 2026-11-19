import { useEffect, useMemo, useState } from 'react';
import { useMimzi } from '../state/MimziStore';
import { chooseVoice, getVoices, lastVoiceUse, onVoiceUse, onVoicesChanged, speakText, speechSupported, type VoiceUse } from '../lib/speech';

const SAMPLE = 'I want more bubbles, please.';

/**
 * Mimzi Voice — every word speaks automatically with the device's built-in voices.
 * Only facts the device reports are shown (name, language, on-device or not); Mimzi
 * doesn't guess a voice's gender, age or accent.
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

  const opts = (voiceURI?: string) => ({
    rate: settings.speechRate,
    lang: settings.speechLang,
    voiceURI,
    pitch: settings.speechPitch,
    volume: settings.speechVolume,
  });

  const lang2 = settings.speechLang.slice(0, 2).toLowerCase();
  const groups = useMemo(() => {
    const list = showAll ? voices : voices.filter((v) => v.lang?.toLowerCase().startsWith(lang2));
    const map = new Map<string, SpeechSynthesisVoice[]>();
    for (const v of [...list].sort((a, b) => (a.lang || '').localeCompare(b.lang || '') || a.name.localeCompare(b.name))) {
      const key = v.lang || 'Unknown language';
      map.set(key, [...(map.get(key) ?? []), v]);
    }
    return [...map.entries()];
  }, [voices, showAll, lang2]);

  const chosen = settings.voiceURI ? voices.find((v) => v.voiceURI === settings.voiceURI) : undefined;
  const effective = chooseVoice(voices, settings.voiceURI, settings.speechLang, online);
  const localCount = voices.filter((v) => v.localService && v.lang?.toLowerCase().startsWith(lang2)).length;
  const withPron = tiles.filter((t) => t.pronunciation && !t.deletedAt);
  const pronTile = tiles.find((t) => t.id === pronWord);

  return (
    <section className="panel settings">
      <h2>Mimzi Voice</h2>
      <p className="muted">
        Every button speaks automatically — no recordings needed. Mimzi uses the voices built into this device, so the iPad and an Android tablet
        will sound different. Voices marked <strong>on this device</strong> also work without internet.
      </p>

      {!speechSupported() && <p className="form-error">This browser has no built-in speech. Recorded words will still play, and words always show on screen.</p>}

      <div className="voice-status" data-testid="voice-status">
        {settings.voiceURI && !chosen && voices.length > 0 && (
          <p className="form-error">
            Your chosen voice “{settings.voiceName ?? settings.voiceURI}” isn’t on this device. Mimzi is using “{effective.voice?.name ?? 'the device default'}” instead.
          </p>
        )}
        {chosen && !chosen.localService && (
          <p className="notice-inline">
            “{chosen.name}” needs the internet. {online ? 'It works now, but offline' : 'You’re offline, so right now'} Mimzi uses “
            {chooseVoice(voices, settings.voiceURI, settings.speechLang, false).voice?.name ?? 'an on-device voice'}” instead.
          </p>
        )}
        {use?.reason === 'offline' && <p className="notice-inline">Last word used the offline backup voice “{use.usedName}”.</p>}
        <p className="muted small">
          {voices.length ? `${voices.length} voices found · ${localCount} work offline in this language.` : 'No voices reported yet (some browsers load them after the first word is spoken).'}
          {localCount === 0 && voices.length > 0 && ' No on-device voice was found — install one in the device’s text-to-speech settings for offline speech.'}
        </p>
      </div>

      <div className="row">
        <button type="button" className="btn btn-primary" onClick={() => void speakText(SAMPLE, opts(settings.voiceURI))}>
          🔊 Hear Mimzi’s voice
        </button>
        <button type="button" className="btn btn-quiet" onClick={() => updateSettings({ voiceURI: undefined, voiceName: undefined })} disabled={!settings.voiceURI}>
          Use automatic voice
        </button>
      </div>

      <h3>Choose a voice</h3>
      <label className="check">
        <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} /> Show voices in all languages
      </label>
      {groups.length === 0 ? (
        <p className="muted">No voices for this language were reported by this browser.</p>
      ) : (
        groups.map(([lang, list]) => (
          <div key={lang} className="voice-group">
            <h4>{lang}</h4>
            <ul className="voice-list">
              {list.map((v) => (
                <li key={v.voiceURI} className={`voice-row${v.voiceURI === settings.voiceURI ? ' voice-on' : ''}`}>
                  <label className="check">
                    <input
                      type="radio"
                      name="voice"
                      checked={v.voiceURI === settings.voiceURI}
                      onChange={() => updateSettings({ voiceURI: v.voiceURI, voiceName: v.name, speechLang: v.lang || settings.speechLang })}
                    />
                    <span>
                      <strong>{v.name}</strong> <span className="muted small">{v.localService ? '· on this device' : '· needs internet'}</span>
                      {v.default && <span className="muted small"> · device default</span>}
                    </span>
                  </label>
                  <button type="button" className="btn small" onClick={() => void speakText(SAMPLE, { ...opts(v.voiceURI), lang: v.lang || settings.speechLang })} aria-label={`Preview ${v.name}`}>
                    ▶ Preview
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))
      )}

      <h3>Speech settings</h3>
      <label className="field">
        <span>Speed ({settings.speechRate.toFixed(1)}×)</span>
        <input type="range" min={0.5} max={1.5} step={0.1} value={settings.speechRate} onChange={(e) => updateSettings({ speechRate: Number(e.target.value) })} data-testid="speech-rate" />
      </label>
      <label className="field">
        <span>Pitch ({settings.speechPitch.toFixed(1)}) — not every device supports pitch</span>
        <input type="range" min={0.5} max={1.5} step={0.1} value={settings.speechPitch} onChange={(e) => updateSettings({ speechPitch: Number(e.target.value) })} />
      </label>
      <label className="field">
        <span>Volume ({Math.round(settings.speechVolume * 100)}%) — the device volume buttons also apply</span>
        <input type="range" min={0.2} max={1} step={0.1} value={settings.speechVolume} onChange={(e) => updateSettings({ speechVolume: Number(e.target.value) })} />
      </label>
      <label className="check">
        <input type="checkbox" checked={settings.speakOnTap} onChange={(e) => updateSettings({ speakOnTap: e.target.checked })} data-testid="speak-on-tap" />
        Say each word when it’s tapped
      </label>
      <label className="check">
        <input type="checkbox" checked={settings.showSentenceBar} onChange={(e) => updateSettings({ showSentenceBar: e.target.checked })} />
        Message bar: collect words and say the whole message with 🔊
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
        <button type="button" className="btn" disabled={!pronTile} onClick={() => pronTile && void speakText(pronText || pronTile.speak, opts(settings.voiceURI))}>
          🔊 Test
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
              <button type="button" className="btn small" onClick={() => void speakText(t.pronunciation!, opts(settings.voiceURI))}>
                🔊
              </button>
              <button type="button" className="btn btn-quiet small" onClick={() => saveTile({ ...t, pronunciation: undefined })}>
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
