# Frame for Browser

Frame's Chrome extension connects an employee's browser to their personal Frame account over trusted HTTPS. Use the side panel or the Frame website to continue the same project conversation. The model stays on the administrator-configured OpenAI-compatible endpoint.

## Enable and install

1. Update Frame and run `npm ci && npm run build`. This also builds `dist/browser-extension/` and `dist/frame-browser.zip`. Start/restart Frame normally.
2. In **Admin → Frame for Browser**, enable browser capability for all accounts. It is disabled by default.
3. Each project owner enables **Frame for Browser** under **Project settings → Plugins**.
4. In **Settings → Frame for Browser**, download the extension ZIP and unzip it to a durable folder on Windows.
5. In Chrome, open `chrome://extensions`, enable Developer mode, choose **Load unpacked**, and select the extracted folder containing `manifest.json`. Pin Frame in the toolbar if desired.
6. Each user creates their own pairing code in Frame Settings, opens the Frame extension, and enters their HTTPS Frame address and the code. Codes are single use, expire in ten minutes, and must be kept private. The extension does not request the user's Frame password.
7. Select a project and conversation (or create one). Bring the desired website tab to the front, then choose **Attach current tab** in the side panel. Repeat for additional tabs. Only attached tabs and tabs created for the task are available to that conversation.

Requires Chrome 120+ on Windows and a certificate trusted by Chrome. Test the current managed Chrome build and organizational extension policies before distribution. The extension package supports all Frame accounts; it does not automatically install on employee computers. Managed deployment/signing or Web Store publication is a separate distribution step. Chrome policies may prohibit unpacked extensions. The server's download route expects the normal repository working directory, matching `npm start`.

No desktop helper or additional model server is required. The extension polls the configured Frame server, not a third-party relay. Browser credentials expire after 30 days and can be revoked in Settings. Website passwords/cookies are not exported; normal existing browser sessions are used.

## Use

Ask Frame to read a page, extract a table, find a record, navigate, fill fields, or prepare changes. Page text and controls receive short-lived references; Frame rereads pages as they change. Open shadow roots and injectable frames are included. New task tabs and recognized popups are grouped under **Frame task**. Browser controls show attached tabs, online status, reviews, and Disconnect. **Open this conversation in Frame** opens the same chat in the main website.

Website-changing operations show a review with exact actions, targets, site addresses, and field values. One approval covers only the displayed batch. Execution stops after a failed/uncertain action and reports completed actions separately; batches are not transactions and cannot generally be rolled back. Approvals expire after fifteen minutes. A changed target or human interaction with the page invalidates prepared actions. Dependent actions on a future page require a fresh snapshot and, when consequential, another review.

Reading, normal link navigation, scrolling, and recognizable search controls do not prompt. Unknown fields and controls are conservatively reviewed because some websites autosave on input. Search/navigation classification is a best-effort interpretation of the DOM, **not a guarantee that a website cannot change state**. Review the target site's behavior during acceptance, especially unusual GET endpoints, custom search handlers, and autosaving forms. No arbitrary JavaScript evaluation, raw CDP tool, cookie API, filesystem access, file upload, or website download tool is exposed to the model.

Login, MFA, CAPTCHA, protected fields, and unsupported controls use **Continue** handoffs. The user acts in the website and then resumes the agent. Some applications require trusted input events, closed shadow roots, custom controls, or browser-native dialogs that this first version cannot automate; handoff is the fallback. It does not promise compatibility with every website.

Snapshots include bounded visible text, tables as page text, and up to 300 interactive controls, including select options. Truncation is explicit and returned text is additionally budgeted for the model context. Screenshots require image support in Admin → Model; they use Chrome's debugger screenshot API and may show Chrome's debugging notice. Screenshots are viewport captures, not full-page captures. Chrome may prevent debugger attachment on managed/restricted pages or when another debugger is attached.

## Data and isolation

- Each browser is paired to one Frame account. Ownership checks apply to projects, chats, images, approvals, command claims, and results. Browser tokens cannot administer Frame, send email, or approve SQL writes.
- Tabs are assigned to one conversation per device. The model cannot select another account's browser. The extension refuses to automate the configured Frame website itself and exposes no public website messaging endpoint.
- Browser-used conversations remain excluded from nightly knowledge/method learning, even after disconnect/revocation. Extracts and screenshots used by tools are persisted in the authoritative Pi conversation. Derived assistant prose is also excluded from automatic learning. Use the main Frame UI's explicit Save to knowledge workflow when desired.
- Website content remains untrusted reference data. Attached-browser runs do not expose host shell/file tools, preventing those tools from bypassing browser approvals. Other explicitly enabled built-in tools keep their own controls.
- Commands are delivered once. A failed delivery/result is not retried automatically. Before each execute command, the extension verifies that the server still considers it live. Stop cannot undo an already dispatched website action.
- Disconnect cancels pending reviews/commands. Browser/service-worker or server restarts require explicit reattachment. Keep Chrome running and the Frame side panel open for reliable responsiveness. Background worker suspension or sleeping computers may cause timeout; no offline/scheduled browser execution is provided.
- Paired-device secrets are hashed on the server and stored in Chrome extension-local storage accessible only to trusted extension contexts. Local machine administrators still control browser profiles and the Frame data directory.

## Development and acceptance

- `npm run check`
- `npm test` includes authorization, single-delivery, cancellation, partial outcome, retention, and real Pi SDK integration tests against a simulated device.
- `npm run build` builds Frame and the distributable extension; `npm run build:browser` builds only the extension.
- `npm run test:browser-extension` loads the real extension in Chromium and runs a local fixture website through the real Pi worker with a deterministic model. It checks shared approval from the main UI, form updates, screenshots, credential-field exclusion, and stale-target rejection. Set `FRAME_BROWSER_EXECUTABLE` for a local Chromium binary. CI installs full Chromium, not only the headless shell.

Before broad internal use, validate on Windows Chrome with the actual model: login/MFA, navigation and popups, tables, iframe/custom controls, ordinary forms, autosave, review accuracy, Stop, network interruption after submission, revoked/disabled accounts, and two users working simultaneously. Automated fixture tests do not establish compatibility with private company websites or the production model.
