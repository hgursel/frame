# Working on Frame

- Frame is a self-hosted organizational workspace for local llama.cpp models. No cloud-provider features, telemetry, or silent network fallback.
- Keep the implementation small and concrete. No speculative frameworks, services, provider abstraction layers, or multi-user claims without authorization tests.
- Use US English. Preserve user changes. Never commit data/, secrets, credentials, generated runtime files, or private organization content.
- One implementation agent at a time. Do not delegate unless the user explicitly requests it.
- Pi SDK version and protocol assumptions must be verified against installed code. Update dependency lockfiles and integration tests together.
- Keep chat history authoritative in Pi sessions. Never replay an accepted/interrupted agent task automatically.
- Project directories and child processes are not sandboxes. Keep host-tool risk explicit; no silent elevation or auto-approval.
- Configuring a new integration does not authorize contacting arbitrary external services or running its installer without explicit user action.
- Test with `npm run check`, `npm test`, and `npm run build`. Real llama.cpp tests are a separate acceptance step; do not claim them from a mock test.
- Keep README status and docs/ROADMAP.md honest about implemented versus planned features.
