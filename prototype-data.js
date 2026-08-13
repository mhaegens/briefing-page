window.BRIEFING_DEMO = {
  title: "DKG NFR Review — 2026-08-11",
  source: { name: "RFP Builder", mark: "R", tone: "coral" },
  cards: [
    {
      source: "RFP Builder", mark: "R", tone: "coral", type: "action", priority: "critical",
      title: "NFR-3.10 response must be rewritten",
      summary: "Aiden implies BTP multi-hyperscaler support removes cloud lock-in, but SAP DM in eu20 runs on Azure only.",
      why: "Rewrite NFR-3.10 response",
      body: [
        "The requirement asks for multi-cloud support or a transparent risk description. BTP is offered across multiple hyperscalers, but SAP DM in eu20 runs exclusively on Azure.",
        "DKG cannot choose or switch to AWS or GCP. Data export, BCP commitments, and multi-AZ redundancy mitigate—but do not remove—the gap."
      ],
      content: [
        { kind: "metric", value: "3.10", label: "Must gap", detail: "The single biggest architectural objection.", tone: "coral" },
        { kind: "comparison", title: "Claim versus deployment reality", left: { label: "Current wording", value: "BTP is multi-hyperscaler, so lock-in is removed.", tone: "neutral" }, right: { label: "What DKG gets", value: "SAP DM in eu20 runs exclusively on Azure.", tone: "coral" } },
        { kind: "bullets", title: "What the rewrite must say", items: [
          { text: "SAP DM runs on Microsoft Azure in eu20.", tone: "coral" },
          { text: "DKG cannot move this workload to AWS or GCP.", tone: "coral" },
          { text: "Data export and multi-AZ resilience mitigate the gap.", tone: "lime" }
        ]},
        { kind: "bar_chart", title: "Mitigation coverage", caption: "Documented—not a portability score", items: [
          { label: "Cloud portability", value: 0, max: 1, display: "Gap", tone: "coral" },
          { label: "Contractual data export", value: 1, max: 1, display: "Documented", tone: "lime" },
          { label: "Regional resilience", value: 1, max: 1, display: "Multi-AZ", tone: "blue" }
        ]},
        { kind: "callout", label: "Recommended wording", title: "Be explicit about Azure-only hosting", text: "SAP DM is hosted on Microsoft Azure in eu20. Multi-cloud portability is not available for this deployment.", tone: "yellow" }
      ]
    },
    {
      source: "RFP Builder", mark: "R", tone: "coral", type: "warning", priority: "high",
      title: "NFR-4.04 has a factual error on S/4HANA integration",
      summary: "No middleware required is wrong. SAP CPI is the mandatory integration layer between SAP DM and S/4HANA.",
      body: ["Standard integration is delivered via pre-built CPI iFlows. CPI configuration is part of implementation scope; custom development is not required for standard flows."],
      content: [
        { kind: "metric", value: "4.04", label: "Factual error", detail: "This contradicts NFR-4.02 in the same document.", tone: "coral" },
        { kind: "comparison", title: "Fix the contradiction", left: { label: "Incorrect", value: "No middleware required", tone: "coral" }, right: { label: "Correct", value: "SAP CPI is mandatory", tone: "lime" } },
        { kind: "bullets", title: "Standard scope", items: [
          { text: "Pre-built CPI iFlows cover standard S/4HANA exchanges.", tone: "blue" },
          { text: "CPI configuration belongs in implementation scope.", tone: "yellow" },
          { text: "No custom development is needed for standard flows.", tone: "lime" }
        ]}
      ]
    },
    {
      source: "RFP Builder", mark: "R", tone: "coral", type: "action", priority: "medium",
      title: "7 items need a col J remark before submission",
      summary: "Seven requirements contain unconfirmed claims or gaps that need a short qualification.",
      why: "Add col J remarks for 7 items",
      body: ["Two security claims need evidence, four data or contract claims need qualification, and one integration response understates custom scope."],
      content: [
        { kind: "metric", value: "07", label: "Remarks needed", detail: "All seven can be resolved without rewriting the full answer.", tone: "yellow" },
        { kind: "bar_chart", title: "Where the remarks sit", caption: "7 items grouped by topic", items: [
          { label: "Security evidence", value: 2, max: 7, display: "2 items", tone: "blue" },
          { label: "Data, roadmap & contract", value: 4, max: 7, display: "4 items", tone: "yellow" },
          { label: "Integration scope", value: 1, max: 7, display: "1 item", tone: "coral" }
        ]},
        { kind: "bullets", title: "The seven exceptions", items: [
          { text: "NFR-1.05 — verify ISO 27017 and 27018.", tone: "yellow" },
          { text: "NFR-1.06 — narrow CIS to Level 1 or provide evidence.", tone: "yellow" },
          { text: "NFR-2.03 — verify the named AI addendum.", tone: "yellow" },
          { text: "NFR-3.01 — qualify roadmap specifics.", tone: "yellow" },
          { text: "NFR-3.04 — correct maintenance window flexibility.", tone: "yellow" },
          { text: "NFR-3.09 — confirm escrow with legal.", tone: "yellow" },
          { text: "NFR-4.06 — disclose custom PPD REST scope.", tone: "coral" }
        ]}
      ]
    },
    {
      source: "RFP Builder", mark: "R", tone: "coral", type: "information", priority: "low",
      title: "Security NFR-1.05 through NFR-1.12",
      summary: "6 of 8 security items are verified clean; only two exceptions need your attention.",
      body: ["NFR-1.05 and NFR-1.06 need verification. Vulnerability monitoring, SSO, RBAC, SCIM, audit logging, and named user handling are supported."],
      content: [
        { kind: "metric", value: "6/8", label: "Verified clean", detail: "Only two security claims need another look.", tone: "lime" },
        { kind: "bar_chart", title: "Security review", caption: "8 requirements", items: [
          { label: "Verified", value: 6, max: 8, display: "6", tone: "lime" },
          { label: "Needs evidence", value: 2, max: 8, display: "2", tone: "coral" }
        ]},
        { kind: "bullets", title: "Only read the exceptions", items: [
          { text: "NFR-1.05 — ISO claims need Trust Center verification.", tone: "coral" },
          { text: "NFR-1.06 — CIS Level 2 lacks evidence.", tone: "coral" }
        ]},
        { kind: "callout", label: "Everything else", title: "Six responses can stay", text: "SSO, RBAC, SCIM, audit logging, named users, and vulnerability monitoring are documented.", tone: "lime" }
      ]
    },
    {
      source: "RFP Builder", mark: "R", tone: "coral", type: "information", priority: "low",
      title: "Portability and reliability NFR-2.01 through NFR-3.10",
      summary: "Ten of fifteen responses are clean. Five require qualification or rewriting.",
      body: ["Four of five data requirements and six of ten reliability requirements are clean. The five exceptions are isolated below."],
      content: [
        { kind: "metric", value: "10/15", label: "Clean responses", detail: "Five exceptions are already isolated for action.", tone: "blue" },
        { kind: "bar_chart", title: "Review coverage", caption: "Clean responses by section", items: [
          { label: "Data portability · NFR-2", value: 4, max: 5, display: "4 of 5", tone: "lime" },
          { label: "Reliability · NFR-3", value: 6, max: 10, display: "6 of 10", tone: "blue" }
        ]},
        { kind: "bullets", title: "Exceptions only", items: [
          { text: "NFR-2.03 — verify the AI addendum.", tone: "yellow" },
          { text: "NFR-3.01 — qualify roadmap items.", tone: "yellow" },
          { text: "NFR-3.04 — correct maintenance wording.", tone: "yellow" },
          { text: "NFR-3.09 — confirm escrow.", tone: "yellow" },
          { text: "NFR-3.10 — rewrite the Azure-only claim.", tone: "coral" }
        ]}
      ]
    },
    {
      source: "RFP Builder", mark: "R", tone: "coral", type: "information", priority: "low",
      title: "Interoperability NFR-4.01 through NFR-4.10",
      summary: "7 of 10 items are clean; one is factually wrong and two need scope qualifications.",
      body: ["NFR-4.04 is wrong, NFR-4.05 is optimistic, and NFR-4.06 understates custom scope. The other seven are supported."],
      content: [
        { kind: "metric", value: "7/10", label: "Verified clean", detail: "The review effort is concentrated in three responses.", tone: "lime" },
        { kind: "bar_chart", title: "Interoperability verdict", caption: "10 requirements", items: [
          { label: "Clean", value: 7, max: 10, display: "7", tone: "lime" },
          { label: "Needs qualification", value: 2, max: 10, display: "2", tone: "yellow" },
          { label: "Factual error", value: 1, max: 10, display: "1", tone: "coral" }
        ]},
        { kind: "bullets", title: "Only read the exceptions", items: [
          { text: "NFR-4.04 — SAP CPI is mandatory.", tone: "coral" },
          { text: "NFR-4.05 — Qlik and Databricks fit is Partial.", tone: "yellow" },
          { text: "NFR-4.06 — Ultimo is custom PPD REST scope.", tone: "yellow" }
        ]},
        { kind: "callout", label: "Seven clean answers", title: "Keep the rest as written", text: "APIs, CPI architecture, delta exchange, metadata, and ISA-95 alignment are supported.", tone: "blue" }
      ]
    }
  ]
};
