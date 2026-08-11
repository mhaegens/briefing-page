# Agent Publishing Guide

This document defines the contract for publishing briefings to the Briefing Hub. Read it before your first POST.

---

## Endpoint

```
POST https://brief.haegens.be/api/ingest
Authorization: Bearer <BRIEFING_HUB_API_KEY>
Content-Type: application/json
```

On success: `{ "ok": true, "slug": "<id>", "card_count": N }`
On validation failure: `{ "ok": false, "errors": "<details>" }` — 400
On auth failure: 401
On server error: 500

---

## Payload Structure

```json
{
  "title": "string — concise subject line for the inbox row",
  "source": {
    "name": "string — your agent's display name",
    "mark": "string — 1-2 char abbreviation shown as the avatar badge",
    "tone": "blue | lime | coral | yellow"
  },
  "cards": [ ...one or more card objects... ]
}
```

---

## Card Object

```json
{
  "type": "action | information | warning | result",
  "priority": "critical | high | medium | low",
  "title": "string — card headline",
  "summary": "string — one sentence shown in the card header",
  "body": ["paragraph 1", "paragraph 2"],
  "meta": "string — small label shown at card bottom, e.g. 'Demo Builder · 3 items'",
  "action_label": "string — optional, shown on the action button if type=action",
  "reference": "string — optional, file or URL reference shown as footer text"
}
```

All fields except `action_label` and `reference` are required.

---

## Field Reference

### `source.tone` — badge color

| Value | Use for |
|---|---|
| `blue` | General / informational agents |
| `lime` | Build, deploy, or success events |
| `coral` | Warnings, issues, things needing attention |
| `yellow` | Monitoring, alerts, time-sensitive items |

### `source.mark` — avatar abbreviation

Max 2 characters. Examples: `DB` (Demo Builder), `AI` (Claude), `HA` (Home Assistant), `GH` (GitHub).

### `card.type`

| Value | Use when |
|---|---|
| `action` | The user needs to make a decision or take a step |
| `information` | Factual update, no action required |
| `warning` | Something is wrong or at risk |
| `result` | Outcome of a process the user previously triggered |

### `card.priority`

| Value | Use when |
|---|---|
| `critical` | Blocking — the user must act before anything else proceeds |
| `high` | Important — should be reviewed today |
| `medium` | Normal — no urgency |
| `low` | FYI — can wait |

### `card.body`

Array of strings. Each string is one paragraph. Keep paragraphs short (1-3 sentences). Do not embed markdown — plain text only.

### `card.meta`

Shown as a small label at the bottom of the card. Convention: `<source name> · <N items>` or a brief context string. Keep under 40 characters.

---

## Design Rules

**One briefing = one topic.** Do not bundle unrelated updates into a single briefing. If you have three separate things to report, send three briefings.

**Cards are ordered.** Put the most important card first. The user reviews cards in sequence — they should reach critical information before low-priority context.

**Use `action` cards sparingly.** Only mark a card as `action` if the user genuinely needs to make a choice. Informational updates that merely mention next steps should be `information`.

**`body` is a list of facts, not a narrative.** Each string should be a complete, standalone sentence. Avoid filler like "As you can see..." or "It is worth noting that...".

**`summary` is the card in one sentence.** The user reads `summary` before deciding whether to expand the card. Make it specific enough to act on without reading `body`.

**`title` is the inbox subject line.** It should tell the user what the briefing is about before they open it. "Weekly pipeline report" is better than "Update".

---

## Complete Example

```json
{
  "title": "DSM Firmenich demo ready for review",
  "source": {
    "name": "Demo Builder",
    "mark": "DB",
    "tone": "lime"
  },
  "cards": [
    {
      "type": "action",
      "priority": "high",
      "title": "Approve demo plan before Thursday",
      "summary": "The DSM Firmenich demo plan is complete and needs your sign-off before the customer call.",
      "body": [
        "All 9 sections are populated. POD layout uses the Fiori ASB board with NC code drill-down.",
        "Assumed: customer uses discrete manufacturing with rework loop. Flag if incorrect.",
        "Thursday 14:00 CET is the latest you can approve and still have time to load the config."
      ],
      "meta": "Demo Builder · 3 items",
      "action_label": "Open demo plan",
      "reference": "demos/dsm-firmenich-v2/"
    },
    {
      "type": "information",
      "priority": "medium",
      "title": "Assumptions made during generation",
      "summary": "Two assumptions were made that you should verify before the call.",
      "body": [
        "Work center count set to 4 based on typical specialty chemicals plant size.",
        "Operator roster uses 6 workers across 2 shifts — adjust if customer has different headcount."
      ],
      "meta": "Demo Builder · 2 assumptions"
    }
  ]
}
```

---

## What Happens After You Publish

- The briefing appears in the inbox immediately
- The user reviews cards in order, marking each as reviewed or actioned
- When the user completes the briefing, all card content is permanently deleted from the server
- The slug returns 404 after completion — do not cache it or expect it to persist
- Stage 2 (not yet live): `GET /api/briefings/:slug/decisions` will let you poll for the user's action choices
