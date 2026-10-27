# Development roadmap

## Scheduled tasks (implemented)

Chat-created review cards with explicit activation; private Scheduled panel and run outputs; admin timezone; one-time/daily/weekday/weekly/monthly timing; latest missed-run catch-up; nonoverlapping execution; fresh context and enabled skills/file/Python tools from the originating project; server-enforced read-only SQL plugin tools and fixed email recipients; automatic email after successful completion; failure notifications; restart-safe run claims. Edits and timezone changes require reactivation. Local fixture coverage does not replace real-model and production SMTP acceptance. See [Scheduled](SCHEDULED.md).

## 0.1 — Foundation

Implemented: local endpoint setup, administrator sign-in, managed projects, chat-only/trusted-tool modes, SDK worker lifecycle, streaming, persisted history, and downloads. Validate against a real model server/model before internal trial use.

## 0.2 — Knowledge and document workflow (implemented)

- Chronological activity rows between intermediate replies, with only the current row animated. Streamed reasoning, tool details, and SQL results expand in bounded inline panels; completed rows show their own step counts. One FRAME heading per user turn; replies, charts, files, approvals, and errors stay visible. Waiting, stopping, and reconnecting status lives in the current row rather than above the composer.
- Project document uploads, preserved sources, bounded PDF/DOCX extraction, Markdown notes and revision history.
- OKF 0.2 concept files, provenance, cross-links, index/log, and bundle import/export with preview, duplicate skipping, preserved revisions, and rollback.
- Internal SMTP email with approved domains, editable human-confirmed drafts, generated-output attachments, persistent send status and duplicate protection; admin-managed display names and email profiles.
- Wide project/admin settings with category navigation, collapsed library references, sidebar username, built-in File/Python tools, opt-in Excel for new projects, admin-only skills, and a private Arena project for each new account.
- Conversation knowledge search/read, model draft proposals, and reviewed saves/updates from useful answers and tool results.
- Explicit Python environment installation, tested PDF/DOCX generation, and completed-artifact publication.

## 0.3 — Chat interface and context management (implemented)

- Refreshed chat layout, Light/Dark/System appearance saved per browser, collapsible navigation, conversation search, copying, and scroll-aware streaming.
- Context window/usage meter with reported-versus-estimated counts, checkpoint inspection, and observed generation throughput.
- Configurable automatic compaction with scaled local-model budgets, manual/interruptible compaction, and reversible older read-only tool-result pruning.
- Local mock SDK and browser coverage. Real-model long-context quality and model-server timing validation remain acceptance work; see [context research](CONTEXT.md).

## 0.4 — Navigation and content refinements (implemented)

- Clean Frame wordmark, stronger sidebar headings, and a conversation creation button beside the section title.
- Shared chat/knowledge Markdown renderer with GFM tables, task lists, copyable code, and local Mermaid diagrams with expansion and source fallback.
- Chat composer attachment menu for project knowledge or computer uploads, with removable selections.
- Confirmed knowledge file/page removal with revision and activity guards, catalog cleanup, and rollback on catalog-update failure.
- Separate user and admin settings; Context within Model and Document tools within Skills, with retained admin form drafts and keyboard tab navigation.
- CI validates TypeScript, 17 API/SDK/Python tests, production build, and desktop/mobile browser workflows. Browser screenshots are retained as workflow artifacts.

## 0.4.1 — Chat lifecycle fixes

- Monotonic snapshot ordering prevents delayed HTTP responses from replacing newer stream state.
- Polling reconciles disconnected or stalled active SSE streams without replaying prompts.
- Phase changes publish immediately; trailing updates flush after event bursts. Tool preparation and waiting no longer masquerade as reasoning.
- Run-scoped, idempotent Stop aborts model transport, prevents post-stop continuation, and has fixed icon alignment.
- Conversation/project changes reject stale results; successful sends preserve newly typed drafts.
- Knowledge selection/history ignore late responses.
- Regression tests cover follow-up tool calls, stream outage recovery, model connection cancellation, automatic preflight cancellation, and stop geometry.

