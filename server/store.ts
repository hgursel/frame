import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, chmodSync, readFileSync, writeFileSync, renameSync, existsSync } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { Conversation, Project, StoredSettings } from '../shared/types.js';

export const defaults: StoredSettings = {
  baseUrl: 'http://127.0.0.1:8080/v1',
  modelId: '',
  contextWindow: 32768,
  maxTokens: 4096,
  autoCompaction: true,
  compactAtPercent: 75,
  pruneToolOutputs: true,
  apiKey: '',
  instructions: 'Be accurate, practical, and transparent about uncertainty.',
};

export class Store {
  readonly db: DatabaseSync;
  ephemeralBranch?: (id: string) => any[];
  constructor(readonly root: string) {
    mkdirSync(root, { recursive: true, mode: 0o700 });
    chmodSync(root, 0o700);
    for (const sub of ['projects', 'sessions', 'agent'])
      mkdirSync(path.join(root, sub), { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(path.join(root, 'frame.db'));
    this.db.exec(`
      PRAGMA journal_mode=WAL;
      PRAGMA foreign_keys=ON;
      PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS meta(key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS logins(token TEXT PRIMARY KEY, expires INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS projects(id TEXT PRIMARY KEY, name TEXT NOT NULL, instructions TEXT NOT NULL, toolsEnabled INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS conversations(id TEXT PRIMARY KEY, projectId TEXT NOT NULL REFERENCES projects(id), title TEXT NOT NULL, createdAt TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS runs(id TEXT PRIMARY KEY, conversationId TEXT NOT NULL REFERENCES conversations(id), status TEXT NOT NULL, error TEXT, createdAt INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS documents(id TEXT PRIMARY KEY, projectId TEXT NOT NULL REFERENCES projects(id), name TEXT NOT NULL, kind TEXT NOT NULL, extension TEXT NOT NULL, bytes INTEGER NOT NULL, revision TEXT NOT NULL, truncated INTEGER NOT NULL, updatedAt TEXT NOT NULL);
      PRAGMA user_version=2;
    `);
    if (
      !(this.db.prepare('PRAGMA table_info(conversations)').all() as any[]).some(
        (c) => c.name === 'incognito',
      )
    )
      this.db.exec('ALTER TABLE conversations ADD COLUMN incognito INTEGER NOT NULL DEFAULT 0');
    chmodSync(path.join(root, 'frame.db'), 0o600);
    this.db
      .prepare(
        "UPDATE runs SET status='interrupted', error='Frame restarted before this run completed. Review the conversation before retrying.' WHERE status='running'",
      )
      .run();
  }
  meta(key: string): string | undefined {
    return (
      this.db.prepare('SELECT value FROM meta WHERE key=?').get(key) as
        { value: string } | undefined
    )?.value;
  }
  setMeta(key: string, value: string) {
    this.db.prepare('INSERT OR REPLACE INTO meta VALUES (?, ?)').run(key, value);
  }
  settings(): StoredSettings {
    const file = path.join(this.root, 'settings.json');
    return existsSync(file)
      ? { ...defaults, ...JSON.parse(readFileSync(file, 'utf8')) }
      : { ...defaults };
  }
  saveSettings(value: StoredSettings) {
    const file = path.join(this.root, 'settings.json');
    writeFileSync(`${file}.tmp`, JSON.stringify(value, null, 2), { mode: 0o600 });
    renameSync(`${file}.tmp`, file);
  }
  projects(): Project[] {
    return (
      this.db.prepare('SELECT * FROM projects ORDER BY name').all() as unknown as Project[]
    ).map((p) => ({ ...p, toolsEnabled: !!p.toolsEnabled }));
  }
  project(id: string) {
    return this.projects().find((p) => p.id === id);
  }
  createProject(input: Omit<Project, 'id'>) {
    const project = { id: randomUUID(), ...input };
    mkdirSync(this.projectPath(project.id), { recursive: true, mode: 0o700 });
    this.db
      .prepare('INSERT INTO projects VALUES (?, ?, ?, ?)')
      .run(project.id, project.name, project.instructions, Number(project.toolsEnabled));
    return project;
  }
  updateProject(id: string, input: Omit<Project, 'id'>) {
    this.db
      .prepare('UPDATE projects SET name=?, instructions=?, toolsEnabled=? WHERE id=?')
      .run(input.name, input.instructions, Number(input.toolsEnabled), id);
    return this.project(id)!;
  }
  projectPath(id: string) {
    return path.join(this.root, 'projects', id);
  }
  conversations(): Conversation[] {
    return this.db
      .prepare('SELECT * FROM conversations ORDER BY createdAt DESC')
      .all() as unknown as Conversation[];
  }
  conversation(id: string) {
    return this.db.prepare('SELECT * FROM conversations WHERE id=?').get(id) as unknown as
      Conversation | undefined;
  }
  createConversation(projectId: string, incognito = false) {
    const conversation: Conversation = {
      id: randomUUID(),
      projectId,
      title: incognito ? 'Incognito chat' : 'New conversation',
      incognito,
      createdAt: new Date().toISOString(),
    };
    this.db
      .prepare(
        'INSERT INTO conversations(id,projectId,title,createdAt,incognito) VALUES (?, ?, ?, ?, ?)',
      )
      .run(
        conversation.id,
        projectId,
        conversation.title,
        conversation.createdAt,
        Number(incognito),
      );
    return conversation;
  }
  sessionFile(id: string) {
    return path.join(this.root, 'sessions', `${id}.jsonl`);
  }
  artifacts(conversation: Conversation) {
    return path.join(this.projectPath(conversation.projectId), 'outputs', conversation.id);
  }
  close() {
    this.db.close();
  }
}
