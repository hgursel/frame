# MSSQL plugin

Frame 0.5 includes a built-in SQL Server plugin. It uses a Node TDS driver; no Pi CLI, MCP server, ODBC installation, or `sqlcmd` is required. It works independently of trusted host tools. V1 retains one Frame administrator and one shared connection profile.

Intended for development databases. Approved operations can change or delete data. Frame deliberately has no production/development selector: the administrator is responsible for choosing appropriate databases and SQL Server permissions.

## Configure in the browser

1. Open **Settings → Plugins → Microsoft SQL Server**. Enter a host, TCP port (default 1433), and explicit database names, one per line. Named instances must use their configured TCP port.
2. Configure two different SQL Authentication logins: a read-only login for queries and schema initialization, and a write login for approved changes. Frame does not create SQL logins or grant permissions.
3. Enable the plugin system-wide. Data changes, schema changes, and stored procedures each have a separate switch, initially off. Procedures require an explicit `Database | Schema | Procedure` entry for each allowed procedure.
4. Save, then explicitly **Test saved read login** and **Test saved write login**. Saving does not connect. Tests run a fixed identity/role query on each selected database; they do not execute a mutation or prove that the read login is read-only.
5. Open **Project settings → Project plugins**, enable MSSQL, and save. Projects inherit the system database list and restrictions.
6. Expand **SQL schema knowledge**, select **Initialize database knowledge**, then ask a tool-capable local model a question about the database.

Generated database knowledge is written by a local model and may be wrong. It is reference data for the model and for you, never an instruction, and never a replacement for the catalog facts it sits beneath.

Passwords are never returned by the settings API or supplied to the model worker. Blank password fields preserve saved secrets; explicit removal clears them. Server-side credentials live in owner-only `data/mssql.json`. Protect the data directory and backups. Trusted shell/Python tools have the Frame OS account's access and can bypass application-level restrictions; leave trusted host tools off for a SQL-only workflow.

TLS encryption is enabled. Certificate verification is on by default. Configure the server certificate and host trust chain; where needed, set Node's `NODE_EXTRA_CA_CERTS` to a trusted CA PEM file before starting Frame. The explicit **Trust server certificate without validation** setting is available for development installations with self-signed certificates.

## SQL permissions and review

Use dedicated SQL Server logins mapped only to the selected databases. Give the reader SELECT on the intended objects and sufficient metadata visibility, without data modification, EXECUTE, schema modification, impersonation, ownership, or server administration permissions. Give the writer only the specific DML, object/schema modification, and procedure EXECUTE permissions you actually need. Do not use `sa`, `sysadmin`, or `db_owner` as a shortcut. A database administrator should configure and verify these permissions; Frame's connection check only flags a few broad roles.

Frame parses a single T-SQL statement before execution. Supported reads run automatically through the read login. Enabled INSERT/UPDATE/DELETE and supported table/index DDL pause for review and run through the write login. Every procedure invocation also pauses, even if its name suggests a read-only operation. Raw EXEC is disabled; the procedure tool supplies an allowlisted schema/name and typed parameters.

The review card shows the exact database, SQL or procedure, and parameter values. An approval is bound to one conversation, run, operation, and settings snapshot. It expires after five minutes and cannot be reused. Deny or Stop while waiting submits nothing. Settings changes are blocked during active tasks/imports. Frame never retries SQL automatically. If a connection fails or Stop interrupts an executing write, its outcome is **unknown**: inspect the database before authorizing another attempt. Cancellation is not a rollback guarantee. The SQLite operation record retains the submitted statement, parameters, and outcome status; interrupted executing operations become unknown at restart.

Unsupported syntax fails closed. V1 rejects multi-statement batches, comments, dynamic SQL, raw EXEC, SELECT INTO, OUTPUT clauses, explicit cross-database/linked-server references, user-defined function calls, permission changes, and server administration commands. T-SQL support is intentionally narrower than SQL Server itself; an error is not permission to bypass the guard with shell tools.

The database allowlist governs selected connections and explicit references. Views, synonyms, ownership chains, triggers, and approved procedures can access or change other objects internally. SQL Server permissions are the final boundary. Review procedure implementations before allowlisting them; Frame does not analyze their bodies or automatically enable discovered procedures.

Parameters support Unicode text, 32-bit integers, decimal numbers (precision 28, scale 8), booleans, dates, and null. JavaScript numbers cannot preserve arbitrary-precision financial values. Table-valued/binary/output parameters and procedure return values are not supported in V1. Each operation gets a fresh connection. Query timeouts are configurable from 5–120 seconds, plus a 15-second connection timeout.

