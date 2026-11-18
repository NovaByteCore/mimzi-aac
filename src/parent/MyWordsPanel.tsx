import { useState } from 'react';
import { useMimzi } from '../state/MimziStore';
import { OBSERVATION_METHODS, type MediaRecord, type Observation } from '../types';
import { AudioRecorder } from './AudioRecorder';
import { ConfirmDialog } from './ConfirmDialog';
import { newId } from '../lib/id';
import { downloadText, observationsToCsv, observationsToText, sortObservations } from '../lib/observations';

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const blank = (): Observation => ({
  id: '',
  target: '',
  pronunciation: '',
  method: 'Speech',
  date: today(),
  notes: '',
  createdAt: 0,
});

/** Caregiver-only log of how the child is communicating. No scores and no conclusions. */
export function MyWordsPanel() {
  const { observations, saveObservation, deleteObservation, mediaUrls } = useMimzi();
  const [form, setForm] = useState<Observation>(blank);
  const [pendingAudio, setPendingAudio] = useState<{ blob: Blob; url: string } | null>(null);
  const [filter, setFilter] = useState('');
  const [error, setError] = useState('');
  const [toDelete, setToDelete] = useState<Observation | null>(null);
  const editing = Boolean(form.id);

  const list = sortObservations(observations).filter((o) => o.target.toLowerCase().includes(filter.trim().toLowerCase()));

  const save = async () => {
    if (!form.target.trim()) {
      setError('Add the target word.');
      return;
    }
    setError('');
    const media: MediaRecord[] = [];
    let audioId = form.audioId;
    if (pendingAudio) {
      audioId = newId('audio');
      media.push({ id: audioId, kind: 'audio', mime: pendingAudio.blob.type || 'audio/webm', blob: pendingAudio.blob, createdAt: Date.now() });
    }
    await saveObservation(
      {
        ...form,
        id: form.id || newId('obs'),
        target: form.target.trim(),
        pronunciation: form.pronunciation.trim(),
        notes: form.notes.trim(),
        audioId,
        createdAt: form.createdAt || Date.now(),
      },
      media,
    );
    if (pendingAudio) URL.revokeObjectURL(pendingAudio.url);
    setPendingAudio(null);
    setForm(blank());
  };

  const audioUrl = pendingAudio?.url ?? (form.audioId ? mediaUrls[form.audioId] : undefined);

  return (
    <section className="panel">
      <h2>My Words</h2>
      <p className="muted">
        A private notebook of how your child is communicating — words, sounds, signs, gestures and AAC taps. Only visible in Parent Mode. Mimzi
        doesn’t score or assess anything.
      </p>

      <div className="obs-form" data-testid="obs-form">
        <h3>{editing ? 'Edit note' : 'Add a note'}</h3>
        <div className="form-grid">
          <label className="field inline">
            <span>Target word</span>
            <input value={form.target} onChange={(e) => setForm({ ...form, target: e.target.value })} placeholder="more" maxLength={60} />
          </label>
          <label className="field inline">
            <span>How they say or show it</span>
            <input value={form.pronunciation} onChange={(e) => setForm({ ...form, pronunciation: e.target.value })} placeholder="mo" maxLength={80} />
          </label>
          <label className="field inline">
            <span>Method</span>
            <select value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value as Observation['method'] })}>
              {OBSERVATION_METHODS.map((m) => (
                <option key={m}>{m}</option>
              ))}
            </select>
          </label>
          <label className="field inline">
            <span>Date</span>
            <input type="date" value={form.date} max={today()} onChange={(e) => setForm({ ...form, date: e.target.value || today() })} />
          </label>
        </div>
        <label className="field">
          <span>Notes</span>
          <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} maxLength={1000} placeholder="e.g. said it at snack time, without a model" />
        </label>
        <AudioRecorder
          url={audioUrl}
          label="Record a clip (optional)"
          maxSeconds={20}
          onRecorded={(blob) => setPendingAudio({ blob, url: URL.createObjectURL(blob) })}
          onRemove={() => {
            setPendingAudio(null);
            setForm({ ...form, audioId: undefined });
          }}
        />
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="modal-actions">
          {editing && (
            <button type="button" className="btn btn-quiet" onClick={() => setForm(blank())}>
              Cancel edit
            </button>
          )}
          <button type="button" className="btn btn-primary" onClick={save}>
            {editing ? 'Save changes' : 'Add note'}
          </button>
        </div>
      </div>

      <div className="panel-head">
        <h3>Notes ({observations.length})</h3>
        <div className="row">
          <button
            type="button"
            className="btn"
            disabled={!observations.length}
            onClick={() => downloadText(observationsToCsv(observations), `mimzi-my-words-${today()}.csv`, 'text/csv')}
          >
            ⬇️ Spreadsheet (CSV)
          </button>
          <button
            type="button"
            className="btn"
            disabled={!observations.length}
            onClick={() => downloadText(observationsToText(observations), `mimzi-my-words-${today()}.txt`, 'text/plain')}
          >
            ⬇️ Summary for therapist
          </button>
        </div>
      </div>
      <label className="field inline">
        <span>Find a word</span>
        <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Search" />
      </label>

      {list.length === 0 ? (
        <p className="muted">No notes yet.</p>
      ) : (
        <table className="obs-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Word</th>
              <th>Said / shown</th>
              <th>Method</th>
              <th>Notes</th>
              <th>
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {list.map((o) => (
              <tr key={o.id} data-obs={o.target}>
                <td>{o.date}</td>
                <td>
                  <strong>{o.target}</strong>
                </td>
                <td>{o.pronunciation}</td>
                <td>{o.method}</td>
                <td>
                  {o.notes}
                  {o.audioId && mediaUrls[o.audioId] && <audio src={mediaUrls[o.audioId]} controls preload="none" className="obs-audio" />}
                </td>
                <td className="obs-actions">
                  <button type="button" className="btn small" onClick={() => setForm(o)}>
                    Edit
                  </button>
                  <button type="button" className="btn btn-danger-quiet small" onClick={() => setToDelete(o)}>
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {toDelete && (
        <ConfirmDialog
          title={`Delete the note for “${toDelete.target}”?`}
          message="This can’t be undone (unless you have a backup)."
          confirmLabel="Delete"
          danger
          onCancel={() => setToDelete(null)}
          onConfirm={async () => {
            await deleteObservation(toDelete.id);
            if (form.id === toDelete.id) setForm(blank());
            setToDelete(null);
          }}
        />
      )}
    </section>
  );
}