## 0.5 — Built-in MSSQL plugin (implemented)

- One system connection profile with separate read/write SQL logins, database allowlist, default-off mutation/schema/procedure gates, and project toggles.
- Parsed supported reads; exact, single-use review for changes and administrator-allowlisted procedures; cancellation without automatic replay.
- Paged schema initialization, searchable per-object Markdown knowledge, refresh/cancel, atomic cache publication, obsolete markers, and OKF export outside the normal document quota.
- Bounded result tables and CSV artifacts. Browser coverage runs through the real Pi SDK with a controlled SQL driver; live SQL Server and local-model acceptance remain to be completed. See [MSSQL](MSSQL.md).
- Ranked schema search: FTS5 with BM25 over object names, split identifier parts, column names, and descriptions, adjusted by a mechanical importance score, with accent folding and an unranked fallback for caches built before the index.
- Generated database knowledge: a local model writes per-object notes, subject areas, a glossary, recipes from queries that already ran, and aliases closing recorded search gaps. Output is validated against real column names, stored apart from catalog facts, and labelled with its model and review state. Row sampling was removed by the structural-only knowledge update below. Note quality against a real schema and model is unverified.

## 0.5.1 — SQL knowledge improvements (implemented)

- Compact catalog pages, incoming references, ranked SQLite FTS search, identifier splitting and Turkish accent folding.
- Optional local-model object notes, subject areas, glossary, completed-query recipes (now parameterized, without lookup sampling).
- Sequential per-object generation with immediate checkpoints, one-term glossary requests, compact subject-area summaries, JSON/non-thinking requests, and bounded context/output recovery.
- Generation cancellation and bounded requests; review decisions with version checks, rejected alias removal, connection-aware invalidation, and atomic schema publication.
- Regression tests cover refresh failure, unavailable FTS, multi-database grouping, generation transport limits, and browser review/reject behavior. Live-model interpretation quality still needs acceptance testing.

## Workspace refinements (implemented)

- Display-name initials avatar in the sidebar; larger login wordmark without the welcome/sign-in introduction; Incognito grouped beside Files on the right. Scheduled task prompts render Markdown inside a bounded, keyboard-scrollable region.

- Project list capped at four visible rows with independent scrolling; account menu for Scheduled Tasks, Settings, Admin, and Sign Out. Frame logo opens a blank chat in the current project without adding an empty history entry.
- Sidebar project/conversation action menus with confirmed deletion and scoped file/database cleanup; conversation deletion preserves shared knowledge.
- Centered empty-chat composer, “Your knowledge. Your infrastructure.”, context controls beneath the composer, and friendly tool labels.
- Automatic SQL CSV exports appear only through their query result’s download link; conversation file cards show other deliverables, including ordinary CSV reports. Existing exports are retained and filtered by persisted SQL operation IDs.
- 60-minute task deadline (paused while awaiting structured question answers); completed SQL knowledge jobs show completion instead of their last processing phase.
- Deferred: adjustable per-project task limits and engine-specific prompt-processing percentages.

## Charts (implemented)

- Default-off system setting and per-project enablement; model instructed to chart only on explicit user request.
- Bar, line, pie/donut, and scatter charts rendered inline from saved typed SQL results, CSV files, and Markdown tables in project knowledge, chat, or generated files, independent of shortened previews.
- Local filtering, grouping, sums/averages/minima/maxima/counts, and sorting; source references avoid copying tables through model tool arguments.
- Single-title chart cards, hover/focus values, legend toggles, data tables, and an expand icon; expanded views close on backdrop click, Escape, or × and contain PNG/CSV downloads. Persistent snapshots and scoped deletion.
- Bounded datasets and chart points, visible partial-source notices, NULL gaps, and validation without arbitrary model code or cloud dependencies.
- API and real-SDK/mock-model browser coverage; local-model acceptance remains separate. See [Charts](CHARTS.md).

