# Development and validation

[Back to Frame](../README.md) · [Contributor instructions](../AGENTS.md) · [Architecture](ARCHITECTURE.md)

Optional settings are documented in [.env.example](../.env.example); copy it to `.env` if needed. Both `npm start` and `npm run dev` read `.env`. Runtime model and project configuration is managed in the browser. Deployment-level bind/origin/storage choices remain outside the UI.

For access from another computer, use an HTTPS reverse proxy with the exact `FRAME_ORIGIN`, or a local SSH tunnel. The Node service binds only to loopback. See [deployment notes](DEPLOYMENT.md).

```bash
npm run check
npm test
npm run build
npm run dev
```

`dev` runs the TypeScript server and serves the previously built frontend. Rebuild after frontend changes. No separate frontend process or HMR is required for this scaffold.

Tests use local temporary directories and a mock OpenAI-compatible HTTP server, including a real Pi SDK worker. They do not require a GPU or spend API credits. **A test pass is not verification against your real llama.cpp/model configuration.**

For Python integration coverage, run `npm run python:setup`, then run tests with `FRAME_PYTHON` set to the absolute path of `data/python/venv/bin/python`. CI installs that runtime and runs PDF/DOCX, branded Reports, and complete SDK tool workflow tests. Python-dependent tests are explicitly skipped without `FRAME_PYTHON`; cancellation coverage still runs.

For the optional browser smoke test, run `npx playwright install chromium --only-shell`, then `npm run build && npm run test:ui`. The browser binary is a development dependency, not needed to run Frame. The suites cover chat, MSSQL/Charts, and Reports settings and generation. Set `FRAME_PYTHON` for the document/report workflows. Set `FRAME_REPORT_QA` to a temporary directory when running `tests/reports.test.ts` to retain sample PDFs for visual inspection.

## References

- [Pi SDK](https://pi.dev/docs/latest/sdk)
- [Pi security model](https://pi.dev/docs/latest/security)
- [llama.cpp server](https://github.com/ggml-org/llama.cpp/tree/master/tools/server)
- [Google Open Knowledge Format 0.2](https://github.com/GoogleCloudPlatform/open-knowledge-format/blob/main/SPEC.md)
- [Karpathy's LLM Wiki pattern](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f)
