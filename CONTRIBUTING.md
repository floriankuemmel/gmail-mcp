# Contributing

Thanks for taking a look. This is a small personal project, but contributions are welcome.

## Scope

This server is intentionally focused: local-first, safety-first, low token usage. New tools are welcome if they fit that philosophy. Features that require a cloud component, telemetry, or a shared OAuth client are out of scope.

## Ground rules

- **Never paste email contents, message IDs, OAuth tokens, or screenshots of your inbox** into issues or pull requests. If you need to share a reproduction, redact aggressively or describe the shape of the data instead.
- Keep PRs focused: one change per PR.
- Run `npm audit` before submitting.
- By contributing you agree that your contribution is licensed under the MIT License of this project.

## Running locally

```bash
npm ci
npm run setup    # one-time OAuth
npm start
```

## Reporting security issues

Please do **not** open a public issue for security problems. Use GitHub's Private Vulnerability Reporting (Security tab on the repo) instead.
