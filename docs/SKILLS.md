# Skills

Use your existing Agent Skills with Frame. A skill is a folder with a `SKILL.md` (instructions plus `name` and `description` frontmatter) and optional scripts, references, and assets. This is the format used by OpenCode, Claude Code, and Pi, so the same folder works in each tool without conversion. Frame loads skills with the embedded Pi SDK's own loader; there is no separate importer, registry, or cloud service.

## Set up

1. Put your skills in a folder outside the Frame checkout, for example `/opt/frame-skills/<skill-name>/SKILL.md`. Give the Linux account that runs Frame read access to the folder and execute permission on scripts. `~` inside a script means that account's home directory.
2. Open **Settings → Plugins → Skills**, enter one absolute folder path per line, and select **Save skill folders**. Frame lists the skills it found and any warnings, such as a missing description, a duplicate name, or an unreadable folder. **Rescan** refreshes the list after you edit files.
3. Open **Project settings**. Skills run with **trusted agent tools**, so enable those for the project. Under **Project skills**, select the skills this project may use and save.

Saving settings records folder paths only. It does not run scripts, install dependencies, or contact anything.

## Use in chat

- The model sees each enabled skill's name, description, and `SKILL.md` location. When a request matches, it reads the full instructions and runs the skill's scripts with the project's trusted agent tools.
- Type `/` in the message box to pick an enabled skill. This inserts `/skill:<name> `; add your request after it. Frame sends the complete `SKILL.md` with that message, which is the reliable way to make a small local model follow a skill. The conversation shows the short `/skill:` command, not the skill body.
- A skill with `disable-model-invocation: true` in its frontmatter is not listed for the model; it is available only through `/skill:<name>`.
- Frame rescans skill folders at the start of each turn, so edits apply to the next message. A renamed or removed skill silently drops out of the projects that enabled it.
- Skills are unavailable in incognito chats and in projects without trusted agent tools, because the model could not read or run them there.

## Credentials

Keep credentials with the skill, not in Frame, prompts, or `SKILL.md`. A common layout is a `.env` beside the scripts with `chmod 600`, loaded by the script itself, for example with `python-dotenv` or `set -a; . ./.env; set +a` in Bash. Frame does not read, inject, or redact these values. Frame starts the agent with a minimal environment (`PATH`, `LANG`, and Frame's own variables), so keys exported in your shell profile are not available to scripts.

Be explicit about the boundary: trusted agent tools can read any file and run any command the Frame Linux account can. Frame instructs the model never to print or read credential files, but it cannot prevent it. Use a dedicated service account, give it only the credentials its skills need, and prefer credentials with limited remote permissions.

## Boundaries

- Skills are trusted administrator content. Review a skill's instructions and scripts before adding its folder: a skill can direct the model to do anything the account can do, without per-command approval.
- Scripts run as the Frame account in the project workspace. This is not a sandbox.
- A stopped or failed script may already have changed remote data. Frame never retries automatically; verify the outcome before asking again.
- Python scripts use their own shebang interpreter. Install their packages for that interpreter; Frame's managed document environment is separate.
- Frame does not install skills from the internet, run a skill's setup steps, or connect to MCP servers.

## Private Tools removal

Skills replace the former Private Tools plugin. On startup Frame deletes stored Private Tools registrations (executable paths, environment-file paths, input definitions, and project toggles). Your scripts and `.env` files are not touched. To reuse such a script, add a `SKILL.md` beside it describing when and how to run it.

## Validation

Automated tests use temporary skill folders, a local mock model, and the real Pi SDK. They cover folder validation and warnings, project enablement and deletion, host-tool gating, skill listing in the system prompt, `/skill:` expansion, collapsed history, and the settings and picker UI. Whether a particular local model chooses and follows your skills well is an acceptance check on your own hardware.
