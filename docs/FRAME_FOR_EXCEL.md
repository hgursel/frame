> Multiuser update: sign in with your own Frame username and password. Complete temporary password changes in the main browser. Projects, sessions, attachments, and outputs are private to their owner. Admins configure global limits; project owners may disable Excel.

# Frame for Excel — Windows pilot

New projects start with Excel disabled. Enable **Frame for Excel** in **Project settings → Plugins** before connecting the add-in. Existing projects keep their previous enabled/disabled choice.


Frame for Excel is a private Office task-pane add-in for one administrator using Microsoft 365 Excel Desktop on Windows. It connects to your Frame server over trusted HTTPS. It uses the existing local llama.cpp model, selected project's knowledge/library references, and enabled read-only SQL connection. There is no Copilot requirement, cloud-model fallback, Microsoft Graph connection, or Microsoft 365 Integrated Apps deployment in this pilot.

## What is implemented

- Sign in with your Frame username and password, choose a project, and start an Excel conversation.
- **No Capture button is needed.** Send includes the current selected rectangle automatically. Blank sheets and single empty cells work; the selected top-left cell is the suggested starting point for new output. Switching cells or sheets does not start another conversation. The selection label follows Excel. Defaults are **100,000 cells and 1,024 columns**, configurable in **Settings → Frame for Excel** up to 500,000 cells and 4,096 columns. Both limits apply together. Transfers have a separate 12 MiB UTF-8 JSON ceiling including validation metadata. Reopen the pane after changing limits.
- The model receives bounded values plus sparse formulas, without duplicate literal formula values or number formats. The initial section is retained in the native conversation as a historical reference. `excel_read_selection` reads more of the initial capture; **`excel_read_workbook` reads live cells on any sheet in the same workbook**, lists sheets, and inspects table/chart metadata. These read-only requests are serviced by the originating authenticated Excel pane, require it to remain open, and expire after 90 seconds or when the run stops. It cannot access another workbook. Reads are limited to 10,000 cells / 64,000 bytes of returned cell context; metadata shares the same context budget. Prior snapshots may be stale, so Frame should reread live data when needed. Additional workbook reads appear in grouped activity.
- The configured model context includes conversation history, knowledge, tool definitions, and response space. A 256k context window does not guarantee every 100,000-cell selection fits at once. Initial context and subsequent section reads use conservative estimates; very large cells or long conversations can require a focused selection or a fresh conversation. No history is silently removed. Larger captures do not expand the model's output-token budget.
- Ask for explanations, formula corrections, cleanup, reconciliation, summaries, native Excel tables/charts, or project policy discussion with citations.
- Thinking and tool calls use Frame's grouped expandable activity display. The conversation scrolls independently while the composer and Send/Stop controls remain at the bottom.
- Preview one batch at a time. A compact **Review changes** card opens a separate panel with paginated cell previews, operation descriptions, and a persistent Apply/Reject footer. Full proposal data is fetched only when reviewed; status polling uses stored summaries. **`excel_edit_workbook` targets exact ranges on existing sheets**, independently of the currently selected cells. A values matrix replaces only its destination rectangle; formula-only edits preserve other cells. Formatting supports number formats, font bold/italic/size/color, fill, alignment, wrapping, row height, column width, and autofit. Tables can be created, resized, and restyled; named charts can be created or have their type, title, source, and position updated. Column/bar/line/pie charts are supported. New sheets remain available when requested. There is no arbitrary Office.js/code execution, sheet deletion, or macro execution.
- Sorting moves rows within an explicit rectangle, with a header option and multiple sort columns. Value filters and clearing filter criteria work on ranges and existing tables. Whole-row/column insertion or deletion uses the rows/columns touched by an explicit range. These structural changes get a separate single-operation batch because they shift later addresses and may adjust references elsewhere in Excel. Their previews inspect the current used range, which must fit configured snapshot limits. Other batches support up to 20 operations within the combined cell limit.
- SQL reads use existing project database allowlists, query policy, and read-only credentials. Writes and procedures are rejected even when the project otherwise enables them. Import by the saved operation ID: full captured rows are transferred directly, not reconstructed by the model from a preview. Imports use the configured cell/column limits (including headers) and an 8 MiB source-data ceiling. SQL row-limit truncation is labeled. Narrow larger queries first; do not repeat a write to recover data.
- Typed string cells remain literal text, including strings starting with `=`, `+`, `-`, or `@`. Explicit formulas are separate and restricted to supported built-in functions. External workbook links, network/custom functions, and array literals are excluded. ExcelApi 1.16 is required for typed cell writes; update Microsoft 365 Excel if the add-in reports an unsupported version.
- Existing-sheet proposals inspect their destinations before presenting the preview. Apply rechecks worksheet identity, values, formulas, number formats, used-range bounds, and basic table/chart metadata. Selecting another cell or sheet does not redirect a pending edit. Existing table cells are editable; protected sheets and merged/spill destinations still require an appropriate editable range. The check is optimistic, not an atomic transaction against coauthoring; it does not detect every chart property or mixed visual-format change. This remains a single-user pilot.
- A server-side one-time claim prevents repeated Apply requests. No operation is automatically replayed after reload, stop, or connection failure. Excel operations are not transactional: a failed batch may have partial effects. Unknown outcomes remain visibly marked and must be inspected manually. Save a copy before significant edits; automatic rollback and full native Undo integration are not claimed.

