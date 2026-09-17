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

          - uses: efegokdemir/shopify-app-changeguard@e1f52e9009797f9b254768eedecc0b9258f37dd7
            with:
              base_sha: ${{ github.event.pull_request.base.sha }}
              head_sha: ${{ github.event.pull_request.head.sha }}

The full commit SHA pins the externally tested Action version, including its GitHub Actions job summary and Node.js 24 setup.

No Shopify credentials or npm installation are required in the
consuming repository.

The Action reviews changed Shopify app TOML files, prints JSON
in the GitHub Actions logs and writes a job summary containing counts,
rule IDs and an explicit review status.

Review outcomes:

- No supported-field changes detected: the check succeeds.
- Manual review recommended: findings are informational and the check succeeds.
- Review incomplete: unreviewable configurations cause the check to fail.

The job summary does not print configuration values, file paths or finding
descriptions. The JSON logs contain additional finding details, so review
their contents before sharing them.

## External integration validation

On 17 September 2026, this pinned Action commit was exercised in a
separate private test repository using synthetic Shopify configurations.

The validation covered:

- A changed configuration with five findings. The Action succeeded and
  displayed the Manual review recommended status.
- A deliberately malformed TOML configuration. The Action exited with
  code 2 and displayed Review incomplete with one unreviewable file.

These tests validate the two scenarios described above. They are not a
security audit, deployment approval or guarantee for other repositories.

This experimental tool does not certify security or approve deployment.
