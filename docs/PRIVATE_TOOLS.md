# Private Tools

Connect your own local scripts to Frame without publishing the scripts, credentials, or integration details. The public repository contains only the generic executor and settings UI. No MCP server, package installer, or cloud service is needed.

## Register an operation

1. Keep your integration in a directory outside the Frame Git checkout, for example `/opt/frame-private/my-integration/`. Give the Linux account running Frame access to the executable and its parent directories.
2. Open **Settings → Plugins → Private Tools**, enable it, and select **Add operation**.
3. Enter an ID, display name, and description. IDs use lowercase letters, digits, and underscores and start with a letter. The model sees the tool as `private_<id>`.
4. Register an **absolute executable path**. For a Bash wrapper, include a shebang and make it executable. Optional fixed arguments are literal, one per line; Frame never interpolates user input into a shell command.
5. Optionally enter an **absolute environment-file path**. The file must be regular (not a symlink), readable by Frame, at most 64 KiB, and have no group/other permissions (`chmod 600`). Its contents are never returned by the settings API. Do not put credentials into tool descriptions, fixed arguments, usage instructions, or chat.
6. Add the operation's JSON inputs: text, number, or boolean, each required or optional. Unknown fields and invalid types are rejected. V1 supports flat JSON objects, up to 20 inputs per operation and 20 operations.
7. Leave **Ask every time** selected initially. Select **Run automatically** only for an operation you intend to authorize without review; Frame cannot infer whether a script changes remote data.
8. Save, then enable **Private Tools** in the project's settings. Registered operations are available for new turns in that project. General host tools can remain disabled.

Saving configuration does not execute a script, load the `.env`, install dependencies, or contact an endpoint. Settings cannot be changed while chats are running. Removing an operation or deleting a project never deletes your external scripts or credentials. The system configuration stays local in Frame's database and is not included in Knowledge Library or project knowledge exports.

## Script contract

Frame sends one UTF-8 JSON object followed by a newline to stdin, then closes stdin. Return the intended result as text or JSON on stdout and exit with code 0. Stderr is counted toward the output limit but is not sent to the model, shown in chat, or persisted as tool output. Nonzero exits return a generic error; arrange private, access-controlled diagnostics within your integration if needed.

Each process starts in the executable's directory. Frame passes a minimal environment (`PATH=/usr/local/bin:/usr/bin:/bin`, `LANG=C.UTF-8`) plus values from the selected `.env`. It does not inherit the Frame service's credentials or arbitrary environment variables. Environment files use Node's dotenv syntax: plain `KEY=value`, optional quotes/comments, and no variable expansion or command substitution. They are parsed as data, never shell-sourced. Runtime-control variables such as `PATH`, `HOME`, `BASH_ENV`, `NODE_OPTIONS`, `LD_*`, and Python runtime paths are rejected. Set application-specific variables instead; use explicit executable paths in wrappers.

For an existing script that accepts positional arguments, make a small private adapter. For example, this executable Python wrapper receives JSON and passes a literal argument to a private Bash script:

```python
#!/usr/bin/python3
import json
import subprocess
import sys

request = json.load(sys.stdin)
result = subprocess.run(
    ["/opt/frame-private/my-integration/script.sh", "lookup", request["record_id"]],
    capture_output=True,
    text=True,
    check=True,
)
sys.stdout.write(result.stdout)
```

Register the wrapper's path and one required text input named `record_id`. The original script inherits the `.env` values. Adapt operation names and arguments privately on your own machine. Avoid `eval`, `shell=True`, or building shell commands from the inputs. If a downstream program interprets leading dashes as options, validate the identifier or use that program's supported `--` separator.

You can paste usage guidance from `SKILL.md` into **Private usage instructions**. This is administrator guidance for the local model, not an automatic OpenCode skill importer. Define each executable operation in the UI; Frame does not infer callable commands from Markdown. A shared wrapper may serve multiple operations using different fixed arguments.

## Approval and limits

Approval cards appear in the main chat with the operation name and exact validated inputs. Each approval is bound to one conversation/run, expires after five minutes, and is consumed once. Denying, stopping, or expiry before execution starts launches nothing. Reconnecting to the chat restores pending approval cards; restarting Frame does not replay an operation.

Execution defaults to 60 seconds and 32,000 output bytes, configurable per operation up to 30 minutes and 128 KiB. The output limit includes stdout and stderr. Stop, timeout, or excessive output terminates the local process group. The existing 30-minute conversation limit still applies. Frame never automatically retries failed executions. A remote request may already have completed when the process stops: verify the outcome before requesting another execution.

## Privacy and boundaries

The local model receives descriptions, input definitions, usage instructions, submitted inputs, and returned results. It does not receive configured executable paths, fixed arguments, environment-file paths, or `.env` contents through Private Tools. Output redaction replaces exact environment values and their JSON-escaped forms before sending output to the worker or saving it in native chat history. This is a safeguard, not a secret scanner: encoded, transformed, or partially printed credentials may evade it. Scripts must never print credentials or verbose HTTP authentication headers.

Normal chats retain returned output and assistant responses. These can be used by existing knowledge workflows; Private Tools is not a separate confidential-document store. Incognito uses Frame's existing temporary-chat behavior, but cannot prevent your script or remote server from writing logs or changing data.

Scripts are trusted administrator code and run with the Frame Linux account's permissions. This is not an OS sandbox. Keep general host tools disabled when the model should not read private files directly, and use appropriate Linux account and remote-service permissions. Plugins and host tools can still reach resources their account can access. Keep `.env`, scripts, backups, and integration logs outside the public checkout; back them up separately.

## Validation

Tests use harmless local scripts and dummy credentials. They cover registration, project boundaries, literal argument/stdin handling, validation, approvals, cancellation, timeouts, output limits, redaction, and real Pi SDK/browser integration. They do not exercise your private server or guarantee the correctness of your script.
