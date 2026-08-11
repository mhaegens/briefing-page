"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type View = "inbox" | "briefing" | "history" | "sources";
type CardType = "action" | "information" | "warning" | "result";
type Priority = "critical" | "high" | "medium" | "low";

type BriefingCard = {
  id: number;
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
};

const cards: BriefingCard[] = [
  {
    id: 1,
    source: "Mail Agent",
    sourceMark: "M",
    sourceTone: "blue",
    type: "action",
    priority: "high",
    title: "Customer wants PP/DS in the next demo",
    summary:
      "They asked whether campaign constraints can be included in Thursday’s scheduling walkthrough.",
    body: [
      "The Acme planning team replied to yesterday’s demo recap. They want the next session to include a realistic PP/DS scenario with campaign constraints.",
      "Your current demo already covers finite capacity. The missing piece is showing how campaign rules affect the sequence and the resulting schedule.",
    ],
    meta: "Received today at 08:12",
    actionLabel: "A reply would unblock Thursday’s demo prep.",
    reference: "Customer email · Demo follow-up",
  },
  {
    id: 2,
    source: "Research Agent",
    sourceMark: "R",
    sourceTone: "lime",
    type: "information",
    priority: "medium",
    title: "Three useful patterns for the briefing schema",
    summary:
      "The strongest examples separate content, user state, and follow-up work—just like your architecture proposes.",
    body: [
      "The review found three recurring patterns: immutable source content, explicit human dispositions, and a separate action queue.",
      "This supports keeping briefing JSON independent from SQLite lifecycle state and future agent workflow state.",
    ],
    meta: "Generated today at 07:48",
    reference: "Research run · 6 sources checked",
  },
  {
    id: 3,
    source: "Demo Builder",
    sourceMark: "D",
    sourceTone: "coral",
    type: "warning",
    priority: "critical",
    title: "One slide still uses last quarter’s figures",
    summary:
      "Slide 18 was not updated because its source spreadsheet is currently locked.",
    body: [
      "The deck refresh completed for 27 of 28 slides. Slide 18 still shows last quarter’s capacity figures because the linked workbook could not be opened.",
      "Nothing was overwritten. The rest of the deck is ready to review.",
    ],
    meta: "Finished today at 07:31",
    actionLabel: "Open the workbook, then rerun slide 18 only.",
    reference: "Demo deck · Build 184",
  },
  {
    id: 4,
    source: "Mail Agent",
    sourceMark: "M",
    sourceTone: "blue",
    type: "information",
    priority: "low",
    title: "The workshop room is confirmed",
    summary:
      "Room Atlas is booked from 13:00 to 16:30, with 20 minutes for setup.",
    body: [
      "Facilities confirmed Room Atlas for Thursday. The room has the large touch display and a guest Wi-Fi network.",
    ],
    meta: "Received yesterday at 17:42",
    reference: "Facilities email · Room booking",
  },
  {
    id: 5,
    source: "Research Agent",
    sourceMark: "R",
    sourceTone: "lime",
    type: "result",
    priority: "medium",
    title: "Competitive scan is ready",
    summary:
      "A focused comparison of four planning tools is ready, with the differences that matter for your customer.",
    body: [
      "The scan covers constraint modelling, scheduling explainability, deployment options, and integration effort.",
      "Two findings are worth carrying into the next customer conversation; the complete notes are attached to the source run.",
    ],
    meta: "Completed yesterday at 16:05",
    reference: "Research run · Competitor scan",
  },
  {
    id: 6,
    source: "Demo Builder",
    sourceMark: "D",
    sourceTone: "coral",
    type: "result",
    priority: "low",
    title: "Demo environment reset completed",
    summary:
      "The scenario is back at its clean starting state and the health checks all pass.",
    body: [
      "The demo tenant was reset, test orders were restored, and the scheduling service passed all six health checks.",
    ],
    meta: "Completed yesterday at 15:18",
    reference: "Demo environment · Reset 92",
  },
];

const actionChoices = [
  { label: "Draft a response", note: "Let Mail Agent prepare it", mark: "01" },
  { label: "Add to demo prep", note: "Put it on Thursday’s list", mark: "02" },
  { label: "Remind me later", note: "Bring it back this afternoon", mark: "03" },
  { label: "I’ll handle it", note: "Keep no agent follow-up", mark: "04" },
];

