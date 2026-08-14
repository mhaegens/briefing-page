"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import AgentsView from "./AgentsView";

type View = "inbox" | "briefing" | "history" | "sources" | "agents";
type CardType = "action" | "information" | "warning" | "result";
type Priority = "critical" | "high" | "medium" | "low";
type BriefingStatus = "unread" | "in_progress" | "reviewed" | "completed" | "deleted";
type ContentTone = "blue" | "lime" | "coral" | "yellow" | "neutral";

type ContentBlock =
  | {
      kind: "metric";
      value: string;
      label: string;
      detail?: string;
      tone?: ContentTone;
    }
  | {
      kind: "comparison";
      title?: string;
      left: { label: string; value: string; tone?: ContentTone };
      right: { label: string; value: string; tone?: ContentTone };
    }
  | {
      kind: "bullets";
      title: string;
      items: Array<{ text: string; tone?: ContentTone }>;
    }
  | {
      kind: "bar_chart";
      title: string;
      caption?: string;
      items: Array<{ label: string; value: number; max?: number; display?: string; tone?: ContentTone }>;
    }
  | {
      kind: "callout";
      label?: string;
      title: string;
      text: string;
      tone?: ContentTone;
    };

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
  content?: ContentBlock[];
  meta: string;
  actionLabel?: string;
  reference?: string;
  status: "unread" | "reviewed" | "actioned";
  action_job_type?: string | null;
};

