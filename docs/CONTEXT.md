# Context management in Frame

Frame uses a two-stage policy: shorten large, older read-only tool results in outbound chat requests, then use Pi's native conversation compaction when context approaches its budget. Summaries use the same configured local model. Original Pi JSONL history remains authoritative; compaction adds a checkpoint rather than deleting the transcript.

This is a practical starting policy for local models, not a benchmark-proven universal optimum. Context quality varies with model, quantization, tokenizer, template, and task. Match Frame's context setting to **the context allocated per llama.cpp slot**, not the model's advertised maximum. Changing Frame's setting does not resize the server's KV cache.

## Controls and measurements

Open **Context** in the chat header to see the configured window, used tokens and percentage, automatic threshold, output limit, checkpoint count, and the latest summary. **Compact now** runs a separate, cancelable summary task. It does not send a new user message or resume a previous task. The same project lock and request-ID deduplication used for chat apply to compaction.

Settings exposes automatic compaction, a 50–90% trigger (default **75%**), and older tool-output shortening. Output headroom can move the effective trigger earlier:

```text
safety reserve = max(256, 3% of context window)
reserve = max((100% - chosen trigger) × window, maximum output + safety reserve)
effective trigger = window - reserve
recent-history target = min(8,000, 25% of effective trigger), with a 128-token minimum
```

Pi chooses valid message/turn boundaries around this recent-history target; it is not an exact count or a promise to retain a fixed number of turns. At a 32,768-token window and 4,096-token output limit, the default trigger is 24,576 tokens and the recent-history target is 6,144 tokens. This avoids applying Pi's fixed 16,384-token reserve and 20,000-token recent-history default to a small local slot.

- **Reported context:** Pi uses the local endpoint's last valid input/output/cache usage, with estimates for subsequent messages. Frame marks counts with `≈`/`~` when estimates are involved. Context use includes generated output, not just input.
- **Before a provider count or after compaction:** Frame estimates current messages plus system prompt and tool schemas at roughly four characters per token. This can be inaccurate, particularly for code, non-English text, and model-specific templates. Previous pre-compaction usage is never displayed as a new exact count.
- **Reloads:** the latest UI metrics persist in SQLite. Changing model, endpoint, context settings, instructions, or project tool configuration invalidates the cached usage. Existing conversations without metrics show “Not measured yet” until their next task.
- **Tokens/second:** live counts are estimates. After a response, Frame uses reported output tokens when available, divided by elapsed time from the first streamed delta to the completed message on the server. This excludes waiting for the first token and tool execution, and includes reasoning when the provider counts it. It is observed streaming throughput, not llama.cpp's internal inference benchmark. A response shorter than 100 ms of observable streaming has no reliable rate. Summary generation is excluded. The idle label refers to the last response.

## What is preserved and what is shortened

The outbound pruning projection protects the latest two user turns, all errors, tool-call arguments/IDs, and results from tools that change state. Only successful `read`, `read_knowledge`, `search_knowledge`, `ls`, `find`, and `grep` results are candidates. Tool calls and their results remain paired. Bash is never assumed to be read-only.

Older text blocks exceeding an adaptive 2,000–8,000-character limit retain a beginning and ending excerpt plus an explicit omission notice. This is a mechanical size reduction, not a claim that the omitted middle is unimportant. The model can re-read a source when needed; full original tool results remain in the native session and the bounded chat history projection. Messages are copied for transport, never mutated on disk. This projection is deterministic and idempotent, avoiding destructive transcript edits or a separate archive service.

Pi's compactor still receives original history, allowing its summary to recover details omitted from a prior outbound projection. Its native structured summary preserves goals, constraints, decisions, progress, next steps, and important context; its file-operation tracking and previous-summary merging remain intact. Frame's manual and preflight compaction add explicit guidance to preserve source references, uncertainty, pending work, errors, exact identifiers, and completed actions. Summaries are model-generated and can lose information; durable organizational facts belong in reviewed knowledge pages.

## When compaction runs

1. Before a new prompt, Frame accounts for the pending text, attachments, system prompt, and tool definitions. A single input that exceeds its available budget fails before the input is appended. With automation enabled, older context can be compacted before accepting the new turn.
2. Pi's native threshold checks remain enabled during tool loops and after responses. These use conservative native usage estimates; they may compact sooner than a pruned outbound request strictly requires.
3. Pi can compact on recognized context-overflow errors and continue the current inference loop. This is native context recovery, not replay of the original user task. Completed tool results remain part of the session. Ordinary transport retries are disabled.
4. **Compact now** uses the same native checkpoint mechanism while idle. **Stop** cancels it. Reconnecting to SSE never submits a task again.

