# Personal workspaces

Frame runs one installation with local accounts. Admins manage accounts, the model connection, global plugins/connections, installed skills, and execution capacity. Each account creates and manages its own private projects, knowledge, and conversations. There is no project sharing. Administrator accounts do not bypass content ownership in the API. Server operators can still read underlying files.

## Upgrade and first use

1. Stop Frame and back up the entire data directory (database/WAL, settings, projects, sessions, and agent data).
2. Deploy the new build. Existing single-password installations migrate to username `admin`, retaining the old password and assigning existing projects to it. Existing cookies are revoked; log in again. Fresh installs use the printed setup token to create the initial account.
3. In Admin → Users, create accounts with temporary passwords. Users must replace these on first login; existing password reset/disable operations revoke sessions. Disabling preserves their files. For Excel, complete the password change in the main browser first.
4. Admins configure the endpoint base URL, optional key, model ID, context/output budgets, image/tool capabilities, and concurrent model requests. No particular engine is assumed. The default capacity is two requests; benchmark your chosen backend before increasing it.
5. Every newly created account receives its own **Arena** project, including the initial administrator. Existing accounts receive no additional project. Users create projects and manage knowledge directly. File/Python tools are always enabled for ordinary project chats. Excel defaults off for new projects; existing project choices are preserved. Only admins can see or use skills. Uploads stay conversation-only unless intentionally saved to knowledge.

Project and admin settings use wide pages with category navigation. Project categories are General, Knowledge & Library, Plugins, and admin-only Skills. Library references start collapsed with an attachment count. The signed-in display name is the only bottom sidebar row, falling back to username. Its ⋯ menu opens Scheduled Tasks, Settings, Admin (administrators only), and Sign Out. User Settings contains Account and Light/Dark/System appearance, saved per browser. Admin contains installation-wide settings; Context is inside Model, and Document tools is inside Skills. The project list scrolls after four visible rows, leaving the remaining space for conversations. Clicking Frame opens a blank chat in the current project without creating an empty conversation until needed. Admins manage Display Name and Email under Users; regular users cannot edit these fields. Configured SMTP is available in all projects, with a human Send confirmation for each email. See [internal email](EMAIL.md).

SQL uses one read-only login for everyone. Legacy write credentials are ignored; remove unused credentials from backups/configuration under your retention policy. Grant read-only rights at SQL Server—Frame does not change database grants.

## File and Python isolation

Install the Linux `bubblewrap` package and Python 3 on the Frame host. The service account must be permitted to use unprivileged user, mount, and PID namespaces. Ubuntu/AppArmor/container policies may restrict these; configure a scoped policy for the Frame service instead of disabling protections globally.

Commands run with an empty filesystem view populated only with system runtimes, conversation outputs (writable), project knowledge/uploads and enabled skills (read-only), and the optional Python environment. Temporary files live inside that command's sandbox; save persistent work in the conversation output directory. Networking is unrestricted. Frame credentials, host home directories, other projects, and Pi session/agent files are not mounted. No host-execution fallback exists.

Keep installed skill directories free of secrets: any user enabling a skill can read its files. Custom Python runtimes must live in a dedicated runtime directory, not the private data root. File/Python tools perform an isolation check on first use and report an error if unavailable. Constrained chart/report/Word services remain separate from arbitrary commands.

## Concurrency and lifecycle

There is one active response per conversation and no per-user conversation limit. Different conversations can run together even in one project. A FIFO permit surrounds each streaming model request; completion, failure, cancellation, or worker exit releases it. Question waits and tool execution hold no model permit. Queue status is visible in chat. Closing a tab or logging out does not stop normal tasks. Incognito retains its existing temporary expiry. Service restarts mark unfinished work interrupted and never replay accepted prompts automatically.

Knowledge maintenance remains installed with its existing scheduling/settings; it is not redesigned or removed. Its management view is admin-only and filters project content to the current owner.

## Validate before inviting users

Run `npm run check`, `npm test`, `npm run build`, and `npm run test:multiuser-ui`. The suite tests ownership across project/conversation/Excel routes, migration, resets/disabling, queue ordering, same-project concurrency, independent cancellation, and logout survival using mock OpenAI-compatible endpoints. The sandbox integration test explicitly skips when namespaces are unavailable; a skip does not prove successful isolation on that host.

On the deployment host, confirm file/Python tools actually succeed, then verify they cannot read another conversation, write project knowledge, or read Frame settings/credentials (including via symlinks and `/proc`). Exercise concurrent real-model requests, cancellation, images/tool calls, database permissions, and real Excel Desktop. Automated mock checks do not establish backend compatibility or throughput.
