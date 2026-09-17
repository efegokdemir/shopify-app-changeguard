# ChangeGuard (experimental)

Unofficial open-source prototype for reviewing changes in Shopify app TOML files.
Not affiliated with, endorsed by, or certified by Shopify.

## Status

**v0.1 local proof of concept.** It compares required/optional access scopes,
application_url and [auth].redirect_urls across two local TOML files. URL values
are redacted in findings. Webhook subscriptions, application IDs, unknown fields
and actual deployed state are **not checked**. An empty report is not a security
or deployment approval. Does not access Shopify or deploy anything.

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
This is private/unpublished until initial checks are reviewed; there is no npm release.

## Security

Use anonymized configuration examples. Never commit real secrets, credentials or private
application configurations. CLI is read-only and offline. TOML parse errors are redacted
because parser diagnostics might otherwise contain original source lines.

## Next milestones

Explainable client ID/webhook diffs; regression
fixtures; git revision support; read-only GitHub PR checks; external developer validation.
