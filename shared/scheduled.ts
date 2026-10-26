export interface ScheduleTiming {
  kind: 'once' | 'daily' | 'weekdays' | 'weekly' | 'monthly';
  time: string;
  date?: string;
  weekday?: number;
  day?: number;
}
export interface ScheduledTask {
  id: string;
  projectId: string;
  ownerId: string;
  sourceConversationId: string | null;
  title: string;
  instructions: string;
  timing: ScheduleTiming;
  recipients: string[];
  attachments: 'none' | 'generated';
  timezone: string;
  revision: number;
  state: 'draft' | 'active' | 'paused' | 'completed';
  nextRunAt: number | null;
  createdAt: number;
}
export interface ScheduledRun {
  id: string;
  taskId: string;
  conversationId: string;
  status: 'running' | 'completed' | 'failed' | 'interrupted';
  scheduledAt: number;
  startedAt: number;
  finishedAt: number | null;
  error: string | null;
  notification: string | null;
}
export function validTimezone(zone: string) {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}
function formatter(zone: string) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: zone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
}
function parts(f: Intl.DateTimeFormat, at: number) {
  const p = Object.fromEntries(f.formatToParts(at).map((v) => [v.type, v.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}` };
}
/** Resolve a wall time. Skip nonexistent spring times; use the first fall occurrence only. */
function wallTime(f: Intl.DateTimeFormat, date: string, time: string) {
  const wall = Date.parse(`${date}T${time}:00Z`);
  const candidates = new Set<number>();
  for (const delta of [-86400000, 0, 86400000]) {
    const probe = wall + delta;
    const local = parts(f, probe);
    const offset = Date.parse(`${local.date}T${local.time}:00Z`) - probe;
    const candidate = wall - offset;
    const check = parts(f, candidate);
    if (check.date === date && check.time === time) candidates.add(candidate);
  }
  return candidates.size ? Math.min(...candidates) : null;
}
/** Strictly after `after`, in the administrator's IANA timezone, including DST. */
export function nextOccurrence(
  timing: ScheduleTiming,
  timezone: string,
  after: number,
): number | null {
  const f = formatter(timezone);
  if (timing.kind === 'once') {
    const at = wallTime(f, timing.date!, timing.time);
    return at !== null && at > after ? at : null;
  }
  const start = Date.parse(`${parts(f, after).date}T00:00:00Z`);
  for (let i = 0; i < 370; i++) {
    const d = new Date(start + i * 86400000);
    if (timing.kind === 'weekdays' && [0, 6].includes(d.getUTCDay())) continue;
    if (timing.kind === 'weekly' && d.getUTCDay() !== timing.weekday) continue;
    if (timing.kind === 'monthly' && d.getUTCDate() !== timing.day) continue;
    const at = wallTime(f, d.toISOString().slice(0, 10), timing.time);
    if (at !== null && at > after) return at;
  }
  return null;
}
export function timingLabel(t: ScheduleTiming) {
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  return `${t.kind === 'once' ? t.date : t.kind === 'weekly' ? `Every ${days[t.weekday!]}` : t.kind === 'monthly' ? `Monthly on day ${t.day}` : t.kind === 'weekdays' ? 'Weekdays' : 'Daily'} at ${t.time}`;
}
