import { compactBoardWords } from './lib/manageWords';
import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { useMimzi } from './state/MimziStore';
import { FavoritesEditor } from './parent/FavoritesEditor';
import { Board } from './components/Board';
import { getRecentPictures, onRecentPictures, pictureUrls, type RecentPicture } from './lib/recentPictures';
import { everydayPictures } from './lib/pictureSets';
import { SentenceBar, SpokenBar } from './components/SentenceBar';
import { Icon } from './components/Icon';
import { GroupsSheet } from './components/GroupsSheet';
import { TileButton } from './components/TileButton';
import { TileFace } from './components/TileFace';
import { HoldButton } from './components/HoldButton';
import { orderedTiles } from './lib/grid';
import { sentenceReducer, sentenceText } from './lib/sentence';
import { speakText, speakTile, spokenFor, type SpeakOptions } from './lib/speech';
import { HOME_PAGE } from './data/vocabulary';
import { mulberryUrl } from './lib/colors';
import { remoteSymbolUrls } from './lib/symbols';
import { scheduleSymbolUrls } from './lib/myday';
import type { MyDayTool, SpeechState, Tile, Utterance } from './types';
import { ParentGate } from './parent/ParentGate';
import { ParentMode } from './parent/ParentMode';
import { MyDayView } from './components/MyDayView';
import { ScheduleEditor } from './parent/schedule/ScheduleEditor';
import { QuickScheduleEditor } from './parent/schedule/QuickScheduleEditor';

type View = 'talk' | 'myday' | 'favorites' | 'people' | 'parent';

