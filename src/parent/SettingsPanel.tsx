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
      <fieldset className="field layout-choice" data-testid="layout-choice">
        <legend>Board layout</legend>
        <label className="check">
          <input type="radio" name="layout" checked={settings.layoutMode !== 'fixed'} onChange={() => void updateSettings({ layoutMode: 'auto' })} data-testid="layout-auto" />
          <span>
            <strong>Auto (recommended)</strong> — Mimzi sizes the pictures and spacing to fit the tablet, in portrait and landscape. If the words don’t all fit with
            large, easy-to-tap pictures, the page continues on the next page. Words keep their order.
          </span>
        </label>
        <label className="check">
          <input type="radio" name="layout" checked={settings.layoutMode === 'fixed'} onChange={() => void updateSettings({ layoutMode: 'fixed' })} data-testid="layout-fixed" />
          <span>Fixed size — the same rows and columns on every screen</span>
        </label>
        {settings.layoutMode === 'fixed' && (
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
        )}
        <p className="muted small">Which words your child sees is chosen in Manage words. Layout only changes how the board fits the screen.</p>
      </fieldset>
      <label className="check">
        <input type="checkbox" checked={settings.showSentenceBar} onChange={(e) => updateSettings({ showSentenceBar: e.target.checked })} />
        Show the sentence bar (build messages from several pictures)
      </label>
      <label className="field">
        <span>Text size ({Math.round(settings.textScale * 100)}%)</span>
        <input type="range" min={0.8} max={1.6} step={0.1} value={settings.textScale} onChange={(e) => updateSettings({ textScale: Number(e.target.value) })} />
      </label>
      <label className="check">
        <input type="checkbox" checked={settings.onePage ?? true} onChange={(e) => updateSettings({ onePage: e.target.checked })} data-testid="one-page" />
        Everything on one page — pictures shrink so all of a page’s words fit on one screen (no page arrows)
      </label>
      <label className="field">
        <span>Board picture size ({sizeName(settings.tileScale ?? 1)})</span>
        <input type="range" min={0.75} max={1.75} step={0.25} value={settings.tileScale ?? 1} onChange={(e) => updateSettings({ tileScale: Number(e.target.value) })} data-testid="tile-scale" aria-label="Board picture size" />
        <small className="muted">Bigger shows fewer, larger pictures on each page (the rest move to the next page). Used with Auto layout when “Everything on one page” is off.</small>
      </label>
      <label className="field">
        <span>Quick Words size ({sizeName(settings.quickScale ?? 1)})</span>
        <input type="range" min={0.75} max={2} step={0.25} value={settings.quickScale ?? 1} onChange={(e) => updateSettings({ quickScale: Number(e.target.value) })} data-testid="quick-scale" aria-label="Quick Words size" />
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

function sizeName(v: number): string {
  if (v <= 0.75) return 'smaller';
  if (v < 1) return 'a bit smaller';
  if (v === 1) return 'normal';
  if (v <= 1.25) return 'bigger';
  if (v <= 1.5) return 'much bigger';
  return 'biggest';
}
