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
