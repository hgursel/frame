# Knowledge in Frame

Frame combines Google's [Open Knowledge Format 0.2](https://github.com/GoogleCloudPlatform/open-knowledge-format/blob/main/SPEC.md) with the practical parts of [Karpathy's LLM Wiki pattern](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f): preserved sources, reusable synthesized pages, links, a catalog, and a change history. It uses your local llama.cpp model throughout.

## Everyday workflow

1. In a project, open **Knowledge** and upload a source. Frame preserves the original and extracts bounded text. Source documents are read-only.
2. Attach a source to a question, or ask Frame to search project knowledge. `search_knowledge` finds literal terms across titles/content; `read_knowledge` reads the page with its provenance in bounded sections. These tools work without enabling host tools.
3. Ask: “Synthesize this source into a reusable knowledge note. Link related pages and flag contradictions.” The model can call `propose_knowledge`, which returns a draft without saving anything.
4. Click **Review knowledge draft**, **Useful · Save to knowledge**, or **Save useful result**. Edit the useful content, remove mistakes, and add evidence or uncertainty.
5. Create a new page or choose an existing one. An ordinary response is appended to the current page for review; a model-proposed full revision is shown with the current page available for comparison. Save applies the complete reviewed text. A stale target revision returns a conflict instead of overwriting newer work.
6. Check “I checked these claims against their sources” only when you have done so. Merely saving a liked response does not record verification. Later edits clear prior verification unless explicitly reconfirmed.

The model can find saved pages in subsequent turns and other conversations in that project. No background ingestion, automatic verification, automatic training, vector database, or cloud service is involved. Ask the model to maintain links and document disagreements; V1 does not provide an unattended wiki maintenance/lint engine.

## Format and ownership

Each project has `knowledge/wiki/`, a generated OKF bundle. Concept IDs are stable document UUID filenames. Every concept has YAML frontmatter with `type`, `title`, `description`, `generated`, and `sources`; user-confirmed pages also have `verified`. Normal links such as `[Runbook](/<document-id>.md)` connect pages. The viewer follows those links locally. Broken links remain visible rather than making the whole bundle unreadable.

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

Install Ubuntu's `python3-venv` prerequisite, then use **Settings → Document tools**. Installation requires explicitly allowing package downloads. It creates `data/python/venv/` using the pinned `python/requirements.txt`; no package installer runs on application startup or model request. The CLI equivalent is `npm run python:setup`.

Organization proxies and pip index/certificate settings are passed to the installer only. Air-gapped deployments can provision the same requirements into a virtual environment and set the deployment variable `FRAME_PYTHON` to its interpreter; Frame will not modify an externally managed environment.

PDF/DOCX extraction works with host tools disabled. To generate artifacts, enable the project's trusted host tools and ask the model to call `create_document`. It accepts a title, filename, format, and a small Markdown subset: headings, paragraphs, and bullets. Other syntax is treated literally; it does not execute HTML or code. PDF fonts are bundled with ReportLab; complex scripts and rich typesetting are outside this initial tool's scope.

The generator publishes only complete files and refuses to overwrite an existing filename. The completed PDF/DOCX appears in the conversation's download list. Other Python scripts can use the `FRAME_PYTHON` interpreter and `PI_ARTIFACT_DIR`, but arbitrary scripts do not inherit the managed generator's publication or resource guarantees.
