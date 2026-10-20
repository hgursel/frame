import React, { useEffect, useState } from 'react';
import { api } from './api.js';
import type { ExcelLimits } from '../shared/excel.js';
type Config = { origin: string; https: boolean; limits: ExcelLimits; contextWindow: number };
export function ExcelSettings() {
  const [config, setConfig] = useState<Config>();
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    void api<Config>('/excel/config')
      .then(setConfig)
      .catch((e) => setError(e.message));
  }, []);
  return (
    <section className="library-panel" aria-label="Frame for Excel setup">
      <span className="settings-eyebrow">WINDOWS DESKTOP PILOT</span>
      <h2>Frame for Excel</h2>
      <p>
        Use your local model, project knowledge, and read-only SQL in Excel. Review every workbook
        change before applying it.
      </p>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {config && (
        <>
          <dl className="library-facts">
            <dt>Frame address</dt>
            <dd>{config.origin}</dd>
            <dt>Connection</dt>
            <dd>
              {config.https
                ? 'HTTPS configured — verify certificate trust on your Windows computer.'
                : 'HTTPS setup required before installation.'}
            </dd>
            <dt>Excel version</dt>
            <dd>Microsoft 365 Excel Desktop on Windows with ExcelApi 1.16.</dd>
            <dt>Access</dt>
            <dd>One administrator. Sign in inside Excel with your Frame password.</dd>
          </dl>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setError('');
              setSaved(false);
              try {
                const result = await api<{ limits: ExcelLimits }>(
                  '/excel/config',
                  'PUT',
                  config.limits,
                );
                setConfig({ ...config, limits: result.limits });
                setSaved(true);
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <h3>Workbook limits</h3>
            <p>
              Model context configured in Frame: {config.contextWindow.toLocaleString()} tokens.
              Large selections are supplied in compact sections, with room reserved for history and
              the response.
            </p>
            <label>
              Maximum cells per selection or proposal
              <input
                type="number"
                min={2000}
                max={500000}
                step={1}
                required
                value={config.limits.maxCells}
                onChange={(e) => {
                  setSaved(false);
                  setConfig({
                    ...config,
                    limits: { ...config.limits, maxCells: Number(e.target.value) },
                  });
                }}
              />
            </label>
            <label>
              Maximum columns
              <input
                type="number"
                min={100}
                max={4096}
                step={1}
                required
                value={config.limits.maxColumns}
                onChange={(e) => {
                  setSaved(false);
                  setConfig({
                    ...config,
                    limits: { ...config.limits, maxColumns: Number(e.target.value) },
                  });
                }}
              />
            </label>
            <p className="muted small">
              Recommended: 100,000 cells and 1,024 columns. Limits also apply to saved SQL imports.
              Selection transfers are capped at 12 MiB; SQL source data at 8 MiB. Model-generated
              output must still fit the response budget. Reopen the Excel pane after changing
              limits.
            </p>
            <button disabled={busy}>{busy ? 'Saving…' : 'Save Excel limits'}</button>
            {saved && <p role="status">Excel limits saved.</p>}
          </form>
          <ol>
            <li>
              Use a stable LAN hostname, such as <code>frame.test</code>, and add it to your Windows
              hosts file.
            </li>
            <li>
              Enable HTTPS on Frame’s reverse proxy. A self-signed certificate trusted on your
              Windows computer is suitable for this pilot. Set <code>FRAME_ORIGIN</code> to the
              exact HTTPS address and restart Frame.
            </li>
            <li>
              Download the XML manifest below and place it in a Windows shared folder accessible
              only to you.
            </li>
            <li>
              In Excel: File → Options → Trust Center → Trust Center Settings → Trusted Add-in
              Catalogs. Add the folder’s UNC path, enable Show in Menu, and restart Excel.
            </li>
            <li>
              Home → Add-ins → Advanced → Shared Folder → Frame for Excel → Add. Sign in, select a
              project, and capture a range.
            </li>
          </ol>
          <div className="library-catalog-actions">
            {config.https ? (
              <a className="button-link" href="/api/excel/manifest">
                Download Excel manifest
              </a>
            ) : (
              <button disabled>HTTPS required for manifest</button>
            )}
            <a href="/excel-setup" target="_blank" rel="noreferrer">
              HTTPS &amp; installation guide ↗
            </a>
          </div>
          <p className="muted small library-footnote">
            Local sideloading is Microsoft’s testing route. No Microsoft 365 Integrated Apps
            deployment is needed for this pilot. Workbook permissions cover the document; Frame
            enforces selection limits and preview-before-Apply. Office.js loads from Microsoft’s
            CDN. AI requests go to your Frame server and configured local model. Desktop Excel and
            real-model acceptance testing must be completed on your machine.
          </p>
        </>
      )}
    </section>
  );
}
