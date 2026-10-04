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

## Direct LAN access

For a trusted LAN, edit the `.env` in the Frame checkout (replace the address with the Ubuntu server's private IPv4 address, visible in `hostname -I`):

```dotenv
FRAME_HOST=0.0.0.0
FRAME_PORT=3000
FRAME_ORIGIN=http://192.168.1.50:3000
FRAME_ALLOW_HTTP_LAN=true
```

Run `npm run build`, restart `npm start`, and open **http://192.168.1.50:3000** from either computer. Use this same address on the server too: Host and Origin checks deliberately accept only the configured address. `0.0.0.0` is a listen address, not a browser URL. To listen on only one interface, set `FRAME_HOST` to that private IPv4 instead. A DHCP reservation keeps the address stable.

Your existing Frame password still applies. This does not add multiple user accounts. HTTP sends passwords, sessions, and conversation data without encryption; use it only on a trusted LAN. For a shared or untrusted network use HTTPS below. Do not forward this port from your router to the Internet. Keep llama.cpp on server loopback; other computers only need access to Frame.

If Ubuntu's firewall is enabled, allow TCP 3000 only from your actual LAN subnet. For example, `sudo ufw allow from 192.168.1.0/24 to any port 3000 proto tcp` applies only to that example subnet. No firewall rules are changed by Frame.

**systemd:** the supplied service sets its own environment and does not load `.env`. Use `sudo systemctl edit frame` with your real address:

```ini
[Service]
Environment=FRAME_HOST=0.0.0.0
Environment=FRAME_PORT=3000
Environment=FRAME_ORIGIN=http://192.168.1.50:3000
Environment=FRAME_ALLOW_HTTP_LAN=true
```

Then run `sudo systemctl daemon-reload` and `sudo systemctl restart frame`. A non-loopback bind requires an explicit origin. Direct HTTP accepts private IPv4 origins only; internal DNS names require HTTPS.

## HTTPS LAN access

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

The lockfile pins application dependencies. Installing/building requires package-registry access; running against a local model does not require cloud model APIs. Changes to SDK versions must pass the mock integration suite and a real llama.cpp acceptance test. Python document tools install only through the explicit Settings action or `npm run python:setup`; Ubuntu needs `python3-venv`. Skills are loaded only from folders you configure; Frame does not install them or run their setup steps. MCP is not supported.

For the 0.2 update, stop Frame, back up its data directory, pull the latest code, run `npm ci` and `npm run build`, then restart. SQLite adds the knowledge tables without replacing existing projects or conversations. Use Settings to install document tools when PDF/DOCX features are needed. Keep the repository's `python/` folder alongside the compiled application; the Node service invokes its document helper.

The included systemd hardening is defense-in-depth, not a sandbox. Tool execution still has the service account’s accessible files/network, including Frame’s own writable data. Container/VM isolation and organization-level access controls are roadmap work.

## Image message limits

Chat image messages can be up to 12 MiB including JSON/base64 overhead (up to 8 MiB of encoded image files in total). If using a reverse proxy, allow at least 12 MiB request bodies for the messages endpoint; for nginx, use `client_max_body_size 12m;` in the relevant server/location. Images are served through authenticated conversation URLs with `Cache-Control: no-store`. Frame does not configure the llama.cpp vision projector: configure vision support on that server before sending images.
