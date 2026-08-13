# Rich card content contract

The optional `content` array lets a producer curate a card instead of sending one wall of prose. The Briefing Hub—not the producer—still owns typography, colour, spacing, accessibility, and responsive layout.

`body` remains required as the durable plain-text fallback. `content` is a structured editorial view of the same facts, not a place to add new claims.

## Available blocks

| Block | Use it for | Do not use it for |
| --- | --- | --- |
| `metric` | One number or identifier the user should remember | Decorative numbers or invented scores |
| `comparison` | Claim vs reality, before vs after, option A vs B | Two unrelated paragraphs |
| `bullets` | Two to seven independently scannable facts or steps | Splitting every sentence into a bullet |
| `bar_chart` | Values with a real numerator and denominator | Vague confidence, risk, or “strength” percentages |
| `callout` | A conclusion, recommended wording, or key caveat | Repeating the summary |

Supported tones are `blue`, `lime`, `coral`, `yellow`, and `neutral`. Tone is semantic guidance, not arbitrary styling:

- `coral`: error, gap, or urgent exception
- `yellow`: verify, qualify, or use caution
- `lime`: confirmed, clean, or resolved
- `blue`: neutral evidence or context
- `neutral`: claim, baseline, or undecorated context

## Recommended LLM rules

1. Use two to four blocks per card; never exceed six.
2. Put the most decision-relevant block first.
3. Prefer one short comparison or chart over a long explanatory paragraph.
4. Never invent a number to make a chart look interesting.
5. Keep the summary understandable without opening the rich view.

Suggested sequence by card type:

- Critical action: `metric → comparison → bullets → callout`
- Review summary: `metric → bar_chart → bullets`
- Information: `metric → bullets → callout`
- Result: `metric → bar_chart → callout`

## Minimal example

```json
{
  "type": "action",
  "priority": "critical",
  "title": "NFR-3.10 response must be rewritten",
  "summary": "The current wording hides an Azure-only deployment constraint.",
  "body": [
    "The complete plain-text explanation remains here."
  ],
  "content": [
    {
      "kind": "metric",
      "value": "3.10",
      "label": "Must gap",
      "detail": "The biggest architectural objection.",
      "tone": "coral"
    },
    {
      "kind": "comparison",
      "title": "Claim versus reality",
      "left": {
        "label": "Current wording",
        "value": "BTP is multi-hyperscaler.",
        "tone": "neutral"
      },
      "right": {
        "label": "Deployment reality",
        "value": "SAP DM in eu20 runs on Azure only.",
        "tone": "coral"
      }
    }
  ],
  "meta": "RFP Builder — 2026-08-11"
}
```

See [examples/dkg-nfr-review-rich.json](examples/dkg-nfr-review-rich.json) for all five block types used with realistic content. The authoritative validation rules live in [src/schema/briefing.schema.json](src/schema/briefing.schema.json).

## Glossary links

The renderer automatically recognises selected terms such as SAP DM, BTP, CPI, SCIM, RBAC, ISA-95, eu20, and multi-AZ. It presents them as dotted links with a plain-language explanation and an optional authoritative source.

Keep this glossary renderer-owned. Producers should send normal text, not HTML links or tooltips.

## Security and deletion

Rich blocks are briefing content. They must be validated, sanitised, size-limited, excluded from logs, and deleted during the same cascading purge as `title`, `summary`, and `body`.
