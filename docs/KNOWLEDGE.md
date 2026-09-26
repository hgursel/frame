# Knowledge in Frame

Frame combines Google's [Open Knowledge Format 0.2](https://github.com/GoogleCloudPlatform/open-knowledge-format/blob/main/SPEC.md) with the practical parts of [Karpathy's LLM Wiki pattern](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f): preserved sources, reusable synthesized pages, links, a catalog, and a change history. It uses your local llama.cpp model throughout.

## Everyday workflow

1. In a project, open **Knowledge** and upload a source. Frame preserves the original and extracts bounded text. Source documents are read-only.
2. Use **+** beside the chat composer, then **Attach from knowledge** or **Upload from computer**. Computer uploads are saved to the project's knowledge and attached to the next prompt. Remove a selection using its chip's remove button; this does not delete the source. Attach a source to a question, or ask Frame to search project knowledge. `search_knowledge` ranks titles, aliases, tags, descriptions, and content; `read_knowledge` reads the page with its provenance in bounded sections. These tools work without enabling host tools.
3. Ask: “Synthesize this source into a reusable knowledge note. Link related pages and flag contradictions.” The model can call `propose_knowledge`, which returns a draft without saving anything.
4. Click **Review knowledge draft**, **Useful · Save to knowledge**, or **Save useful result**. Edit the useful content, remove mistakes, and add evidence or uncertainty.
5. Create a new page or choose an existing one. An ordinary response is appended to the current page for review; a model-proposed full revision is shown with the current page available for comparison. Save applies the complete reviewed text. A stale target revision returns a conflict instead of overwriting newer work.
6. Check “I checked these claims against their sources” only when you have done so. Merely saving a liked response does not record verification. Later edits clear prior verification unless explicitly reconfirmed.

The model can find saved pages in subsequent turns and other conversations in that project. Optional [Knowledge maintenance](KNOWLEDGE_MAINTENANCE.md) under Settings schedules health checks and bounded learning from completed conversations. It keeps up to 30 reusable methods per project in SQLite, supplies relevant excerpts before generation, and lets you review or automatically publish eligible methods. Authored pages remain separate. No automatic verification, model training, vector database, or cloud service is involved.

SQL conversations have a stricter save path: use **Save useful result** on a successful SELECT to keep a parameterized query template. Result tables, values, and assistant commentary from SQL conversations cannot be saved through this shortcut. The template body is read-only in the review dialog.

## Reading and removing content

Chat and knowledge share Markdown rendering for tables, task lists, fenced code with copying, and Mermaid diagrams. Diagrams render locally after a streamed response finishes; use **Expand diagram** for a larger view. Invalid or unsupported diagram content shows its source instead. External images, diagram configuration directives, and interactive diagram links are disabled; Mermaid source is limited to 20,000 characters.

Open a source or page in **Knowledge**, choose **Remove file** or **Remove page**, and confirm its name. Removal deletes its stored original/content, captured evidence, saved revisions, and generated wiki page, then refreshes the active catalog and export. A newer revision or active project task blocks removal. Removing a catalog entry is not an erasure of past conversations: previously attached excerpts, citations in other pages, prior exports, and backups remain. Other pages are not silently rewritten, so review links and provenance that referred to the removed document.

## Format and ownership

Each project has `knowledge/wiki/`, a generated OKF bundle. Concept IDs are stable document UUID filenames. Every concept has YAML frontmatter with `type`, `title`, `description`, `generated`, and `sources`; user-confirmed pages also have `verified`. Edit discovery metadata in the page viewer: `description` explains when to use a page, while `frame.tags`, `frame.aliases`, and `frame.category` support retrieval. This uses the descriptive, progressive-discovery idea of skills without making knowledge pages executable skills. Normal links such as `[Runbook](/<document-id>.md)` connect pages. The viewer follows those links locally. Broken links remain visible rather than making the whole bundle unreadable.

The root `index.md` declares `okf_version: "0.2"` and groups sources and knowledge notes. `log.md` uses ISO date headings, newest first. Original documents and captured answer/tool evidence are stored beside the bundle and referenced through relative `sources` paths. Captured evidence does not include model thinking. Original source citations inside answers remain part of the text; Frame does not claim to validate them automatically.

**Export OKF bundle** downloads the wiki and its referenced original/evidence files together. Other tools can consume the `wiki/` directory as OKF. Frame owns its active pages through the web UI and regenerates this projection; direct edits to generated `wiki/` files are overwritten. Complete OKF bundle import and round-trip preservation of external frontmatter are future work. Back up the whole data directory for exact Frame restoration, including SQLite revisions and Pi sessions.

## Limits

| Feature         | V1 limit                                                                                  |
| --------------- | ----------------------------------------------------------------------------------------- |
| Upload types    | UTF-8 MD/TXT/CSV, text PDF, ordinary non-macro DOCX                                       |
| Upload size     | 10 MiB per file; 100 files / 100 MiB per project                                          |
| Extraction      | 120,000 characters; PDF up to 100 pages                                                   |
| DOCX expansion  | 64 MiB and 2,000 ZIP members                                                              |
| Attachments     | Up to 5 per prompt; bounded total excerpt budget                                          |
| Knowledge reads | Up to 6,000 characters per call, smaller for small configured contexts; offset pagination |
| Markdown edits  | Up to 120 KB of UTF-8 text                                                                |
| History display | Latest 50 saved page revisions; older revisions remain in SQLite                          |

No OCR, image understanding, spreadsheets beyond CSV, legacy DOC, or macro execution. A PDF with no selectable text returns an actionable error. Extraction can lose layout; retain the original as evidence. Sources with truncated text are marked in the UI.

## Python document workflow

Install Ubuntu's `python3-venv` prerequisite, then use **Settings → Documents**. Installation requires explicitly allowing package downloads. It creates `data/python/venv/` using the pinned `python/requirements.txt`; no package installer runs on application startup or model request. The CLI equivalent is `npm run python:setup`.

Organization proxies and pip index/certificate settings are passed to the installer only. Air-gapped deployments can provision the same requirements into a virtual environment and set the deployment variable `FRAME_PYTHON` to its interpreter; Frame will not modify an externally managed environment.

PDF/DOCX extraction works with host tools disabled. All PDF generation uses the [Reports plugin](REPORTS.md), enabled globally and for the project. For Word documents, enable the project's trusted host tools and ask the model to call `create_document`. That tool accepts DOCX only, with a title, filename, and a small Markdown subset: headings, paragraphs, and bullets. Other syntax is treated literally; it does not execute HTML or code. The former plain Markdown-to-PDF generator has been removed; legacy PDF calls are rejected with instructions to use Reports.

Both generators publish only complete files and refuse to overwrite an existing filename. The completed PDF or DOCX appears in the conversation's download list. Other Python scripts can use the `FRAME_PYTHON` interpreter and `PI_ARTIFACT_DIR`, but arbitrary scripts do not inherit the managed generator's publication or resource guarantees.
