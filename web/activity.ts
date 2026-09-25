import type { DisplayMessage } from '../shared/types.js';

export interface IndexedMessage {
  message: DisplayMessage;
  index: number;
}
export interface ResponseTurn {
  key: number;
  user?: IndexedMessage;
  messages: IndexedMessage[];
}

// Keep the native snapshot indices: Save to knowledge uses them on the server.
// A truncated history may begin with an assistant or tool result.
export function responseTurns(messages: DisplayMessage[]): ResponseTurn[] {
  const turns: ResponseTurn[] = [];
  for (const [index, message] of messages.entries()) {
    if (message.role === 'user') {
      turns.push({ key: index, user: { message, index }, messages: [] });
    } else {
      if (!turns.length) turns.push({ key: -1, messages: [] });
      turns.at(-1)!.messages.push({ message, index });
    }
  }
  return turns;
}

export function activitySteps(messages: IndexedMessage[]) {
  return messages.filter(({ message }) => message.role === 'tool' || !!message.thinking);
}

export type ResponseBlock =
  | { kind: 'activity'; key: string; messages: IndexedMessage[] }
  | { kind: 'content'; key: string; item: IndexedMessage };

// A row belongs to the work between visible messages, not to the whole user turn.
// Empty slots keep the live row in place before a result or text starts streaming.
export function responseBlocks(messages: IndexedMessage[]): ResponseBlock[] {
  let activity: Extract<ResponseBlock, { kind: 'activity' }> = {
    kind: 'activity',
    key: 'activity-start',
    messages: [],
  };
  const blocks: ResponseBlock[] = [activity];
  for (const item of messages) {
    const { message, index } = item;
    if (message.role === 'tool' || message.thinking || !message.text) activity.messages.push(item);
    if (message.chart || (message.role === 'assistant' && message.text)) {
      blocks.push({ kind: 'content', key: `content-${index}`, item });
      activity = { kind: 'activity', key: `activity-after-${index}`, messages: [] };
      blocks.push(activity);
    }
  }
  return blocks;
}

export function currentActivityKey(
  messages: IndexedMessage[],
  blocks: ResponseBlock[],
  running: boolean,
  status: string,
) {
  const last = messages.at(-1)?.message;
  // Text is preceded by its reasoning/tools; subsequent tool work follows that text.
  if (running && status === 'Responding' && last?.role === 'assistant' && last.text)
    return blocks.at(-3)!.key;
  if (!running) {
    const recorded = blocks.findLast(
      (b) => b.kind === 'activity' && activitySteps(b.messages).length,
    );
    if (recorded) return recorded.key;
  }
  return blocks.at(-1)!.key;
}
