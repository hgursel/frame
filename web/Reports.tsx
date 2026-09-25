import React, { useEffect, useState } from 'react';
import { api } from './api.js';
import type { ReportProfile, ReportSettings } from '../shared/reports.js';
import './reports.css';
export function ReportsSettings({ projectId }: { projectId?: string }) {
  const endpoint = projectId ? `/projects/${projectId}/reports` : '/plugins/reports';
  const [settings, setSettings] = useState<ReportSettings>();
  const [form, setForm] = useState<ReportProfile>();
  const [overrides, setOverrides] = useState<Partial<ReportProfile>>({});
  const [enabled, setEnabled] = useState(false),
    [tab, setTab] = useState('branding');
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [notice, setNotice] = useState('');
  const load = (value: ReportSettings) => {
    setSettings(value);
    setForm(value.profile);
    setOverrides(value.overrides);
    setEnabled(value.enabled);
  };
  useEffect(() => {
    let live = true;
    void api<ReportSettings>(endpoint)
      .then((v) => {
        if (live) load(v);
      })
      .catch((e) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, [endpoint]);
  if (!form || !settings) return <p role="status">{error || 'Loading report settings…'}</p>;
  const change = <K extends keyof ReportProfile>(key: K, value: ReportProfile[K]) => {
    setForm({ ...form, [key]: value });
    if (projectId) setOverrides({ ...overrides, [key]: value });
  };
  const inherited = (key: keyof ReportProfile) => !!projectId && !(key in overrides);
  const reset = (key: keyof ReportProfile) => {
    const next = { ...overrides };
    delete next[key];
    setOverrides(next);
    setForm({ ...form, [key]: settings.defaults[key] });
  };
  const field = (key: keyof ReportProfile, label: string, control: React.ReactNode) => (
    <div className="report-field">
      <label>
        {label}
        {control}
      </label>
      {projectId && (
        <small>
          {inherited(key) ? (
            'Organization default'
          ) : (
            <button type="button" onClick={() => reset(key)}>
              Use organization default
            </button>
          )}
        </small>
      )}
    </div>
  );
  const action = async (work: () => Promise<void>) => {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await work();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="plugin-card report-settings">
      <h2>{projectId ? 'Report design overrides' : 'Reports'}</h2>
      <p className="muted">Branded PDF reports · Charts and tables · Local generation</p>
      {projectId ? (
        <p>
          Fields inherit organization defaults until you change them. Reset any field to follow
          future organization updates.
        </p>
      ) : (
        <label className="checkbox">
          <input
            aria-label="Enable Reports system-wide"
            type="checkbox"
            checked={enabled}
            disabled={busy}
            onChange={(e) => setEnabled(e.target.checked)}
          />
          Enable Reports system-wide
        </label>
      )}
      <nav className="report-topics" aria-label="Report settings topics">
        {['branding', 'layout', 'instructions'].map((name) => (
          <button type="button" key={name} aria-pressed={tab === name} onClick={() => setTab(name)}>
            {name[0].toUpperCase() + name.slice(1)}
          </button>
        ))}
      </nav>
      <fieldset disabled={busy}>
        <div hidden={tab !== 'branding'}>
          {field(
            'organization',
            'Organization name',
            <input
              value={form.organization}
              maxLength={120}
              onChange={(e) => change('organization', e.target.value)}
            />,
          )}
          {field(
            'label',
            'Report label',
            <input
              value={form.label}
              maxLength={80}
              onChange={(e) => change('label', e.target.value)}
            />,
          )}
          <div className="report-colors">
            {(['primary', 'secondary', 'accent'] as const).map((key) => (
              <React.Fragment key={key}>
                {field(
                  key,
                  `${key[0].toUpperCase() + key.slice(1)} color`,
                  <input
                    aria-label={`${key} report color`}
                    type="color"
                    value={form[key]}
                    onChange={(e) => change(key, e.target.value)}
                  />,
                )}
              </React.Fragment>
            ))}
          </div>
          <div className="report-logo-box">
            {settings.logo ? (
              <img src={`data:image/png;base64,${settings.logo}`} alt="Report logo" />
            ) : (
              <p className="muted">No logo uploaded</p>
            )}
            <label>
              Upload report logo
              <input
                type="file"
                accept="image/png,image/jpeg"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = '';
                  if (!file) return;
                  void action(async () => {
                    const body = new FormData();
                    body.append('file', file);
                    const next = await api<ReportSettings>(endpoint + '/logo', 'POST', body);
                    setSettings(next);
                    setNotice('Logo saved. Other design changes still need Save.');
                  });
                }}
              />
            </label>
            <small>
              PNG or JPEG, up to 2 MiB. Logo changes save immediately.{' '}
              {settings.logoInherited ? 'Using organization logo.' : ''}
            </small>
            <div className="row-actions">
              <button
                type="button"
                onClick={() =>
                  void action(async () => {
                    const next = await api<ReportSettings>(endpoint + '/logo', 'DELETE', {});
                    setSettings(next);
                    setNotice('Logo removed.');
                  })
                }
              >
                Remove logo
              </button>
              {projectId && (
                <button
                  type="button"
                  onClick={() =>
                    void action(async () => {
                      const next = await api<ReportSettings>(endpoint + '/logo', 'DELETE', {
                        inherit: true,
                      });
                      setSettings(next);
                      setNotice('Organization logo restored.');
                    })
                  }
                >
                  Use organization logo
                </button>
              )}
            </div>
          </div>
        </div>
        <div hidden={tab !== 'layout'}>
          {field(
            'template',
            'Default report layout',
            <select
              value={form.template}
              onChange={(e) => change('template', e.target.value as ReportProfile['template'])}
            >
              <option value="executive">Executive summary</option>
              <option value="analytical">Data analysis</option>
              <option value="technical">Technical report</option>
            </select>,
          )}
          {field(
            'paper',
            'Paper size',
            <select
              value={form.paper}
              onChange={(e) => change('paper', e.target.value as ReportProfile['paper'])}
            >
              <option value="letter">US Letter</option>
              <option value="a4">A4</option>
            </select>,
          )}
          {field(
            'landscape',
            'Landscape pages',
            <input
              type="checkbox"
              checked={form.landscape}
              onChange={(e) => change('landscape', e.target.checked)}
            />,
          )}
          {field(
            'cover',
            'Separate cover page',
            <input
              type="checkbox"
              checked={form.cover}
              onChange={(e) => change('cover', e.target.checked)}
            />,
          )}
          {field(
            'footer',
            'Footer text',
            <input
              value={form.footer}
              maxLength={160}
              placeholder="Department or confidentiality label"
              onChange={(e) => change('footer', e.target.value)}
            />,
          )}
          <p className="muted">
            Wide tables split into labeled column groups. Table headers repeat on new pages. Saved
            charts render as static vector graphics.
          </p>
        </div>
        <div hidden={tab !== 'instructions'}>
          {field(
            'instructions',
            'Report instructions (Markdown)',
            <textarea
              rows={14}
              value={form.instructions}
              maxLength={12000}
              placeholder={
                '## Required sections\nExecutive summary, findings, recommendations\n\n## Writing style\nConcise, cite sources, distinguish facts from estimates.'
              }
              onChange={(e) => change('instructions', e.target.value)}
            />,
          )}
          <p className="muted">
            Tell the model which titles, sections, descriptions, and writing style to use. Visual
            layout follows the design controls. No HTML or CSS is required.
          </p>
        </div>
        <div className="row-actions">
          <button
            type="button"
            onClick={() =>
              void action(async () => {
                load(
                  await api<ReportSettings>(
                    endpoint,
                    'PUT',
                    projectId ? { overrides } : { enabled, profile: form },
                  ),
                );
                setNotice('Report settings saved.');
              })
            }
          >
            Save report settings
          </button>
          <button
            type="button"
            disabled={settings.runtime.state !== 'ready'}
            onClick={() =>
              void action(async () => {
                const response = await fetch('/api' + endpoint + '/sample', {
                  method: 'POST',
                  credentials: 'same-origin',
                  headers: { 'Content-Type': 'application/json' },
                  body: '{}',
                  signal: AbortSignal.timeout(65000),
                });
                if (!response.ok)
                  throw new Error((await response.json()).error || 'Sample failed.');
                const url = URL.createObjectURL(await response.blob());
                const a = document.createElement('a');
                a.href = url;
                a.download = 'report-design-sample.pdf';
                a.click();
                setTimeout(() => URL.revokeObjectURL(url), 1000);
                setNotice('Sample PDF downloaded using saved settings.');
              })
            }
          >
            Download saved-design sample
          </button>
        </div>
      </fieldset>
      <p className="muted small">
        {settings.runtime.message}
        {settings.runtime.state !== 'ready'
          ? ' Open Settings → Documents to set up the local document runtime.'
          : ' No host-tool permission is needed.'}
      </p>
      {busy && <p role="status">Working…</p>}
      {notice && <p role="status">{notice}</p>}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
