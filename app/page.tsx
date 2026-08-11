"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type View = "inbox" | "briefing" | "history" | "sources";
type CardType = "action" | "information" | "warning" | "result";
type Priority = "critical" | "high" | "medium" | "low";
type BriefingStatus = "unread" | "in_progress" | "reviewed" | "completed" | "deleted";

type BriefingCard = {
  id: number;
  position: number;
  source: string;
  sourceMark: string;
  sourceTone: string;
  type: CardType;
  priority: Priority;
  title: string;
  summary: string;
  body: string[];
  meta: string;
  actionLabel?: string;
  reference?: string;
  status: "unread" | "reviewed" | "actioned";
};

type BriefingListItem = {
  slug: string;
  title: string;
  source: { name: string; mark: string; tone: string };
  status: BriefingStatus;
  card_count: number;
  unread_count: number;
  created_at: string;
};

type AgentSource = {
  id: number;
  name: string;
  mark: string;
  tone: string;
  last_briefing_at: string | null;
  briefings_this_week: number;
  unread_count: number;
};

const actionChoices = [
  { label: "Draft a response", note: "Let Mail Agent prepare it", mark: "01" },
  { label: "Add to demo prep", note: "Put it on Thursday's list", mark: "02" },
  { label: "Remind me later", note: "Bring it back this afternoon", mark: "03" },
  { label: "I'll handle it", note: "Keep no agent follow-up", mark: "04" },
];

function SourceBadge({ mark, tone, name, compact = false }: { mark: string; tone: string; name: string; compact?: boolean }) {
  return (
    <span className={`source-badge ${tone} ${compact ? "compact" : ""}`}>
      <span className="source-mark" aria-hidden="true">{mark}</span>
      {!compact && <span>{name}</span>}
    </span>
  );
}

function NavIcon({ name }: { name: string }) {
  const glyphs: Record<string, string> = {
    Inbox: "▦",
    Briefing: "▶",
    History: "↺",
    Sources: "◉",
  };
  return <span className="nav-icon" aria-hidden="true">{glyphs[name]}</span>;
}

function formatDate(d: Date) {
  return d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
}

