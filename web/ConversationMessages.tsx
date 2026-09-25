import React, { useEffect, useRef } from 'react';
import type { ChatSnapshot } from '../shared/types.js';
import {
  activitySteps,
  responseTurns,
  responseBlocks,
  currentActivityKey,
  type IndexedMessage,
} from './activity.js';
import { ChartCard } from './Charts.js';
import { CopyMessage } from './ContextPanel.js';
import { SqlResultTable } from './Plugins.js';
import { RichMarkdown } from './RichMarkdown.js';
import { statusLabel, toolLabel } from './tool-labels.js';

function Activity({
  messages,
  status,
  running,
  paused,
  chatId,
  canSave,
  onSave,
}: {
  messages: IndexedMessage[];
  status?: string;
  running: boolean;
  paused: boolean;
  chatId: string;
  canSave: boolean;
  onSave: (index: number) => void;
}) {
  const steps = activitySteps(messages);
  const panel = useRef<HTMLDivElement>(null);
  const pinned = useRef(true);
  useEffect(() => {
    if (pinned.current && panel.current) panel.current.scrollTop = panel.current.scrollHeight;
  }, [messages]);
  if (!steps.length && !status) return null;
  const failures = steps.filter(({ message }) => message.failed).length;
  const label =
    status || `View activity · ${steps.length} ${steps.length === 1 ? 'step' : 'steps'}`;
  return (
    <details
      className={`activity ${running ? 'activity-running' : ''} ${paused ? 'activity-paused' : ''}`}
      onToggle={(event) => {
        if (event.currentTarget.open && pinned.current && panel.current)
          panel.current.scrollTop = panel.current.scrollHeight;
      }}
    >
      <summary>
        <span className="activity-orbit" aria-hidden="true" />
        <span className="activity-status" aria-live={status ? 'polite' : 'off'}>
          {label}
        </span>
        {!!failures && (
          <span className="activity-warning">
            {failures} {failures === 1 ? 'tool failed' : 'tools failed'}
          </span>
        )}
        <span className="activity-chevron" aria-hidden="true">
          ›
        </span>
      </summary>
      <div
        className="activity-body"
        ref={panel}
        tabIndex={0}
        aria-label="Activity details"
        onScroll={(event) => {
          const el = event.currentTarget;
          pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
        }}
      >
        {!steps.length && (
          <p className="activity-empty">
            {running
              ? 'Details will appear here as the task progresses.'
              : 'No reasoning or tool activity was recorded.'}
          </p>
        )}
        {steps.map(({ message: m, index }) =>
          m.role === 'tool' ? (
            <details className="tool" key={index}>
              <summary>
                {m.failed ? '×' : '✓'} {toolLabel(m.name)}
              </summary>
              {m.sqlResult ? (
                <SqlResultTable result={m.sqlResult} chatId={chatId} />
              ) : (
                <pre>{m.chart ? 'Chart displayed in the conversation below.' : m.text}</pre>
              )}
              {canSave && (
                <button className="save-knowledge" onClick={() => onSave(index)}>
                  {m.proposal ? 'Review knowledge draft' : 'Save useful result'}
                </button>
              )}
            </details>
          ) : (
            <section className="activity-reasoning" key={index}>
              <div className="activity-step-label">Reasoning</div>
              <pre aria-label="Model thinking">{m.thinking}</pre>
            </section>
          ),
        )}
      </div>
    </details>
  );
}

export function ConversationMessages({
  snapshot,
  chatId,
  connected,
  stopping,
  onSave,
  canSave = true,
}: {
  canSave?: boolean;
  snapshot: ChatSnapshot;
  chatId: string;
  connected: boolean;
  stopping: boolean;
  onSave: (index: number) => void;
}) {
  const turns = responseTurns(snapshot.messages);
  // Before the worker publishes the new user message, do not animate the old answer.
  const preparing = snapshot.running && snapshot.status === 'Preparing conversation';
  const standalone = !turns.length || preparing;
  const currentStatus =
    !connected && chatId
      ? `${snapshot.running ? (stopping ? 'Stopping' : statusLabel(snapshot.status)) : 'Checking task status…'} · Live updates reconnecting`
      : snapshot.running
        ? stopping
          ? 'Stopping'
          : statusLabel(snapshot.status)
        : snapshot.error
          ? 'Task interrupted'
          : snapshot.status === 'stopped'
            ? 'Stopped'
            : undefined;
  const paused = !connected || snapshot.status === 'Awaiting SQL approval';
  const activity = (messages: IndexedMessage[], current: boolean) => (
    <Activity
      messages={messages}
      status={current ? currentStatus : undefined}
      running={current && snapshot.running}
      paused={paused}
      chatId={chatId}
      canSave={canSave && !snapshot.running}
      onSave={onSave}
    />
  );
  return (
    <>
      {turns.map((turn, position) => {
        const blocks = responseBlocks(turn.messages);
        const liveKey = currentActivityKey(
          turn.messages,
          blocks,
          snapshot.running,
          snapshot.status,
        );
        const current = !standalone && position === turns.length - 1;
        return (
          <React.Fragment key={turn.key}>
            {turn.user && (
              <article className="message user">
                {!!turn.user.message.attachments?.length && (
                  <div className="attachment-chips">
                    {turn.user.message.attachments.map((a) => (
                      <span key={a.id}>▤ {a.name}</span>
                    ))}
                  </div>
                )}
                <RichMarkdown text={turn.user.message.text} />
              </article>
            )}
            {(!!turn.messages.length ||
              (!standalone && position === turns.length - 1 && currentStatus)) && (
              <section className="response-turn message assistant" aria-label="Frame response">
                <div className="message-author">FRAME</div>
                {blocks.map((block) => {
                  if (block.kind === 'activity')
                    return (
                      <React.Fragment key={block.key}>
                        {activity(block.messages, current && block.key === liveKey)}
                      </React.Fragment>
                    );
                  const { message: m, index } = block.item;
                  return m.chart ? (
                    <ChartCard key={block.key} reference={m.chart} chatId={chatId} />
                  ) : (
                    <div className="response-text" key={block.key}>
                      <RichMarkdown
                        text={m.text}
                        streaming={snapshot.running && index === snapshot.messages.length - 1}
                      />
                      {!snapshot.running && (
                        <div className="message-actions">
                          <CopyMessage text={m.text} />
                          <>
                            {canSave && (
                              <button className="save-knowledge" onClick={() => onSave(index)}>
                                ♡ Useful · Save to knowledge
                              </button>
                            )}
                          </>
                        </div>
                      )}
                    </div>
                  );
                })}
              </section>
            )}
          </React.Fragment>
        );
      })}
      {standalone && currentStatus && (
        <section className="response-turn message assistant" aria-label="Frame response">
          <div className="message-author">FRAME</div>
          {activity([], true)}
        </section>
      )}
    </>
  );
}
