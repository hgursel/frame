# Knowledge maintenance

Frame can check project knowledge and learn reusable procedures, definitions, calculation rules, and query templates from completed conversations. This is a built-in feature under **Settings → Knowledge**, using your configured local model. It does not train or fine-tune the model.

## Configure a nightly run

1. Select the projects to maintain. Nothing is selected initially.
2. Set a daily time and an IANA timezone, for example `02:00` and `Europe/Istanbul`. The default timezone is UTC; choose your own explicitly.
3. Choose whether to learn from completed conversations, or only check existing knowledge.
4. Choose a publishing policy, save, and enable the schedule. Scheduling starts disabled. **Run maintenance now** uses the saved settings even with scheduling disabled.

| Policy | What becomes available to chats |
| --- | --- |
| Review every draft | Nothing until you publish it from the review inbox. This is the default. |
| Publish new pages | New pages become usable but remain unverified. Changes to existing pages require review. |
| Maintain learned pages | New pages publish automatically. Unverified, unmodified learned pages and eligible metadata can be updated automatically. Human-written content and verified pages require review. |

Automatic publishing never adds a human verification mark. **Publish as verified** requires you to check the claims against their sources. Drafts are separate from active knowledge, chat retrieval, and OKF export. Reject drafts you do not want to keep. Changed source conversations or edited target pages block stale publication; existing page revisions remain available.

Frame must be running for its schedule to work. Starting after the configured time triggers one catch-up run for that local date, not a replay of every missed night. Repeated daylight-saving hours do not create duplicate runs; a skipped hour is caught on the next available tick. The runtime budget defaults to 30 minutes of active processing, excluding time paused or waiting between items. Stop preserves completed work. Subsequent runs skip already processed material. Active work recovers from persisted checkpoints after restart.

## What the job does

- Checks exact duplicate content, missing descriptions/tags, broken UUID page links, and removed or changed supporting sources.
- Flags learned pages whose source conversation has changed, and query recipes whose cached schema generation has changed.
- Suggests discovery metadata for suitable pages, using a bounded excerpt of one page at a time.
- Processes completed, non-incognito conversations in bounded segments. It ignores reasoning and raw tool output. Long messages are split with overlap, including later corrections.
- Reuses identical candidates and counts repeat occurrences. Matching page titles become proposed updates rather than duplicate pages.

This first version finds structural health issues. It does **not** automatically prove business rules, detect every semantic contradiction, or merge similarly worded pages. Common tasks can surface repeatedly, but frequency alone is not verification. Review-first publishing is appropriate while evaluating your local model's extraction quality.

Interactive chats take priority. A new chat request aborts the current maintenance model request; the unfinished item resumes after interactive work finishes. Page publication finishes at a safe write checkpoint. Maintenance also waits for uploads and active plugin jobs. It never calls SQL, shell, or agent tools while learning. The model transport uses bounded JSON requests and the same private endpoint checks as Frame's existing SQL enrichment.

## SQL: queries without results

For a conversation containing MSSQL activity, Frame excludes **all conversational prose and reasoning** from automatic learning. It reads only successful SELECT tool calls, parses supported statements, removes comments by rejecting commented statements, replaces literals and original parameter names with placeholders, and renames aliases. It keeps table/column names and database structure, not real examples. Unsupported or ambiguous SQL is skipped.

Result rows, aggregate results, sample values, parameter values, CSV contents, chart data, and assistant summaries of SQL results are never inputs to this SQL learning path. No model call processes raw SQL or SQL results to create these recipes. Conversations containing pasted SQL or tabular data are excluded from general prose learning as an additional precaution. Templates must be checked against the current schema and supplied with appropriate parameters before execution; saved knowledge never grants permission to execute a write.

The same restriction applies to **Save useful result** in SQL conversations. The review dialog offers a sanitized query template with a read-only body. Saving SQL-derived assistant answers through the conversation shortcut is blocked. Existing manually authored documents are not rewritten or scrubbed by this feature.

Old generated lookup-value pages and legacy query recipes are retired from retrieval and export during upgrade. Their historical records and any previous exports or backups are not physically erased. SQL knowledge generation no longer samples lookup rows, even if an older configuration enabled it.

## Discovery metadata for small models

Open a knowledge page and expand **Discovery metadata** to edit its description, tags, aliases, and category. Generated OKF Markdown begins with YAML frontmatter, for example:

```yaml
---
type: Knowledge Note
title: Change Approval
description: Use before maintenance to check approval and recovery planning.
frame:
  category: procedure
  tags: [maintenance, approval]
  aliases: [change preparation]
---
```

Frame also records provenance and generation information; human-confirmed pages have a verification record. Descriptions explain when a page is useful. Tags and aliases bridge the user's vocabulary to the page's title. This follows the discover-then-read approach of skills while keeping knowledge as reference material, not executable instructions.

Search weights titles, aliases, tags, and descriptions more heavily than body text. Each normal chat receives at most five relevant page references within a small metadata budget, then uses bounded search/read tools for details. The full knowledge collection is never inserted into the model prompt. Existing document limits remain: 100 files and 100 MiB per project; SQL schema pages use their separate cache. Consolidate or remove pages if that limit is reached.

## Incognito chats

Choose **New incognito chat** in the sidebar. Conversation and compaction state remain in server memory and are never written as a Pi session file. These chats do not appear in normal history, cannot be saved through the knowledge shortcut, and are excluded from maintenance, SQL recipes, and vocabulary-gap learning.

An incognito chat ends when you select another conversation/project, press **End chat**, reload/close its tab, sign out, or lose its heartbeat for 30 minutes. Leaving for Settings does not end it; download wanted files before ending the chat. Browser exit delivery is best-effort, with heartbeat expiry and startup cleanup covering abandoned sessions.

Temporary plugin artifacts and operational records can exist on the Frame host while the chat is active. Ending it stops active work and cleans up those files and records as soon as in-flight work permits. A restart discards abandoned incognito sessions. This is not forensic erasure of disks, backups, browser downloads, or logs held by llama.cpp or SQL Server. SQL changes that you explicitly approve are not undone by ending a chat.

Trusted host tools are disabled in incognito so the agent cannot persist a transcript through arbitrary file writes. Uploads that would permanently add to project knowledge are also disabled; existing knowledge can still be attached, and enabled managed SQL/Charts/Reports tools remain available.

## Validation

Automated coverage uses the real Pi SDK with a controlled local model transport. It checks memory-only follow-ups, cleanup and restart, API access, SQL value exclusion, publication policies, scheduling, and foreground preemption. Browser checks cover Settings, review/publish, metadata editing, and desktop/mobile incognito behavior. Test the quality and performance of your actual llama.cpp model separately before enabling automatic publishing.
