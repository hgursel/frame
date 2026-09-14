# Ubuntu deployment notes

Run Frame as a dedicated, non-root account. Node 24 and npm are required. Do not give this account passwordless sudo. Only grant the project files and network services it actually needs. The first administrator can enable shell execution, so app administration is a high-trust role.

## Local access

Use `npm ci`, `npm run build`, and `npm start`. Keep the process running. The default origin is exactly `http://127.0.0.1:3000`; using `localhost` instead requires matching FRAME_ORIGIN because Host/Origin checks are strict.

For an SSH tunnel from your workstation:

```bash
ssh -L 3000:127.0.0.1:3000 frame-server
```

Then browse to `http://127.0.0.1:3000`. The endpoint configured in Frame is resolved from the server, not the workstation.

## Service example

`deploy/frame.service` is a template, not an installer. It assumes source/build artifacts in `/opt/frame`, an existing `frame` user/group, and Node at `/usr/bin/node`. Adjust those paths explicitly. The unit uses `StateDirectory=frame` for `/var/lib/frame` and must have read access to the application.

On first startup, an administrator with access to the service journal can retrieve the bootstrap token. Journal access must remain restricted. It is not a password reset mechanism after initialization. Browser-based password rotation is not implemented in the foundation.

## LAN access

Keep Frame on loopback and put an HTTPS reverse proxy in front. Set `FRAME_ORIGIN=https://frame.example.internal` to your real origin. Preserve that Host header; do not replace it with `127.0.0.1`. Forward SSE without buffering. Frame’s password authentication remains required; do not assume a reverse proxy creates project isolation or multi-user authorization.

An illustrative Caddy block:

```caddyfile
frame.example.internal {
    tls internal
    reverse_proxy 127.0.0.1:3000 {
        flush_interval -1
    }
}
```

Replace the example name, arrange DNS, and deploy your organization’s trusted TLS certificate or trust the appropriate internal CA. Do not deploy the literal example as-is. Do not expose the foundation release directly to the Internet.

## Backups

Stop Frame cleanly before backing up the entire configured data directory. Include SQLite plus any WAL/SHM files that remain, settings.json, all Pi sessions, project folders, and agent data. Restore as a unit while the service is stopped, preserving restrictive ownership/permissions. Protect backups as secrets because they contain endpoint tokens and conversation data. Do not commit them to Git.

## Dependencies and updates

The lockfile pins application dependencies. Installing/building requires package-registry access; running against a local model does not require cloud model APIs. Changes to SDK versions must pass the mock integration suite and a real llama.cpp acceptance test. Python document tooling, MCP processes, and extra fonts are not automatically installed in this foundation.

The included systemd hardening is defense-in-depth, not a sandbox. Tool execution still has the service account’s accessible files/network, including Frame’s own writable data. Container/VM isolation and organization-level access controls are roadmap work.