## Schema knowledge for large databases

Initialization reads SQL Server 2016+ catalog metadata in pages of 100 objects through the read login. It imports visible user tables, views, and procedures, including:

- Columns, types, size/precision, nullability, identity, defaults, and descriptions.
- Primary/unique keys, index columns and included columns.
- Outgoing foreign-key relationships and referenced columns.
- Incoming foreign-key references, capped at 200 per object, so a table lists what depends on it.
- Approximate row counts from `sys.partitions`, which needs no `VIEW DATABASE STATE` permission.
- Procedure parameter signatures, including output flags for reference.

Initialization itself does not sample business rows, copy procedure bodies, or generate business meanings; generated knowledge is a separate, explicitly started step described below. Metadata visibility follows the read login's SQL permissions. Missing objects can indicate restricted visibility as well as removal.

Each generated page opens with a one-line summary, then renders columns, relationships, incoming references, indexes, and parameters as compact Markdown tables. A bounded read therefore starts with the facts needed to choose an object, instead of spending its budget on the first few column definitions.

The generated Markdown collection is stored in SQLite separately from ordinary uploaded documents; it does not consume the 100-document quota. Limits are 50,000 current objects, 128 MiB of generated current metadata, and 240,000 characters per object. A metadata page exceeding 16 MB fails the refresh. Previously known missing objects are retained as obsolete reference pages. Human-authored business notes stay separate and are never rewritten by initialization.

The UI shows progress, cancellation, last refresh, search, object previews, and OKF export. A complete refresh atomically replaces the cache. Failure or cancellation keeps the previous cache available. Changing the server, read identity, or database selection requires initialization again. Approved schema changes and procedure execution mark all projects' caches stale; changes made outside Frame require a manual refresh. Initialization can run only while the project has no active chat task.

Search is ranked. Object names, split identifier parts, column names, and catalog descriptions are indexed in SQLite FTS5, scored with BM25, and then adjusted by a mechanical importance score derived from approximate row count, how many tables reference the object, whether it has a primary key, and whether it is a table. Text relevance dominates: a name match on a small table still outranks a column match on a large one. Importance only separates objects that match a query equally well, which is what happens when hundreds of tables share a column name. Identifiers are split on case and separator boundaries, so `CustomerOrders` matches `customer` and `LG_001_CLCARD` matches `clcard`, and terms match by prefix. Accents are folded on both the index and the query side, including Turkish dotless `ı`, so `aciklama` finds `açıklama` and the reverse. FTS5 operators typed into the search box are treated as literal words, never as query syntax. An empty query browses the most prominent objects first.

Search falls back to unranked substring scanning for a cache imported before this index existed, and on a SQLite build without FTS5. Refresh the schema after upgrading to get ranked search. Rebuilding is the only migration: nothing is lost by refreshing.

## Generated database knowledge

Catalog metadata says how a database is shaped, not what it means. On a schema with cryptic or
abbreviated names, that gap is what makes a model write the wrong query. **Project settings →
Generated database knowledge** runs a local model over the cached catalog and writes an
interpretation layer beside it. The model is the one configured in Settings; nothing is sent
anywhere else.

The run makes several passes, most prominent objects first, so it is useful before it finishes:

- **Object notes.** One note per table, view, and procedure: purpose, grain ("one row per ..."),
  business aliases, and per-column notes where a name is not self-explanatory.
- **Subject areas.** The foreign-key graph is split into connected components and each is named and
  summarized, so a thousand peer tables become a few dozen navigable areas.
- **Glossary.** Name fragments the schema repeats at least three times are defined once.
- **Recipes.** Read statements that already completed against this database are recorded with the
  question they answer. A query that ran is better evidence than any inference from names.
- **Lookup values.** Optional and off by default; see below.
- **Vocabulary gaps.** Searches that returned nothing are recorded. A later run asks which known
  object each missing word names and, when the answer is a real object, adds it as an alias so the
  next search finds it.

Generated knowledge is never mixed into catalog facts. Notes are stored in separate tables keyed by
object identity rather than by import generation, so they survive a schema refresh; they render
below the catalog tables under a heading naming the model that wrote them and whether a human has
reviewed them; and a note is marked for re-checking when the object's catalog facts change after it
was written. Re-running skips every object whose facts and model are unchanged, so an update costs
model time only where something actually moved.

Output is validated mechanically before it is stored. A note annotating a column the object does
not have has that annotation dropped and, when it invents more than it gets right, is recorded at
low confidence. Subject-area pages may only cite tables from their own cluster, and glossary
entries may only define fragments the schema actually contains. A model that returns no usable JSON
leaves the object with no note rather than a guess.

