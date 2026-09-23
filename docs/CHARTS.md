# Charts plugin

Charts turns saved MSSQL results into inline bar, line, pie/donut, and scatter charts. It renders locally with React and SVG; no chart CDN, cloud service, model-generated JavaScript, or additional package is needed.

## Enable and use

1. Enable **Charts** in **Settings → Plugins**, then save Charts settings.
2. Enable **Charts** in the project's settings and save project plugins. Enable/configure MSSQL as well to obtain new SQL results.
3. Ask, for example: “Query monthly revenue ordered by month, then show a line chart.” Or, after a query: “Make a bar chart from those results.”

Charts is off by default. The model receives instructions to use chart tools **only when explicitly requested**, never automatically after a query or because database content contains an instruction. This is model-directed behavior, not a deterministic intent classifier; verify it with your local model and template. A chart request never bypasses SQL restrictions or write approval.

Hover or focus a point to see its exact values, toggle legend entries, expand the chart, inspect its underlying table, or download PNG/CSV. PNG exports include the currently visible series, legend, source timestamp, and SQL-limit warning. CSV includes all selected chart columns/rows, regardless of hidden legend entries, and neutralizes spreadsheet formulas in text cells. Pie percentages reflect visible categories.

## Data and limits

- SQL execution saves typed returned rows **before** shortening the 20-row chat preview, but only when Charts is enabled globally and for the project. SQL's configured row/byte limits still apply. A limited result is visibly labelled; it is never presented as the complete query result.
- The model refers to a dataset ID and column names. It does not reproduce thousands of values in tool arguments. `charts_datasets` lists up to 20 recent datasets within a 10,000-character budget, with the first 40 column names and an omitted-column count; `charts_create` validates the selected columns and stores an immutable chart snapshot. Neither tool executes SQL.
- Existing SQL results from before Charts was enabled have no dataset ID. Obtain a new read-only result when needed; never replay a change or procedure to recover chart data. Saving a chart dataset failing does not make completed SQL fail or execute again.
- Bar/line/scatter: up to 1,000 points across at most five measures. Pie/donut: one measure and up to 20 unique categories, with nonnegative values and a positive total. Aggregate/filter in SQL first; oversized charts fail visibly rather than silently dropping rows.
- Line charts use SQL category order at equal spacing, not a continuous time scale. Use `ORDER BY`. Scatter requires numeric X values. Numeric strings are accepted; unrepresentable integers and nonnumeric measures are rejected. NULL values remain gaps or omitted points, not zero.
- Dataset storage is bounded to 5,000 rows, 200 columns, about 1 MB each, and 100 datasets per conversation. At most 100 charts per conversation. Start a new conversation after reaching a limit.
- Charts are snapshots, not live dashboards. Source database and timestamp are shown. Reloading never reruns a query. Disabling Charts prevents new chart creation but preserves existing charts. Deleting the conversation or project removes its charts and saved datasets along with other scoped data.

The existing single-administrator authentication protects chart JSON/CSV routes. Dataset and chart IDs are scoped to their conversation. These controls are not multi-user authorization or a sandbox for trusted host tools.

## Verification and deferred features

Automated API/service tests cover full-result capture, typed negative values and NULLs, validation, limits, scope, authentication, deletion, and non-replay after capture failures. Browser tests use the real Pi SDK with a local mock model and SQL driver to exercise plugin switches, all chart types, hover/legend/expansion, PNG/CSV, mobile layout, and persisted chat reload. Real llama.cpp and SQL Server acceptance remains separate.

Deferred: uploaded/arbitrary data sources, dashboards, live refresh, drilldown queries, and a visual chart editor.
