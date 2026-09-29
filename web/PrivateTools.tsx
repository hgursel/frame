import React, { useEffect, useState } from 'react';
import type {
  PrivateToolsSettings as Settings,
  PrivateTool,
  PrivateToolApproval,
} from '../shared/private-tools.js';
import { api } from './api.js';

export function PrivateToolsSettings() {
  const [form, setForm] = useState<Settings>();
  const [selected, setSelected] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  useEffect(() => {
    let live = true;
    void api<Settings>('/plugins/private-tools')
      .then((value) => {
        if (live) setForm(value);
      })
      .catch((e) => {
        if (live) setError(e.message);
      });
    return () => {
      live = false;
    };
  }, []);
  if (!form) return <p>{error || 'Loading Private Tools…'}</p>;
  const tool = form.tools[selected];
  const update = (value: Partial<PrivateTool>) =>
    setForm({
      ...form,
      tools: form.tools.map((t, i) => (i === selected ? { ...t, ...value } : t)),
    });
  return (
    <section className="plugin-card">
      <h2>Private Tools</h2>
      <p className="muted">Connect local scripts without publishing your integration.</p>
      <p className="muted small">
        Keep scripts and credentials outside the Frame repository. Register an executable wrapper
        that accepts JSON on stdin and returns text or JSON on stdout. Saving does not execute it.
      </p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError('');
          setNotice('');
          try {
            setForm(await api<Settings>('/plugins/private-tools', 'PUT', form));
            setNotice('Private Tools saved. Enable this plugin in Project settings.');
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <fieldset disabled={busy} className="settings-topic">
          <label className="checkbox">
            <input
              type="checkbox"
              checked={form.enabled}
              onChange={(e) => setForm({ ...form, enabled: e.target.checked })}
            />
            Enable Private Tools system-wide
          </label>
          <label>
            Private usage instructions
            <textarea
              rows={5}
              value={form.instructions}
              maxLength={8000}
              onChange={(e) => setForm({ ...form, instructions: e.target.value })}
              placeholder="Paste usage guidance from your SKILL.md. Do not include credentials."
            />
          </label>
          <p className="muted small">
            These instructions and tool descriptions are shared with your local model. Executable
            paths and .env contents are not.
          </p>
          <div className="form-row">
            <label>
              Registered operation
              <select
                value={selected}
                onChange={(e) => setSelected(Number(e.target.value))}
                disabled={!form.tools.length}
              >
                {!form.tools.length && <option value={0}>No operations yet</option>}
                {form.tools.map((t, i) => (
                  <option key={i} value={i}>
                    {t.name || `Operation ${i + 1}`}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              disabled={form.tools.length >= 20}
              onClick={() => {
                setSelected(form.tools.length);
                setForm({
                  ...form,
                  tools: [
                    ...form.tools,
                    {
                      id: `operation_${crypto.randomUUID().slice(0, 8)}`,
                      name: 'New operation',
                      description: '',
                      parameters: [],
                      executable: '',
                      args: [],
                      envFile: '',
                      approval: 'always',
                      timeoutSeconds: 60,
                      maxOutputBytes: 32000,
                    },
                  ],
                });
              }}
            >
              Add operation
            </button>
          </div>
          {tool && (
            <div className="private-tool-editor">
              <div className="form-row">
                <label>
                  Tool ID
                  <input
                    required
                    pattern="[a-z][a-z0-9_]{0,39}"
                    maxLength={40}
                    value={tool.id}
                    onChange={(e) => update({ id: e.target.value })}
                  />
                </label>
                <label>
                  Display name
                  <input
                    required
                    maxLength={80}
                    value={tool.name}
                    onChange={(e) => update({ name: e.target.value })}
                  />
                </label>
              </div>
              <label>
                Tool description
                <textarea
                  required
                  maxLength={2000}
                  rows={3}
                  value={tool.description}
                  onChange={(e) => update({ description: e.target.value })}
                  placeholder="Explain when to use this operation and what it returns."
                />
              </label>
              <label>
                Executable path
                <input
                  required
                  value={tool.executable}
                  onChange={(e) => update({ executable: e.target.value })}
                  placeholder="/opt/frame-private/my-integration/wrapper.sh"
                />
              </label>
              <label>
                Fixed arguments
                <textarea
                  rows={2}
                  value={tool.args.join('\n')}
                  onChange={(e) =>
                    update({ args: e.target.value ? e.target.value.split('\n') : [] })
                  }
                  placeholder="Optional. One argument per line; no shell expansion."
                />
              </label>
              <label>
                Environment file
                <input
                  value={tool.envFile}
                  onChange={(e) => update({ envFile: e.target.value })}
                  placeholder="/opt/frame-private/my-integration/.env"
                />
              </label>
              <p className="muted small">
                Optional absolute .env path. Use chmod 600 and grant the Frame account read access.
                Put credentials here, never in arguments, descriptions, or chat.
              </p>
              <h3>JSON inputs</h3>
              {!tool.parameters.length && (
                <p className="muted small">This operation takes an empty JSON object.</p>
              )}
              {tool.parameters.map((p, index) => {
                const parameter = (change: Partial<typeof p>) =>
                  update({
                    parameters: tool.parameters.map((v, i) =>
                      i === index ? { ...v, ...change } : v,
                    ),
                  });
                return (
                  <fieldset className="login-group" key={index}>
                    <legend>Input {index + 1}</legend>
                    <div className="form-row">
                      <label>
                        Input name
                        <input
                          required
                          pattern="[a-z][a-z0-9_]{0,39}"
                          value={p.name}
                          onChange={(e) => parameter({ name: e.target.value })}
                        />
                      </label>
                      <label>
                        Input type
                        <select
                          value={p.type}
                          onChange={(e) => parameter({ type: e.target.value as typeof p.type })}
                        >
                          <option value="string">Text</option>
                          <option value="number">Number</option>
                          <option value="boolean">True / false</option>
                        </select>
                      </label>
                    </div>
                    <label>
                      Input description
                      <input
                        maxLength={300}
                        value={p.description}
                        onChange={(e) => parameter({ description: e.target.value })}
                      />
                    </label>
                    <label className="checkbox">
                      <input
                        type="checkbox"
                        checked={p.required}
                        onChange={(e) => parameter({ required: e.target.checked })}
                      />
                      Required
                    </label>
                    <button
                      type="button"
                      onClick={() =>
                        update({ parameters: tool.parameters.filter((_, i) => i !== index) })
                      }
                    >
                      Remove input {index + 1}
                    </button>
                  </fieldset>
                );
              })}
              <button
                type="button"
                disabled={tool.parameters.length >= 20}
                onClick={() =>
                  update({
                    parameters: [
                      ...tool.parameters,
                      { name: '', description: '', type: 'string', required: true },
                    ],
                  })
                }
              >
                Add input
              </button>
              <h3>Execution</h3>
              <label>
                Approval
                <select
                  aria-label="Approval"
                  value={tool.approval}
                  onChange={(e) => update({ approval: e.target.value as PrivateTool['approval'] })}
                >
                  <option value="always">Ask every time (default)</option>
                  <option value="automatic">Run automatically</option>
                </select>
              </label>
              <p className="muted small">
                Automatic execution is your authorization for this operation. Frame cannot determine
                whether your script changes remote data.
              </p>
              <div className="form-row">
                <label>
                  Timeout (seconds)
                  <input
                    type="number"
                    min={1}
                    max={1800}
                    value={tool.timeoutSeconds}
                    onChange={(e) => update({ timeoutSeconds: Number(e.target.value) })}
                  />
                </label>
                <label>
                  Output limit (bytes)
                  <input
                    type="number"
                    min={1024}
                    max={131072}
                    value={tool.maxOutputBytes}
                    onChange={(e) => update({ maxOutputBytes: Number(e.target.value) })}
                  />
                </label>
              </div>
              <button
                type="button"
                className="danger-button"
                onClick={() => {
                  setForm({ ...form, tools: form.tools.filter((_, i) => i !== selected) });
                  setSelected(0);
                }}
              >
                Remove operation
              </button>
              <p className="muted small">
                Removing an operation changes Frame configuration only; it does not delete your
                local files.
              </p>
            </div>
          )}
          <p className="warning">
            Scripts run with the Frame account’s permissions. Keep general host tools disabled if
            the model should not access private files. Return only intended results; never print
            credentials. Normal chats retain tool output.
          </p>
          <button type="submit">Save Private Tools</button>
        </fieldset>
      </form>
      {notice && <p role="status">{notice}</p>}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}

export function PrivateApprovalCard({
  approval,
  chatId,
}: {
  approval: PrivateToolApproval;
  chatId: string;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  return (
    <section className="sql-approval" aria-label="Private tool approval">
      <h3>Allow {approval.name}?</h3>
      <pre>{JSON.stringify(approval.input, null, 2)}</pre>
      <p className="muted small">
        Allow once for these exact inputs. This operation may change the remote server. Stopping
        after execution starts cannot undo those changes.
      </p>
      <div className="button-row">
        {[false, true].map((approve) => (
          <button
            key={String(approve)}
            disabled={busy || Date.now() >= approval.expiresAt}
            onClick={async () => {
              setBusy(true);
              setError('');
              try {
                await api(
                  `/conversations/${chatId}/private-tool-approvals/${approval.id}`,
                  'POST',
                  { runId: approval.runId, approve },
                );
              } catch (e) {
                setError((e as Error).message);
                setBusy(false);
              }
            }}
          >
            {approve ? 'Allow once' : 'Deny tool'}
          </button>
        ))}
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
