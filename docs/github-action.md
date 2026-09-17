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
          - uses: actions/checkout@v5
            with:
              fetch-depth: 0
              persist-credentials: false

          - uses: efegokdemir/shopify-app-changeguard@29ce6c7cf9acfdd126c4d1bdc7bbfaf19746d289
            with:
              base_sha: ${{ github.event.pull_request.base.sha }}
              head_sha: ${{ github.event.pull_request.head.sha }}

The full commit SHA pins the externally tested Action version, including its GitHub Actions job summary and Node.js 24 setup.

No Shopify credentials or npm installation are required in the
consuming repository.

The Action reviews changed Shopify app TOML files, prints JSON
in the GitHub Actions logs and writes a counts-only job summary.
Findings are informational.
Unreviewable configurations fail the check.

This experimental tool does not certify security or approve deployment.
