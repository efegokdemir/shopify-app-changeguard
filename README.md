# ChangeGuard (experimental)

Unofficial open-source prototype for reviewing changes in Shopify app TOML files.
Not affiliated with, endorsed by, or certified by Shopify.

## Status

**v0.1 local proof of concept.** It reviews required/optional access scopes,
application_url, [auth].redirect_urls, webhook API version and app-specific
webhook subscription changes across two local TOML files. URLs, delivery
destinations, topics and filter expressions are not printed in findings.
Application IDs, unrelated sections and deployed state are **not checked**.
An empty report is not a security or deployment approval. Does not access Shopify
or deploy anything.

## Develop

Requires Node.js 20+ and npm.

```sh
npm install
npm test
npm run check -- --before examples/before.toml --after examples/after.toml
npm run check -- --before examples/before.toml --after examples/after.toml --json
```

Exit codes: 0 = analysis completed (including review findings), 2 = invalid input/tool error.
A fail-on policy and GitHub Action may be added after the scope diff is validated.
The GitHub repository is intended to be public. No npm release has been published; the package remains private to prevent accidental publication.

## Security

Use anonymized configuration examples. Never commit real secrets, credentials or private
application configurations. CLI is read-only and offline. TOML parse errors are redacted
because parser diagnostics might otherwise contain original source lines.

## Next milestones

Explainable client ID diffs; additional webhook regression
fixtures; git revision support; read-only GitHub PR checks; external developer validation.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

MIT. See [LICENSE](LICENSE).
