# Reports

[Back to Frame](../README.md) · [Charts](CHARTS.md) · [Knowledge](KNOWLEDGE.md)

Reports creates branded PDFs locally from conversation findings, saved charts, and tables. It uses the existing managed Python runtime; no separate Pi installation, cloud service, browser renderer, MSSQL connection, or trusted host-tool permission is required.

## Set up

1. Install the optional runtime in **Settings → Documents**. Ubuntu needs Python 3 and `python3-venv`. An existing working Frame document runtime already has the required packages.
2. Open **Settings → Plugins → Reports**, enable the plugin, and configure its design. The plugin menu separates Reports, Charts, and MSSQL while preserving unsaved drafts when switching between them.
3. Under **Branding**, set the organization name and report label, choose primary/secondary/accent colors, and upload a PNG or JPEG logo. Logos save immediately; use **Save report settings** for the other controls.
4. Under **Layout**, choose a default layout, Letter or A4, portrait or landscape, an optional cover page, and footer text.
5. Under **Instructions**, describe required sections, titles, descriptions, and writing style in Markdown. Save, then use **Download saved-design sample** to inspect the layout. The sample contains fictional data and does not call the model or apply writing instructions.
6. Enable **Reports** in a project's settings. **Customize report design** provides optional overrides for that project.

Project fields inherit organization defaults individually until changed. **Use organization default** removes a field override so future organization changes apply again. Instructions are also one inherited field: a project override replaces, rather than appends to, the organization instructions. A project can inherit, replace, or remove the organization logo independently. Existing PDFs keep their original design.

## Layouts and instructions

| Layout | Intended use | Presentation |
| --- | --- | --- |
| Executive summary | Findings, decisions, recommendations | Larger headings and more spacious typography |
| Data analysis | Charts, tables, and commentary | Tighter spacing and wider content area |
| Technical report | Procedures, detailed sections, code | Numbered major sections and compact typography |

The model selects content and can choose a layout for a particular request. Design controls determine formatting; instructions guide the model, rather than enforce a fixed form or execute code. For example:

```markdown
## Required sections
Executive summary, scope, findings, recommendations, sources.

## Recommendations
Include an owner, priority, and next action for each recommendation.

## Writing style
Be concise. Separate observed facts from estimates. Cite source filenames.
Use existing conversation tables and charts; do not invent missing values.
```

PDFs support headings, emphasis, lists, callouts, Markdown tables, code, repeated table headers, page numbers, and static vector charts. Wide tables split into labeled column groups with the first column repeated. Embedded fonts cover common Latin text; full multilingual typesetting and custom font uploads are not implemented. There is no arbitrary HTML/CSS template editor or remote image loading.

## Use through chat

- “Create an executive PDF report from these findings, with recommendations and the revenue chart.”
- “Make a data analysis report using the uploaded CSV table and the charts above.”
- “Revise the report: add a technical procedure section and shorten the summary.”

Frame generates the PDF directly and shows it with conversation downloads. Revisions create a new PDF; they do not overwrite previous files or edit a PDF in place.

`reports_sources` discovers current-conversation charts/datasets and scoped project documents, chat tables, and generated CSV/Markdown files. `reports_create` uses those IDs so the model does not need to repeat every table value. Tables may also be written as Markdown in the report narrative. References to saved charts and datasets work even if Charts has subsequently been disabled. Creating a new chart or calculating a grouped/filtered dataset still requires the Charts plugin. Reports itself does not rerun SQL, recalculate data, or execute model-supplied scripts.

PDF charts are static snapshots of the saved chart data, drawn in the report palette, rather than screenshots of the interactive browser view. Source limits and partial-result notices remain visible. Tables copied from assistant messages remain unverified model output.

## Limits and lifecycle

- Logo: PNG/JPEG up to 2 MiB and 12 megapixels; normalized locally to a maximum of 1000 × 500 pixels and 500 KB.
- Report: 40 requested blocks, 500 normalized blocks, and 3 MB of renderer input.
- Tables: up to 20 selected columns, 1,000 rows per table, and 3,000 table rows per report. Filter or summarize larger sources first.
- PDF: up to 100 pages and 8 MB. The local renderer has a 60-second wall-clock deadline plus CPU and memory limits.
- A report job blocks conflicting project deletion/settings changes. Stop cancels the active renderer; incomplete output is not published. Already completed files are retained.
- PDFs use the existing authenticated artifact download route. Deleting a conversation removes its PDFs; deleting a project also removes its report overrides and all conversation files.

If generation fails, check **Settings → Documents**, source sizes, and the tool result. A model can still choose invalid arguments or write a weak report; validate your own llama.cpp model's tool use and content quality. Automated coverage uses the real Pi SDK with a controlled local endpoint, not a production model.
