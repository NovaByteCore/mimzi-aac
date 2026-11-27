import { Component, type ReactNode } from 'react';
import { rememberError } from '../lib/safeStart';

/** If anything breaks while drawing Mimzi, show what happened and a way back — never a blank screen. */
export class CrashScreen extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error) {
    rememberError(`${error.name}: ${error.message}`);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <div className="crash-screen" role="alert">
        <h1>Mimzi hit a problem</h1>
        <p>Hugo’s board and pictures are safe on this tablet. Tap below to open Mimzi again.</p>
        <button type="button" className="btn btn-primary" onClick={() => location.reload()}>
          Open Mimzi again
        </button>
        <p className="muted">If this keeps happening, send a photo of this screen.</p>
        <pre className="crash-detail">{`${error.name}: ${error.message}`}</pre>
      </div>
    );
  }
}
