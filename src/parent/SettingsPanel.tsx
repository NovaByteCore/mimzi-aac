import { useState } from 'react';
import { useMimzi } from '../state/MimziStore';
import { GRID_PRESETS } from '../lib/defaults';
import { createPinRecord, isValidPin } from '../lib/pin';
import { WORD_TYPE_COLOR, WORD_TYPE_LABEL, type WordType } from '../types';

export function SettingsPanel() {
  const { settings, updateSettings } = useMimzi();
  const [pinA, setPinA] = useState('');
  const [pinB, setPinB] = useState('');
  const [pinMsg, setPinMsg] = useState('');

  const gridValue = `${settings.grid.rows}x${settings.grid.cols}`;

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

      <h2>Navigation</h2>
      <label className="field">
        <span>Word groups list</span>
        <select value={settings.pageList ?? 'auto'} onChange={(e) => void updateSettings({ pageList: e.target.value as 'auto' | 'hide' })} data-testid="page-list-setting">
          <option value="auto">Show — beside the board on larger tablets; a “Groups” button on phones and small tablets</option>
          <option value="hide">Hide — use folder buttons and Home / Back only</option>
        </select>
      </label>
      <p className="muted small">Quick words are set in their own section: Parent Mode → Quick words.</p>

      <h2>Colour coding</h2>
      <label className="field">
        <span>Button colours</span>
        <select value={settings.colorMode} onChange={(e) => updateSettings({ colorMode: e.target.value as 'wordType' | 'custom' })} data-testid="color-mode">
          <option value="wordType">AAC colour coding by word type (recommended)</option>
          <option value="custom">Each button’s own colour</option>
        </select>
      </label>
      <ul className="color-key" aria-label="Colour key">
        {(Object.keys(WORD_TYPE_LABEL) as WordType[]).map((k) => (
          <li key={k} className={`tile-${WORD_TYPE_COLOR[k]}`}>
            {WORD_TYPE_LABEL[k]}
          </li>
        ))}
      </ul>
      <p className="muted small">Based on the Modified Fitzgerald Key. Words always have labels and pictures too, so colour is never the only clue.</p>

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
