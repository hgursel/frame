# Knowledge Library

Frame includes eight optional, locally stored packs (37 focused sections in their current versions):

| Pack | Version | Sections |
| --- | --- | --- |
| California HR Essentials | 1.1.0 | 12 sections: original HR essentials plus Job Descriptions & Offer Letters, Pay Transparency & Equal Pay, and Background Checks & Fair Chance Hiring |
| Business Contract Review | 1.1.0 | 6 sections: original contract workflows plus Statements of Work & Change Orders |
| Workplace Investigations | 1.0.0 | 3 sections: complaint intake/plan, evidence timeline/interviews, and human-reviewed investigation reports |
| Performance Reviews & Improvement Plans | 1.0.0 | 2 sections: evidence-based reviews and measurable improvement plans/follow-up |
| Commercial Leases | 1.0.0 | 3 sections: premises/lease review, rent/operating costs, and options/repairs/exit |
| Cybersecurity Essentials | 1.0.0 | 3 sections: CSF 2.0 gap review, assessment questions, and an original risk register |
| IT Security Operations | 1.0.0 | 4 sections: account security, logging/detection, vulnerability triage, and incident preparation |
| Responsible AI at Work | 1.0.0 | 4 sections: AI RMF orientation, an original AI-use assessment, human oversight, and evaluation/monitoring |

These are **Frame-authored reference briefs, templates, and review workflows**, not official legal text, licensed legal forms, a complete legal database, or legal advice. Source links point to agency publications; their full documents are not bundled. The contract pack contains original analysis procedures, not jurisdiction-specific legal rules. Use the actual project agreement as evidence of contractual terms.

## Security and AI packs

These three packs are optional additions; existing project attachments and published pack versions stay unchanged. Install and attach only the topics useful to each project. They provide concise paraphrases and original Frame worksheets with publisher links, not full NIST/CISA manuals, an audit service, or a live threat feed.

| Pack | Try asking |
| --- | --- |
| Cybersecurity Essentials | “Compare our security procedures with this framework and identify gaps.” |
| IT Security Operations | “Create an incident-response checklist for our IT team.” |
| Responsible AI at Work | “Review our proposed internal AI application for operational risks.” |

