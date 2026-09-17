# Install ChangeGuard in another repository

Create `.github/workflows/changeguard.yml` in your Shopify app repository
with the following contents:

    name: Shopify configuration review

    on:
      pull_request:

    permissions:
      contents: read

    jobs:
      review:
        runs-on: ubuntu-latest
        steps:
          - uses: actions/checkout@v4
            with:
              fetch-depth: 0
              persist-credentials: false

          - uses: efegokdemir/shopify-app-changeguard@021f4e89b5464facbe4a1c805d918296e7e29ba0
            with:
              base_sha: ${{ github.event.pull_request.base.sha }}
              head_sha: ${{ github.event.pull_request.head.sha }}

The full commit SHA pins the externally tested Action version.

No Shopify credentials or npm installation are required in the
consuming repository.

The Action reviews changed Shopify app TOML files and prints JSON
in the GitHub Actions logs. Findings are informational.
Unreviewable configurations fail the check.

This experimental tool does not certify security or approve deployment.