## Reports (implemented)

- Default-off system setting and project enablement; organization branding/layout/instructions with per-field project overrides and independent logo inheritance.
- Executive, analytical, and technical PDF layouts with larger centered logos, smaller Title Case cover titles, three brand colors, page numbers, and repeating table headers.
- Cover → editable confidentiality page → report sequence; notice text inherits organization defaults or project overrides. Generic Report label removed with compatibility for saved settings.
- Scoped references to conversation charts/datasets, uploaded CSV/Markdown, chat tables, and generated files; static vector charts and wide-table pagination.
- Reports is the only built-in PDF generator; the former Markdown-to-PDF writer is removed and legacy calls fail with guidance. `create_document` remains DOCX-only.
- Direct local PDF generation and revisions as separate downloads; bounded rendering and Stop cancellation without partial publication. No MSSQL or host tools required.
- Plugin settings navigation with retained drafts and a saved-design sample download. API, PDF, and browser coverage through the real SDK with a local mock model. See [Reports](REPORTS.md).

## Knowledge maintenance and incognito (implemented)

- Built-in Admin → Knowledge scheduling with timezone, project selection, active-processing budget, manual run/stop, persisted checkpoints, and chat preemption.
- Review inbox with selectable publication policy; drafts stay out of retrieval, human verification is explicit, and verified or manually rewritten pages are protected from automatic content updates.
- Health findings for duplicate content, missing metadata, broken page links, removed/changed evidence, and changed SQL schema generations. No claim of semantic contradiction detection.
- Sequential bounded conversation learning and metadata enrichment; SQL conversations contribute only parameterized SELECT templates. No result rows, sampled lookup values, chart/CSV data, parameter values, or SQL-derived assistant prose enters automatic learning.
- Editable OKF discovery metadata, weighted title/tag/alias/description retrieval, and a small relevant-page shortlist for each chat prompt.
- Incognito transcript/compaction state stays in memory, is excluded from history and learning, and ends on leave/reload/end or heartbeat expiry. Temporary plugin files and records are cleaned up; host tools and permanent uploads are disabled in incognito.
- Tests cover scheduling, interruption/restart, publishing policies, SQL value exclusion, retrieval, memory-only SDK follow-ups, and browser settings/review/incognito workflows. Real-model knowledge quality remains an acceptance step.

## Skills (implemented)

- Settings for absolute Agent Skills folders scanned with the Pi SDK loader; warnings for invalid, duplicate, or unreadable skills. Rescanned each turn, with no execution or installation on save.
- Per-project skill selection. Skills are offered only with trusted agent tools and never in incognito chats; `disable-model-invocation` skills are hidden from the model but available through `/skill:name`.
- Composer `/` picker inserting `/skill:name`; Pi expands the full `SKILL.md` for that turn. History and knowledge learning show the short command instead of the skill body; preflight counts the expansion.
- Skills load their own credentials. Frame does not read, inject, or redact `.env` values, and trusted agent tools remain unsandboxed.
- Replaces Private Tools: its code is removed and stored registrations are deleted on startup; external scripts are untouched.
- API, real-SDK/mock-model, and browser tests. Skill selection and adherence with a real local model remain acceptance work. See [Skills](SKILLS.md).

## Private Tools (removed)

The registered-script plugin with per-operation JSON inputs, approvals, and `.env` redaction was removed in favor of Skills. Stored registrations are deleted on startup; external scripts and credentials are untouched.

## Frame for Excel (implemented pilot; Windows acceptance pending)

- Compact composer with one send/stop control, expandable selection details, and conversation-only uploads/knowledge attachments using Frame's existing file and image handling. Screenshot paste, context usage, observed throughput, and manual compaction reuse the shared UI/backend. Retrieval behavior is unchanged.
- Proposal controls stay with their original response. Applied/replaced proposals collapse to a short history entry; accepted follow-ups supersede pending proposals while failed submissions leave them reviewable. Applying/uncertain batches retain the existing recovery controls. Request retries cannot replace a newer proposal.