**Cybersecurity Essentials** uses [NIST CSF 2.0](https://nvlpubs.nist.gov/nistpubs/CSWP/NIST.CSWP.29.pdf) and its [Small Business Quick-Start Guide](https://www.nist.gov/publications/nist-cybersecurity-framework-20-small-business-quick-start-guide). Its assessment questions and blank risk register are original Frame material, not official NIST forms or a certification score.

**IT Security Operations** links selected CISA resources for MFA, logging, KEV prioritization, and incident preparation. The joint event-logging guide is linked at [co-publisher ASD ACSC](https://www.cyber.gov.au/business-government/detecting-responding-to-threats/event-logging/best-practices-for-event-logging-and-threat-detection). Direct CISA page retrieval returned access errors during source review; brief claims were checked against official indexed summaries, and the logging guide was read at the co-publisher. This pack supplies no live CVE data, fixed patch deadlines, or general incident-reporting deadlines. Federal procedures must be adapted to the organization; a reference never authorizes operational changes.

**Responsible AI at Work** covers [NIST AI RMF 1.0](https://nvlpubs.nist.gov/nistpubs/ai/NIST.AI.100-1.pdf) and selected [Playbook](https://airc.nist.gov/airmf-resources/playbook/) topics: context and oversight (MAP 1, 3.5), ownership (GOVERN 1.6, 2.1, 3.2), measurement (MEASURE 1.1–1.2), and deployment/monitoring (MANAGE 1.1, 4.1). NIST's site notes that AI RMF 1.0 is being updated; this snapshot does not claim to cover a future revision. The AI-use assessment and local-model test plan are original Frame workflows. Local hosting alone does not establish that an application is safe or fit for purpose.

## Upgrading the first two packs

Projects using California HR Essentials or Business Contract Review **1.0.0** keep that version. Install **1.1.0** in Settings, then select **Use this version** under the project’s Library references. Installing alone does not upgrade a project. Old content is preserved byte-for-byte and its citations continue to resolve. A fresh catalog shows only the latest bundled version; previously installed versions remain visible for review or rollback.

Investigation, performance, and commercial-lease packs are separate choices. Investigation and performance material supports human-led documentation and review; it does not automatically determine credibility, guilt, applicant suitability, ratings, discipline, or termination. Commercial-lease and SOW material is an original review workflow, not a legal rulebook: cite actual agreements and verify jurisdiction-specific questions separately.

## Start using a pack

1. In **Settings → Knowledge Library**, explore the sections and select **Install pack**.
2. Open **Project settings → Library references** and select **Attach to project**.
3. Upload the relevant handbook, agreement, amendments, or policies through project Knowledge or the chat attachment menu.
4. Ask normally in chat: “Review our California paid sick leave policy” or “Compare this agreement and amendment; cite each changed obligation.”

Packs do not enable host tools, SQL access, charts, or reports. Those remain separate project choices. No model calls or downloads are needed to install a bundled pack.

Project Knowledge shows attached library references apart from uploaded documents and authored pages. **Detach** changes retrieval for new turns; it does not delete project documents, saved chats, or historical citations. A project can attach up to eight packs, with one version of each pack at a time.

## Retrieval and citations

The existing ranked knowledge search includes attached pack sections. At most three relevant reference excerpts are supplied automatically, within the existing context-dependent byte budget (maximum 12,000 bytes). The model can use `search_knowledge` and bounded `read_knowledge` calls for further detail; entire packs are not automatically placed in the model prompt. At very small context settings an excerpt may not fit; search/read remain available.

Each section includes a description, tags, applicability, content kind, source-check date, legal effective date where known, and publisher/section references. A null effective date means it varies or needs verification, not that the download/review date is the effective date. Publisher sources remain HTTPS links; opening them leaves Frame and requires connectivity.

The activity row shows the library references supplied for the latest turn. Model-rendered local citations open a read-only section viewer with its version and publisher links. Search/read results include the same citation metadata. Frame cannot force the model to cite correctly; inspect important findings against the source and actual agreement. Only excerpts and documents supplied or read during that turn reach the model.

Each pack records its source-check date: **September 26, 2026** for the legal/HR packs and **September 29, 2026** for the security/AI packs. They are not continuously updated. Requirements may vary by employer size, entity type, employee location, industry, collective bargaining agreement, facts, and date. Local ordinances and specialized industries are not fully covered. Current law, training requirements, or filing forms may require checking the publisher before acting. Do not use a reference pack as evidence that a business is compliant.

## Versions and offline transfer

Installing a pack stores an immutable JSON snapshot in SQLite. An existing ID/version cannot be replaced with different content. Projects pin a version: installing a newer version does **not** update any project automatically. In Project settings, explicitly select **Use this version** to change it. Concurrent edits are rejected rather than overwriting another selection. Active project tasks must finish first.

Historical installed versions are retained so earlier citation URLs continue to resolve. There is no global pack deletion UI in this first release. Deleting a project removes only its pack attachments; other projects and the shared library are preserved. A project’s OKF export continues to contain its own documents, not copies of library packs. Export packs separately for transfer.

**Export pack** downloads a JSON file. **Import pack** in Settings installs a validated file without fetching URLs or executing content. Custom packs need their own ID; IDs belonging to the bundled Frame release are reserved and accept only exact bundled content. To install a newer official pack, update Frame first. Imported material is unverified reference data. There is no public catalog service, automatic online updater, web crawler, or network fallback.

The JSON schema is defined in `server/library/service.ts`, with shared types in `shared/library.ts`. It bounds IDs, semantic versions, section count, text size, sources, and HTTPS URLs; duplicate section IDs are rejected. Export a starter pack to see the format. To customize it, choose a new ID/title and accurately describe authorship, rights, sources, and dates. Give changed content a new version.

## Content ownership and memory

Library packs are read-only reference snapshots. They do not become editable OKF pages and do not enter the maintenance page inventory. Maintenance cannot rewrite them. Chat draft proposals cannot target a library section ID. Learned methods stay separate and must not be treated as authoritative contract amounts, employee facts, or law. The worker instructions explicitly distinguish library briefs, publisher references, company policies, agreements, and learned methods, and direct the model to flag conflicts and missing facts.

No paid legal manuals or proprietary standards are included. Starter text is original, with short paraphrased reference summaries and publisher links. A linked source does not imply endorsement. Review redistribution rights before importing third-party full text for wider distribution.

## Validation and limits

Automated checks cover installation and project scoping, immutable/pinned versions across restart, import validation, authentication/origin checks, active-run guards, read-only tools, project deletion, bounded retrieval, and representative topic matching. Browser coverage exercises installation, attachments, source viewing, local citations, mobile layout, and delivery of relevant content through the actual Pi SDK to a controlled local model endpoint.

These checks do **not** measure legal or security correctness, organizational compliance, or real llama.cpp/Qwen answer quality. Before relying on the packs, test representative questions against known answers, verify amendment precedence and exceptions, and have HR or counsel review important decisions. Contract registers are extracted information, not scheduled reminders or legal approval.
