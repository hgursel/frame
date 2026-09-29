export interface SkillsSettings {
  /** Absolute paths scanned with Pi's Agent Skills loader. */
  folders: string[];
}
export interface SkillEntry {
  name: string;
  description: string;
  folder: string;
  filePath: string;
  baseDir: string;
  /** False when frontmatter sets `disable-model-invocation`; only `/skill:name` loads it. */
  modelInvocation: boolean;
}
export interface SkillsCatalog extends SkillsSettings {
  skills: SkillEntry[];
  warnings: string[];
}
export interface ProjectSkills {
  enabled: string[];
  hostTools: boolean;
  skills: SkillEntry[];
}

/**
 * Pi expands `/skill:name args` into the full SKILL.md before storing the user message.
 * Show and learn from the short command instead of the skill body.
 */
export function collapseSkillInvocation(text: string) {
  const match = text.match(
    /^<skill name="([^"]+)" location="[^"]+">\n[\s\S]*?\n<\/skill>(?:\n\n([\s\S]+))?$/,
  );
  if (!match) return text;
  const args = match[2]?.trim();
  return `/skill:${match[1]}${args ? ` ${args}` : ''}`;
}
