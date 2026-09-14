# Development roadmap

## 0.1 — Foundation

Implemented: local endpoint setup, administrator sign-in, managed projects, chat-only/trusted-tool modes, SDK worker lifecycle, streaming, persisted history, and downloads. Validate against a real llama.cpp build/model before internal trial use.

## Next — Complete the local workflow

1. **llama.cpp acceptance matrix:** record server version, model/quantization, template, context per slot, tool calls, stop behavior, long-history compaction, and concurrency. Add compatibility fixtures without hard-coding model names.
2. **MCP and skills:** choose one maintained MCP integration or narrow adapter; support selected transports, secret references, connectivity tests, explicit trust, project scoping, and cleanup. Install trusted skills only after displaying what code/dependencies will run. Bridge extension dialogs and cancel unsupported interactions. Do not silently auto-approve.
3. **Knowledge and documents:** bounded uploads, read-only wiki browser then editing with conflict detection, file-type policy, tested Python virtual environment for document skills, atomic artifact publication, and richer tool-call presentation.
4. **Packaging and diagnostics:** repeatable Ubuntu installer/uninstaller, dependency checks, sanitized diagnostics, admin password/token rotation, backup/restore commands, UI smoke tests and signed versioned releases. Avoid unattended self-updates.

## Before organizational multi-user deployment

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
