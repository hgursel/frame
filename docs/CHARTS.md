# Charts plugin

Turn SQL results, CSV files, and Markdown tables into inline bar, line, pie/donut, and scatter charts. Rendering and calculations stay local; no chart CDN, cloud service, or model-generated JavaScript is used.

## Enable and use

1. Enable **Charts** in **Settings → Plugins**, then save Charts settings.
2. Enable **Charts** in the project's settings and save project plugins. MSSQL is needed only to run SQL queries, not for file or chat charts.
3. Upload a CSV/Markdown file with the chat attachment menu, select a knowledge source, paste a Markdown table, or refer to an earlier table or query result. Ask for a chart explicitly.

Examples:

- “Use sales.csv, total revenue by region, and show a bar chart.”
- “Chart the second table in this Markdown file.”
- “Make a pie chart from the table in your previous response.”
- “Filter these results to completed orders, average their amounts by region, and sort largest first.”

Charts is off by default. The model is instructed to use chart tools **only when explicitly requested**, never automatically after a query or because source content contains an instruction. This is model-directed behavior, not a deterministic intent classifier; verify it with your local model and template. A chart request never bypasses SQL restrictions or write approval. Tables from assistant responses remain unverified model output.

## Using a chart

Hover or focus a point to see its values, toggle legend entries, or open **View chart data**. The card has one title and an expand icon. The expanded view contains PNG and CSV downloads; close it with the × icon, Escape, or a click outside the window.

PNG exports include the title, visible series, legend, and partial-source warning where applicable. CSV includes all selected chart columns/rows regardless of hidden legend entries, and neutralizes spreadsheet formulas in text cells. Pie percentages reflect visible categories. Database names and timestamps are retained internally for existing SQL snapshots but are not displayed on chart cards.

## Sources and calculations

- **SQL:** capture typed returned rows before shortening the 20-row chat preview. SQL's configured row/byte limits still apply. Capture requires Charts to be enabled when the query runs. Old results without a dataset ID require a new read-only query; never replay a change or procedure to recover chart data.
- **Project files and knowledge:** read original CSV/Markdown uploads, or the current version of an edited Markdown knowledge page. Chart imports do not use shortened attachment excerpts. UTF-8, comma-separated CSV supports quoted commas, quotes, and newlines. Markdown uses GFM tables, including inline formatting and escaped pipes. Multiple Markdown tables are selected by their 1-based table number. Headers must be unique and nonempty; ragged rows fail visibly. Blank cells are null, not zero.
- **Chat:** import a table from a user or assistant message in the current conversation's native session branch. Discovery covers the latest 100 user/assistant messages. Thinking and tool output are not table sources. No full table is copied back through model tool arguments.
- **Generated files:** import CSV/Markdown artifacts within the current conversation. Arbitrary filesystem paths and remote URLs are not supported.
- **Local calculations:** AND filters run before grouping. Group by up to three columns and calculate up to five named sums, averages, minima, maxima, or counts. Numeric aggregates ignore nulls; an all-null group stays null. Count without a column counts rows; count with a column counts nonnull values. Measures without grouping produce an “All rows” category. Sort by up to three columns, using numeric or text order; nulls sort last. Each transform creates a new dataset and retains partial-source warnings. No arbitrary code or SQL is evaluated.

The model selects references and column names through `charts_sources`, `charts_import`, `charts_datasets`, `charts_transform`, and `charts_create`. Source discovery is paginated in groups of 20. Dataset discovery lists 20 recent datasets within a 10,000-character budget. Data values stay on the server until the selected chart is rendered.

## Limits and persistence

- Imported source text and saved datasets are limited to about 1 MB, 5,000 data rows, and 200 columns. Larger uploads may be stored in knowledge but must be split or summarized before chart import. Unsupported or oversized sources fail explicitly rather than silently clipping data. PDF/Word/Excel table extraction is not included.
- Bar/line/scatter: up to 1,000 points across at most five measures. Pie/donut: one measure and up to 20 unique categories, with nonnegative values and a positive total. Use local filtering/grouping or aggregate in SQL before plotting larger datasets.
- Line charts use category order at equal spacing, not a continuous time scale. Scatter requires numeric X values. Plain numeric strings are accepted. Currency symbols, thousands separators, unsafe integers, and nonnumeric measures are rejected rather than guessed. NULLs remain gaps or omitted points.
- At most 100 datasets and 100 charts per conversation. Imports and calculations each consume a dataset slot. Source references, calculation notices, and chart snapshots persist across reloads; loading charts never reruns a query or recalculates a source. Later file edits do not change saved charts.
- Disabling Charts prevents new imports, calculations, and charts while preserving existing charts. Deleting a conversation or project removes its charts and datasets. Project knowledge remains shared when only a conversation is deleted.

The single-administrator authentication protects chart JSON/CSV routes. Dataset, chart, message, and generated-file references are scoped to their conversation; document references are scoped to its project. File reads reject traversal, symlinks, and hardlinks. These are application access checks, not a sandbox for trusted host tools.

## Verification and deferred features

Tests cover parsers, local calculations, full-source reads, scope, validation, limits, authentication, persistence, deletion, and non-replay after SQL capture failures. Browser tests use the real Pi SDK with a local mock model and SQL driver to exercise chart types, file/chat sources without MSSQL, hover, legend, expansion/dismissal, exports, mobile layout, and reload. Real llama.cpp and SQL Server acceptance remains separate.

Deferred: other file formats, arbitrary formulas, continuous date axes, dashboards, live refresh, drilldown queries, and a visual chart editor.
