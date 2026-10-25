import React, { useEffect, useState } from 'react';
import { api } from './api.js';
import { EMAIL_FOOTER, type EmailDraft, type SmtpSettings } from '../shared/email.js';
import './email.css';
export function EmailSettings() {
  const [form, setForm] = useState<SmtpSettings>();
  const [password, setPassword] = useState('');
  const [clearPassword, setClear] = useState(false);
  const [domains, setDomains] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    void api<SmtpSettings>('/admin/email')
      .then((c) => {
        setForm(c);
        setDomains(c.domains.join('\n'));
      })
      .catch((e) => setError(e.message));
  }, []);
  if (!form) return <p role="status">{error || 'Loading email settings…'}</p>;
  return (
    <section className="email-settings">
      <h2>Email</h2>
      <p>
        Send internal emails from any project after the user reviews the draft and clicks Send.
        Replies are not monitored.
      </p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError('');
          setNotice('');
          try {
            const { hasPassword, ...settings } = form;
            const result = await api<SmtpSettings>('/admin/email', 'PUT', {
              ...settings,
              domains: domains
                .split(/[\n,]+/)
                .map((s) => s.trim())
                .filter(Boolean),
              password,
              clearPassword,
            });
            setForm(result);
            setPassword('');
            setClear(false);
            setNotice('Email settings saved.');
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <fieldset disabled={busy}>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={form.enabled}
              onChange={(e) => setForm({ ...form, enabled: e.target.checked })}
            />
            Enable email in all projects
          </label>
          <div className="email-settings-grid">
            <label>
              SMTP host
              <input
                value={form.host}
                onChange={(e) => setForm({ ...form, host: e.target.value })}
                placeholder="smtp.example.com"
              />
            </label>
            <label>
              SMTP port
              <input
                type="number"
                min={1}
                max={65535}
                required
                value={form.port}
                onChange={(e) => setForm({ ...form, port: Number(e.target.value) })}
              />
            </label>
            <label>
              Encryption
              <select
                value={form.security}
                onChange={(e) =>
                  setForm({ ...form, security: e.target.value as SmtpSettings['security'] })
                }
              >
                <option value="starttls">STARTTLS (usually 587 or 25)</option>
                <option value="tls">TLS (usually 465)</option>
                <option value="none">None — internal relay only</option>
              </select>
            </label>
            <label>
              SMTP username
              <input
                autoComplete="off"
                value={form.username}
                onChange={(e) => setForm({ ...form, username: e.target.value })}
                placeholder="Leave blank for an unauthenticated relay"
              />
            </label>
            <label>
              SMTP password
              <input
                type="password"
                autoComplete="new-password"
                value={password}
                placeholder={form.hasPassword ? 'Saved — leave blank to keep' : 'Optional'}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
            <label className="checkbox">
              <input
                type="checkbox"
                checked={clearPassword}
                onChange={(e) => setClear(e.target.checked)}
              />
              Clear saved SMTP password
            </label>
            <label>
              Sender display name
              <input
                value={form.fromName}
                onChange={(e) => setForm({ ...form, fromName: e.target.value })}
                maxLength={120}
              />
            </label>
            <label>
              Sender email
              <input
                type="email"
                value={form.fromEmail}
                onChange={(e) => setForm({ ...form, fromEmail: e.target.value })}
                placeholder="no-reply@example.com"
              />
            </label>
          </div>
          <label>
            Approved recipient domains
            <textarea
              rows={4}
              value={domains}
              onChange={(e) => setDomains(e.target.value)}
              placeholder="example.com"
            />
          </label>
          <p className="muted">
            One domain per line. Subdomains must be listed separately. TLS certificates are
            verified. Configure reply rejection on your mail server if needed.
          </p>
        </fieldset>
        <div className="button-row settings-actions">
          <button className="primary" disabled={busy}>
            Save email settings
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setError('');
              setNotice('');
              try {
                const r = await api<{ message: string }>('/admin/email/verify', 'POST', {});
                setNotice(r.message);
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            Test saved connection
          </button>
        </div>
      </form>
      {notice && <p role="status">{notice}</p>}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
    </section>
  );
}
export function EmailDrafts({ chatId, drafts }: { chatId: string; drafts: EmailDraft[] }) {
  return (
    <div className="email-drafts">
      {drafts.map((d) => (
        <EmailCard key={d.id} chatId={chatId} incoming={d} />
      ))}
    </div>
  );
}
function EmailCard({ chatId, incoming }: { chatId: string; incoming: EmailDraft }) {
  const [editRevision, setEditRevision] = useState(incoming.revision);
  const [draft, setDraft] = useState(incoming);
  const [editing, setEditing] = useState(false);
  const [to, setTo] = useState(incoming.to.join(', '));
  const [subject, setSubject] = useState(incoming.subject);
  const [body, setBody] = useState(incoming.body);
  const [selected, setSelected] = useState(incoming.attachments.map((a) => a.name));
  const [outputs, setOutputs] = useState<{ name: string; bytes: number }[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    setDraft(incoming);
  }, [incoming]);
  const apply = async (action: string) => {
    setBusy(true);
    setError('');
    try {
      setDraft(
        await api<EmailDraft>(`/conversations/${chatId}/emails/${draft.id}/${action}`, 'POST', {
          revision: draft.revision,
        }),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const active = draft.status === 'draft' || draft.status === 'sending';
  return (
    <details className="email-card" open={active || editing}>
      <summary>
        Email · {draft.subject} ·{' '}
        {draft.status === 'accepted'
          ? 'Accepted by SMTP'
          : draft.status === 'draft'
            ? 'Awaiting confirmation'
            : draft.status}
      </summary>
      {editing ? (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError('');
            try {
              setDraft(
                await api<EmailDraft>(`/conversations/${chatId}/emails/${draft.id}`, 'PATCH', {
                  revision: editRevision,
                  to: to
                    .split(/[,;\n]+/)
                    .map((s) => s.trim())
                    .filter(Boolean),
                  subject,
                  body,
                  attachments: selected,
                }),
              );
              setEditing(false);
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <fieldset disabled={busy}>
            <label>
              To
              <input
                required
                value={to}
                onChange={(e) => setTo(e.target.value)}
                placeholder="person@example.com, another@example.com"
              />
            </label>
            <label>
              Subject
              <input
                required
                maxLength={250}
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
              />
            </label>
            <label>
              Message
              <textarea
                required
                rows={8}
                maxLength={50000}
                value={body}
                onChange={(e) => setBody(e.target.value)}
              />
            </label>
            <p>
              <strong>Generated attachments</strong>
            </p>
            {outputs.map((a) => (
              <label key={a.name} className="checkbox">
                <input
                  type="checkbox"
                  checked={selected.includes(a.name)}
                  onChange={(e) =>
                    setSelected(
                      e.target.checked
                        ? [...selected, a.name]
                        : selected.filter((n) => n !== a.name),
                    )
                  }
                />
                {a.name} · {Math.ceil(a.bytes / 1024)} KB
              </label>
            ))}
          </fieldset>
          <div className="button-row">
            <button disabled={busy} className="primary">
              Save draft for review
            </button>
            <button disabled={busy} type="button" onClick={() => setEditing(false)}>
              Discard edits
            </button>
          </div>
        </form>
      ) : (
        <>
          <p>
            <strong>From:</strong> {draft.from.name} &lt;{draft.from.address}&gt;
          </p>
          <p>
            <strong>To:</strong> {draft.to.join(', ')}
          </p>
          <p>
            <strong>Subject:</strong> {draft.subject}
          </p>
          <div className="email-body">{draft.body}</div>
          <p className="muted">{EMAIL_FOOTER}</p>
          <p>
            <strong>Attachments:</strong>{' '}
            {draft.attachments.length
              ? draft.attachments.map((a) => (
                  <span key={a.name}>
                    <a
                      href={`/api/conversations/${chatId}/artifacts/${encodeURIComponent(a.name)}`}
                      target="_blank"
                      rel="noreferrer noopener"
                    >
                      {a.name}
                    </a>{' '}
                    ({Math.ceil(a.bytes / 1024)} KB){' '}
                  </span>
                ))
              : 'None'}
          </p>
          {draft.status === 'draft' && (
            <div className="button-row">
              <button className="primary" disabled={busy} onClick={() => void apply('send')}>
                Send email
              </button>
              <button
                disabled={busy}
                onClick={async () => {
                  setError('');
                  setBusy(true);
                  try {
                    setOutputs(await api(`/conversations/${chatId}/email/outputs`));
                    setEditRevision(draft.revision);
                    setTo(draft.to.join(', '));
                    setSubject(draft.subject);
                    setBody(draft.body);
                    setSelected(draft.attachments.map((a) => a.name));
                    setEditing(true);
                  } catch (e) {
                    setError((e as Error).message);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Edit draft
              </button>
              <button disabled={busy} onClick={() => void apply('cancel')}>
                Cancel email
              </button>
            </div>
          )}
        </>
      )}
      <p role="status">
        {draft.status === 'sending'
          ? 'Sending to SMTP…'
          : draft.status === 'cancelled'
            ? 'Email cancelled. Nothing was sent.'
            : draft.message}
      </p>
      {!!draft.accepted.length && <p>Accepted: {draft.accepted.join(', ')}</p>}
      {!!draft.rejected.length && <p>Rejected: {draft.rejected.join(', ')}</p>}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
    </details>
  );
}