Large captures and writes use bounded rectangular batches. Apply validates reviewed destinations before writing and displays progress; interruption between batches may leave some cells changed. There is no automatic retry or rollback. Avoid editing the workbook while reads or Apply are running. Real Windows performance at the configured upper limits requires testing with representative workbooks.

Conversation history is saved in the selected Frame project using Pi sessions. Workbook context is reference data, never an instruction source or automatic knowledge import. Proposals and captured SQL imports are stored locally with the conversation and deleted with it. Closing/reloading the pane loses its in-memory workbook binding and starts a new Excel conversation; previous history remains viewable in Frame. Pending changes are never adopted by a different pane. Continue Excel conversations from the add-in, not from normal Frame chat. Host tools, skills, and PDF/chart plugins are disabled for Excel turns; charts here are native workbook charts. Knowledge edits remain explicit drafts in Frame.

Excel conversations are excluded from automatic project learning. To retain a useful method or policy explanation, open its history in Frame and explicitly save the reviewed content to knowledge. If Send loses its acknowledgment, **Retry original request** reuses its original request ID; it does not automatically rerun an accepted task. If Apply remains uncertain, inspect the workbook before closing the batch using the recovery button.

## Chat controls and attachments

The composer has one send arrow that becomes a stop button during a run. Enter sends; Shift+Enter adds a line. Activity appears in the conversation. Expand **Selected: …** for workbook capture details.

Review controls stay with the response that proposed the changes. After Apply or replacement, the compact entry offers **View changes**. To revise an unapplied proposal, send a follow-up: the accepted message marks the old proposal **Replaced**, with no workbook edits. Invalid or rejected submissions leave the old proposal available. A batch already being applied must finish or be resolved through its recovery control first.

Use **+** to upload CSV, TXT, Markdown, PDF, or DOCX files; select project knowledge; or upload images. PNG/JPEG/WebP uploads and pasted screenshots use Frame's existing image conversion and limits. Images require a vision-capable local model. Files stay in this conversation and are sent with your next message; they do not automatically enter project knowledge or import rows into the workbook. Up to five file/knowledge attachments and four images can be sent per message, including attachment-only messages. Large files are supplied as bounded excerpts with readers for additional sections.

Below the input, **Context** shows usage and the existing automatic compaction settings, plus **Compact now** when idle with no unresolved proposal. Compaction preserves visible history and does not replay workbook edits. **Open Frame** opens the main workspace, where context settings can be changed. Throughput shows the current/last response rate, marking estimates as in Frame. Project knowledge and database-schema retrieval behavior is unchanged.

## 1. Choose a hostname on your Windows computer

Keep the Frame server's IP stable. Open Notepad **as administrator**, open `C:\Windows\System32\drivers\etc\hosts` with the All files filter, and add a line replacing this example IP:

```text
192.168.1.50    frame.test
```

Save as `hosts`, without `.txt`. The examples below use `frame.test` and HTTPS port 443. If you choose a different hostname, use it consistently in the hosts entry, certificate SAN, proxy, and `FRAME_ORIGIN`. The hosts file maps names only; it does not enable TLS or trust a certificate.

## 2. Create a pilot certificate on the Frame Linux server

These are administrator-run deployment instructions, not commands executed automatically by Frame. Keep private keys outside the repository. Use a new directory if these files already exist; do not overwrite an active certificate. With OpenSSL installed:

