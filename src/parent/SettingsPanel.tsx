import { useEffect, useState } from 'react';
import { useMimzi } from '../state/MimziStore';
import { GRID_PRESETS } from '../lib/defaults';
import { getVoices, onVoicesChanged, speakText, speechSupported } from '../lib/speech';
import { createPinRecord, isValidPin } from '../lib/pin';

const MAX_QUICK = 6;

export function SettingsPanel() {
  const { settings, updateSettings, tiles, categories } = useMimzi();
  const [addQuick, setAddQuick] = useState('');
  const liveTiles = tiles.filter((t) => !t.deletedAt);
  const tileById = new Map(liveTiles.map((t) => [t.id, t]));
  const quick = settings.quickTileIds.filter((id) => tileById.has(id));
  const moveQuick = (i: number, dir: -1 | 1) => {
    const next = [...quick];
    const j = i + dir;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j], next[i]];
    void updateSettings({ quickTileIds: next });
  };
  const [voices, setVoices] = useState(() => getVoices());
  const [pinA, setPinA] = useState('');
  const [pinB, setPinB] = useState('');
  const [pinMsg, setPinMsg] = useState('');

  useEffect(() => {
    setVoices(getVoices());
    return onVoicesChanged(() => setVoices(getVoices()));
  }, []);

  const langVoices = voices.filter((v) => v.lang?.slice(0, 2).toLowerCase() === settings.speechLang.slice(0, 2).toLowerCase());
  const gridValue = `${settings.grid.rows}x${settings.grid.cols}`;
  const test = () =>
    void speakText('I want more bubbles', { rate: settings.speechRate, lang: settings.speechLang, voiceURI: settings.voiceURI });

  return (
    <section className="panel settings">
      <h2>Board</h2>
      <label className="field">
        <span>Pictures per page</span>
        <select
          value={gridValue}
          onChange={(e) => {
            const [rows, cols] = e.target.value.split('x').map(Number);
            void updateSettings({ grid: { rows, cols } });
          }}
          data-testid="grid-select"
        >
          {GRID_PRESETS.map((p) => (
            <option key={p.label} value={`${p.grid.rows}x${p.grid.cols}`}>
              {p.label}
            </option>
          ))}
        </select>
      </label>
      <label className="check">
        <input type="checkbox" checked={settings.showSentenceBar} onChange={(e) => updateSettings({ showSentenceBar: e.target.checked })} />
        Show the sentence bar (build messages from several pictures)
      </label>
      <label className="field">
        <span>Text size ({Math.round(settings.textScale * 100)}%)</span>
        <input type="range" min={0.8} max={1.6} step={0.1} value={settings.textScale} onChange={(e) => updateSettings({ textScale: Number(e.target.value) })} />
      </label>
      <label className="field">
        <span>Space between pictures ({settings.tileGap}px)</span>
        <input type="range" min={4} max={28} step={2} value={settings.tileGap} onChange={(e) => updateSettings({ tileGap: Number(e.target.value) })} />
      </label>
      <label className="check">
        <input type="checkbox" checked={settings.highContrast} onChange={(e) => updateSettings({ highContrast: e.target.checked })} />
        High contrast
      </label>
      <label className="check">
        <input type="checkbox" checked={settings.reducedMotion} onChange={(e) => updateSettings({ reducedMotion: e.target.checked })} />
        Reduce motion (no tap animation)
      </label>
      <label className="check">
        <input type="checkbox" checked={settings.haptics} onChange={(e) => updateSettings({ haptics: e.target.checked })} />
        Vibrate on tap (Android phones only — iPad has no vibration)
      </label>

      <h2>Quick words</h2>
      <p className="muted small">Always on screen on every child page. Keep the most important ones here (up to {MAX_QUICK}).</p>
      <ol className="quick-list" data-testid="quick-list">
        {quick.map((id, i) => (
          <li key={id} className="cat-row">
            <strong>{tileById.get(id)?.label}</strong>
            <span className="spacer" />
            <button type="button" className="icon-btn small" onClick={() => moveQuick(i, -1)} disabled={i === 0} aria-label={`Move ${tileById.get(id)?.label} up`}>
              ▲
            </button>
            <button type="button" className="icon-btn small" onClick={() => moveQuick(i, 1)} disabled={i === quick.length - 1} aria-label={`Move ${tileById.get(id)?.label} down`}>
              ▼
            </button>
            <button
              type="button"
              className="btn btn-quiet small"
              disabled={quick.length <= 1}
              onClick={() => updateSettings({ quickTileIds: quick.filter((q) => q !== id) })}
            >
              Remove
            </button>
          </li>
        ))}
      </ol>
      {quick.length < MAX_QUICK && (
        <div className="add-row">
          <label className="field inline">
            <span>Add a quick word</span>
            <select value={addQuick} onChange={(e) => setAddQuick(e.target.value)} data-testid="quick-add-select">
              <option value="">Choose…</option>
              {[...categories]
                .sort((a, b) => a.order - b.order)
                .map((c) => (
                  <optgroup key={c.id} label={c.name}>
                    {liveTiles
                      .filter((t) => t.categoryId === c.id && !quick.includes(t.id))
                      .sort((a, b) => a.order - b.order)
                      .map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.label}
                        </option>
                      ))}
                  </optgroup>
                ))}
            </select>
          </label>
          <button
            type="button"
            className="btn"
            disabled={!addQuick}
            onClick={() => {
              void updateSettings({ quickTileIds: [...quick, addQuick] });
              setAddQuick('');
            }}
          >
            Add
          </button>
        </div>
      )}

      <h2>Signs</h2>
      <label className="check">
        <input type="checkbox" checked={settings.showSignButtons} onChange={(e) => updateSettings({ showSignButtons: e.target.checked })} />
        Show “See sign” buttons on tiles that have a sign video
      </label>
      <label className="check">
        <input type="checkbox" checked={settings.signLoop} onChange={(e) => updateSettings({ signLoop: e.target.checked })} />
        Repeat sign videos
      </label>
      <label className="field">
        <span>Sign video speed ({Math.round(settings.signSpeed * 100)}%)</span>
        <input type="range" min={0.5} max={1} step={0.25} value={settings.signSpeed} onChange={(e) => updateSettings({ signSpeed: Number(e.target.value) })} />
      </label>

      <h2>Celebrations (My Day)</h2>
      <label className="check">
        <input type="checkbox" checked={settings.celebrationVisual} onChange={(e) => updateSettings({ celebrationVisual: e.target.checked })} />
        Show a gentle “You did it!” when a reward board is full
      </label>
      <label className="check">
        <input type="checkbox" checked={settings.celebrationSound} onChange={(e) => updateSettings({ celebrationSound: e.target.checked })} />
        Say “You did it!” out loud
      </label>

      <h2>Speech</h2>
      {!speechSupported() && <p className="form-error">This browser has no text-to-speech. Recorded voices will still play.</p>}
      <label className="field">
        <span>Speaking speed ({settings.speechRate.toFixed(1)}×)</span>
        <input type="range" min={0.5} max={1.5} step={0.1} value={settings.speechRate} onChange={(e) => updateSettings({ speechRate: Number(e.target.value) })} />
      </label>
      <label className="field">
        <span>Voice on this device</span>
        <select value={settings.voiceURI ?? ''} onChange={(e) => updateSettings({ voiceURI: e.target.value || undefined })}>
          <option value="">Automatic</option>
          {langVoices.map((v) => (
            <option key={v.voiceURI} value={v.voiceURI}>
              {v.name} {v.localService ? '' : '(needs internet)'}
            </option>
          ))}
        </select>
      </label>
      <p className="muted small">
        Voices come from the device, so the iPad and the Samsung phone will sound different. Voices marked “needs internet” won’t work
        offline — pick one without that label.
      </p>
      <button type="button" className="btn" onClick={test}>
        🔊 Test speech
      </button>

      <h2>Parent PIN</h2>
      <div className="add-row">
        <label className="field inline">
          <span>New PIN</span>
          <input type="password" inputMode="numeric" autoComplete="new-password" value={pinA} onChange={(e) => setPinA(e.target.value.replace(/\D/g, ''))} maxLength={8} />
        </label>
        <label className="field inline">
          <span>Again</span>
          <input type="password" inputMode="numeric" autoComplete="new-password" value={pinB} onChange={(e) => setPinB(e.target.value.replace(/\D/g, ''))} maxLength={8} />
        </label>
        <button
          type="button"
          className="btn"
          onClick={async () => {
            if (!isValidPin(pinA)) return setPinMsg('Use 4 to 8 numbers.');
            if (pinA !== pinB) return setPinMsg('The two PINs don’t match.');
            await updateSettings({ pin: await createPinRecord(pinA) });
            setPinA('');
            setPinB('');
            setPinMsg('PIN changed.');
          }}
        >
          Change PIN
        </button>
      </div>
      {pinMsg && <p role="status">{pinMsg}</p>}
      {settings.pin?.algo === 'fallback' && (
        <p className="muted small">This page isn’t on HTTPS, so the PIN uses a simpler lock. Install Mimzi from its HTTPS address for full protection.</p>
      )}
    </section>
  );
}
