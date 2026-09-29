import React, { useEffect, useState } from 'react';
import { api } from './api.js';
import type { ProjectSkills, SkillEntry, SkillsCatalog } from '../shared/skills.js';

function SkillList({ skills }: { skills: SkillEntry[] }) {
  return (
    <ul className="skill-list">
      {skills.map((s) => (
        <li key={s.name}>
          <strong>{s.name}</strong>
          {!s.modelInvocation && <span className="skill-tag">/skill only</span>}
          <span>{s.description}</span>
          <code>{s.filePath}</code>
        </li>
      ))}
    </ul>
  );
}

export function SkillsSettings() {
  const [folders, setFolders] = useState(''),
    [catalog, setCatalog] = useState<SkillsCatalog>(),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(''),
    [error, setError] = useState('');
  const run = async (action: () => Promise<SkillsCatalog>, done: string) => {
    setBusy(true);
    setNotice('');
    setError('');
    try {
      const value = await action();
      setCatalog(value);
      setFolders(value.folders.join('\n'));
      setNotice(done);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    let live = true;
    void api<SkillsCatalog>('/skills')
      .then((value) => {
        if (!live) return;
        setCatalog(value);
        setFolders(value.folders.join('\n'));
      })
      .catch((e) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, []);
  return (
    <section className="plugin-card">
      <h2>Skills</h2>
      <p className="muted">Agent Skills · SKILL.md folders · Run with trusted agent tools</p>
      <p>
        Point Frame at folders of skills in the Agent Skills format used by OpenCode, Claude Code,
        and Pi: each skill is a folder with a <code>SKILL.md</code> and optional scripts. Enable
        skills per project. The model sees each skill’s name and description, reads the full
        instructions when a task matches, and runs its scripts with the project’s trusted agent
        tools. Type <code>/</code> in a chat to pick a skill directly.
      </p>
      <label>
        Skill folders
        <textarea
          rows={3}
          disabled={!catalog || busy}
          placeholder="/opt/frame-skills"
          value={folders}
          onChange={(e) => setFolders(e.target.value)}
        />
      </label>
      <p className="muted small">
        One absolute path per line, readable by the Linux account running Frame. Keep skills outside
        the Frame checkout. For credentials, keep a <code>chmod 600</code> <code>.env</code> in the
        skill and load it from your script; Frame does not read it. Trusted agent tools can read any
        file the Frame account can, so the model is not prevented from opening it.
      </p>
      <div className="button-row">
        <button
          disabled={!catalog || busy}
          onClick={() =>
            void run(
              () =>
                api<SkillsCatalog>('/skills', 'PUT', {
                  folders: folders
                    .split('\n')
                    .map((f) => f.trim())
                    .filter(Boolean),
                }),
              'Skill folders saved.',
            )
          }
        >
          Save skill folders
        </button>
        <button
          type="button"
          disabled={!catalog || busy}
          onClick={() => void run(() => api<SkillsCatalog>('/skills'), 'Skills rescanned.')}
        >
          Rescan
        </button>
      </div>
      {notice && <p role="status">{notice}</p>}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {catalog && (
        <>
          <h3>
            {catalog.skills.length} skill{catalog.skills.length === 1 ? '' : 's'} found
          </h3>
          {catalog.skills.length ? (
            <SkillList skills={catalog.skills} />
          ) : (
            <p className="muted small">No skills found in the configured folders.</p>
          )}
          {!!catalog.warnings.length && (
            <div className="warning" role="group" aria-label="Skill warnings">
              {catalog.warnings.map((w) => (
                <p key={w}>{w}</p>
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}

export function ProjectSkillsSettings({ projectId }: { projectId: string }) {
  const [value, setValue] = useState<ProjectSkills>(),
    [enabled, setEnabled] = useState<string[]>([]),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(''),
    [error, setError] = useState('');
  useEffect(() => {
    let live = true;
    void api<ProjectSkills>(`/projects/${projectId}/skills`)
      .then((v) => {
        if (!live) return;
        setValue(v);
        setEnabled(v.enabled);
      })
      .catch((e) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, [projectId]);
  return (
    <section className="plugin-card">
      <h2>Project skills</h2>
      {value && !value.hostTools && (
        <p className="warning">
          Skills run with trusted agent tools. Enable trusted agent tools above and save the project
          before selected skills become available in chat.
        </p>
      )}
      {value && !value.skills.length && (
        <p className="muted small">No skills found. Add skill folders in Settings → Plugins.</p>
      )}
      {value?.skills.map((s) => (
        <React.Fragment key={s.name}>
          <label className="checkbox">
            <input
              type="checkbox"
              aria-label={`Enable skill ${s.name}`}
              disabled={busy}
              checked={enabled.includes(s.name)}
              onChange={(e) =>
                setEnabled((names) =>
                  e.target.checked ? [...names, s.name] : names.filter((n) => n !== s.name),
                )
              }
            />
            {s.name}
          </label>
          <p className="muted small">{s.description}</p>
        </React.Fragment>
      ))}
      {value &&
        enabled
          .filter((name) => !value.skills.some((s) => s.name === name))
          .map((name) => (
            <div className="button-row" key={name}>
              <span>{name} — unavailable</span>
              <button
                type="button"
                aria-label={`Remove unavailable skill ${name}`}
                disabled={busy}
                onClick={() => setEnabled((names) => names.filter((n) => n !== name))}
              >
                Remove
              </button>
            </div>
          ))}
      {value && (
        <button
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setNotice('');
            setError('');
            try {
              const v = await api<ProjectSkills>(`/projects/${projectId}/skills`, 'PUT', {
                enabled,
              });
              setValue(v);
              setEnabled(v.enabled);
              setNotice('Project skills saved.');
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          Save project skills
        </button>
      )}
      {notice && <p role="status">{notice}</p>}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
    </section>
  );
}

/**
 * Typing `/` in the composer lists the project's enabled skills. Choosing one inserts
 * `/skill:name `, which Pi expands into the full SKILL.md for that turn.
 */
export function useSkillPicker(
  projectId: string | undefined,
  draft: string,
  setDraft: (value: string) => void,
  unavailable?: string,
) {
  const [project, setProject] = useState<{ id: string; value: ProjectSkills }>(),
    [active, setActive] = useState(0),
    [dismissed, setDismissed] = useState(false);
  const query = draft.match(/^\/(?:s|sk|ski|skil|skill|skill:)?([a-z0-9-]*)$/)?.[1];
  const typing = query !== undefined && !!projectId && !dismissed;
  useEffect(() => {
    if (!typing || !projectId) return;
    let live = true;
    // Refresh when the picker opens so project setting changes apply without a reload.
    void api<ProjectSkills>(`/projects/${projectId}/skills`)
      .then((value) => live && setProject({ id: projectId, value }))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [typing, projectId]);
  useEffect(() => setActive(0), [query]);
  useEffect(() => {
    if (!draft.startsWith('/')) setDismissed(false);
  }, [draft]);
  const value = project && project.id === projectId ? project.value : undefined;
  const reason =
    unavailable ||
    (value && !value.hostTools
      ? 'Skills need trusted agent tools. Enable them in Project settings.'
      : undefined);
  const options =
    value && !reason
      ? value.skills.filter((s) => value.enabled.includes(s.name) && s.name.includes(query || ''))
      : [];
  const open = typing && !!value && (!!reason || options.length > 0 || !!value.enabled.length);
  const pick = (name: string) => setDraft(`/skill:${name} `);
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!open) return false;
    if (e.key === 'Escape') setDismissed(true);
    else if (!options.length) return false;
    else if (e.key === 'ArrowDown') setActive((i) => (i + 1) % options.length);
    else if (e.key === 'ArrowUp') setActive((i) => (i - 1 + options.length) % options.length);
    else if ((e.key === 'Enter' && !e.shiftKey) || e.key === 'Tab')
      pick(options[Math.min(active, options.length - 1)]!.name);
    else return false;
    e.preventDefault();
    return true;
  };
  const element = open ? (
    <div className="skill-picker" role="listbox" aria-label="Skills">
      {reason ? (
        <p className="muted small">{reason}</p>
      ) : options.length ? (
        options.map((s, i) => (
          <div
            key={s.name}
            role="option"
            aria-selected={i === active}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => pick(s.name)}
          >
            <strong>/skill:{s.name}</strong>
            <span>{s.description}</span>
          </div>
        ))
      ) : (
        <p className="muted small">No enabled skill matches “{query}”.</p>
      )}
    </div>
  ) : null;
  return { element, onKeyDown };
}