```bash
sudo install -d -m 700 /etc/frame/tls
sudo openssl req -x509 -nodes -newkey rsa:3072 -sha256 -days 90 \
  -keyout /etc/frame/tls/frame.test.key \
  -out /etc/frame/tls/frame.test.crt \
  -subj '/CN=frame.test' \
  -addext 'subjectAltName=DNS:frame.test' \
  -addext 'extendedKeyUsage=serverAuth' \
  -addext 'keyUsage=digitalSignature,keyEncipherment'
sudo chmod 600 /etc/frame/tls/frame.test.key
sudo openssl x509 -in /etc/frame/tls/frame.test.crt -noout -fingerprint -sha256
```

Copy **only `frame.test.crt`** to your Windows computer over your existing trusted transfer method. Verify its SHA-256 certificate fingerprint against the server before trusting it. Keep `frame.test.key` on the server. Import the certificate into **Current User → Trusted Root Certification Authorities** using Windows certificate management (`certmgr.msc`). If your managed device requires a machine-wide trust store instead, use the corresponding administrator-managed certificate store. A certificate trusted by Edge should also be checked in the actual Excel WebView. Restart Excel after importing. Track the 90-day expiration and replace/retrust the certificate before it expires. An organizational CA certificate is preferable for a longer-lived deployment.

## 3. Put HTTPS in front of Frame

Use an existing reverse proxy or install Nginx through your normal administration process. Example Nginx server block (adapt to your existing configuration; do not replace unrelated sites):

```nginx
server {
    listen 443 ssl;
    server_name frame.test;
    ssl_certificate /etc/frame/tls/frame.test.crt;
    ssl_certificate_key /etc/frame/tls/frame.test.key;
    ssl_protocols TLSv1.2 TLSv1.3;
    client_max_body_size 32m;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $http_host;
        proxy_set_header X-Forwarded-Proto https;
        proxy_buffering off;
        proxy_read_timeout 3700s;
    }
}
```

Frame validates the exact host/origin; preserve the original Host header, including a nonstandard port if you use one. Frame does not trust forwarded headers for authorization. Do not strip its CSP, origin checks, or cookie flags. Keep port 3000 bound to loopback and restrict port 443 to your intended LAN/VPN access. This does not require exposing Frame to the public internet.

Set the deployment environment (for example in your existing `.env` or service configuration):

```dotenv
FRAME_HOST=127.0.0.1
FRAME_PORT=3000
FRAME_ORIGIN=https://frame.test
```

Remove `FRAME_ALLOW_HTTP_LAN` if it was previously enabled. Leave the existing data directory and model settings unchanged. Validate the proxy configuration (`sudo nginx -t` for Nginx), reload it, and restart Frame using your normal service procedure. From Windows, open `https://frame.test` and verify **no certificate warning**, then sign in. A previous HTTP session does not transfer; sign in again. llama.cpp remains a separate configured local endpoint.

## 4. Install locally in Windows Excel

1. In Frame, open **Settings → Frame for Excel** and download `frame-excel-manifest.xml`. The manifest is generated from `FRAME_ORIGIN`, never from a URL submitted by the browser. Downloading requires administrator sign-in and HTTPS configuration.
2. Create a folder on your Windows computer, such as `C:\FrameExcelPilot`, and share it with only your Windows account. Note its UNC path, for example `\\YOUR-PC\FrameExcelPilot`. Put the XML manifest there. Use account-specific permissions rather than an Everyone share.
3. In Excel, choose **File → Options → Trust Center → Trust Center Settings → Trusted Add-in Catalogs**. Add the UNC path as the catalog URL and select **Show in Menu**.
4. Close and restart Excel. Choose **Home → Add-ins → Advanced → Shared Folder**, select **Frame for Excel**, and choose **Add**. Menu wording may vary by Office update channel. The Home ribbon should show Frame for Excel on clients supporting add-in commands.
5. Sign in inside the pane using your **Frame password**, choose a project, and send a request. Selected cells are read automatically; a blank sheet is a valid starting point.

This uses Microsoft's XML add-in-only manifest and Windows shared-folder testing route. No tenant Integrated Apps deployment is required. Microsoft does not support shared-folder deployment for production add-ins; reassess distribution before broad/production rollout. The manifest declares `ReadWriteDocument`; Frame reads this workbook as needed and requires explicit Apply for edits. Company policies can still disable web add-ins or custom catalogs.

