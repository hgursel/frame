# Project memory and knowledge maintenance

Frame learns a compact set of reusable methods using your existing local model. It does not fine-tune the model, install a vector database, or run a second agent framework. Open **Settings → Knowledge** for Overview, Methods, Review, and Schedule.

## What gets remembered

A project keeps at most **30 active methods**: recurring procedures, definitions, calculation rules, or parameterized SQL queries. Methods live in Frame's SQLite database, separate from uploaded documents and authored OKF pages. Learning does not create Markdown files.

- A task becomes eligible after it occurs in **three distinct completed, non-incognito conversations**, or after a direct user request: **“Remember this method.”** The latter applies to the latest extracted method. Supported nouns also include rule, query, procedure, and workflow; a preceding “please” is optional.
- General extraction sees bounded conversation segments and a short list of known task titles to consolidate matching tasks. SQL methods are grouped by normalized, parameterized query structure.
- One-off tasks stay out of the review inbox. At most 100 lower-frequency observations are kept per project. One-off SQL queries require no model request; only eligible SQL structures receive generated descriptive metadata.
- Publication follows your saved policy. Repetition, a request to remember, and successful SQL execution do **not** prove business correctness.
- At capacity, a more frequent candidate may replace a less frequent, unverified, non-confirmed method. Confirmed and verified methods are protected; when no eligible replacement exists, the new method stays in Review until you forget one.
- **Forget method** removes it from future recall and rejects its candidate so the same learning record is not automatically recreated. Existing conversation answers, exports, and backups are not rewritten.

Grouping is deliberately conservative. Different SQL structures remain separate even when they have similar descriptions. General task consolidation uses normalized or nearly identical titles and asks the local model to reuse known task names; it is not a guarantee of semantic equivalence.

## Recall before generation

Frame ranks authored knowledge and active learned methods together, using titles, descriptions, tags, aliases, and content. Up to three matching excerpts are supplied directly before the model starts, with a total serialized budget of at most 12,000 bytes (less for small configured contexts). It does not inject the entire library, even with a large context window.

For matching SQL methods, Frame can also supply up to four relevant cached schema objects within a separate bounded budget. This uses local SQLite reads, not live database discovery queries. Missing or truncated details still require tool lookup. The prompt instructs the model to reuse supplied facts and look up gaps rather than repeat every schema search. SQL-specific knowledge search can find the same active query methods.

Known stale schemas, changed connection identities, and changed dependencies exclude SQL methods from direct recall. Unchanged dependency hashes remain reusable after a schema refresh. The cache is not a live schema guarantee: Frame does not detect external database changes until its schema cache is refreshed or marked stale. Templates still need current parameters and review of any uncertain business interpretation. Memory never authorizes a database write.

The chat activity panel identifies methods supplied for the latest turn. **Supplied to N turns** counts context injection, not proof the model used it correctly. Incognito chats can read existing methods but do not contribute learning or persistent usage counts.

## Publication and review

| Policy | Behavior |
| --- | --- |
| Review every eligible method | Default. Nothing becomes active until reviewed. |
| Publish new methods; review updates | Eligible new methods become available unverified. Updates remain drafts. |
| Publish new methods and explicitly confirmed updates | New methods publish automatically. An update requires a new explicit confirmation and an unverified target; otherwise it remains a draft. |

Verified methods always require review for changes. A learned method matching an existing authored page's title also requires review. Source changes or deletion can block stale drafts. Removing a conversation removes methods/candidates that depend on it; removing a project removes all of its memory records.

Reference-page maintenance checks duplicate content, broken links, changed/missing sources, and discovery metadata. It can propose metadata improvements but does not replace authored page content. Verified reference pages require review. Drafts are excluded from normal chat recall.

## Scheduling

In **Schedule**, choose projects, a daily time, timezone, runtime budget, learning switch, and publication policy. Save before running maintenance. Scheduling starts disabled; manual runs use saved settings.

Frame and the local model must be available. Missed schedules catch up once per local date; DST repeats do not create duplicate runs. The default processing budget is 30 minutes, excluding paused time. Stop preserves completed work; the scheduler resumes unfinished items from checkpoints on later runs.

Interactive chats take priority and abort the current maintenance model request. Maintenance waits for active uploads and plugin jobs. It never executes SQL, shell commands, or agent tools while learning.

## SQL privacy

SQL learning receives only successful, supported SELECT structures. It parses and parameterizes literals and original parameter names, renames aliases, and rejects unsupported/commented statements. **All conversation prose, reasoning, SQL result rows, aggregates, actual parameter values, CSV contents, and chart data are excluded from this path.** The local model sees only the sanitized structure when generating a title and description. Those descriptions are inferred, not confirmed business definitions; ambiguous names still require human clarification.

General prose learning excludes conversations containing MSSQL activity or pasted SQL/tabular material. It instructs the model to retain procedures rather than observed outcomes. Existing manually authored documents are not scrubbed or changed.

The SQL “Save useful result” shortcut retains its structural-only, read-only template review. SQL-derived assistant answers cannot be saved through that shortcut.

## Upgrade cleanup

On the first start of this version, Frame permanently removes automatically created legacy maintenance pages and generated SQL notes, glossary/domain pages, and recipes. Legacy candidate/checkpoint records are cleared so eligible historical conversations can be processed again. SQL alias indexes are reset along with their generated explanations.

Imported schema facts, uploaded source documents, human-authored pages, and formerly generated pages subsequently edited by a human are retained. Metadata enrichment alone does not make an authored page a deletion target. Cleanup is restartable and runs once. Prior downloads, backups, and conversation messages are not erased.

After updating, select projects and run maintenance to regenerate curated methods. SQL interpretation generation remains a separate optional operation in project settings; query learning now belongs exclusively to project maintenance.

## Incognito

Choose the incognito icon in the chat header before sending the first message. Transcript/compaction state remains in server memory, and incognito does not appear in saved conversation history. It is excluded from learning, vocabulary-gap collection, and permanent knowledge saves.

End chat, switch conversations/projects, reload, sign out, or allow its heartbeat to expire to end it. Leaving for Settings does not end it. Temporary plugin artifacts and operational records are removed when in-flight work permits; restart cleans abandoned sessions. This is not forensic erasure of disks, browser downloads, backups, or external model/database logs. Approved SQL changes are not undone.

Host tools and uploads that would permanently add to project knowledge remain disabled in incognito. Existing knowledge and enabled managed SQL/Charts/Reports tools can still be used.

## Validation and limits

Automated tests cover selection thresholds, capacity, review policies, privacy, migration, schema dependency checks, bounded direct recall, real Pi SDK requests through a controlled local model transport, and desktop/mobile settings. These are not quality benchmarks of Qwen or another production model. Compare repeated tasks with memory enabled and disabled on your own llama.cpp deployment, checking correctness as well as latency and discovery calls.

Memory can improve task-specific context; it does not make an incorrect rule true or guarantee fewer tool calls on every request.