- Automatic selection input with blank-sheet support; no Capture button. Selection snapshots remain historical conversation context across cell/sheet changes. A pane-bound read-only bridge provides on-demand reads of any sheet in the current workbook. Existing-sheet proposals cover partial values/formulas, formatting, table/chart creation and updates, sorting/filtering, and separate whole-row/column insertion/deletion batches with explicit destinations and Apply.

- Larger configurable captures (default 100,000 cells / 1,024 columns), compact model context, on-demand scoped section reads, visible supplied ranges, and bounded Excel read/write batches. Stored proposal summaries avoid transferring or parsing large validation snapshots during polling. Grouped activity reuses Frame's web renderer; the composer and review-panel actions remain visible while their content scrolls.

- Windows Microsoft 365 task pane, local XML manifest download in Settings, and a self-signed HTTPS/hosts/shared-folder installation guide. No tenant deployment or Microsoft Copilot dependency.
- Selection-scoped context, project knowledge, read-only SQL, formulas, selection replacement, and new worksheets with tables/native charts. Literal data uses typed cells; supported formulas are explicit.
- Preview before Apply, pane-bound sessions, one-time claims, stale-cell/protection checks, and uncertain-outcome recovery without replay. Workbook history stays separate from automatic project learning.
- Automated schema/API/SDK and simulated Office-host checks do not establish real Excel, certificate trust, coauthoring, or local-model correctness. Complete the [Windows acceptance checklist](FRAME_FOR_EXCEL.md) before relying on the pilot.
- Deferred: macros, arbitrary functions/code, full native Undo/transactional rollback, Mac/Web Excel, and organization-wide distribution. Real Windows acceptance is still required for native table, chart, and structural-edit behavior.

## Next — Complete V1

1. **OpenAI-compatible engine acceptance matrix:** record server version, model/quantization, template, context per request, tool calls, stop behavior, long-history compaction, and concurrency. Add compatibility fixtures without hard-coding model names.
2. **MCP:** deferred at the owner's request in favor of Skills. If revisited, choose one maintained integration or narrow adapter with selected transports, secret references, connectivity tests, explicit trust, project scoping, and cleanup. Do not silently auto-approve. Online skill installation, if added, must display what code and dependencies will run first.
3. **Knowledge refinements:** broader external OKF compatibility, semantic contradiction review, richer dependency tracking, and larger knowledge quotas. Scheduled structural health checks and controlled conversation learning are implemented; no autonomous factual verification.
4. **Packaging and diagnostics:** repeatable Ubuntu installer/uninstaller, dependency checks, sanitized diagnostics, admin password/token rotation, backup/restore commands, and signed versioned releases. Avoid unattended self-updates.

## Personal workspaces and concurrent execution (implemented)

- Local usernames/passwords, administrator-created accounts, temporary password replacement, resets, disabling, and session revocation.
- Owner-only personal projects, knowledge, chats, downloads, charts, and Excel sessions, including ownership enforcement for administrator accounts.
- Existing password/content migrates to the initial admin account. Existing sessions are revoked.
- Admin-managed skills/connections; owners enable capabilities per project. One read-only SQL login for everyone.
- Concurrent conversations with FIFO model-request capacity, one response per conversation, and independent cancellation. Logout does not stop normal tasks.
- Bubblewrap isolation for arbitrary file/shell tools with unrestricted networking; fail closed without supported namespaces.
- OpenAI-compatible endpoint/model settings with optional authentication, context/output budgets, concurrency, image and tool capability switches.
- Automated cross-owner API, migration, streaming/queue and cancellation tests. Successful sandbox execution, real backend performance, SQL login privileges, and real Excel remain deployment acceptance checks.
- Deferred: sharing/collaboration, SSO, audit/retention policies, per-user quotas, and network allowlists. Nightly maintenance remains present and is not redesigned.

## Acceptance checklist for the first real machine

