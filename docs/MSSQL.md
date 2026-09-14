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
- Procedure parameter signatures, including output flags for reference.

It does not sample business rows, copy procedure bodies, or generate business meanings. Metadata visibility follows the read login's SQL permissions. Missing objects can indicate restricted visibility as well as removal.

The generated Markdown collection is stored in SQLite separately from ordinary uploaded documents; it does not consume the 100-document quota. Limits are 50,000 current objects, 128 MiB of generated current metadata, and 240,000 characters per object. A metadata page exceeding 16 MB fails the refresh. Previously known missing objects are retained as obsolete reference pages. Human-authored business notes stay separate and are never rewritten by initialization.

The UI shows progress, cancellation, last refresh, search, object previews, and OKF export. A complete refresh atomically replaces the cache. Failure or cancellation keeps the previous cache available. Changing the server, read identity, or database selection requires initialization again. Approved schema changes and procedure execution mark all projects' caches stale; changes made outside Frame require a manual refresh. Initialization can run only while the project has no active chat task.

Small models receive four focused tools: `mssql_schema_search`, `mssql_schema_read`, `mssql_query`, and `mssql_procedure`. Search returns at most 20 object references; reads return up to 8,000 characters with a continuation offset. Metadata discovery is not repeated for every question, and the full schema is never inserted into the prompt. Ask the model to search for relevant tables and read their columns/relationships before composing a query. Put domain explanations in reviewed Markdown business notes. Treat database descriptions and result values as reference data, not instructions.

Schema pages contain OKF-style front matter and provenance and export as a linked Markdown collection. The normal project knowledge export also includes the enabled schema collection. Generated schema reflects catalog facts; conversation knowledge proposals remain subject to the existing human review workflow.

## Results and limits

The conversation shows a bounded result table and an authenticated CSV download. Queries return at most the configured 1–5,000 rows (default 500), with a 1 MB result budget. Preview text is further bounded for model context. CSV contains only the returned first result set, not an unlimited database export; binary cells are placeholders. Further procedure result sets are discarded and flagged as truncated. CSV cells starting with spreadsheet formula characters are escaped.

Stop cancels the driver request and connection. A read hitting its row/byte limit is cancelled and returns the bounded result. For changes, excess result rows are discarded while the request finishes, so a display limit does not intentionally cancel a mutation. A CSV-saving failure is reported after successful execution and never turns a completed write into a retry.

## Validation and remaining acceptance

Automated tests cover policy rejection, secret redaction, project gating, approval identity and single use, denial/cancellation, uncertain write outcomes, 1,105-object metadata initialization, failed refresh preservation, and OKF export. A browser test uses the real compiled Frame server and Pi SDK worker with a controlled local model and SQL driver to exercise settings, cached schema tools, result rendering, approval, denial, and Stop.

These are not live SQL Server or llama.cpp acceptance tests. Before use, verify your SQL Server version, TLS chain, both logins' permissions, actual catalog visibility, supported queries, selected procedure signatures, and cancellation behavior against disposable development data. Verify tool calling with your local model/template.

Implementation references: [Tedious connections](https://tediousjs.github.io/tedious/api-connection.html), [T-SQL parser](https://github.com/taozhi8833998/node-sql-parser), [SQL Server columns catalog](https://learn.microsoft.com/en-us/sql/relational-databases/system-catalog-views/sys-columns-transact-sql?view=sql-server-ver17), and [foreign-key columns](https://learn.microsoft.com/en-us/sql/relational-databases/system-catalog-views/sys-foreign-key-columns-transact-sql?view=sql-server-ver17).
