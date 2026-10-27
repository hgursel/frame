# Skills

Use your existing Agent Skills with Frame. A skill is a folder with a `SKILL.md` (instructions plus `name` and `description` frontmatter) and optional scripts, references, and assets. This is the format used by OpenCode, Claude Code, and Pi, so the same folder works in each tool without conversion. Frame loads skills with the embedded Pi SDK's own loader; there is no separate importer, registry, or cloud service.

## Set up

1. Put your skills in a folder outside the Frame checkout, for example `/opt/frame-skills/<skill-name>/SKILL.md`. Give the Linux account that runs Frame read access to the folder and execute permission on scripts. `~` inside a script refers to temporary sandbox storage.
2. Open **Admin → Skills**, enter one absolute folder path per line, and select **Save skill folders**. Frame lists the skills it found and any warnings, such as a missing description, a duplicate name, or an unreadable folder. **Rescan** refreshes the list after you edit files.
3. As an administrator, open **Project settings → Skills**, select the skills this project may use, and save. File and Python tools are built in; there is no separate enable switch.

Saving settings records folder paths only. It does not run scripts, install dependencies, or contact anything.

## Use in chat

- The model sees each enabled skill's name, description, and `SKILL.md` location. When a request matches, it reads the full instructions and runs the skill's scripts with the project’s isolated tools.
- Type `/` in the message box to pick an enabled skill. This inserts `/skill:<name> `; add your request after it. Frame sends the complete `SKILL.md` with that message, which is the reliable way to make a small local model follow a skill. The conversation shows the short `/skill:` command, not the skill body.
- A skill with `disable-model-invocation: true` in its frontmatter is not listed for the model; it is available only through `/skill:<name>`.
- Frame rescans skill folders at the start of each turn, so edits apply to the next message. A renamed or removed skill silently drops out of the projects that enabled it.
- Skills are unavailable in incognito chats and in projects without file and Python tools, because the model could not read or run them there.

## Credentials and execution

Only administrators can register, list, enable, or use skills in their own projects. Regular users cannot access the global/project skill APIs or use `/skill:` commands. Previously saved selections for regular users are not passed to workers. Configured skill folders are hidden in every sandbox; only enabled administrator skills are mounted back read-only. Do not put credentials, `.env` files, or private organization content inside a generally available skill folder. Frame’s model/SQL credentials stay outside the sandbox and are not passed to scripts.

Scripts can write only the current conversation’s output/work directory and temporary files. Project knowledge, conversation uploads, selected skill files, and required runtime files are read-only. Network access is unrestricted. There is no per-command approval; a failed/stopped remote operation may still have completed and must be checked before retrying. Use `$FRAME_PYTHON` when the managed Python runtime is enabled, or a system interpreter. Home directories and arbitrary host installations are not available.

Linux bubblewrap and permitted user namespaces are required. Missing isolation causes an explicit tool failure, never host execution. Frame does not install skills, execute their setup steps, or contact MCP servers. See [multiuser deployment](MULTIUSER.md).

## Private Tools removal

Skills replace the former Private Tools plugin. On startup Frame deletes stored Private Tools registrations (executable paths, environment-file paths, input definitions, and project toggles). Your scripts and `.env` files are not touched. To reuse such a script, add a `SKILL.md` beside it describing when and how to run it.

## Validation

Automated tests use temporary skill folders, a local mock model, and the real Pi SDK. They cover folder validation and warnings, project enablement and deletion, admin-only access, skill listing in the system prompt, `/skill:` expansion, collapsed history, and the settings and picker UI. Whether a particular local model chooses and follows your skills well is an acceptance check on your own hardware.