export function App() {
  const store = useMimzi();
  const { tiles, categories, settings, mediaUrls } = store;
  const [view, setView] = useState<View>('talk');
  const [gateOpen, setGateOpen] = useState(false);
  const [groupsOpen, setGroupsOpen] = useState(false);
  const [favoritesOpen, setFavoritesOpen] = useState(false);
  const [firstThenCard, setFirstThenCard] = useState<'first' | 'then' | null>(null);
  // "Edit schedule" on My Day: PIN first, then the schedule editor (grown-ups only).
  const [scheduleGate, setScheduleGate] = useState<MyDayTool | null>(null);
  /** After the PIN: the small quick editor for the board on screen (full editor via More options). */
  const [quickEdit, setQuickEdit] = useState<MyDayTool | null>(null);
  const [scheduleEdit, setScheduleEdit] = useState<MyDayTool | null>(null);
  // Page navigation: a stack of page ids (Home at the bottom) for folders, Back and Home.
  const [stack, setStack] = useState<string[]>([HOME_PAGE]);
  const categoryId = stack[stack.length - 1];
  const setCategoryId = (id: string) => setStack(id === HOME_PAGE ? [HOME_PAGE] : [HOME_PAGE, id]);
  const lastTap = useRef<{ id: string; at: number }>({ id: '', at: 0 });
  /** Per page: the first slot on screen (not a page number), so rotating keeps the same words. */
  const [pages, setPages] = useState<Record<string, number>>({});
  const [sentence, dispatch] = useReducer(sentenceReducer, []);
  // What was last said, exactly as it was said, so "Say it again" and "Try again" replay the
  // same recording, pronunciation and language.
  const [lastSpoken, setLastSpokenRaw] = useState<Utterance | null>(null);
  const [speech, setSpeech] = useState<SpeechState | null>(null);
  const speechSeq = useRef(0);

  const visibleCategories = useMemo(
    () => categories.filter((c) => !c.hidden).sort((a, b) => a.order - b.order),
    [categories],
  );
  useEffect(() => {
    if (categories.length && !categories.some((c) => c.id === categoryId)) setStack([HOME_PAGE]);
  }, [categories, categoryId]);

  const tilesById = useMemo(() => new Map(tiles.map((t) => [t.id, t])), [tiles]);
  const [recentPics, setRecentPics] = useState<RecentPicture[]>([]);
  useEffect(() => {
    void getRecentPictures().then(setRecentPics);
    return onRecentPictures(setRecentPics);
  }, []);

  // Save every symbol the board uses for offline use (service worker cache).
  useEffect(() => {
    if (!('serviceWorker' in navigator) || store.status !== 'ready') return;
    const t = setTimeout(() => {
      const urls = new Set<string>([
        ...remoteSymbolUrls(tiles, { symbolStyle: settings.symbolStyle }),
        ...scheduleSymbolUrls(store.myDay),
        // Recent and everyday pictures, so the picture picker works offline on the tablet.
        ...pictureUrls([...recentPics, ...everydayPictures()]),
      ]);
      for (const x of [...tiles, ...categories]) {
        if (x.symbol?.startsWith('mul:')) urls.add(mulberryUrl(x.symbol.slice(4)));
        const fb = (x as Tile).fallbackSymbol;
        if (fb?.startsWith('mul:')) urls.add(mulberryUrl(fb.slice(4)));
      }
      void navigator.serviceWorker.ready.then((reg) => reg.active?.postMessage({ type: 'mimzi:cache-symbols', urls: [...urls] }));
    }, 1500);
    return () => clearTimeout(t);
  }, [tiles, categories, store.status, settings.symbolStyle, store.myDay, recentPics]);
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

  /** Is the phrase visible in the bar at the top of the screen right now? */
  const shownAtTop = (text: string) => {
    if (settings.showSentenceBar) {
      const words = sentenceText(sentence);
      return words === text || sentence.some((i) => i.label === text);
    }
    return lastSpoken?.text === text;
  };

  /** Speak an utterance and report honestly what happened (never "success" if nothing played). */
  const play = (u: Utterance, atTop: boolean) => {
    const seq = ++speechSeq.current;
    setSpeech({ utterance: u, status: 'speaking', atTop });
    const opts = { ...speechOpts, lang: u.lang || speechOpts.lang };
    void (u.audioUrl ? speakTile(u.speak, u.audioUrl, opts) : speakText(u.speak, opts)).then((r) => {
      if (seq !== speechSeq.current) return; // a newer request owns the status now
      if (r === 'spoken' || r === 'recorded') setSpeech({ utterance: u, status: 'done', atTop });
      else if (r === 'interrupted') setSpeech(null); // cut off on purpose — not an error
      else setSpeech({ utterance: u, status: r === 'unsupported' ? 'unsupported' : 'failed', atTop });
    });
  };

  const onTap = (tile: Tile) => {
    // Optional guard against accidental double taps (Parent Mode → Mimzi Voice).
    const now = Date.now();
    if (settings.repeatGuardMs > 0 && lastTap.current.id === tile.id && now - lastTap.current.at < settings.repeatGuardMs) return;
    lastTap.current = { id: tile.id, at: now };
    if (settings.haptics && 'vibrate' in navigator) navigator.vibrate?.(15);
    if (tile.linkTo) {
      setStack((st) => [...st.filter((p) => p !== tile.linkTo), tile.linkTo!]);
      if (settings.speakFolders) play({ text: tile.label, speak: spokenFor(tile), lang: tile.lang }, false);
      return;
    }
    const u: Utterance = { text: tile.speak || tile.label, speak: spokenFor(tile), lang: tile.lang, audioUrl: tile.audioId ? mediaUrls[tile.audioId] : undefined };
    setLastSpokenRaw(u);
    if (settings.showSentenceBar) {
      dispatch({ type: 'add', item: { tileId: tile.id, label: tile.label, speak: spokenFor(tile) } });
    }
    if (settings.speakOnTap) play(u, true);
  };

  const speakSentence = () => {
    const text = sentenceText(sentence);
    if (!text) return;
    const u: Utterance = { text, speak: text };
    setLastSpokenRaw(u);
    play(u, true);
  };

  /** My Day and other screens: say a phrase (shown on My Day while it is said). */
  const say = (text: string) => {
    const u: Utterance = { text, speak: text };
    if (!settings.showSentenceBar) setLastSpokenRaw(u);
    play(u, !settings.showSentenceBar);
  };

  const replay = () => {
    if (lastSpoken) play(lastSpoken, true);
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
  let wordCount: number | undefined;
  const pageKey = view === 'talk' ? `cat:${categoryId}` : view;
  if (view === 'talk') {
    boardTiles = orderedTiles(tiles, categoryId);
    if (settings.compactWordPages?.includes(categoryId)) {
      boardTiles = compactBoardWords(boardTiles);
      wordCount = boardTiles.filter((tile) => !tile.linkTo).length;
      slotted = false;
    }
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
    emptyMessage = 'No favorites yet. Tap Edit favorites to add words.';
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
          <SpokenBar text={lastSpoken?.text ?? ''} onReplay={replay} />
        )}
        {speech && (speech.status === 'failed' || speech.status === 'unsupported') && view !== 'myday' && (
          <div className="speech-fail" role="alert" data-testid="speech-fail">
            <span>
              {speech.status === 'unsupported' ? 'This device can’t speak right now' : 'Mimzi couldn’t say'} “{speech.utterance.text}”.
              {speech.atTop && shownAtTop(speech.utterance.text) ? ' The words are shown at the top of the screen.' : ''}
            </span>
            {speech.status === 'failed' && (
              <button type="button" className="btn small" onClick={() => play(speech.utterance, speech.atTop)}>
                Try again
              </button>
            )}
            <button type="button" className="btn btn-quiet small" onClick={() => setSpeech(null)} aria-label="Dismiss">
              <Icon name="close" />
            </button>
          </div>
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
          <MyDayView say={say} speech={speech} onRetry={() => speech && play(speech.utterance, speech.atTop)} onEdit={(tool) => tool === 'firstThen' ? setFirstThenCard('first') : setScheduleGate(tool)} onPickFirstThen={setFirstThenCard} />
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
            {settings.pageList !== 'hide' && (
              <button type="button" className="page-btn groups-btn" onClick={() => setGroupsOpen(true)} aria-haspopup="dialog" data-testid="groups-btn">
                <Icon name="steps" /> Groups
              </button>
            )}
            <h2 className="page-title" data-testid="page-title">{boardLabel}</h2>
          </div>
        )}
        {view === 'favorites' && (
          <div className="page-toolbar">
            <h2 className="page-title">Favorites</h2>
            <button type="button" className="page-btn" onClick={() => setFavoritesOpen(true)} aria-haspopup="dialog">Edit favorites</button>
          </div>
        )}
        <Board
          slotted={slotted}
          tiles={boardTiles}
          grid={settings.grid}
          auto={settings.layoutMode === 'fixed' && wordCount === undefined ? undefined : { textScale: settings.textScale, maxGap: settings.tileGap, wordCount }}
          anchor={pages[pageKey] ?? 0}
          onAnchor={(slot) => setPages((s) => ({ ...s, [pageKey]: slot }))}
          onTap={onTap}
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
        <HoldButton
          className="nav-btn nav-parent"
          label="Grown-ups: Parent Mode (asks for the PIN)"
          onHold={() => setGateOpen(true)}
          onTap={() => setGateOpen(true)}
        >
          <Icon name="lock" size={26} /> Grown-ups
        </HoldButton>
      </nav>

      {groupsOpen && (
        <GroupsSheet
          categories={visibleCategories}
          current={categoryId}
          onClose={() => setGroupsOpen(false)}
          onPick={(id) => {
            setCategoryId(id);
            setGroupsOpen(false);
          }}
        />
      )}
      {scheduleGate && (
        <ParentGate
          onCancel={() => setScheduleGate(null)}
          onUnlock={() => {
            setQuickEdit(scheduleGate);
            setScheduleGate(null);
          }}
        />
      )}
      {favoritesOpen && <FavoritesEditor onClose={() => setFavoritesOpen(false)} />}
      {firstThenCard && <QuickScheduleEditor tool="firstThen" initialCard={firstThenCard} onClose={() => setFirstThenCard(null)} />}
      {quickEdit && (
        <QuickScheduleEditor
          tool={quickEdit}
          onClose={() => setQuickEdit(null)}
          onMore={() => {
            setScheduleEdit(quickEdit);
            setQuickEdit(null);
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