- [ ] Fresh Node 24 installation builds and starts without a separately installed Pi CLI.
- [ ] Only the configured model endpoint receives model traffic; no cloud catalog/telemetry requests.
- [ ] Chat streams with the chosen model and resumes after service restart.
- [ ] Read/write/bash works only after opting into trusted tools; generated files download safely.
- [ ] Stop actually ends generation and relevant subprocesses; repeated Send/reconnect never replays a task.
- [ ] Bad token, wrong model ID, full context, unavailable server, and malformed tool arguments fail visibly.
- [ ] Two projects run without sharing conversation history; same-project concurrent tasks queue/run independently.
- [ ] Backup/restore recovers settings, metadata, sessions, and project outputs together.

## Curated project memory (implemented)

- Up to 30 active methods per project in SQLite; three distinct completed chats or explicit confirmation qualify a task. No new Markdown files from conversation learning.
- Shared project/SQL recall supplies bounded method content and cached schema references before generation; unchanged dependency hashes survive schema refreshes.
- Overview, Methods, Review, and Schedule sections in Knowledge settings, with publication controls and recall counts.
- One-time permanent cleanup of legacy automatic notes and SQL interpretations; preserve schema facts and authored/source documents.
- Production Qwen/llama.cpp retrieval quality, business correctness, and latency remain deployment acceptance checks, not claims from mock tests.

## Shared Knowledge Library (implemented)

- In-app **Browse packs** in app/project settings: offline metadata search and collection filters, section previews, explicit verified installation or JSON download from the fixed public Frame repository. No background network requests, project-data transmission, automatic attachments, or version replacement. Download failures, authentication/origin guards, integrity checks, and desktop/mobile flows have automated coverage.
- Compact searchable app/project catalog, status filters, expandable section details, project-level import, and direct install-and-attach for bundled references.
- Optional GitHub downloads: 12 detailed California/guild guides (27 sections), 48 official-source URLs, deterministic versioned JSON files and checksums. Both employer and member-service roles are covered; bargaining agreements are excluded. Existing eight bundled briefs and pinned project versions are preserved. Legal/attorney review remains an acceptance task.
- Federal/industry expansion: seven federal core guides and nine industry guides add 34 practical sections. The catalog now groups 36 downloads (28 detailed guides, 61 sections, 117 official-source URLs, plus eight bundled briefs). All previously published JSON files remain unchanged; new content uses federal jurisdiction metadata and explicit state/local limitations. All new sections have scoped search/read coverage; no live-model or legal-review claim is made.

- Eight optional packs with 37 current sections: expanded California HR Essentials and Business Contract Review (v1.1), plus Workplace Investigations, Performance Reviews & Improvement Plans, and Commercial Leases. Published v1.0 content remains unchanged; project upgrades are explicit. Cybersecurity Essentials, IT Security Operations, and Responsible AI at Work add 11 source-linked sections and original risk-register/AI-use templates. Original workflows, source links, and applicability metadata; no full manuals or live threat feeds.
- Global install/export/validated JSON import and per-project version selection; immutable installed snapshots, explicit upgrades, and historical citation preservation.
- Existing bounded retrieval/search/read tools include attached sections; read-only local citation viewer and latest-turn activity references. Project files and maintenance remain separate.
- Automated API/retrieval/browser checks use a controlled model transport. Legal content is not a comprehensive or continuously updated source; real-model answer quality and professional review remain acceptance work. See [Knowledge Library](KNOWLEDGE_LIBRARY.md).
- Deferred: online catalog/update service, automatic legal change monitoring, pack authoring UI, and global pack removal.

### Conversation workspace

- Structured questions with selectable options, custom answers, cancellation, and refresh recovery.
- Outputs and Sources in a collapsible right panel, with a drawer on smaller screens.
- Chat uploads are conversation-scoped, sent with the next message, and promoted to project knowledge only by explicit action. Incognito uploads are removed when the chat ends. Chats with uploaded documents are excluded from automatic learning.