function formatTime(iso: string | null) {
  if (!iso) return "–";
  const d = new Date(typeof iso === "number" ? iso * 1000 : iso);
  return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

export default function Home() {
  const [view, setView] = useState<View>("inbox");
  const [activeBriefingSlug, setActiveBriefingSlug] = useState<string | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [liveCards, setLiveCards] = useState<BriefingCard[]>([]);
  const [briefingTitle, setBriefingTitle] = useState("");
  const [briefingSource, setBriefingSource] = useState<{ name: string; mark: string; tone: string } | null>(null);
  const [reviewed, setReviewed] = useState<number[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [showActions, setShowActions] = useState(false);
  const [sessionComplete, setSessionComplete] = useState(false);
  const [deleted, setDeleted] = useState(false);
  const [savedActions, setSavedActions] = useState<string[]>([]);
  const [dragX, setDragX] = useState(0);
  const [searchOpen, setSearchOpen] = useState(false);
  const [briefingLoading, setBriefingLoading] = useState(false);
  const dragStart = useRef<number | null>(null);

  const currentCard = liveCards[currentIndex];
  const remaining = Math.max(liveCards.length - reviewed.length, 0);
  const progress = sessionComplete ? 100 : liveCards.length > 0 ? ((currentIndex + 1) / liveCards.length) * 100 : 0;

  const navItems = useMemo(
    () => [
      { label: "Inbox", value: "inbox" as View, count: remaining },
      { label: "Briefing", value: "briefing" as View },
      { label: "History", value: "history" as View },
      { label: "Sources", value: "sources" as View },
    ],
    [remaining],
  );

  function resetSession() {
    setCurrentIndex(0);
    setReviewed([]);
    setSessionComplete(false);
    setDeleted(false);
    setSavedActions([]);
    setShowActions(false);
    setExpanded(false);
    setLiveCards([]);
    setActiveBriefingSlug(null);
  }

  async function startBriefing(slug: string) {
    if (deleted) resetSession();
    setBriefingLoading(true);
    setCurrentIndex(0);
    setReviewed([]);
    setSessionComplete(false);
    setDeleted(false);
    setSavedActions([]);
    try {
      const res = await fetch(`/api/briefings/${slug}`);
      if (!res.ok) throw new Error("Failed to load briefing");
      const data = await res.json();
      const mapped: BriefingCard[] = data.cards.map((c: {
        id: number; position: number; type: CardType; priority: Priority;
        title: string; summary: string; body: string[]; meta: string;
        action_label?: string; reference?: string; status: "unread" | "reviewed" | "actioned";
      }) => ({
        id: c.id,
        position: c.position,
        source: data.source.name,
        sourceMark: data.source.mark,
        sourceTone: data.source.tone,
        type: c.type,
        priority: c.priority,
        title: c.title,
        summary: c.summary,
        body: c.body,
        meta: c.meta,
        actionLabel: c.action_label,
        reference: c.reference,
        status: c.status,
      }));
      setLiveCards(mapped);
      setBriefingTitle(data.title);
      setBriefingSource(data.source);
      setActiveBriefingSlug(slug);
      setView("briefing");
    } catch (err) {
      console.error(err);
    } finally {
      setBriefingLoading(false);
    }
  }

  async function advance(action?: string) {
    if (action) setSavedActions((existing) => [...existing, action]);
    const card = liveCards[currentIndex];
    if (card) {
      setReviewed((existing) => existing.includes(card.id) ? existing : [...existing, card.id]);
      // Record decision on server
      const status = action ? "actioned" : "reviewed";
      fetch(`/api/cards/${card.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, ...(action ? { action_choice: action } : {}) }),
      }).catch(console.error);
    }
    setShowActions(false);
    setExpanded(false);
    setDragX(0);
    if (currentIndex >= liveCards.length - 1) {
      setSessionComplete(true);
    } else {
      setCurrentIndex((i) => i + 1);
    }
  }

  function markNeedsAction() {
    if (!currentCard) return;
    if (currentCard.type === "action" || currentCard.type === "warning") {
      setShowActions(true);
    } else {
      advance("Follow up later");
    }
  }

  function moveBack() {
    if (currentIndex > 0) {
      setCurrentIndex((i) => i - 1);
      setSessionComplete(false);
    }
  }

  function onPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    dragStart.current = event.clientX;
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function onPointerMove(event: React.PointerEvent<HTMLDivElement>) {
    if (dragStart.current === null) return;
    const next = event.clientX - dragStart.current;
    setDragX(Math.max(-140, Math.min(140, next)));
  }

  function onPointerUp() {
    if (dragX < -80) advance();
    else if (dragX > 80) markNeedsAction();
    else setDragX(0);
    dragStart.current = null;
  }

  function switchView(next: View) {
    setView(next);
    setSearchOpen(false);
  }

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (
        view !== "briefing" ||
        sessionComplete ||
        deleted ||
        expanded ||
        showActions ||
        event.target instanceof HTMLInputElement
      ) return;
      if (event.key === "ArrowLeft") { event.preventDefault(); advance(); }
      if (event.key === "ArrowRight") { event.preventDefault(); markNeedsAction(); }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  });

  return (
    <main className="app-shell">
      <aside className="sidebar" aria-label="Primary navigation">
        <button className="brand" onClick={() => switchView("inbox")} aria-label="Briefing Hub home">
          <span className="brand-mark" aria-hidden="true"><i /><i /><i /></span>
          <span className="brand-words">Briefing<br />Hub</span>
        </button>

        <nav className="sidebar-nav">
          <p className="nav-kicker">Your space</p>
          {navItems.map((item) => (
            <button
              key={item.value}
              className={view === item.value ? "nav-item active" : "nav-item"}
              onClick={() => switchView(item.value)}
            >
              <NavIcon name={item.label} />
              <span>{item.label}</span>
              {item.count ? <span className="nav-count">{item.count}</span> : null}
            </button>
          ))}
        </nav>

        <div className="sidebar-foot">
          <div className="privacy-status">
            <span className="pulse-dot" aria-hidden="true" />
            <div>
              <strong>Private & protected</strong>
              <span>Encrypted connection</span>
            </div>
          </div>
          <button className="profile-button" aria-label="Open profile">
            <span className="avatar">MH</span>
            <span><strong>Mitchell</strong><small>Personal hub</small></span>
            <span aria-hidden="true">•••</span>
          </button>
        </div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <button className="mobile-brand" onClick={() => switchView("inbox")} aria-label="Briefing Hub home">
            <span className="brand-mark mini" aria-hidden="true"><i /><i /><i /></span>
            <strong>Briefing Hub</strong>
          </button>
          <div className={searchOpen ? "search-wrap open" : "search-wrap"}>
            <button className="search-button" onClick={() => setSearchOpen(!searchOpen)} aria-label="Search briefings">
              <span aria-hidden="true">⌕</span>
              <span className="search-label">Search anything</span>
              <kbd>⌘ K</kbd>
            </button>
            {searchOpen && (
              <div className="search-popover">
                <label htmlFor="briefing-search">Find a briefing</label>
                <input id="briefing-search" autoFocus placeholder="Try 'customer' or 'demo'" />
                <p>Search only checks active briefing content.</p>
              </div>
            )}
          </div>
          <div className="topbar-actions">
            <button className="icon-button" aria-label="Notifications"><span className="notification-dot" />♢</button>
          </div>
        </header>

        <div className="page-stage">
          {view === "inbox" && (
            <InboxView
              deleted={deleted}
              onStart={startBriefing}
              onOpenBriefing={(slug) => startBriefing(slug)}
              loading={briefingLoading}
            />
          )}

          {view === "briefing" && (
            <BriefingView
              card={currentCard ?? null}
              briefingTitle={briefingTitle}
              currentIndex={currentIndex}
              totalCards={liveCards.length}
              progress={progress}
              dragX={dragX}
              sessionComplete={sessionComplete}
              deleted={deleted}
              savedActions={savedActions}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onExpand={() => setExpanded(true)}
              onSkip={() => advance()}
              onAction={markNeedsAction}
              onBack={moveBack}
              onReviewAgain={() => { setCurrentIndex(0); setSessionComplete(false); }}
              onKeep={() => switchView("inbox")}
              onDelete={async () => {
                if (!activeBriefingSlug) return;
                try {
                  const res = await fetch(`/api/briefings/${activeBriefingSlug}/complete`, { method: "POST" });
                  if (!res.ok) throw new Error("Purge failed");
                  setDeleted(true);
                } catch (err) {
                  console.error("Failed to purge briefing:", err);
                  alert("Failed to delete briefing. Please try again.");
                }
              }}
              onReset={resetSession}
            />
          )}

          {view === "history" && <HistoryView onOpenBriefing={startBriefing} />}
          {view === "sources" && <SourcesView />}
        </div>
      </section>

      <nav className="mobile-nav" aria-label="Mobile navigation">
        {navItems.map((item) => (
          <button
            key={item.value}
            className={view === item.value ? "active" : ""}
            onClick={() => switchView(item.value)}
          >
            <NavIcon name={item.label} />
            <span>{item.label}</span>
          </button>
        ))}
      </nav>

      {expanded && currentCard && (
        <ExpandedCard card={currentCard} onClose={() => setExpanded(false)} onAction={markNeedsAction} />
      )}

      {showActions && currentCard && (
        <ActionSheet
          card={currentCard}
          onClose={() => setShowActions(false)}
          onChoose={(action) => advance(action)}
        />
      )}
    </main>
  );
}

function InboxView({
  deleted,
  onStart,
  onOpenBriefing,
  loading,
}: {
  deleted: boolean;
  onStart: (slug: string) => void;
  onOpenBriefing: (slug: string) => void;
  loading: boolean;
}) {
  const [briefingList, setBriefingList] = useState<BriefingListItem[]>([]);
  const [fetching, setFetching] = useState(true);

  useEffect(() => {
    fetch("/api/briefings")
      .then((r) => r.json())
      .then((d) => setBriefingList(d.briefings ?? []))
      .catch(console.error)
      .finally(() => setFetching(false));
  }, []);

  const active = briefingList.filter((b) => b.status !== "completed");
  const actionCount = active.filter((b) => b.unread_count > 0).length;
  const firstSlug = active[0]?.slug;

  return (
    <div className="inbox-page page-view">
      <div className="page-heading inbox-heading">
        <div>
          <span className="eyebrow">{formatDate(new Date())}</span>
          <h1>Good morning, Mitchell.</h1>
        </div>
        <p>Your agents gathered the signal.<br />You only need to make the calls.</p>
      </div>

      <section className={deleted ? "hero-callout complete" : "hero-callout"}>
        <div className="hero-copy">
          <span className="hero-number">{deleted ? "✓" : fetching ? "…" : String(actionCount).padStart(2, "0")}</span>
          <div>
            <span className="eyebrow dark">Your focus</span>
            <h2>{deleted ? "Morning briefing cleared." : actionCount === 0 ? "Nothing needs you right now." : `${actionCount === 1 ? "One thing" : `${actionCount} things`} need${actionCount === 1 ? "s" : ""} you.`}</h2>
            <p>{deleted ? "The content is gone. Your chosen follow-ups are safely queued." : actionCount === 0 ? "Check back later — your agents are working." : `${active.reduce((s, b) => s + b.card_count, 0)} cards, a few focused minutes.`}</p>
          </div>
        </div>
        <button
          className="primary-action dark"
          onClick={() => firstSlug && onStart(firstSlug)}
          disabled={loading || !firstSlug}
        >
          <span>{deleted ? "Run again" : "Start morning briefing"}</span>
          <span className="button-arrow" aria-hidden="true">→</span>
        </button>
        <div className="hero-scribble" aria-hidden="true">One thing<br />at a time ↘</div>
      </section>

      <div className="inbox-grid">
        <section className="briefings-panel">
          <div className="section-heading">
            <div>
              <span className="eyebrow">Today</span>
              <h3>Incoming briefings</h3>
            </div>
            <button className="text-button">View all <span aria-hidden="true">→</span></button>
          </div>

          <div className="briefing-list">
            {fetching && (
              <div style={{ padding: "20px", color: "var(--muted)", fontSize: "12px", textAlign: "center" }}>
                Loading…
              </div>
            )}
            {!fetching && active.length === 0 && (
              <div style={{ padding: "20px", color: "var(--muted)", fontSize: "12px", textAlign: "center" }}>
                Your agents have nothing to report yet.
              </div>
            )}
            {!fetching && active.map((b, i) => (
              <button key={b.slug} className={i === 0 ? "briefing-row featured" : "briefing-row"} onClick={() => onOpenBriefing(b.slug)}>
                <span className={`row-accent ${b.source.tone}`} />
                <span className="source-bubble" style={{ background: `var(--${b.source.tone})`, color: b.source.tone === "blue" ? "white" : "var(--ink)", width: 39, height: 39, display: "grid", placeItems: "center", borderRadius: 10, fontWeight: 950, fontSize: 13 }}>{b.source.mark}</span>
                <span className="row-copy">
                  <span className="row-topline"><strong>{b.source.name}</strong><time>{formatTime(b.created_at)}</time></span>
                  <span>{b.title}</span>
                </span>
                <span className={b.unread_count > 0 ? "count-bubble" : "count-bubble quiet"}>{b.card_count}</span>
              </button>
            ))}
          </div>
        </section>

        <aside className="rhythm-panel">
          <div className="section-heading compact-heading">
            <div>
              <span className="eyebrow">Your rhythm</span>
              <h3>This week</h3>
            </div>
            <span className="tiny-label">Calm</span>
          </div>
          <div className="rhythm-chart" aria-label="Briefings completed this week">
            {[42, 70, 54, 86, 30, 18, 12].map((height, index) => (
              <div className="rhythm-day" key={index}>
                <span className={index === 1 ? "bar active" : "bar"} style={{ height: `${height}%` }} />
                <small>{["M", "T", "W", "T", "F", "S", "S"][index]}</small>
              </div>
            ))}
          </div>
          <p className="rhythm-note"><strong>{briefingList.filter(b => b.status === "completed").length} briefings cleared</strong><span>All time</span></p>
        </aside>
      </div>

      <section className="quiet-note">
        <span className="quiet-icon" aria-hidden="true">◎</span>
        <div><strong>No noisy notifications.</strong><span>Your inbox is the source of truth. Critical items are the only exception.</span></div>
        <button aria-label="Open notification settings">Settings →</button>
      </section>
    </div>
  );
}

function BriefingView({
  card,
  briefingTitle,
  currentIndex,
  totalCards,
  progress,
  dragX,
  sessionComplete,
  deleted,
  savedActions,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onExpand,
  onSkip,
  onAction,
  onBack,
  onReviewAgain,
  onKeep,
  onDelete,
  onReset,
}: {
  card: BriefingCard | null;
  briefingTitle: string;
  currentIndex: number;
  totalCards: number;
  progress: number;
  dragX: number;
  sessionComplete: boolean;
  deleted: boolean;
  savedActions: string[];
  onPointerDown: (event: React.PointerEvent<HTMLDivElement>) => void;
  onPointerMove: (event: React.PointerEvent<HTMLDivElement>) => void;
  onPointerUp: () => void;
  onExpand: () => void;
  onSkip: () => void;
  onAction: () => void;
  onBack: () => void;
  onReviewAgain: () => void;
  onKeep: () => void;
  onDelete: () => void;
  onReset: () => void;
}) {
  if (deleted) {
    return (
      <div className="briefing-page page-view success-page">
        <div className="success-mark" aria-hidden="true"><span>✓</span></div>
        <span className="eyebrow">Briefing complete</span>
        <h1>Done means gone.</h1>
        <p>The cards and their attachments have been deleted. The old briefing link no longer opens.</p>
        <div className="retained-state">
          <span className="retained-count">{Math.max(savedActions.length, 0)}</span>
          <div><strong>follow-ups kept</strong><span>Only content-free workflow state remains.</span></div>
        </div>
        <button className="primary-action blue-action" onClick={onReset}>Back to inbox <span>→</span></button>
      </div>
    );
  }

  if (sessionComplete) {
    return (
      <div className="briefing-page page-view completion-page">
        <div className="completion-grid">
          <div className="completion-copy">
            <span className="eyebrow">All {totalCards} cards reviewed</span>
            <h1>Your head is clear.<br /><em>One last choice.</em></h1>
            <p>Reviewing cards does not delete them. You decide when this briefing is truly finished.</p>
            <button className="text-button review-link" onClick={onReviewAgain}>↺ Review the cards again</button>
          </div>

          <div className="delete-card">
            <span className="delete-icon" aria-hidden="true">⌫</span>
            <span className="eyebrow dark">Finish securely</span>
            <h2>Mark this briefing as done?</h2>
            <p>The briefing content, attachments, and cached copies will be deleted from the server.</p>
            <ul>
              <li><span>✓</span> Your review status stays</li>
              <li><span>✓</span> Selected follow-ups stay</li>
              <li><span>×</span> Original content cannot be reopened</li>
            </ul>
            <div className="delete-actions">
              <button className="secondary-action" onClick={onKeep}>Keep briefing</button>
              <button className="danger-action" onClick={onDelete}>Mark done & delete <span>→</span></button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!card) return null;

  const direction = dragX > 25 ? "right" : dragX < -25 ? "left" : "neutral";
  return (
    <div className="briefing-page page-view">
      <div className="focus-header">
        <div>
          <span className="eyebrow">{briefingTitle || "Morning briefing"}</span>
          <h1>One thing at a time.</h1>
        </div>
        <div className="progress-copy"><strong>{currentIndex + 1} of {totalCards}</strong><span>~{Math.max(1, totalCards - currentIndex)} min left</span></div>
      </div>

      <div className="progress-track" aria-label={`Card ${currentIndex + 1} of ${totalCards}`}>
        <span style={{ width: `${progress}%` }} />
      </div>

      <div className="focus-layout">
        <button className="round-button back-button" onClick={onBack} disabled={currentIndex === 0} aria-label="Previous card">←</button>

        <div className="card-stage">
          <div className="stack-card stack-two" />
          <div className="stack-card stack-one" />
          <div
            className={`focus-card drag-${direction}`}
            style={{ transform: `translateX(${dragX}px) rotate(${dragX / 28}deg)` }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          >
            <div className="swipe-stamp left-stamp">REVIEWED</div>
            <div className="swipe-stamp right-stamp">FOLLOW UP</div>
            <div className="card-topline">
              <SourceBadge mark={card.sourceMark} tone={card.sourceTone} name={card.source} />
              <span className={`priority-tag ${card.priority}`}>{card.priority}</span>
            </div>
            <div className="card-main-copy">
              <span className="card-type">{card.type === "warning" ? "Heads up" : card.type}</span>
              <h2>{card.title}</h2>
              <p>{card.summary}</p>
            </div>
            {card.actionLabel && (
              <div className="action-hint"><span aria-hidden="true">↳</span><p><strong>Why it matters</strong>{card.actionLabel}</p></div>
            )}
            <button className="read-more" onClick={onExpand}>Read full note <span>↗</span></button>
          </div>
        </div>

        <span className="round-button ghost-spacer" aria-hidden="true">→</span>
      </div>

      <div className="decision-area">
        <p className="gesture-hint">Swipe the card or use these buttons</p>
        <div className="decision-buttons">
          <button className="decision-button seen" onClick={onSkip}><span className="decision-icon">←</span><span><strong>Reviewed</strong><small>No follow-up</small></span></button>
          <button className="decision-button action" onClick={onAction}><span><strong>Needs action</strong><small>Choose what happens</small></span><span className="decision-icon">→</span></button>
        </div>
      </div>

      <p className="keyboard-hint"><kbd>←</kbd> reviewed <span>·</span> <kbd>→</kbd> needs action <span>·</span> tap card for detail</p>
    </div>
  );
}

function ExpandedCard({ card, onClose, onAction }: { card: BriefingCard; onClose: () => void; onAction: () => void }) {
  return (
    <div className="overlay" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <article className="detail-sheet" role="dialog" aria-modal="true" aria-labelledby="detail-title">
        <div className="sheet-handle" aria-hidden="true" />
        <header className="sheet-header">
          <SourceBadge mark={card.sourceMark} tone={card.sourceTone} name={card.source} />
          <button className="close-button" onClick={onClose} aria-label="Close detail">×</button>
        </header>
        <div className="sheet-content">
          <div className="sheet-labels"><span className={`priority-tag ${card.priority}`}>{card.priority}</span><span>{card.type}</span></div>
          <h2 id="detail-title">{card.title}</h2>
          <p className="sheet-summary">{card.summary}</p>
          <div className="body-copy">{card.body.map((paragraph, i) => <p key={i}>{paragraph}</p>)}</div>
          {card.actionLabel && <blockquote><strong>Suggested next step</strong>{card.actionLabel}</blockquote>}
          <div className="source-reference"><span>Source reference</span><strong>{card.reference}</strong><small>{card.meta}</small></div>
        </div>
        <footer className="sheet-footer">
          <button className="secondary-action" onClick={onClose}>Back to card</button>
          <button className="primary-action blue-action" onClick={() => { onClose(); onAction(); }}>Needs action <span>→</span></button>
        </footer>
      </article>
    </div>
  );
}

function ActionSheet({ card, onClose, onChoose }: { card: BriefingCard; onClose: () => void; onChoose: (action: string) => void }) {
  return (
    <div className="overlay action-overlay" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="action-sheet" role="dialog" aria-modal="true" aria-labelledby="action-title">
        <button className="close-button" onClick={onClose} aria-label="Close actions">×</button>
        <span className="eyebrow">Needs action</span>
        <h2 id="action-title">What should happen?</h2>
        <p className="action-context">For &ldquo;{card.title}&rdquo;</p>
        <div className="action-choice-list">
          {actionChoices.map((choice) => (
            <button key={choice.label} onClick={() => onChoose(choice.label)}>
              <span className="choice-number">{choice.mark}</span>
              <span><strong>{choice.label}</strong><small>{choice.note}</small></span>
              <span className="choice-arrow">→</span>
            </button>
          ))}
        </div>
        <p className="content-note"><span aria-hidden="true">◇</span> Only your choice is retained after this briefing is deleted.</p>
      </section>
    </div>
  );
}

function HistoryView({ onOpenBriefing }: { onOpenBriefing: (slug: string) => void }) {
  const [briefingList, setBriefingList] = useState<BriefingListItem[]>([]);
  const [filter, setFilter] = useState<"all" | "active" | "completed" | "action">("all");
  const [fetching, setFetching] = useState(true);

  useEffect(() => {
    fetch("/api/briefings")
      .then((r) => r.json())
      .then((d) => setBriefingList(d.briefings ?? []))
      .catch(console.error)
      .finally(() => setFetching(false));
  }, []);

  const filtered = briefingList.filter((b) => {
    if (filter === "active") return b.status !== "completed";
    if (filter === "completed") return b.status === "completed";
    if (filter === "action") return b.unread_count > 0;
    return true;
  });

  return (
    <div className="history-page page-view content-page">
      <div className="page-heading">
        <div><span className="eyebrow">History</span><h1>What&apos;s been handled.</h1></div>
        <p>Active content is searchable. Completed briefings leave only a minimal status record.</p>
      </div>
      <div className="filter-row">
        {(["all", "active", "completed", "action"] as const).map((f) => (
          <button key={f} className={filter === f ? "filter active" : "filter"} onClick={() => setFilter(f)}>
            {f === "all" ? "All" : f === "active" ? "Active" : f === "completed" ? "Completed" : "Needs action"}
          </button>
        ))}
      </div>
      <section className="history-list">
        {fetching && <div style={{ padding: 20, textAlign: "center", color: "var(--muted)", fontSize: 12 }}>Loading…</div>}
        {!fetching && filtered.length === 0 && <div style={{ padding: 20, textAlign: "center", color: "var(--muted)", fontSize: 12 }}>No briefings found.</div>}
        {filtered.map((b, index) => {
          const isCompleted = b.status === "completed";
          const stateLabel = isCompleted ? "Completed — content deleted" : "Reviewed — content active";
          return (
            <article className="history-row" key={b.slug}>
              <span className={`history-index ${b.source.tone}`}>{String(index + 1).padStart(2, "0")}</span>
              <div className="history-copy"><h3>{b.title}</h3><span>{b.source.name}</span></div>
              <span className={!isCompleted ? "state-pill active" : "state-pill"}>{stateLabel}</span>
              <time>{formatTime(b.created_at)}</time>
              {isCompleted
                ? <span style={{ width: 30, height: 30 }} />
                : <button onClick={() => onOpenBriefing(b.slug)} aria-label={`Open ${b.title}`}>→</button>
              }
            </article>
          );
        })}
      </section>
      <div className="privacy-callout"><span className="privacy-symbol">⌫</span><div><span className="eyebrow dark">Privacy by design</span><h2>Completed content does not become an archive.</h2><p>Completed rows retain only content-free identifiers, status, and timestamps.</p></div></div>
    </div>
  );
}

function SourcesView() {
  const [sources, setSources] = useState<AgentSource[]>([]);
  const [fetching, setFetching] = useState(true);

  useEffect(() => {
    fetch("/api/sources")
      .then((r) => r.json())
      .then((d) => setSources(d.sources ?? []))
      .catch(console.error)
      .finally(() => setFetching(false));
  }, []);

  return (
    <div className="sources-page page-view content-page">
      <div className="page-heading">
        <div><span className="eyebrow">Sources</span><h1>Your signal crew.</h1></div>
        <p>See who has briefed you recently. Agent controls arrive later; the source model works now.</p>
      </div>
      <section className="source-grid">
        {fetching && <div style={{ padding: 20, color: "var(--muted)", fontSize: 12 }}>Loading…</div>}
        {!fetching && sources.length === 0 && (
          <div style={{ padding: 20, color: "var(--muted)", fontSize: 12 }}>No agents have published yet.</div>
        )}
        {sources.map((source) => (
          <article className={`source-card ${source.tone}`} key={source.name}>
            <div className="source-card-top">
              <span className={`source-large-mark ${source.tone}`}>{source.mark}</span>
              <span className={source.unread_count > 0 ? "health warning" : "health ready"}><i />{source.unread_count > 0 ? `${source.unread_count} unread` : "Ready"}</span>
            </div>
            <h2>{source.name}</h2>
            <p>Last briefing <strong>{source.last_briefing_at ? formatTime(source.last_briefing_at) : "–"}</strong></p>
            <div className="source-metrics">
              <span><strong>{source.unread_count}</strong><small>Unread</small></span>
              <span><strong>{source.briefings_this_week}</strong><small>This week</small></span>
            </div>
            <button>View briefings <span>→</span></button>
          </article>
        ))}
        <article className="future-card">
          <span className="future-label">Stage 2 preview</span>
          <h2>Agent work queue</h2>
          <p>Later, this is where pending decisions, live status, and completed results can surface.</p>
          <div className="future-line"><span /><span /><span /></div>
        </article>
      </section>
    </div>
  );
}