function SourceBadge({ card, compact = false }: { card: BriefingCard; compact?: boolean }) {
  return (
    <span className={`source-badge ${card.sourceTone} ${compact ? "compact" : ""}`}>
      <span className="source-mark" aria-hidden="true">{card.sourceMark}</span>
      {!compact && <span>{card.source}</span>}
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

export default function Home() {
  const [view, setView] = useState<View>("inbox");
  const [currentIndex, setCurrentIndex] = useState(0);
  const [reviewed, setReviewed] = useState<number[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [showActions, setShowActions] = useState(false);
  const [sessionComplete, setSessionComplete] = useState(false);
  const [deleted, setDeleted] = useState(false);
  const [savedActions, setSavedActions] = useState<string[]>([]);
  const [dragX, setDragX] = useState(0);
  const [searchOpen, setSearchOpen] = useState(false);
  const dragStart = useRef<number | null>(null);

  const currentCard = cards[currentIndex];
  const remaining = Math.max(cards.length - reviewed.length, 0);
  const progress = sessionComplete ? 100 : ((currentIndex + 1) / cards.length) * 100;

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
  }

  function startBriefing() {
    if (deleted) resetSession();
    setView("briefing");
  }

  function advance(action?: string) {
    if (action) setSavedActions((existing) => [...existing, action]);
    setReviewed((existing) =>
      existing.includes(currentCard.id) ? existing : [...existing, currentCard.id],
    );
    setShowActions(false);
    setExpanded(false);
    setDragX(0);

    if (currentIndex >= cards.length - 1) {
      setSessionComplete(true);
    } else {
      setCurrentIndex((index) => index + 1);
    }
  }

  function markNeedsAction() {
    if (currentCard.type === "action" || currentCard.type === "warning") {
      setShowActions(true);
    } else {
      advance("Follow up later");
    }
  }

  function moveBack() {
    if (currentIndex > 0) {
      setCurrentIndex((index) => index - 1);
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

      if (event.key === "ArrowLeft") {
        event.preventDefault();
        advance();
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        markNeedsAction();
      }
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
                <input id="briefing-search" autoFocus placeholder="Try ‘customer’ or ‘demo’" />
                <p>Search only checks active briefing content.</p>
              </div>
            )}
          </div>
          <div className="topbar-actions">
            <span className="prototype-pill">Interactive prototype</span>
            <button className="icon-button" aria-label="Notifications"><span className="notification-dot" />♢</button>
          </div>
        </header>

        <div className="page-stage">
          {view === "inbox" && (
            <InboxView
              remaining={remaining}
              deleted={deleted}
              onStart={startBriefing}
              onOpenBriefing={() => switchView("briefing")}
            />
          )}

          {view === "briefing" && (
            <BriefingView
              card={currentCard}
              currentIndex={currentIndex}
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
              onReviewAgain={() => {
                setCurrentIndex(0);
                setSessionComplete(false);
              }}
              onKeep={() => switchView("inbox")}
              onDelete={() => setDeleted(true)}
              onReset={resetSession}
            />
          )}

          {view === "history" && <HistoryView />}
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

      {expanded && (
        <ExpandedCard card={currentCard} onClose={() => setExpanded(false)} onAction={markNeedsAction} />
      )}

      {showActions && (
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
  remaining,
  deleted,
  onStart,
  onOpenBriefing,
}: {
  remaining: number;
  deleted: boolean;
  onStart: () => void;
  onOpenBriefing: () => void;
}) {
  return (
    <div className="inbox-page page-view">
      <div className="page-heading inbox-heading">
        <div>
          <span className="eyebrow">Tuesday, 11 August</span>
          <h1>Good morning, Mitchell.</h1>
        </div>
        <p>Your agents gathered the signal.<br />You only need to make the calls.</p>
      </div>

      <section className={deleted ? "hero-callout complete" : "hero-callout"}>
        <div className="hero-copy">
          <span className="hero-number">{deleted ? "✓" : "03"}</span>
          <div>
            <span className="eyebrow dark">Your focus</span>
            <h2>{deleted ? "Morning briefing cleared." : "Three things need you."}</h2>
            <p>{deleted ? "The content is gone. Your chosen follow-ups are safely queued." : "Everything else can wait. Six cards, about four focused minutes."}</p>
          </div>
        </div>
        <button className="primary-action dark" onClick={onStart}>
          <span>{deleted ? "Run the prototype again" : "Start morning briefing"}</span>
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
            <button className="briefing-row featured" onClick={onOpenBriefing}>
              <span className="row-accent coral" />
              <span className="source-stack">
                <span className="source-bubble coral">D</span>
                <span className="source-bubble blue">M</span>
              </span>
              <span className="row-copy">
                <span className="row-topline"><strong>Needs your attention</strong><time>08:12</time></span>
                <span>Customer reply + one demo warning</span>
              </span>
              <span className="count-bubble">3</span>
            </button>

            <button className="briefing-row" onClick={onOpenBriefing}>
              <span className="row-accent lime" />
              <span className="source-bubble lime">R</span>
              <span className="row-copy">
                <span className="row-topline"><strong>Research Agent</strong><time>07:48</time></span>
                <span>Schema patterns + competitive scan</span>
              </span>
              <span className="count-bubble quiet">2</span>
            </button>

            <button className="briefing-row" onClick={onOpenBriefing}>
              <span className="row-accent blue" />
              <span className="source-bubble blue">M</span>
              <span className="row-copy">
                <span className="row-topline"><strong>Mail Agent</strong><time>Yesterday</time></span>
                <span>Workshop room confirmed</span>
              </span>
              <span className="count-bubble quiet">1</span>
            </button>
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
          <p className="rhythm-note"><strong>12 briefings cleared</strong><span>Average: 3m 42s</span></p>
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
  currentIndex,
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
  card: BriefingCard;
  currentIndex: number;
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
        <p>The six cards and their attachments have been deleted. The old briefing link no longer opens.</p>
        <div className="retained-state">
          <span className="retained-count">{Math.max(savedActions.length, 2)}</span>
          <div><strong>follow-ups kept</strong><span>Only content-free workflow state remains.</span></div>
        </div>
        <button className="primary-action blue-action" onClick={onReset}>Run prototype again <span>→</span></button>
      </div>
    );
  }

  if (sessionComplete) {
    return (
      <div className="briefing-page page-view completion-page">
        <div className="completion-grid">
          <div className="completion-copy">
            <span className="eyebrow">All six cards reviewed</span>
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

  const direction = dragX > 25 ? "right" : dragX < -25 ? "left" : "neutral";
  return (
    <div className="briefing-page page-view">
      <div className="focus-header">
        <div>
          <span className="eyebrow">Morning briefing</span>
          <h1>One thing at a time.</h1>
        </div>
        <div className="progress-copy"><strong>{currentIndex + 1} of {cards.length}</strong><span>~{Math.max(1, cards.length - currentIndex)} min left</span></div>
      </div>

      <div className="progress-track" aria-label={`Card ${currentIndex + 1} of ${cards.length}`}>
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
              <SourceBadge card={card} />
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
          <SourceBadge card={card} />
          <button className="close-button" onClick={onClose} aria-label="Close detail">×</button>
        </header>
        <div className="sheet-content">
          <div className="sheet-labels"><span className={`priority-tag ${card.priority}`}>{card.priority}</span><span>{card.type}</span></div>
          <h2 id="detail-title">{card.title}</h2>
          <p className="sheet-summary">{card.summary}</p>
          <div className="body-copy">{card.body.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}</div>
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
        <p className="action-context">For “{card.title}”</p>
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

function HistoryView() {
  const history = [
    { title: "Morning briefing", source: "3 sources", state: "Reviewed — content active", date: "Today, 09:06", tone: "blue" },
    { title: "Monday wrap-up", source: "Mail Agent", state: "Completed — content deleted", date: "10 Aug, 17:24", tone: "lime" },
    { title: "Demo build 183", source: "Demo Builder", state: "Completed — content deleted", date: "10 Aug, 15:08", tone: "coral" },
    { title: "Planning research", source: "Research Agent", state: "Completed — content deleted", date: "8 Aug, 11:32", tone: "lime" },
  ];
  return (
    <div className="history-page page-view content-page">
      <div className="page-heading">
        <div><span className="eyebrow">History</span><h1>What’s been handled.</h1></div>
        <p>Active content is searchable. Completed briefings leave only a minimal status record.</p>
      </div>
      <div className="filter-row">
        <button className="filter active">All</button><button className="filter">Active</button><button className="filter">Completed</button><button className="filter">Needs action</button>
      </div>
      <section className="history-list">
        {history.map((item, index) => (
          <article className="history-row" key={item.title}>
            <span className={`history-index ${item.tone}`}>{String(index + 1).padStart(2, "0")}</span>
            <div className="history-copy"><h3>{item.title}</h3><span>{item.source}</span></div>
            <span className={item.state.includes("active") ? "state-pill active" : "state-pill"}>{item.state}</span>
            <time>{item.date}</time>
            <button aria-label={`Open ${item.title}`}>→</button>
          </article>
        ))}
      </section>
      <div className="privacy-callout"><span className="privacy-symbol">⌫</span><div><span className="eyebrow dark">Privacy by design</span><h2>Completed content does not become an archive.</h2><p>Titles above are illustrative for this mockup. In the real product, deleted rows retain only content-free identifiers, status, and timestamps.</p></div></div>
    </div>
  );
}

function SourcesView() {
  const sources = [
    { name: "Mail Agent", mark: "M", tone: "blue", last: "08:12 today", unread: 3, week: 41, status: "Ready" },
    { name: "Demo Builder", mark: "D", tone: "coral", last: "07:31 today", unread: 1, week: 6, status: "1 warning" },
    { name: "Research Agent", mark: "R", tone: "lime", last: "07:48 today", unread: 2, week: 9, status: "Ready" },
  ];
  return (
    <div className="sources-page page-view content-page">
      <div className="page-heading">
        <div><span className="eyebrow">Sources</span><h1>Your signal crew.</h1></div>
        <p>See who has briefed you recently. Agent controls arrive later; the source model works now.</p>
      </div>
      <section className="source-grid">
        {sources.map((source) => (
          <article className={`source-card ${source.tone}`} key={source.name}>
            <div className="source-card-top"><span className={`source-large-mark ${source.tone}`}>{source.mark}</span><span className={source.status === "Ready" ? "health ready" : "health warning"}><i />{source.status}</span></div>
            <h2>{source.name}</h2>
            <p>Last briefing <strong>{source.last}</strong></p>
            <div className="source-metrics"><span><strong>{source.unread}</strong><small>Unread</small></span><span><strong>{source.week}</strong><small>This week</small></span></div>
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
