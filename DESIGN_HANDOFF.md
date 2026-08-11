# Briefing Hub — design handoff

## Core experience

The prototype is structured around one short loop:

`Inbox → Focus card → Explicit action (when needed) → Next card → Completion checkpoint`

The inbox combines cards from multiple logical briefings without duplicating their content. Focus mode preserves the source and card order while reducing the visual field to one decision. Expanded detail is a reversible overlay, so the user never loses their place.

## Architecture-to-UI mapping

| Architecture requirement | Mockup treatment |
| --- | --- |
| Briefing inbox | Priority-first hero and three compact incoming groups |
| Combined unread session | “Morning briefing” stack across Mail, Research, and Demo sources |
| Ordered cards | Fixed six-card sequence with explicit progress |
| Swipe left / right | Reviewed / needs-action gestures plus visible button alternatives |
| Expanded card | Full-height detail sheet with body, recommendation, and source reference |
| Explicit actions | Four-choice action sheet after triage |
| Resume position | Progress and current card are held while navigating overlays |
| Reviewed vs completed | Separate completion screen after the last card |
| Cascading purge | “Mark done & delete” copy spells out what disappears and what remains |
| Minimal tombstone | Success view retains only counts and content-free workflow status |
| History | Active/reviewed items are distinguished from content-deleted status records |
| Agent/source overview | Source cards show recency, unread count, weekly volume, and health |
| Stage 2 boundary | A visibly labelled future work-queue preview, not a working V1 feature |
| Privacy/security | Persistent protected-connection state, no-index metadata, deletion explanation |

## Visual language

- **Canvas:** warm off-white to reduce glare and avoid generic dashboard grey.
- **Cobalt:** navigation, decisive actions, and focus progress.
- **Lime:** attention callouts and safe forward motion.
- **Coral:** warnings and follow-up signals.
- **Yellow:** privacy and irreversible completion checkpoints.
- **Shape:** soft containers paired with crisp dark borders and offset shadows; friendly but not childish.
- **Typography:** large, compressed headlines for instant hierarchy; small operational metadata stays secondary.

## Interaction requirements for production

1. All swipe behavior must retain visible button alternatives and keyboard support.
2. The final swipe must never call the completion endpoint.
3. “Mark done & delete” must wait for a successful purge response before showing success.
4. Back navigation and refresh must not resurrect purged content.
5. Motion must respect `prefers-reduced-motion`.

## Not production behavior

This mockup does not implement authentication, API calls, durable state, attachment access, offline caching, file ingestion, or the deletion transaction. Those remain server-side engineering work governed by the v3 architecture document.
