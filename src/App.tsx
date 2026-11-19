import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { useMimzi } from './state/MimziStore';
import { Board } from './components/Board';
import { SentenceBar, SpokenBar } from './components/SentenceBar';
import { Icon } from './components/Icon';
import { TileButton } from './components/TileButton';
import { TileFace } from './components/TileFace';
import { HoldButton } from './components/HoldButton';
import { orderedTiles } from './lib/grid';
import { sentenceReducer, sentenceText } from './lib/sentence';
import { speakText, speakTile, spokenFor, type SpeakOptions, type SpeakResult } from './lib/speech';
import { HOME_PAGE } from './data/vocabulary';
import { mulberryUrl } from './lib/colors';
import { remoteSymbolUrls } from './lib/symbols';
import { scheduleSymbolUrls } from './lib/myday';
import type { MyDayTool, Tile } from './types';
import { ParentGate } from './parent/ParentGate';
import { ParentMode } from './parent/ParentMode';
import { MyDayView } from './components/MyDayView';
import { ScheduleEditor } from './parent/schedule/ScheduleEditor';
import { SignPlayer } from './components/SignPlayer';

type View = 'talk' | 'myday' | 'favorites' | 'people' | 'parent';

export function App() {
  const store = useMimzi();
  const { tiles, categories, settings, mediaUrls, mediaMime } = store;
  const [view, setView] = useState<View>('talk');
  const [gateOpen, setGateOpen] = useState(false);
  // "Edit schedule" on My Day: PIN first, then the schedule editor (grown-ups only).
  const [scheduleGate, setScheduleGate] = useState<MyDayTool | null>(null);
  const [scheduleEdit, setScheduleEdit] = useState<MyDayTool | null>(null);
  // Page navigation: a stack of page ids (Home at the bottom) for folders, Back and Home.
  const [stack, setStack] = useState<string[]>([HOME_PAGE]);
  const categoryId = stack[stack.length - 1];
  const setCategoryId = (id: string) => setStack(id === HOME_PAGE ? [HOME_PAGE] : [HOME_PAGE, id]);
  const lastTap = useRef<{ id: string; at: number }>({ id: '', at: 0 });
  const [pages, setPages] = useState<Record<string, number>>({});
  const [sentence, dispatch] = useReducer(sentenceReducer, []);
  const [lastSpoken, setLastSpoken] = useState('');
  const [toast, setToast] = useState('');
  const [signTile, setSignTile] = useState<Tile | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const visibleCategories = useMemo(
    () => categories.filter((c) => !c.hidden).sort((a, b) => a.order - b.order),
    [categories],
  );
  useEffect(() => {
    if (categories.length && !categories.some((c) => c.id === categoryId)) setStack([HOME_PAGE]);
  }, [categories, categoryId]);

  const tilesById = useMemo(() => new Map(tiles.map((t) => [t.id, t])), [tiles]);

  // Save every symbol the board uses for offline use (service worker cache).
  useEffect(() => {
    if (!('serviceWorker' in navigator) || store.status !== 'ready') return;
    const t = setTimeout(() => {
      const urls = new Set<string>([...remoteSymbolUrls(tiles, { symbolStyle: settings.symbolStyle }), ...scheduleSymbolUrls(store.myDay)]);
      for (const x of [...tiles, ...categories]) {
        if (x.symbol?.startsWith('mul:')) urls.add(mulberryUrl(x.symbol.slice(4)));
        const fb = (x as Tile).fallbackSymbol;
        if (fb?.startsWith('mul:')) urls.add(mulberryUrl(fb.slice(4)));
      }
      void navigator.serviceWorker.ready.then((reg) => reg.active?.postMessage({ type: 'mimzi:cache-symbols', urls: [...urls] }));
    }, 1500);
    return () => clearTimeout(t);
  }, [tiles, categories, store.status, settings.symbolStyle, store.myDay]);
  const speechOpts: SpeakOptions = {
    rate: settings.speechRate,
    lang: settings.speechLang,
    voiceURI: settings.voiceURI,
    voiceName: settings.voiceName,
    sharedVoiceName: settings.sharedVoiceName,
    pitch: settings.speechPitch,
    volume: settings.speechVolume,
    interrupt: settings.interruptMode,
  };

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
    // Optional guard against accidental double taps (Parent Mode → Mimzi Voice).
    const now = Date.now();
    if (settings.repeatGuardMs > 0 && lastTap.current.id === tile.id && now - lastTap.current.at < settings.repeatGuardMs) return;
    lastTap.current = { id: tile.id, at: now };
    if (settings.haptics && 'vibrate' in navigator) navigator.vibrate?.(15);
    if (tile.linkTo) {
      setStack((st) => [...st.filter((p) => p !== tile.linkTo), tile.linkTo!]);
      if (settings.speakFolders) void speakText(spokenFor(tile), { ...speechOpts, lang: tile.lang || speechOpts.lang }).then(report);
      return;
    }
    const spoken = spokenFor(tile);
    setLastSpoken(tile.speak || tile.label);
    if (settings.showSentenceBar) {
      dispatch({ type: 'add', item: { tileId: tile.id, label: tile.label, speak: spoken } });
    }
    if (settings.speakOnTap) {
      void speakTile(spoken, tile.audioId ? mediaUrls[tile.audioId] : undefined, { ...speechOpts, lang: tile.lang || speechOpts.lang }).then(report);
    }
  };

  const speakSentence = () => {
    const text = sentenceText(sentence);
    if (!text) return;
    setLastSpoken(text);
    void speakText(text, speechOpts).then(report);
  };

  const say = (text: string) => {
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

  // Quick words are chosen on their own: hiding a word on its vocabulary page never removes
  // the child's quick way to say it (only deleting the word does).
  const quickTiles = settings.quickTileIds
    .map((id) => tilesById.get(id))
    .filter((t): t is Tile => Boolean(t && !t.deletedAt));

  let boardTiles: Tile[] = [];
  let boardLabel = '';
  let emptyMessage: string | undefined;
  let slotted = true;
  const pageKey = view === 'talk' ? `cat:${categoryId}` : view;
  if (view === 'talk') {
    boardTiles = orderedTiles(tiles, categoryId);
    boardLabel = categories.find((c) => c.id === categoryId)?.name ?? 'Words';
    emptyMessage =
      categoryId === 'food'
        ? 'A grown-up can add your foods and drinks with real photos in Parent Mode.'
        : 'No pictures here yet. A grown-up can add them in Parent Mode.';
  } else if (view === 'favorites') {
    const catOrder = new Map(categories.map((c) => [c.id, c.order]));
    boardTiles = tiles
      .filter((t) => t.favorite && !t.deletedAt)
      .sort((a, b) => (catOrder.get(a.categoryId) ?? 99) - (catOrder.get(b.categoryId) ?? 99) || a.order - b.order);
    boardLabel = 'Favorites';
    slotted = false;
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

      {view === 'talk' && settings.pageList !== 'hide' && (
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
        {view === 'myday' ? (
          <MyDayView say={say} onEdit={(tool) => setScheduleGate(tool)} />
        ) : (
        <div className="board-wrap">
        {view === 'talk' && (
          <div className="page-toolbar" role="toolbar" aria-label="Pages">
            <button type="button" className="page-btn" onClick={() => setStack((st) => (st.length > 1 ? st.slice(0, -1) : st))} disabled={stack.length <= 1} aria-label="Back">
              <Icon name="back" /> Back
            </button>
            <button type="button" className="page-btn" onClick={() => {
                // Home always opens the first Home page (core words + first folders).
                setStack([HOME_PAGE]);
                setPages((s) => ({ ...s, [`cat:${HOME_PAGE}`]: 0 }));
              }}
              disabled={categoryId === HOME_PAGE && !(pages[`cat:${HOME_PAGE}`] > 0)}
              aria-label="Home"
            >
              <Icon name="home" /> Home
            </button>
            <h2 className="page-title" data-testid="page-title">{boardLabel}</h2>
          </div>
        )}
        <Board
          slotted={slotted}
          tiles={boardTiles}
          grid={settings.grid}
          page={pages[pageKey] ?? 0}
          onPage={(p) => setPages((s) => ({ ...s, [pageKey]: p }))}
          onTap={onTap}
          onSign={settings.showSignButtons ? setSignTile : undefined}
          mediaUrls={mediaUrls}
          label={boardLabel}
          emptyMessage={emptyMessage}
        />
        </div>
        )}
      </main>

      <aside className="quick-bar" aria-label="Quick words">
        {quickTiles.map((t) => (
          <TileButton key={t.id} tile={t} photoUrl={t.photoId ? mediaUrls[t.photoId] : undefined} onTap={onTap} compact />
        ))}
      </aside>

      <nav className="main-nav" aria-label="Main">
        <button type="button" className={`nav-btn${view === 'talk' ? ' nav-on' : ''}`} onClick={() => setView('talk')} aria-current={view === 'talk' ? 'page' : undefined}>
          <Icon name="talk" size={26} /> Talk
        </button>
        <button type="button" className={`nav-btn${view === 'myday' ? ' nav-on' : ''}`} onClick={() => setView('myday')} aria-current={view === 'myday' ? 'page' : undefined}>
          <Icon name="day" size={26} /> My Day
        </button>
        <button type="button" className={`nav-btn${view === 'favorites' ? ' nav-on' : ''}`} onClick={() => setView('favorites')} aria-current={view === 'favorites' ? 'page' : undefined}>
          <Icon name="star" size={26} /> Favorites
        </button>
        <button type="button" className={`nav-btn${view === 'people' ? ' nav-on' : ''}`} onClick={() => setView('people')} aria-current={view === 'people' ? 'page' : undefined}>
          <Icon name="people" size={26} /> My People
        </button>
        <HoldButton className="nav-btn nav-parent" label="Parent Mode — press and hold" onHold={() => setGateOpen(true)}>
          <Icon name="lock" size={26} /> Hold for grown-ups
        </HoldButton>
      </nav>

      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}

      {signTile && (
        <SignPlayer
          label={signTile.label}
          url={signTile.signId ? mediaUrls[signTile.signId] : undefined}
          aslSign={settings.showAslDrawings ? signTile.aslSign : undefined}
          mime={(signTile.signId && mediaMime[signTile.signId]) || 'video/mp4'}
          loop={settings.signLoop}
          speed={settings.signSpeed}
          onClose={() => setSignTile(null)}
        />
      )}

      {scheduleGate && (
        <ParentGate
          onCancel={() => setScheduleGate(null)}
          onUnlock={() => {
            setScheduleEdit(scheduleGate);
            setScheduleGate(null);
          }}
        />
      )}
      {scheduleEdit && <ScheduleEditor initial={scheduleEdit} onClose={() => setScheduleEdit(null)} />}

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
