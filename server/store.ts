import { DatabaseSync } from 'node:sqlite';
import {
  mkdirSync,
  chmodSync,
  readFileSync,
  realpathSync,
  writeFileSync,
  renameSync,
  existsSync,
  rmSync,
} from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { hashPassword } from './security.js';
import type { Conversation, Project, StoredSettings } from '../shared/types.js';

export const defaults: StoredSettings = {
  maxConcurrentRequests: 2,
  supportsImages: true,
  supportsTools: true,
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
  /** Canonical path: descendant realpath checks detect replaced directories, not a symlinked data root. */
  readonly root: string;
  ephemeralBranch?: (id: string) => any[];
  constructor(dataDir: string) {
    mkdirSync(dataDir, { recursive: true, mode: 0o700 });
    const root = (this.root = realpathSync(dataDir));
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
      CREATE TABLE IF NOT EXISTS project_plugins (projectId TEXT, plugin TEXT, enabled INTEGER NOT NULL, PRIMARY KEY(projectId,plugin));
      CREATE TABLE IF NOT EXISTS conversations(id TEXT PRIMARY KEY, projectId TEXT NOT NULL REFERENCES projects(id), title TEXT NOT NULL, createdAt TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS runs(id TEXT PRIMARY KEY, conversationId TEXT NOT NULL REFERENCES conversations(id), status TEXT NOT NULL, error TEXT, createdAt INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS documents(id TEXT PRIMARY KEY, projectId TEXT NOT NULL REFERENCES projects(id), name TEXT NOT NULL, kind TEXT NOT NULL, extension TEXT NOT NULL, bytes INTEGER NOT NULL, revision TEXT NOT NULL, truncated INTEGER NOT NULL, updatedAt TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS chat_documents(id TEXT PRIMARY KEY, projectId TEXT NOT NULL REFERENCES projects(id), name TEXT NOT NULL, kind TEXT NOT NULL, extension TEXT NOT NULL, bytes INTEGER NOT NULL, revision TEXT NOT NULL, truncated INTEGER NOT NULL, updatedAt TEXT NOT NULL, conversationId TEXT NOT NULL REFERENCES conversations(id));
      CREATE INDEX IF NOT EXISTS chat_documents_conversation ON chat_documents(conversationId);
      PRAGMA user_version=2;
    `);
    if (
      !(this.db.prepare('PRAGMA table_info(conversations)').all() as any[]).some(
        (c) => c.name === 'incognito',
      )
    )
      this.db.exec('ALTER TABLE conversations ADD COLUMN incognito INTEGER NOT NULL DEFAULT 0');
    if (
      !(this.db.prepare('PRAGMA table_info(conversations)').all() as any[]).some(
        (c) => c.name === 'scheduled',
      )
    )
      this.db.exec('ALTER TABLE conversations ADD COLUMN scheduled INTEGER NOT NULL DEFAULT 0');
    this.db.exec(`CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY, username TEXT NOT NULL UNIQUE COLLATE NOCASE,
      password TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('admin','user')),
      disabled INTEGER NOT NULL DEFAULT 0, mustChangePassword INTEGER NOT NULL DEFAULT 0
    )`);
    for (const column of ['displayName', 'email']) {
      if (
        !(this.db.prepare('PRAGMA table_info(users)').all() as any[]).some((c) => c.name === column)
      )
        this.db.exec(`ALTER TABLE users ADD COLUMN ${column} TEXT NOT NULL DEFAULT ''`);
    }
    for (const [table, column] of [
      ['projects', 'ownerId'],
      ['logins', 'userId'],
    ]) {
      if (
        !(this.db.prepare(`PRAGMA table_info(${table})`).all() as any[]).some(
          (c) => c.name === column,
        )
      )
        this.db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} TEXT REFERENCES users(id)`);
    }
    if (this.meta('password') && !this.db.prepare('SELECT id FROM users LIMIT 1').get()) {
      this.db.exec('BEGIN IMMEDIATE');
      try {
        const id = randomUUID();
        this.db
          .prepare('INSERT INTO users(id,username,password,role) VALUES (?,?,?,?)')
          .run(id, 'admin', this.meta('password')!, 'admin');
        this.db.prepare('UPDATE projects SET ownerId=? WHERE ownerId IS NULL').run(id);
        this.db.exec("DELETE FROM logins; DELETE FROM meta WHERE key='password'; COMMIT");
      } catch (error) {
        this.db.exec('ROLLBACK');
        throw error;
      }
    }
    // File/Python tools are a built-in capability for every project.
    this.db.exec('UPDATE projects SET toolsEnabled=1 WHERE toolsEnabled<>1');
    chmodSync(path.join(root, 'frame.db'), 0o600);
    this.db
      .prepare(
        "UPDATE runs SET status='interrupted', error='Frame restarted before this run completed. Review the conversation before retrying.' WHERE status IN ('running','queued')",
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
  user(id: string): any {
    return this.db
      .prepare(
        'SELECT id,username,displayName,email,role,disabled,mustChangePassword FROM users WHERE id=?',
      )
      .get(id);
  }
  createUser(
    username: string,
    password: string,
    role = 'user',
    mustChangePassword = true,
    profile = { displayName: '', email: '' },
  ) {
    const id = randomUUID();
    this.db.exec('SAVEPOINT create_user');
    try {
      this.db
        .prepare(
          'INSERT INTO users(id,username,password,role,mustChangePassword,displayName,email) VALUES (?,?,?,?,?,?,?)',
        )
        .run(
          id,
          username.toLowerCase(),
          hashPassword(password),
          role,
          Number(mustChangePassword),
          profile.displayName,
          profile.email,
        );
      this.createProject({ name: 'Arena', instructions: '', toolsEnabled: true }, id);
      this.db.exec('RELEASE create_user');
    } catch (error) {
      this.db.exec('ROLLBACK TO create_user; RELEASE create_user');
      throw error;
    }
    return this.user(id);
  }
  ownsProject(userId: string, id: string) {
    return !!this.db.prepare('SELECT id FROM projects WHERE id=? AND ownerId=?').get(id, userId);
  }
  ownsConversation(userId: string, id: string) {
    return !!this.db
      .prepare(
        'SELECT c.id FROM conversations c JOIN projects p ON p.id=c.projectId WHERE c.id=? AND p.ownerId=?',
      )
      .get(id, userId);
  }
  projects(): Project[] {
    return (
      this.db.prepare('SELECT * FROM projects ORDER BY name').all() as unknown as Project[]
    ).map((p) => ({ ...p, toolsEnabled: true }));
  }
  project(id: string): Project | undefined {
    const p = this.db.prepare('SELECT * FROM projects WHERE id=?').get(id) as unknown as
      Project | undefined;
    return p && { ...p, toolsEnabled: true };
  }
  createProject(input: Omit<Project, 'id'>, ownerId?: string) {
    ownerId ??= (
      this.db.prepare("SELECT id FROM users WHERE role='admin' ORDER BY rowid LIMIT 1").get() as any
    )?.id;
    const project = { id: randomUUID(), ...input, toolsEnabled: true, ownerId: ownerId ?? null };
    mkdirSync(this.projectPath(project.id), { recursive: true, mode: 0o700 });
    this.db.exec('SAVEPOINT create_project');
    try {
      this.db
        .prepare(
          'INSERT INTO projects(id,name,instructions,toolsEnabled,ownerId) VALUES (?, ?, ?, 1, ?)',
        )
        .run(project.id, project.name, project.instructions, ownerId ?? null);
      // Missing legacy Excel settings still mean enabled; new projects explicitly opt out.
      this.db.prepare("INSERT INTO project_plugins VALUES (?, 'excel', 0)").run(project.id);
      this.db.exec('RELEASE create_project');
    } catch (error) {
      this.db.exec('ROLLBACK TO create_project; RELEASE create_project');
      rmSync(this.projectPath(project.id), { recursive: true, force: true });
      throw error;
    }
    return project;
  }
  updateProject(id: string, input: Omit<Project, 'id'>) {
    this.db
      .prepare('UPDATE projects SET name=?, instructions=?, toolsEnabled=? WHERE id=?')
      .run(input.name, input.instructions, 1, id);
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
