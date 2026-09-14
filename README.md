# Frame

**A self-hosted AI workspace for organizations.**

Frame brings local models, project context, conversations, and agent tools into a browser-based workspace. It embeds the Pi SDK and connects to a llama.cpp server you operate. No separately installed Pi CLI, cloud-provider setup, or cloud fallback.

## Status: 0.1 foundation scaffold

Runnable, single-administrator foundation. **Not a hardened multi-user organizational release.** Do not expose it directly to the Internet or use it as a security boundary around confidential systems.

### Implemented

- First-run browser setup with a server-console bootstrap token; password sign-in and expiring HttpOnly cookies.
- Browser settings for one local endpoint, model ID, context/output limits, optional endpoint token, and organization instructions.
- Test saved endpoint discovery through `/v1/models` (not a model-quality or tool-capability test).
- Create/edit projects with instructions and an explicit trusted-tools toggle; managed project directories.
- Streaming text chat, Markdown/code rendering, tool-result cards, stop generation, reconnect-safe snapshots.
- Pi-native persisted JSONL history; fresh SDK worker per task resumes the exact conversation file.
- Request-ID deduplication, one active task per project, two tasks maximum across projects, 10-minute task limit.
- Authenticated, download-only artifacts from each conversation’s output folder.
- TypeScript checking, security/API tests, and real-SDK integration tests against a local mock endpoint.

### Planned, not implemented

- MCP connection management, trusted skill installation, and extension dialog bridging.
- Document uploads, wiki editor/browser, and tested Python document-generation environments.
- Existing external-folder registration; V1 creates managed folders only.
- Model/reasoning presets, richer diagnostics, administrator credential rotation, and packaged installer.
- Multi-user identity, project authorization, audit events, and isolated execution.

See [the roadmap](docs/ROADMAP.md) and [architecture](docs/ARCHITECTURE.md). No placeholder control pretends these features work.

## Quick start

Target platform: **Ubuntu 26.04, Node.js 24 LTS, npm**. The agent and tools run on this server, not in your browser. Python, fonts, and skill-specific binaries are separate prerequisites when those tools need them. Frame does not install llama.cpp or download models.

```bash
git clone https://github.com/hgursel/frame.git
cd frame
npm ci
npm run build
npm start
```

Open **http://127.0.0.1:3000**. Use the setup token printed by the server to create a password (minimum 12 characters), then:

1. Open **Settings**. Enter an endpoint such as `http://127.0.0.1:8080/v1` and the model alias your llama.cpp server actually serves.
2. Match the context window to the context allocated per llama.cpp slot. Choose a smaller output limit.
3. Save, then **Test saved connection**. Discovery does not prove tool calling works.
4. Create a project. Leave tools disabled for the first chat test.
5. Send a prompt. Enable trusted tools only after reading the warning and confirming the model’s chat template supports tool calling.

Endpoint tokens stay server-side. An empty password input in model settings preserves the stored token; the explicit remove checkbox clears it. A dummy non-secret token is used internally by the compatibility client for endpoints with no authentication.

### Local model support

Frame uses Pi’s `openai-completions` compatibility adapter for llama.cpp’s `/v1/chat/completions`. Only loopback or RFC1918 private IPv4 endpoints are accepted; `localhost` is normalized to `127.0.0.1`. Literal IPv6 loopback is also supported. Arbitrary DNS names, public IPs, metadata addresses, URL credentials, and redirects are rejected. Internal DNS and other private IPv6 ranges are deferred.

No reasoning-effort parameter or image input is exposed yet. A model may still generate its own reasoning text according to its llama.cpp template. Context configuration in Frame does **not** resize llama.cpp’s KV cache. Choose a tool-capable model and test your template separately.

## Data and execution

The default data directory is `./data`, excluded from Git:

| Location                                           | Purpose                                                                                       |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `frame.db`                                         | Administrator password hash, expiring login tokens, projects, conversations, and run metadata |
| `settings.json`                                    | Model configuration and endpoint token; owner-only file permissions                           |
| `sessions/<conversation-id>.jsonl`                 | Authoritative Pi conversation history                                                         |
| `projects/<project-id>/`                           | Managed project workspace                                                                     |
| `projects/<project-id>/outputs/<conversation-id>/` | Flat user-facing download directory                                                           |
| `agent/<conversation-id>/`                         | Worker-local Pi runtime data                                                                  |

Pi is a dependency with an exact pinned version and lockfile. Frame explicitly disables install telemetry and catalog network refreshes. Project extensions, packages, ambient skills, and arbitrary `AGENTS.md` files are **not automatically discovered** in this foundation. Only the instructions saved through Frame are loaded. MCP/skill integration must deliberately add resource loading and approvals later.

Trusted tools include filesystem read/write/edit/search and shell execution. **A project directory, a worker process, and a prompt instruction are not a sandbox.** Trusted tools can reach every file, network service, and credential accessible to the Frame Linux account. Keep tools disabled for chat-only use; use a dedicated non-root account and least privilege. Model transport restrictions do not restrict shell/Python network access.

Downloads reject traversal, symlinks, multi-linked files, and files larger than 100 MiB. They are served as attachments, never executed as HTML in Frame’s origin. These API checks cannot contain a malicious agent with host-level write access.

## Deployment and development

Optional settings are documented in [.env.example](.env.example); copy it to `.env` if needed. Both `npm start` and `npm run dev` read `.env`. Runtime model and project configuration is managed in the browser. Deployment-level bind/origin/storage choices remain outside the UI.

For access from another computer, use an HTTPS reverse proxy with the exact `FRAME_ORIGIN`, or a local SSH tunnel. The Node service binds only to loopback. See [deployment notes](docs/DEPLOYMENT.md).

```bash
npm run check
npm test
npm run build
npm run dev
```

`dev` runs the TypeScript server and serves the previously built frontend. Rebuild after frontend changes. No separate frontend process or HMR is required for this scaffold.

Tests use local temporary directories and a mock OpenAI-compatible HTTP server, including a real Pi SDK worker. They do not require a GPU or spend API credits. **A test pass is not verification against your real llama.cpp/model configuration.**

For the optional browser smoke test, run `npx playwright install chromium --only-shell`, then `npm run build && npm run test:ui`. The browser binary is a development dependency, not needed to run Frame.

## References

- [Pi SDK](https://pi.dev/docs/latest/sdk)
- [Pi security model](https://pi.dev/docs/latest/security)
- [llama.cpp server](https://github.com/ggml-org/llama.cpp/tree/master/tools/server)

No license for Frame’s source has been selected yet. Dependency licenses remain applicable.
