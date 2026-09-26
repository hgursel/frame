# Architecture decisions

## Product boundary

One repository, one application installation, one Node service. React/Vite builds static assets; Fastify serves the UI and authenticated APIs. Pi is an embedded SDK dependency, not an external CLI prerequisite. Local llama.cpp runs separately on the organization’s infrastructure.

The first release supports a single administrator. It is intended to establish an honest, testable foundation before claiming organization-wide security or feature completeness.

## Runtime ownership

Each accepted task starts a child process that embeds Pi with a fixed project cwd and an explicit session path. On completion the worker exits; the next turn resumes that same Pi file. This avoids idle workers, cwd mutation, process-global environment collisions, and SDK state in HTTP request handlers. Workers use minimal environment variables rather than inheriting cloud keys or all administrator environment secrets.

The parent owns project locks, global concurrency limits, task deadlines, cancellation, and process-group cleanup. Stop sends an SDK abort request first and kills the process group after a three-second grace period. It does not roll back completed writes or remote side effects. Detached subprocesses launched by untrusted shell code are outside this cleanup guarantee.

SDK initialization explicitly selects `frame-local`; no model fallback is intentional or permitted. Remote catalog refresh and install telemetry are disabled. The worker’s HTTP fetch wrapper only permits the selected local origin and `/v1/` paths and rejects redirects. This is a model-transport guard, not an OS egress policy.

## Persistence and reconnect

SQLite stores metadata and request IDs, not a second conversation history. Pi JSONL is authoritative. `history.ts` is a read-only, bounded UI projection that follows native parent IDs and separates reasoning from final text. Only the active assistant's reasoning animates. Native custom messages preserve selected-document context and attachment provenance. No branching UI is implemented.

POST starts a task independently of its SSE subscribers. Each subscriber first receives a complete UI snapshot, so a reconnect gets the current state immediately. While a response streams, a subscriber that already holds the finished messages receives only the in-progress message; a version number ties it to those messages, and a mismatch makes the browser fetch a full snapshot. Finished history is resent only when it changes. There is no event-replay database. Slow clients are disconnected when buffered output exceeds the limit; they reconnect to a current snapshot. Native history remains on disk after worker exit.

Each submitted prompt has a UUID idempotency key. The database records it before process launch. Retrying the same key never launches a second task. A server restart marks running requests interrupted rather than replaying side-effectful prompts. This is at-most-once acceptance, not an exactly-once execution guarantee. A crash after acceptance may require a new request after reviewing the history/files.

## Configuration ownership

Model configuration and organization instructions have one app-owned source in settings.json. Project instructions/tool opt-in live in SQLite. The SDK gets explicit model/runtime/resource settings. No implicit user-global Pi configuration, extension discovery, package install, or shell-evaluated credential value is used.

Settings changes are blocked while tasks are active, then apply to future tasks, including resumed chats. Project changes are similarly blocked during that project’s task. Browsers send IDs, not raw session/workspace paths. Managed folder creation is the only project registration method in V1.

## Security boundaries and limitations

- One administrator authenticates with a password, initially protected by an out-of-band setup token.
- Login cookies contain random opaque tokens; only hashes are stored in SQLite. Eight-hour absolute expiry, HttpOnly, SameSite=Strict, Secure when HTTPS.
- Host checks, strict write Origin checks, and cross-site request rejection protect against common CSRF/DNS-rebinding entry points; no wildcard CORS.
- Password/setup routes are rate-limited. Reverse proxy configuration must preserve the expected Host header.
- Endpoint secrets are owner-readable, not encrypted at rest. Use filesystem/disk encryption and a dedicated account when required. No secret is returned by the settings API.
- Generated HTML is downloadable only. Markdown does not render raw HTML, and remote images are omitted. Opening links is an explicit user action.
- Chat-mode projects have read-only knowledge search/reading and a non-writing proposal tool. Trusted-tool projects additionally grant unsandboxed host-account execution; this is intentionally prominent in the UI.
- Arbitrary third-party extensions are disabled until an explicit trust, lifecycle, and web-dialog design is implemented.

No tenants, RBAC placeholders, Redis, vector store, generic provider/plugin framework, or custom permission DSL. Add those only to satisfy a concrete requirement and tests.

## Knowledge and documents

Original uploads and bounded extracted text live in managed document directories. Curated notes are edited through Frame. SQLite stores document metadata and saved note revisions; `Wiki` produces a portable OKF 0.2 projection with frontmatter, index, newest-first change log, and source links. The exported archive also carries original files and captured conversation evidence. The `wiki/` subdirectory is the conformant bundle; sibling directories hold its referenced source assets.

Each task captures a project-scoped snapshot for bounded search/read tools. The parent keeps the page text for the duration of the task; the worker receives only catalog metadata and reads pages through plugin calls. It does not receive the whole corpus in the model context. Explicit attachments are stored as native Pi custom messages before the prompt. The proposal tool returns structured draft details in the native tool result and makes no filesystem changes. A browser save validates the completed source response, the project, and the target revision before applying a reviewed update. A useful response is unverified unless the user separately confirms checking it against sources. Conversation evidence excludes model reasoning.

Knowledge changes and uploads take the project lock and are rejected while that project runs. Exported OKF files are generated projections; edit through the web UI, not those generated files. Host tools can bypass application ownership conventions, so this is not an authorization boundary against a hostile trusted agent.

Python installs only after an explicit UI/CLI action into an app-owned venv. Pinned extraction/generation packages run without model/network calls. Installer-only proxy/index environment variables support organization package mirrors. Parsing has input, output, CPU, memory and time bounds. PDF/DOCX publication links a completed temporary file into its final name without overwriting an existing artifact. General shell scripts remain subject to host permissions and may have their own network behavior.

## Reports plugin

Reports follows the existing built-in plugin boundary: system configuration plus project enablement, explicit SDK tools, parent-owned validation and artifact publication. Organization design settings live in SQLite metadata; project overrides live in `report_settings` and inherit individual fields. Normalized logo bytes are stored with that configuration. Reports settings are independent of MSSQL and trusted host tools.

The worker sends structured report blocks and source IDs to the parent. Existing chart/source readers enforce conversation/project scope; the parent resolves complete saved data and parses Markdown into a small set of rendering blocks. The bounded Python renderer uses ReportLab and Pillow already present in the document runtime. It receives JSON and returns PDF bytes, with no model code, remote image fetching, or raw HTML rendering. Stop and worker completion abort pending report work. Only a completed PDF is linked into the conversation artifact directory, and each revision gets a new filename.
