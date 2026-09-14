# Development roadmap

## 0.1 — Foundation

Implemented: local endpoint setup, administrator sign-in, managed projects, chat-only/trusted-tool modes, SDK worker lifecycle, streaming, persisted history, and downloads. Validate against a real llama.cpp build/model before internal trial use.

## 0.2 — Knowledge and document workflow (implemented)

- Streamed reasoning with expandable text and a collapsed activity animation.
- Project document uploads, preserved sources, bounded PDF/DOCX extraction, Markdown notes and revision history.
- OKF 0.2 concept files, provenance, cross-links, index/log, and bundle export.
- Conversation knowledge search/read, model draft proposals, and reviewed saves/updates from useful answers and tool results.
- Explicit Python environment installation, tested PDF/DOCX generation, and completed-artifact publication.

## 0.3 — Chat interface and context management (implemented)

- Refreshed chat layout, light/dark appearance, collapsible navigation, conversation search, copying, and scroll-aware streaming.
- Context window/usage meter with reported-versus-estimated counts, checkpoint inspection, and observed generation throughput.
- Configurable automatic compaction with scaled local-model budgets, manual/interruptible compaction, and reversible older read-only tool-result pruning.
- Local mock SDK and browser coverage. Real-model long-context quality and llama.cpp timing validation remain acceptance work; see [context research](CONTEXT.md).

## 0.4 — Navigation and content refinements (implemented)

- Clean Frame wordmark, stronger sidebar headings, and a conversation creation button beside the section title.
- Shared chat/knowledge Markdown renderer with GFM tables, task lists, copyable code, and local Mermaid diagrams with expansion and source fallback.
- Chat composer attachment menu for project knowledge or computer uploads, with removable selections.
- Confirmed knowledge file/page removal with revision and activity guards, catalog cleanup, and rollback on catalog-update failure.
- Model, Context, Instructions, and Documents settings tabs with retained drafts and keyboard navigation.
- CI validates TypeScript, 17 API/SDK/Python tests, production build, and desktop/mobile browser workflows. Browser screenshots are retained as workflow artifacts.

## Next — Complete V1

1. **llama.cpp acceptance matrix:** record server version, model/quantization, template, context per slot, tool calls, stop behavior, long-history compaction, and concurrency. Add compatibility fixtures without hard-coding model names.
2. **MCP and skills:** choose one maintained MCP integration or narrow adapter; support selected transports, secret references, connectivity tests, explicit trust, project scoping, and cleanup. Install trusted skills only after displaying what code/dependencies will run. Bridge extension dialogs and cancel unsupported interactions. Do not silently auto-approve.
3. **Knowledge refinements:** full OKF bundle import/round-trip editing, richer source metadata controls, wiki linting for contradictions/broken links, and optional ingestion automation. V1 already supports user-requested synthesis with reviewed proposals; no unattended wiki rewrite engine.
4. **Packaging and diagnostics:** repeatable Ubuntu installer/uninstaller, dependency checks, sanitized diagnostics, admin password/token rotation, backup/restore commands, and signed versioned releases. Avoid unattended self-updates.

## V2 — Multi-user organizational deployment

Deferred from V1 at the owner's request. V1 retains one administrator.

- Authentication strategy (e.g. organization OIDC), user/session lifecycle, per-project authorization on every endpoint/event/file.
- OS-level worker isolation, credential and egress boundaries, resource limits; decide how shared files and simultaneous writes behave.
- Audit records, retention, deletion/restore policy, key management, dependency review, and security assessment.

## Acceptance checklist for the first real machine

- [ ] Fresh Node 24 installation builds and starts without a separately installed Pi CLI.
- [ ] Only the configured llama.cpp endpoint receives model traffic; no cloud catalog/telemetry requests.
- [ ] Chat streams with the chosen model and resumes after service restart.
- [ ] Read/write/bash works only after opting into trusted tools; generated files download safely.
- [ ] Stop actually ends generation and relevant subprocesses; repeated Send/reconnect never replays a task.
- [ ] Bad token, wrong model ID, full context, unavailable server, and malformed tool arguments fail visibly.
- [ ] Two projects run without sharing conversation history; same-project concurrent tasks are rejected.
- [ ] Backup/restore recovers settings, metadata, sessions, and project outputs together.
