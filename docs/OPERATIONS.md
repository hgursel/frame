# Runtime and data guide

[Back to Frame](../README.md) · [Deployment](DEPLOYMENT.md) · [Development](DEVELOPMENT.md)

## Local model support

Frame uses Pi’s `openai-completions` compatibility adapter for llama.cpp’s `/v1/chat/completions`. Only loopback or RFC1918 private IPv4 endpoints are accepted; `localhost` is normalized to `127.0.0.1`. Literal IPv6 loopback is also supported. Arbitrary DNS names, public IPs, metadata addresses, URL credentials, and redirects are rejected. Internal DNS and other private IPv6 ranges are deferred.

The thinking panel displays reasoning supplied by your model: structured `reasoning_content`/`reasoning`/`reasoning_text` through Pi, or a leading `<think>…</think>` block in ordinary text. It does not invent thinking or force the model to produce it. Expand the panel while generating to see updates; collapsed headers animate until reasoning finishes. Completed thinking persists with native history. No reasoning-effort control or image input is exposed yet. Context configuration in Frame does **not** resize llama.cpp’s KV cache. Knowledge tools and document generation require a tool-capable model/template.

Endpoint tokens stay server-side. An empty password input in model settings preserves the stored token; the explicit remove checkbox clears it. A dummy non-secret token is used internally by the compatibility client for endpoints with no authentication.

**Test saved connection** checks `/v1/models` discovery; it does not validate model quality or tool-calling compatibility.

## Data and execution

Frame permits one active task per project and two across projects. Tasks have a 30-minute limit, including time waiting for approval. Each task uses a fresh SDK worker to resume the authoritative Pi session; interrupted tasks are not automatically replayed.

The default data directory is `./data`, excluded from Git:

| Location                                           | Purpose                                                                                                                                  |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `frame.db`                                         | Administrator password hash, expiring login tokens, projects, conversations, run metadata, saved SQL chart datasets, and chart snapshots |
| `mssql.json`                                       | SQL connection profile and two login credentials; owner-only file permissions                                                            |
| `settings.json`                                    | Model configuration and endpoint token; owner-only file permissions                                                                      |
| `sessions/<conversation-id>.jsonl`                 | Authoritative Pi conversation history                                                                                                    |
| `projects/<project-id>/`                           | Managed project workspace                                                                                                                |
| `projects/<project-id>/outputs/<conversation-id>/` | Flat user-facing download directory                                                                                                      |
| `agent/<conversation-id>/`                         | Worker-local Pi runtime data                                                                                                             |
| `projects/<project-id>/knowledge/<document-id>/`   | Original files, extracted/editable content, conversation evidence                                                                        |
| `projects/<project-id>/knowledge/wiki/`            | Generated OKF bundle: concept pages, index, and log                                                                                      |
| `python/venv/`                                     | Optional managed document runtime                                                                                                        |

Pi is a dependency with an exact pinned version and lockfile. Frame explicitly disables install telemetry and catalog network refreshes. Project extensions, packages, ambient skills, and arbitrary `AGENTS.md` files are **not automatically discovered** in this foundation. Only the instructions saved through Frame are loaded. MCP/skill integration must deliberately add resource loading and approvals later.

Every project has narrowly scoped `search_knowledge`, `read_knowledge`, and `propose_knowledge` tools; proposals do not write. Trusted host tools add filesystem read/write/edit/search, shell execution, and `create_document` when Python is ready. **A project directory, a worker process, and a prompt instruction are not a sandbox.** Trusted tools can reach every file, network service, and credential accessible to the Frame Linux account. Keep host tools disabled when you only need chat and knowledge. Model transport restrictions do not restrict shell/Python network access.

Downloads reject traversal, symlinks, multi-linked files, and files larger than 100 MiB. They are served as attachments, never executed as HTML in Frame’s origin. These API checks cannot contain a malicious agent with host-level write access.

Project and conversation actions live in each sidebar row's **⋯** menu. Deleting a conversation removes its history, worker data, run records, chart snapshots/datasets, and generated files while preserving shared project uploads and knowledge. Deleting a project additionally removes its knowledge/revisions, SQL catalog/notes/indexes, and plugin records. Confirm deletion and stop active tasks first. Shared model/SQL settings and external databases are untouched. Only Frame-owned files are removed; external copies and backups are not erased. File cleanup uses a local recovery journal so failed database transactions restore staged files and interrupted cleanup finishes on restart.
