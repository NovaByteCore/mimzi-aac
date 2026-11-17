import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { useMimzi } from './state/MimziStore';
import { Board } from './components/Board';
import { SentenceBar, SpokenBar } from './components/SentenceBar';
import { TileButton } from './components/TileButton';
import { TileFace } from './components/TileFace';
import { HoldButton } from './components/HoldButton';
import { orderedTiles } from './lib/grid';
import { sentenceReducer, sentenceText } from './lib/sentence';
import { speakText, speakTile, type SpeakResult } from './lib/speech';
import type { Tile } from './types';
import { ParentGate } from './parent/ParentGate';
import { ParentMode } from './parent/ParentMode';

type View = 'talk' | 'favorites' | 'people' | 'parent';

export function App() {
  const store = useMimzi();
  const { tiles, categories, settings, mediaUrls } = store;
  const [view, setView] = useState<View>('talk');
  const [gateOpen, setGateOpen] = useState(false);
  const [categoryId, setCategoryId] = useState('core');
  const [pages, setPages] = useState<Record<string, number>>({});
  const [sentence, dispatch] = useReducer(sentenceReducer, []);
  const [lastSpoken, setLastSpoken] = useState('');
  const [toast, setToast] = useState('');
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const visibleCategories = useMemo(
    () => categories.filter((c) => !c.hidden).sort((a, b) => a.order - b.order),
    [categories],
  );
  useEffect(() => {
    if (visibleCategories.length && !visibleCategories.some((c) => c.id === categoryId)) {
      setCategoryId(visibleCategories[0].id);
    }
  }, [visibleCategories, categoryId]);

  const tilesById = useMemo(() => new Map(tiles.map((t) => [t.id, t])), [tiles]);
  const speechOpts = { rate: settings.speechRate, lang: settings.speechLang, voiceURI: settings.voiceURI };

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 3500);
  }, []);

  const report = useCallback(
    (r: SpeakResult) => {
      if (r === 'unsupported') showToast('This device can’t speak right now — the words are shown at the top.');
      else if (r === 'error') showToast('The sound didn’t play — the words are shown at the top.');
    },
    [showToast],
  );

  const onTap = (tile: Tile) => {
    if (settings.haptics && 'vibrate' in navigator) navigator.vibrate?.(15);
    setLastSpoken(tile.speak);
    if (settings.showSentenceBar) {
      dispatch({ type: 'add', item: { tileId: tile.id, label: tile.label, speak: tile.speak } });
    }
    void speakTile(tile.speak, tile.audioId ? mediaUrls[tile.audioId] : undefined, speechOpts).then(report);
  };

  const speakSentence = () => {
    const text = sentenceText(sentence);
    if (!text) return;
    setLastSpoken(text);
    void speakText(text, speechOpts).then(report);
  };

  const replay = () => {
    if (lastSpoken) void speakText(lastSpoken, speechOpts).then(report);
  };

  if (store.status === 'loading') {
    return (
      <div className="app-loading" role="status">
        Loading Mimzi…
      </div>
    );
  }
  if (store.status === 'error') {
    return (
      <div className="app-error" role="alert">
        <h1>Mimzi couldn’t open its saved words</h1>
        <p>{store.error}</p>
        <p>Private browsing can block storage. Open Mimzi in a normal Safari or Chrome window and try again.</p>
        <button type="button" className="btn" onClick={() => location.reload()}>
          Try again
        </button>
      </div>
    );
  }

  if (view === 'parent') {
    return <ParentMode onExit={() => setView('talk')} />;
  }

  const quickTiles = settings.quickTileIds
    .map((id) => tilesById.get(id))
    .filter((t): t is Tile => Boolean(t && !t.deletedAt && !t.hidden));

  let boardTiles: Tile[] = [];
  let boardLabel = '';
  let emptyMessage: string | undefined;
  const pageKey = view === 'talk' ? `cat:${categoryId}` : view;
  if (view === 'talk') {
    boardTiles = orderedTiles(tiles, categoryId);
    boardLabel = visibleCategories.find((c) => c.id === categoryId)?.name ?? 'Words';
  } else if (view === 'favorites') {
    const catOrder = new Map(categories.map((c) => [c.id, c.order]));
    boardTiles = tiles
      .filter((t) => t.favorite && !t.deletedAt)
      .sort((a, b) => (catOrder.get(a.categoryId) ?? 99) - (catOrder.get(b.categoryId) ?? 99) || a.order - b.order);
    boardLabel = 'Favorites';
    emptyMessage = 'No favorites yet. A grown-up can add them in Parent Mode.';
  } else {
    boardTiles = orderedTiles(tiles, 'family');
    boardLabel = 'My People';
    emptyMessage = 'A grown-up can add family photos in Parent Mode.';
  }

  return (
    <div
      className={`app child-view${settings.highContrast ? ' high-contrast' : ''}${settings.reducedMotion ? ' reduced-motion' : ''}`}
      style={{ ['--text-scale' as string]: settings.textScale, ['--tile-gap' as string]: `${settings.tileGap}px` }}
    >
      <header className="top-bar">
        {settings.showSentenceBar ? (
          <SentenceBar
            items={sentence}
            tilesById={tilesById}
            mediaUrls={mediaUrls}
            onSpeak={speakSentence}
            onBackspace={() => dispatch({ type: 'backspace' })}
            onClear={() => dispatch({ type: 'clear' })}
          />
        ) : (
          <SpokenBar text={lastSpoken} onReplay={replay} />
        )}
      </header>

      {view === 'talk' && (
        <nav className="category-bar" aria-label="Word groups">
          {visibleCategories.map((c) => (
            <button
              key={c.id}
              type="button"
              className={`category-btn tile-${c.color}${c.id === categoryId ? ' category-on' : ''}`}
              aria-pressed={c.id === categoryId}
              onClick={() => setCategoryId(c.id)}
            >
              <span className="category-icon">
                <TileFace symbol={c.symbol} label={c.name} />
              </span>
              <span className="category-name">{c.name}</span>
            </button>
          ))}
        </nav>
      )}

      <main className="board-area">
        <Board
          tiles={boardTiles}
          grid={settings.grid}
          page={pages[pageKey] ?? 0}
          onPage={(p) => setPages((s) => ({ ...s, [pageKey]: p }))}
          onTap={onTap}
          mediaUrls={mediaUrls}
          label={boardLabel}
          emptyMessage={emptyMessage}
        />
      </main>

      <aside className="quick-bar" aria-label="Quick words">
        {quickTiles.map((t) => (
          <TileButton key={t.id} tile={t} photoUrl={t.photoId ? mediaUrls[t.photoId] : undefined} onTap={onTap} compact />
        ))}
      </aside>

      <nav className="main-nav" aria-label="Main">
        <button type="button" className={`nav-btn${view === 'talk' ? ' nav-on' : ''}`} onClick={() => setView('talk')} aria-current={view === 'talk' ? 'page' : undefined}>
          <span aria-hidden="true">💬</span> Talk
        </button>
        <button type="button" className={`nav-btn${view === 'favorites' ? ' nav-on' : ''}`} onClick={() => setView('favorites')} aria-current={view === 'favorites' ? 'page' : undefined}>
          <span aria-hidden="true">⭐</span> Favorites
        </button>
        <button type="button" className={`nav-btn${view === 'people' ? ' nav-on' : ''}`} onClick={() => setView('people')} aria-current={view === 'people' ? 'page' : undefined}>
          <span aria-hidden="true">👨‍👩‍👦</span> My People
        </button>
        <HoldButton className="nav-btn nav-parent" label="Parent Mode — press and hold" onHold={() => setGateOpen(true)}>
          <span aria-hidden="true">🔒</span> Hold for grown-ups
        </HoldButton>
      </nav>

      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}

      {gateOpen && (
        <ParentGate
          onCancel={() => setGateOpen(false)}
          onUnlock={() => {
            setGateOpen(false);
            setView('parent');
          }}
        />
      )}
    </div>
  );
}