type BriefingListItem = {
  slug: string;
  title: string;
  source: { name: string; mark: string; tone: string };
  status: BriefingStatus;
  card_count: number;
  unread_count: number;
  attention_count: number;
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

const glossary: Record<string, { label: string; description: string; href: string }> = {
  "SAP DM": { label: "SAP DM", description: "SAP Digital Manufacturing, SAP's cloud manufacturing execution platform.", href: "https://www.sap.com/products/scm/digital-manufacturing.html" },
  BTP: { label: "BTP", description: "SAP Business Technology Platform: SAP's cloud platform for data, integration and application services.", href: "https://www.sap.com/products/technology-platform.html" },
  CPI: { label: "CPI", description: "SAP Cloud Integration, the integration service within SAP Integration Suite.", href: "https://www.sap.com/products/technology-platform/integration-suite.html" },
  SCIM: { label: "SCIM", description: "A standard protocol for automating user provisioning and deprovisioning.", href: "https://www.rfc-editor.org/rfc/rfc7644" },
  RBAC: { label: "RBAC", description: "Role-based access control: permissions are assigned through job roles.", href: "https://csrc.nist.gov/projects/role-based-access-control" },
  "ISA-95": { label: "ISA-95", description: "An international standard for integrating enterprise and manufacturing control systems.", href: "https://www.isa.org/standards-and-publications/isa-standards/isa-95-standard" },
  OData: { label: "OData", description: "An open protocol for querying and updating data through REST APIs.", href: "https://www.odata.org/" },
  SLA: { label: "SLA", description: "Service-level agreement: a contractual commitment for service availability or performance.", href: "https://www.sap.com/about/trust-center/agreements/cloud/cloud-services.html" },
  RPO: { label: "RPO", description: "Recovery point objective: the maximum acceptable amount of data loss measured in time.", href: "https://www.sap.com/about/trust-center.html" },
  RTO: { label: "RTO", description: "Recovery time objective: the target time for restoring a service after disruption.", href: "https://www.sap.com/about/trust-center.html" },
  eu20: { label: "eu20", description: "SAP's Netherlands cloud region identifier used for this SAP Digital Manufacturing deployment.", href: "https://help.sap.com/docs/digital-manufacturing" },
  hyperscaler: { label: "hyperscaler", description: "A very large public-cloud provider such as Microsoft Azure, AWS, or Google Cloud.", href: "https://www.sap.com/products/technology-platform.html" },
  "multi-AZ": { label: "multi-AZ", description: "A service deployed across multiple availability zones inside one cloud region for resilience.", href: "https://www.sap.com/about/trust-center.html" },
  "col J": { label: "col J", description: "The RFP response column used here for reviewer remarks, qualifications, and disclosure notes.", href: "#content-contract" },
  PPD: { label: "PPD", description: "The project-specific integration component referenced by the fit assessment for the Ultimo REST call.", href: "#content-contract" },
};

function LinkedTerms({ text: value }: { text: string }) {
  const terms = Object.keys(glossary).sort((a, b) => b.length - a.length);
  const matcher = new RegExp(`(${terms.map((term) => term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "gi");
  return <>{value.split(matcher).map((part, index) => {
    const entry = terms.map((term) => glossary[term]).find((item) => item.label.toLowerCase() === part.toLowerCase());
    return entry ? (
      <a className="explain-link" href={entry.href} target={entry.href.startsWith("#") ? undefined : "_blank"} rel={entry.href.startsWith("#") ? undefined : "noreferrer"} title={entry.description} aria-label={`${entry.label}: ${entry.description}`} key={`${part}-${index}`}>{part}<span className="link-help" role="tooltip">{entry.description}<b>{entry.href.startsWith("#") ? "Explained here" : "Learn more ↗"}</b></span></a>
    ) : <span key={`${part}-${index}`}>{part}</span>;
  })}</>;
}

function sentences(body: string[]) {
  return body.flatMap((paragraph) => paragraph.match(/[^.!?]+[.!?]+|[^.!?]+$/g) ?? [paragraph]).map((item) => item.trim()).filter(Boolean);
}

function AutoRichCardBody({ card }: { card: BriefingCard }) {
  const facts = sentences(card.body);
  const flagged = facts.filter((fact) => /flag|gap|wrong|error|unknown|unconfirmed|needs? verification|not confirmed|must/i.test(fact)).length;
  const confirmed = facts.filter((fact) => /confirmed|accurate|correct|standard|documented/i.test(fact)).length;
  const numeric = `${card.title} ${card.summary}`.match(/\b\d+(?:\.\d+)?(?:%|\+)?\b/);
  const callout = numeric?.[0] ?? (card.priority === "critical" ? "!" : String(facts.length).padStart(2, "0"));
  const calloutLabel = numeric ? "key figure" : card.priority === "critical" ? "blocking issue" : "key points";
  const scoreTotal = Math.max(flagged + confirmed, 1);
  const signal = card.priority === "critical" ? "Decision needed" : flagged ? "Review the exceptions" : "Quick evidence scan";

  return (
    <div className="rich-note">
      <section className={`number-callout ${card.priority}`} aria-label={`${callout} ${calloutLabel}`}>
        <span className="callout-number">{callout}</span>
        <div><small>{calloutLabel}</small><strong>{signal}</strong></div>
      </section>

      {(confirmed > 0 || flagged > 0) && (
        <section className="signal-chart" aria-label={`${confirmed} confirmed signals and ${flagged} flagged signals`}>
          <div className="mini-heading"><span>Signal scan</span><small>{confirmed + flagged} tagged claims</small></div>
          <div className="signal-bar"><span className="confirmed" style={{ width: `${confirmed / scoreTotal * 100}%` }} /><span className="flagged" style={{ width: `${flagged / scoreTotal * 100}%` }} /></div>
          <div className="signal-legend"><span><i className="confirmed-dot" />{confirmed} confirmed</span><span><i className="flagged-dot" />{flagged} need attention</span></div>
        </section>
      )}

      <section className="fact-section">
        <div className="mini-heading"><span>The useful bits</span><small>Curated from the source</small></div>
        <ul className="fact-list">
          {facts.map((fact, index) => {
            const alert = /flag|gap|wrong|error|unknown|unconfirmed|needs? verification|not confirmed/i.test(fact);
            return <li className={alert ? "alert" : ""} key={index}><span className="fact-marker">{alert ? "!" : index + 1}</span><p><LinkedTerms text={fact} /></p></li>;
          })}
        </ul>
      </section>
    </div>
  );
}

function toneClass(tone?: ContentTone) {
  return tone ?? "neutral";
}

function RichContentBlock({ block, index }: { block: ContentBlock; index: number }) {
  if (block.kind === "metric") {
    return (
      <section className={`number-callout editorial-metric ${toneClass(block.tone)}`} aria-label={`${block.value} ${block.label}`}>
        <span className="callout-number">{block.value}</span>
        <div><small>{block.label}</small><strong>{block.detail ? <LinkedTerms text={block.detail} /> : "The number to remember"}</strong></div>
      </section>
    );
  }

  if (block.kind === "comparison") {
    return (
      <section className="comparison-block">
        <div className="mini-heading"><span>{block.title ?? "Claim check"}</span><small>Side by side</small></div>
        <div className="comparison-grid">
          <div className={`comparison-side ${toneClass(block.left.tone)}`}><small>{block.left.label}</small><strong><LinkedTerms text={block.left.value} /></strong></div>
          <span className="comparison-arrow" aria-hidden="true">→</span>
          <div className={`comparison-side ${toneClass(block.right.tone)}`}><small>{block.right.label}</small><strong><LinkedTerms text={block.right.value} /></strong></div>
        </div>
      </section>
    );
  }

  if (block.kind === "bullets") {
    return (
      <section className="fact-section editorial-bullets">
        <div className="mini-heading"><span>{block.title}</span><small>{block.items.length} bite-sized points</small></div>
        <ul className="fact-list">
          {block.items.map((item, itemIndex) => (
            <li className={item.tone === "coral" ? "alert" : ""} key={`${index}-${itemIndex}`}>
              <span className={`fact-marker ${toneClass(item.tone)}`}>{item.tone === "coral" ? "!" : itemIndex + 1}</span>
              <p><LinkedTerms text={item.text} /></p>
            </li>
          ))}
        </ul>
      </section>
    );
  }

  if (block.kind === "bar_chart") {
    return (
      <figure className="editorial-chart">
        <figcaption className="mini-heading"><span>{block.title}</span><small>{block.caption ?? "Visual scan"}</small></figcaption>
        <div className="editorial-bars">
          {block.items.map((item, itemIndex) => {
            const max = item.max && item.max > 0 ? item.max : 100;
            const width = item.value === 0 ? 0 : Math.max(4, Math.min(100, item.value / max * 100));
            return (
              <div className="editorial-bar-row" key={`${index}-${itemIndex}`}>
                <div><span>{item.label}</span><strong>{item.display ?? `${item.value}/${max}`}</strong></div>
                <span className="editorial-bar-track"><i className={toneClass(item.tone)} style={{ width: `${width}%` }} /></span>
              </div>
            );
          })}
        </div>
      </figure>
    );
  }

  return (
    <aside className={`editorial-callout ${toneClass(block.tone)}`}>
      <span>{block.label ?? "Worth knowing"}</span>
      <h3><LinkedTerms text={block.title} /></h3>
      <p><LinkedTerms text={block.text} /></p>
    </aside>
  );
}

function RichCardBody({ card }: { card: BriefingCard }) {
  if (!card.content?.length) return <AutoRichCardBody card={card} />;
  return <div className="rich-note curated-note">{card.content.map((block, index) => <RichContentBlock block={block} index={index} key={`${block.kind}-${index}`} />)}</div>;
}

function CardEditorialPreview({ card }: { card: BriefingCard }) {
  const blocks = card.content ?? [];
  const metric = blocks.find((block): block is Extract<ContentBlock, { kind: "metric" }> => block.kind === "metric");
  const comparison = blocks.find((block): block is Extract<ContentBlock, { kind: "comparison" }> => block.kind === "comparison");
  const bullets = blocks.find((block): block is Extract<ContentBlock, { kind: "bullets" }> => block.kind === "bullets");
  const chart = blocks.find((block): block is Extract<ContentBlock, { kind: "bar_chart" }> => block.kind === "bar_chart");

  if (!metric && !comparison && !bullets && !chart) return null;

  return (
    <div className="card-editorial-preview">
      {metric && <div className={`preview-metric ${toneClass(metric.tone)}`}><strong>{metric.value}</strong><span>{metric.label}</span></div>}
      {comparison && <div className="preview-comparison"><span><small>{comparison.left.label}</small><strong>{comparison.left.value}</strong></span><i>→</i><span><small>{comparison.right.label}</small><strong>{comparison.right.value}</strong></span></div>}
      {!comparison && bullets && <ul className="preview-bullets">{bullets.items.slice(0, 3).map((item, index) => <li key={index}><span className={toneClass(item.tone)} />{item.text}</li>)}</ul>}
      {!comparison && !bullets && chart && <div className="preview-bars">{chart.items.slice(0, 3).map((item, index) => <span key={index} title={`${item.label}: ${item.display ?? item.value}`}><i className={toneClass(item.tone)} style={{ width: `${item.value === 0 ? 0 : Math.max(5, Math.min(100, item.value / (item.max || 100) * 100))}%` }} /></span>)}</div>}
    </div>
  );
}

const actionChoices = [
  { label: "Use suggested action", note: "Queue exactly what this card recommends", mark: "01" },
  { label: "Assign for verification", note: "Route it to the right evidence owner", mark: "02" },
  { label: "Remind me later", note: "Bring it back when I have capacity", mark: "03" },
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
    Agents: "◈",
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

function FocusBeacon({
  open,
  briefings,
  deleted,
  onClose,
  onOpenBriefing,
}: {
  open: boolean;
  briefings: BriefingListItem[];
  deleted: boolean;
  onClose: () => void;
  onOpenBriefing: (slug: string) => void;
}) {
  if (!open) return null;

  const active = briefings.filter((briefing) => briefing.status !== "completed");
  const attention = active.filter((briefing) => briefing.attention_count > 0);
  const attentionCount = attention.reduce((total, briefing) => total + briefing.attention_count, 0);
  const quietCount = active.reduce((total, briefing) => total + Math.max(briefing.unread_count - briefing.attention_count, 0), 0);
  const justCleared = deleted && attentionCount === 0;

  return (
    <>
      <button className="beacon-backdrop" onClick={onClose} aria-label="Close focus beacon" />
      <aside className="focus-beacon" role="dialog" aria-modal="false" aria-labelledby="focus-beacon-title">
        <header className="beacon-header">
          <span className="beacon-symbol" aria-hidden="true">◇</span>
          <div><span className="eyebrow">Focus beacon</span><h2 id="focus-beacon-title">Only what deserves interruption.</h2></div>
          <button className="beacon-close" onClick={onClose} aria-label="Close focus beacon">×</button>
        </header>

        <section className={attentionCount > 0 ? "beacon-hero active" : "beacon-hero clear"}>
          <strong>{attentionCount > 0 ? String(attentionCount).padStart(2, "0") : "✓"}</strong>
          <div><span>{attentionCount > 0 ? "Needs your judgment" : "Clear for now"}</span><p>{attentionCount > 0 ? "These can block work or a customer commitment." : "Nothing important is trying to pull you away."}</p></div>
        </section>

        <div className="beacon-list">
          {attention.slice(0, 3).map((briefing) => (
            <button key={briefing.slug} className="beacon-item" onClick={() => onOpenBriefing(briefing.slug)}>
              <span className={`beacon-source ${briefing.source.tone}`}>{briefing.source.mark}</span>
              <span><small>{briefing.source.name} · {briefing.attention_count} priority {briefing.attention_count === 1 ? "card" : "cards"}</small><strong>{briefing.title}</strong></span>
              <i aria-hidden="true">→</i>
            </button>
          ))}
          {attention.length === 0 && (
            <div className="beacon-empty"><span>◎</span><p>Agents can keep working. The beacon will light up only when one needs your decision.</p></div>
          )}
        </div>

        <footer className="beacon-footer">
          <span><i aria-hidden="true">{justCleared ? "✓" : "≋"}</i><strong>{justCleared ? "Briefing cleared" : `${quietCount} routine ${quietCount === 1 ? "update" : "updates"} held back`}</strong></span>
          <small>{justCleared ? "Your follow-ups are still safe." : "They remain in the inbox for when you choose."}</small>
        </footer>
      </aside>
    </>
  );
}

export default function HubClient() {
  const [view, setView] = useState<View>("inbox");
  const [activeBriefingSlug, setActiveBriefingSlug] = useState<string | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [liveCards, setLiveCards] = useState<BriefingCard[]>([]);
  const [briefingTitle, setBriefingTitle] = useState("");
  const [reviewed, setReviewed] = useState<number[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [showActions, setShowActions] = useState(false);
  const [sessionComplete, setSessionComplete] = useState(false);
  const [deleted, setDeleted] = useState(false);
  const [savedActions, setSavedActions] = useState<string[]>([]);
  const [dragX, setDragX] = useState(0);
  const [searchOpen, setSearchOpen] = useState(false);
  const [beaconOpen, setBeaconOpen] = useState(false);
  const [briefingLoading, setBriefingLoading] = useState(false);
  const [briefingList, setBriefingList] = useState<BriefingListItem[]>([]);
  const [briefingsFetching, setBriefingsFetching] = useState(true);
  const [agentJobCount, setAgentJobCount] = useState(0);
  const dragStart = useRef<number | null>(null);

  const currentCard = liveCards[currentIndex];
  const remaining = Math.max(liveCards.length - reviewed.length, 0);
  const progress = sessionComplete ? 100 : liveCards.length > 0 ? ((currentIndex + 1) / liveCards.length) * 100 : 0;
  const beaconCount = briefingList
    .filter((briefing) => briefing.status !== "completed")
    .reduce((total, briefing) => total + briefing.attention_count, 0);

  const navItems = useMemo(
    () => [
      { label: "Inbox", value: "inbox" as View, count: remaining },
      { label: "Briefing", value: "briefing" as View },
      { label: "History", value: "history" as View },
      { label: "Sources", value: "sources" as View },
      { label: "Agents", value: "agents" as View, count: agentJobCount },
    ],
    [remaining, agentJobCount],
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
        content?: ContentBlock[]; action_label?: string; reference?: string; status: "unread" | "reviewed" | "actioned";
        action_job_type?: string | null;
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
        content: c.content,
        meta: c.meta,
        actionLabel: c.action_label,
        reference: c.reference,
        status: c.status,
        action_job_type: c.action_job_type,
      }));
      setLiveCards(mapped);
      setBriefingTitle(data.title);
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
      setBriefingList((existing) => existing.map((briefing) => briefing.slug === activeBriefingSlug ? {
        ...briefing,
        unread_count: Math.max(briefing.unread_count - (card.status === "unread" ? 1 : 0), 0),
        attention_count: Math.max(briefing.attention_count - (card.status === "unread" && (card.priority === "critical" || card.priority === "high") ? 1 : 0), 0),
      } : briefing));
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
    setBeaconOpen(false);
  }

  useEffect(() => {
    fetch("/api/briefings")
      .then((response) => response.json())
      .then((data) => setBriefingList(data.briefings ?? []))
      .catch(console.error)
      .finally(() => setBriefingsFetching(false));
  }, []);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && beaconOpen) {
        setBeaconOpen(false);
        return;
      }
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
            <button className="search-button" onClick={() => { setBeaconOpen(false); setSearchOpen(!searchOpen); }} aria-label="Search briefings">
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
            <button
              className={beaconOpen ? "icon-button active" : "icon-button"}
              aria-label={`Focus beacon${beaconCount > 0 ? `, ${beaconCount} items need attention` : ", clear"}`}
              aria-expanded={beaconOpen}
              aria-controls="focus-beacon-title"
              onClick={() => { setSearchOpen(false); setBeaconOpen((open) => !open); }}
            >
              {beaconCount > 0 && <span className="beacon-count">{beaconCount > 9 ? "9+" : beaconCount}</span>}
              <span aria-hidden="true">◇</span>
            </button>
            <FocusBeacon
              open={beaconOpen}
              briefings={briefingList}
              deleted={deleted}
              onClose={() => setBeaconOpen(false)}
              onOpenBriefing={(slug) => { setBeaconOpen(false); startBriefing(slug); }}
            />
          </div>
        </header>

        <div className="page-stage">
          {view === "inbox" && (
            <InboxView
              deleted={deleted}
              onStart={startBriefing}
              onOpenBriefing={(slug) => startBriefing(slug)}
              loading={briefingLoading}
              briefingList={briefingList}
              fetching={briefingsFetching}
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
                  setBriefingList((existing) => existing.filter((briefing) => briefing.slug !== activeBriefingSlug));
                  setDeleted(true);
                } catch (err) {
                  console.error("Failed to purge briefing:", err);
                  alert("Failed to delete briefing. Please try again.");
                }
              }}
              onReset={resetSession}
              onNavigateToAgents={() => switchView("agents")}
            />
          )}

          {view === "history" && <HistoryView onOpenBriefing={startBriefing} />}
          {view === "sources" && <SourcesView />}
          {view === "agents" && <AgentsView onJobsChange={setAgentJobCount} />}
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
  briefingList,
  fetching,
}: {
  deleted: boolean;
  onStart: (slug: string) => void;
  onOpenBriefing: (slug: string) => void;
  loading: boolean;
  briefingList: BriefingListItem[];
  fetching: boolean;
}) {
  const active = briefingList.filter((b) => b.status !== "completed");
  const actionCount = active.reduce((total, briefing) => total + briefing.attention_count, 0);
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
  onNavigateToAgents,
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
  onNavigateToAgents: () => void;
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
            <CardEditorialPreview card={card} />
            {card.actionLabel && card.action_job_type ? (
              <ActionJobButton card={card} onJobCreated={onNavigateToAgents} />
            ) : card.actionLabel ? (
              <div className="action-hint"><span aria-hidden="true">↳</span><p><strong>Next action</strong>{card.actionLabel}</p></div>
            ) : null}
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
          <RichCardBody card={card} />
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

function ActionJobButton({ card, onJobCreated }: { card: BriefingCard; onJobCreated: () => void }) {
  const [state, setState] = useState<"idle" | "loading" | "done" | string>("idle");

  async function handleClick() {
    setState("loading");
    try {
      const res = await fetch(`/api/cards/${card.id}/action`, { method: "POST" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setState((data as { error?: string }).error ?? "Error — try again");
        return;
      }
      setState("done");
      setTimeout(() => onJobCreated(), 2000);
    } catch {
      setState("Network error — try again");
    }
  }

  const isLoading = state === "loading";
  const isDone = state === "done";
  const isError = state !== "idle" && state !== "loading" && state !== "done";

  return (
    <div className="action-hint action-hint-button">
      <span aria-hidden="true">↳</span>
      <div>
        <strong>Next action</strong>
        <button
          className={`action-job-btn${isDone ? " done" : isError ? " error" : ""}`}
          onClick={handleClick}
          disabled={isLoading || isDone}
        >
          {isLoading ? "Creating job…" : isDone ? "Job created" : isError ? state : card.actionLabel}
        </button>
      </div>
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
