# Runtime and data guide

[Back to Frame](../README.md) · [Deployment](DEPLOYMENT.md) · [Development](DEVELOPMENT.md)

## Local model support

Frame uses Pi’s `openai-completions` adapter with the administrator-selected HTTP(S) base URL, optional API key, and model ID. DNS names and custom paths are supported. Requests stay on the configured endpoint; redirects and URL-embedded credentials are rejected. No backend is installed, started, or silently substituted.
The thinking panel displays reasoning supplied by your model: structured `reasoning_content`/`reasoning`/`reasoning_text` through Pi, or a leading `<think>…</think>` block in ordinary text. It does not invent thinking or force the model to produce it. Expand the panel while generating to see updates; collapsed headers animate until reasoning finishes. Completed thinking persists with native history. Image and tool support are administrator-configurable. Frame’s context setting does not resize the model server’s memory. Knowledge tools and document generation require a tool-capable model/template.

Endpoint tokens stay server-side. An empty password input in model settings preserves the stored token; the explicit remove checkbox clears it. A dummy non-secret token is used internally by the compatibility client for endpoints with no authentication.

**Test saved connection** checks `<base URL>/models` discovery; it does not validate model quality or tool-calling compatibility.

## Data and execution

Different conversations run concurrently, including inside the same project. A FIFO queue limits simultaneous model requests using Settings → Context; there is no per-user quota. One response per conversation preserves session order. Tools and question waits do not hold model permits. Normal tasks continue after tab closure/logout. Incognito retains its existing temporary lifetime. Runs have a 60-minute execution deadline (question waits pause it). Restart interrupts active/queued work without replaying prompts. Each turn resumes its authoritative Pi session in a separate worker.
The default data directory is `./data`, excluded from Git:

| Location                                           | Purpose                                                                                                                                  |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `frame.db`                                         | User password hashes, roles, owner IDs, expiring login tokens, projects, conversations, run metadata, saved SQL chart datasets, and chart snapshots |
| `mssql.json`                                       | SQL connection profile and one shared read-only login; owner-only file permissions                                                            |
| `settings.json`                                    | Model configuration and endpoint token; owner-only file permissions                                                                      |
| `sessions/<conversation-id>.jsonl`                 | Authoritative Pi conversation history                                                                                                    |
| `projects/<project-id>/`                           | Managed project workspace                                                                                                                |
| `projects/<project-id>/outputs/<conversation-id>/` | Flat user-facing download directory                                                                                                      |
| `agent/<conversation-id>/`                         | Worker-local Pi runtime data                                                                                                             |
| `projects/<project-id>/knowledge/<document-id>/`   | Original files, extracted/editable content, conversation evidence                                                                        |
| `projects/<project-id>/knowledge/wiki/`            | Generated OKF bundle: concept pages, index, and log                                                                                      |
| `python/venv/`                                     | Optional managed document runtime                                                                                                        |

Pi is a dependency with an exact pinned version and lockfile. Frame explicitly disables install telemetry and catalog network refreshes. Project extensions, packages, ambient skills (such as `~/.pi` or `.agents/skills`), and arbitrary `AGENTS.md` files are **not automatically discovered**. Only the instructions saved through Frame and skills from folders an administrator lists in Settings → Plugins → Skills and enables for a project are loaded; see [Skills](SKILLS.md). MCP is not supported.

Project knowledge tools remain scoped to that project. File/Python tools use a fresh bubblewrap mount/PID/user namespace with conversation outputs writable, and project knowledge, conversation uploads, selected skills, and required runtime files read-only. Host home, Frame credentials, sessions, and other projects are not mounted. Network access remains unrestricted. Unavailable namespaces or bubblewrap cause tool errors; there is no host fallback. Built-in PDF/DOCX rendering remains a constrained service, separate from arbitrary shell execution. See [deployment checks](MULTIUSER.md).

Downloads require conversation ownership and reject traversal, symlinks, hardlinks, and oversized files. They are served as attachments. Installed skill contents are readable to anyone allowed to enable them; keep credentials out of skill directories. Server administrators retain filesystem access outside Frame.

Project and conversation actions live in each sidebar row's **⋯** menu. Deleting a conversation removes its history, worker data, run records, chart snapshots/datasets, and generated files while preserving shared project uploads and knowledge. Deleting a project additionally removes its knowledge/revisions, SQL catalog/notes/indexes, and plugin records. Confirm deletion and stop active tasks first. Shared model/SQL settings and external databases are untouched. Only Frame-owned files are removed; external copies and backups are not erased. File cleanup uses a local recovery journal so failed database transactions restore staged files and interrupted cleanup finishes on restart.
