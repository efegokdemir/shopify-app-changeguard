# ChangeGuard (experimental)

Unofficial open-source prototype for reviewing changes in Shopify app TOML files.
Not affiliated with, endorsed by, or certified by Shopify.

## Status

**Experimental prototype with a tested GitHub Action.** It reviews required/optional access scopes,
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
Review findings are informational; unreviewable changes fail the check.
The GitHub repository is public. No npm release has been published; the package remains private to prevent accidental publication.

## Security

Use anonymized configuration examples. Never commit real secrets, credentials or private
application configurations. CLI is read-only and offline. TOML parse errors are redacted
because parser diagnostics might otherwise contain original source lines.

## Compare Git revisions

Compare two committed versions of the same TOML file:

    npm run check -- --base-ref main --head-ref HEAD --file shopify.app.toml --json

Run inside a Git repository. Both revisions must be commits, and the file must exist in both. Uncommitted changes are ignored. This operation is read-only and does not contact Shopify.

## Next milestones

Explainable client ID diffs; additional webhook regression
fixtures; expanded PR review coverage; external developer validation.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

MIT. See [LICENSE](LICENSE).

## GitHub PR checks

The repository includes an experimental, read-only pull request workflow.
It compares supported Shopify app TOML files between the PR base and head
commits and prints a JSON report in the workflow logs.

Added, deleted or unparseable configuration files cause the review check
to fail instead of silently reporting success. Ordinary review findings
do not currently fail the check.

The workflow also writes a GitHub Actions job summary with review counts
and findings grouped by rule ID. The JSON report remains in the workflow
logs. File paths and finding descriptions are not copied into the summary.

The workflow does not post PR comments, access Shopify or approve deployment.
It is not an independent security boundary against malicious PR code.

## Reusable GitHub Action

See the [installation guide](docs/github-action.md) for a complete workflow example.

Other repositories can use this action in a pull request workflow.
Check out the repository with `fetch-depth: 0` and
`persist-credentials: false` first.

Use `efegokdemir/shopify-app-changeguard@FULL_REVIEWED_COMMIT_SHA`
and provide these inputs:

- `base_sha`: `${{ github.event.pull_request.base.sha }}`
- `head_sha`: `${{ github.event.pull_request.head.sha }}`

Replace the placeholder with a real, reviewed commit SHA.
The v0.1.0 GitHub release is an experimental prerelease. Pin a reviewed full commit SHA for reproducibility.

The action installs its own dependencies and reviews committed Shopify
app TOML changes offline. Findings are informational, while missing or
unreviewable configurations fail the check. It does not access Shopify
or approve deployment.