If a summary fails, is empty, is truncated, attempts a tool call, or is canceled, Pi does not append a successful checkpoint. Frame reports failures and retains history. A very large recent result or original summary input can still exceed the local model's window. Frame does not silently drop recent messages, switch to a cloud summarizer, increase server context, or repeat an accepted task to conceal that failure. Shorten the next input, reduce attached excerpts, or adjust the real server and Frame context allocation together.

Chat history currently displays at most the latest 100 projected messages within its existing size budget. Compaction does not remove those messages. Full older history stays in Pi JSONL; a searchable archive/history viewer is not implemented.

## Research basis

Reviewed September 14, 2026. This comparison covers nine representative systems, not every agent harness or an empirical model-quality ranking. Pi behavior was also verified against the installed **0.85.1** source and integration tests.

| System                                                                                                                                                                    | Relevant approach                                                                                                                    | What Frame takes from it                                                                                                   |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| [Pi](https://pi.dev/docs/latest/compaction)                                                                                                                               | Native summary checkpoints, recent-history retention, file-operation tracking, merged previous summaries, threshold/overflow checks. | Reuse its compactor, session tree, and cancellation behavior; scale its budgets for local slots.                           |
| [OpenCode](https://opencode.ai/docs/config/#compaction) and [implementation](https://github.com/anomalyco/opencode/blob/main/packages/opencode/src/session/compaction.ts) | Configurable compaction/pruning, protection for recent exchanges, bounded older tool outputs and preserved tail.                     | Conservative tool-output shortening; avoid importing large fixed token budgets into small windows.                         |
| [Gemini CLI](https://github.com/google-gemini/gemini-cli/blob/main/packages/core/src/context/chatCompressionService.ts)                                                   | Earlier compression, recent-history preservation, tool-response budgeting and valid conversation boundaries.                         | Reserve headroom before overflow and preserve message structure.                                                           |
| [Anthropic / Claude context engineering](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)                                               | Clear stale tool results, compact with decisions and unresolved work, keep structured notes outside context.                         | Keep decisions and open work in the checkpoint; use reviewed Markdown knowledge for durable facts.                         |
| [Codex](https://openai.com/index/unrolling-the-codex-agent-loop/)                                                                                                         | Token-budget-driven compaction and provider-side continuation state.                                                                 | Threshold/checkpoint principles transfer; opaque provider-specific compaction does not fit llama.cpp.                      |
| [Deep Agents](https://docs.langchain.com/oss/python/deepagents/context-engineering)                                                                                       | Offload large results to files, summarize near the limit, keep recent history and recovery references.                               | Retain originals and make omissions explicit. Frame already has native history, so no second transcript archive is needed. |
| [Aider](https://aider.chat/docs/config/options.html#--max-chat-history-tokens-value)                                                                                      | A soft chat-history token budget triggers summarization.                                                                             | Keep configuration understandable; avoid a mandatory separate summarizer model.                                            |
| [OpenClaw](https://docs.openclaw.ai/compaction) and [session reference](https://docs.openclaw.ai/reference/session-management-compaction/compaction)                      | Distinguishes ephemeral tool pruning from persisted compaction, reserves headroom, and handles stale post-compaction counts.         | Separate reversible projections from checkpoints; explicitly label estimates after compaction.                             |
| [Hermes](https://hermes-agent.nousresearch.com/docs/user-guide/configuration)                                                                                             | Configurable compression thresholds and recent-history retention, with long-session recovery mechanisms.                             | Expose the trigger; treat fixed retention/default thresholds as choices to validate, not universal constants.              |

The common pattern is **bounded tool results + a recent working set + a structured checkpoint + durable source material**. Frame implements this with its existing process manager, Pi session files, SQLite metadata, and Markdown knowledge. It does not add a vector database, cloud summarizer, or new background service.

## Validation and remaining acceptance work

Automated tests cover scaled budgets, protected outputs and tool IDs, immutable/idempotent pruning, real-SDK manual and preflight compaction against a local mock endpoint, unchanged visible history, summary-based continuation without replay, cancellation/failure, stale-count invalidation, and streamed throughput. Browser tests cover context controls, live reasoning, throughput, light/dark appearance, search, and mobile navigation.

Real llama.cpp acceptance remains separate: try representative long sessions at the actual supported 8K/16K/32K slot sizes, with your model and template. Check recall of decisions, identifiers, source citations, pending tasks, completed mutations, and errors across repeated checkpoints. Compare actual prompt counts with estimates, observe summary latency/quality, and confirm stop and overflow recovery. Start with 75%; adjust based on measured quality and headroom. No local-model quality benchmark is claimed from mock tests.
