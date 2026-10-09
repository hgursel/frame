import React, { useState } from 'react';
import type { QuestionRequest, QuestionAnswer } from '../shared/questions.js';
import { api } from './api.js';
export function QuestionCard({ request, chatId }: { request: QuestionRequest; chatId: string }) {
  const [answers, setAnswers] = useState<QuestionAnswer[]>(
    request.questions.map((q) => ({ questionId: q.id, selected: [], text: '' })),
  );
  const [index, setIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const q = request.questions[index]!;
  const answer = answers[index]!;
  const patch = (value: Partial<QuestionAnswer>) =>
    setAnswers((a) => a.map((v, i) => (i === index ? { ...v, ...value } : v)));
  const submit = async (cancelled = false) => {
    setBusy(true);
    setError('');
    try {
      await api(`/conversations/${chatId}/questions/${request.id}`, 'POST', {
        runId: request.runId,
        cancelled,
        answers: cancelled ? [] : answers,
      });
      setSent(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  if (sent)
    return (
      <div className="question-card" role="status">
        Answer submitted. Frame is continuing…
      </div>
    );
  return (
    <section className="question-card" aria-label="Questions from Frame">
      <div className="question-tabs" role="tablist" aria-label="Questions">
        {request.questions.map((q, i) => (
          <button key={q.id} role="tab" aria-selected={i === index} onClick={() => setIndex(i)}>
            {i + 1}. {q.header}
            {answers[i]!.selected.length || answers[i]!.text ? ' ✓' : ''}
          </button>
        ))}
      </div>
      <h3>{q.question}</h3>
      <p className="muted">
        {q.multiple ? 'Choose any that apply' : 'Choose one option'}, or write your own answer.
      </p>
      <fieldset disabled={busy} aria-label={q.header}>
        {q.options.map((option) => (
          <label key={option.label} className="question-option">
            <input
              type={q.multiple ? 'checkbox' : 'radio'}
              name={`question-${request.id}-${q.id}`}
              checked={answer.selected.includes(option.label)}
              onChange={() =>
                patch({
                  selected: q.multiple
                    ? answer.selected.includes(option.label)
                      ? answer.selected.filter((v) => v !== option.label)
                      : [...answer.selected, option.label]
                    : [option.label],
                })
              }
            />
            <span>
              <strong>{option.label}</strong>
              {option.description && <small>{option.description}</small>}
            </span>
          </label>
        ))}
        <textarea
          aria-label={`Your answer or notes: ${q.header}`}
          placeholder="Your own answer or additional details…"
          maxLength={4000}
          value={answer.text}
          onChange={(e) => patch({ text: e.target.value })}
        />
      </fieldset>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <div className="question-actions">
        <button disabled={busy} onClick={() => void submit(true)}>
          Cancel questions
        </button>
        {index > 0 && <button onClick={() => setIndex(index - 1)}>Previous</button>}
        {index < answers.length - 1 && (
          <button onClick={() => setIndex(index + 1)}>Next question</button>
        )}
        <button
          className="primary"
          disabled={busy || answers.some((a) => !a.selected.length && !a.text.trim())}
          onClick={() => void submit()}
        >
          Submit answers
        </button>
      </div>
    </section>
  );
}