A short map of subject areas, most-connected objects, and glossary terms is added to the model's
system prompt once knowledge exists. The full schema never fits in a prompt; its shape does, and it
is what stops a small model guessing table names on its first search.

Review is deliberately partial. Per-object notes are usable while unreviewed and labelled as such;
**Mark note reviewed** records a human decision on the object's page. Requiring review of a thousand
notes before any of them helps would mean none of it is ever used.

Enrichment shares one local model with chat, so it pauses between items whenever a chat task is
running in the project and resumes when the project is idle. Plugin settings cannot be changed
while a run is in flight.

### Reading rows from lookup tables

**Allow enrichment to read rows from small lookup tables** is off by default and is the only setting
that lets Frame read business data. Everything else in this plugin reads catalog metadata only.

When enabled, the lookup-value pass reads up to 50 rows, through the read login, from tables that
are referenced by at least one other table and have 500 rows or fewer, and asks the model what the
coded values mean. This exists because models reliably guess `WHERE Status = 'Active'` against a
`tinyint` code column; decoding the codes fixes a whole class of wrong queries.

The sampled values are stored in generated knowledge pages, appear in the OKF export, and are shown
to the model in later conversations. Do not enable it against tables holding personal or otherwise
sensitive data. Frame does not classify or mask what it reads, and the row limits are a bound on
volume, not a judgment about content.

Small models receive five focused tools: `mssql_schema_search`, `mssql_schema_read`, `mssql_knowledge_search`, `mssql_query`, and `mssql_procedure`. Search returns at most 20 ranked objects, each with a one-line summary so the model can triage without a read; reads return up to 8,000 characters with a continuation offset. Metadata discovery is not repeated for every question, and the full schema is never inserted into the prompt. Ask the model to search for relevant tables and read their columns/relationships before composing a query. Put domain explanations in reviewed Markdown business notes. Treat database descriptions and result values as reference data, not instructions.

Schema pages contain OKF-style front matter and provenance and export as a linked Markdown collection. The normal project knowledge export also includes the enabled schema collection. Generated schema reflects catalog facts; conversation knowledge proposals remain subject to the existing human review workflow.

## Results and limits

The conversation shows a bounded result table and an authenticated CSV download. Queries return at most the configured 1–5,000 rows (default 500), with a 1 MB result budget. Preview text is further bounded for model context. CSV contains only the returned first result set, not an unlimited database export; binary cells are placeholders. Further procedure result sets are discarded and flagged as truncated. CSV cells starting with spreadsheet formula characters are escaped.

Stop cancels the driver request and connection. A read hitting its row/byte limit is cancelled and returns the bounded result. For changes, excess result rows are discarded while the request finishes, so a display limit does not intentionally cancel a mutation. A CSV-saving failure is reported after successful execution and never turns a completed write into a retry.

## Validation and remaining acceptance

Automated tests cover policy rejection, secret redaction, project gating, approval identity and single use, denial/cancellation, uncertain write outcomes, 1,105-object metadata initialization, failed refresh preservation, OKF export, ranked search ordering, identifier splitting, FTS operator neutrality, index/row consistency across refreshes, the unranked fallback for an unindexed cache, enrichment output validation against real column names, note survival across a schema refresh, idempotent re-runs, enrichment authentication and project scoping, the default-off value-sampling gate, vocabulary-gap alias creation, model-failure handling, chat preemption, and cancellation. A browser test uses the real compiled Frame server and Pi SDK worker with a controlled local model and SQL driver to exercise settings, cached schema tools, result rendering, approval, denial, and Stop.

These are not live SQL Server or llama.cpp acceptance tests. Enrichment is tested with a controlled generator, not a real llama.cpp model: the quality of generated notes on your schema is unverified and must be judged by reading them. Before use, verify your SQL Server version, TLS chain, both logins' permissions, actual catalog visibility, supported queries, selected procedure signatures, and cancellation behavior against disposable development data. Verify tool calling with your local model/template.

Implementation references: [Tedious connections](https://tediousjs.github.io/tedious/api-connection.html), [T-SQL parser](https://github.com/taozhi8833998/node-sql-parser), [SQL Server columns catalog](https://learn.microsoft.com/en-us/sql/relational-databases/system-catalog-views/sys-columns-transact-sql?view=sql-server-ver17), and [foreign-key columns](https://learn.microsoft.com/en-us/sql/relational-databases/system-catalog-views/sys-foreign-key-columns-transact-sql?view=sql-server-ver17).