The add-in loads Office.js from `https://officeapis.public.onecdn.static.microsoft/1/office.js`; allow that Microsoft CDN on the Windows computer. The normal Frame UI retains its existing CSP. Only `/excel.html` allows the Office.js script origins; API authentication and same-origin checks remain unchanged. The add-in signs in as a same-origin desktop web client, with no embedded credentials or global CORS exception. The pilot is for Windows Desktop, not Office on the web or Mac. Standard Microsoft Office licensing, diagnostics, and any OneDrive sync are separate from Frame's local AI transport.

When the hostname/port or manifest ribbon settings change, download the updated manifest and remove/re-add the sideloaded add-in as Microsoft documents. App-code-only updates are served by Frame; restart the pane if an old version is cached. Never add a private key or password to the shared manifest folder.

## Acceptance checks on your Windows computer

Automated tests use a simulated Office host and a local mock model. They do not establish real Excel COM/WebView behavior or your local model's quality. Complete these checks on a disposable workbook before using business data:

1. Open Frame in Edge and Excel with trusted TLS; verify the ribbon button, login, project selection, automatic selection label, and sending from a blank worksheet without Capture.
2. Use a small expense table outside an Excel Table. Ask for a SUM formula. Inspect the preview, Apply once, and verify Excel recalculates the intended cell. Reject a second proposal and verify no changes occur.
3. Change a destination cell while a proposal is waiting. Apply must refuse the stale proposal. Test protected sheets, merged cells, and spill ranges. Test editing a value/formula inside an existing Excel Table: it should work on editable cells without requiring a new worksheet.
4. Ask for a new summary sheet, table, and explicitly requested chart. Verify values, formulas, header names, chart series, and that an existing sheet name is never overwritten. Formula calculation errors and Excel-specific feature differences require manual review.
5. Enable MSSQL for a test project using its read-only login. Ask for a small SELECT result imported to a new table. Compare full returned rows with the query result, including leading `=`, `+`, `-`, `@`, quotes, dates, Unicode, blanks, and numbers. Confirm text remains text and partial results are labeled. Attempt a database write: Excel must refuse it.
6. Ask a question supported by an attached policy/library pack. Verify relevant citations and no automatic project-knowledge additions.
7. Test Stop, expired sign-in, lost network during generation/Apply, pane reload, Save As, and two workbook windows. Never retry a batch marked applying/unknown; inspect the workbook and start a new session. No changes should happen merely by reopening a pane or viewing Frame chat.
8. Try 500 rows × 200 columns, then a wide selection up to 1,024 columns within the cell cap. Verify section bounds, representative values/formulas, paginated previews, composer visibility while scrolling, and the Apply footer at a narrow pane width. Confirm an interrupted multi-batch Apply is never replayed. Increase configurable limits only after testing performance on your Windows machine.
9. In one conversation, start on a blank sheet, generate content larger than the selected cell, switch selections/sheets, and ask a follow-up referencing earlier data. Request a read from a different sheet. Verify destinations do not move when selection changes. Test number formats, table/chart creation and updates, table filters, sorting with headers, and separate row/column insertion/deletion batches on a disposable workbook. Compare native Excel formula adjustments and table behaviors with the preview; the simulated host does not reproduce Excel's full calculation or reference-update engine.

10. Revise a pending proposal by sending a follow-up without Apply/Reject. Confirm the old proposal says Replaced, cannot be applied, and stays before the next turn. Verify applied changes also stay in history. Test an interrupted Send and retry: the replacement must not run twice.
11. Attach a knowledge page, CSV/TXT file, and screenshot (upload and paste). Confirm the model receives them, earlier attachments remain readable, and uploads do not appear in project knowledge. Open Context and compact an idle chat; visible messages and workbook values must remain unchanged. Check menus and errors at a 320-pixel pane width.

## Microsoft references

- [Windows shared-folder sideloading, HTTPS and trusted self-signed testing certificates](https://learn.microsoft.com/en-us/office/dev/add-ins/testing/create-a-network-shared-folder-catalog-for-task-pane-and-content-add-ins)
- [Office add-in-only XML manifests](https://learn.microsoft.com/en-us/office/dev/add-ins/develop/xml-manifest-overview)
- [Office.js CDN guidance](https://learn.microsoft.com/en-us/office/dev/add-ins/develop/referencing-the-javascript-api-for-office-library-from-its-cdn)
- [Excel JavaScript Range API](https://learn.microsoft.com/en-us/javascript/api/excel/excel.range)
