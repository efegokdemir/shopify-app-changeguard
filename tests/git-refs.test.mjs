import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const cli = fileURLToPath(new URL('../dist/cli.js', import.meta.url));
const original = '[access_scopes]\nscopes = "read_orders"\noptional_scopes = ["read_products"]\n';
const updated = '[access_scopes]\nscopes = "read_orders,read_products"\n';

function fixture(check) {
  const dir = mkdtempSync(join(tmpdir(), 'changeguard-git-'));
  const git = (...args) => execFileSync('git', args, { cwd: dir, stdio: 'pipe' });
  const run = (args) => spawnSync(process.execPath, [cli, ...args], {
    cwd: dir, encoding: 'utf8',
  });
  try {
    git('init', '-q', '-b', 'main');
    git('config', 'user.name', 'ChangeGuard Tests');
    git('config', 'user.email', 'tests@example.invalid');
    writeFileSync(join(dir, 'shopify.app.toml'), original);
    git('add', '.');
    git('commit', '-q', '-m', 'initial');
    writeFileSync(join(dir, 'shopify.app.toml'), updated);
    git('add', '.');
    git('commit', '-q', '-m', 'update');
    check({ dir, git, run });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const args = (file = 'shopify.app.toml', base = 'HEAD~1') =>
  ['--base-ref', base, '--head-ref', 'HEAD', '--file', file, '--json'];

test('compares committed revisions', () => fixture(({ run }) => {
  const result = run(args());
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).findings[0].ruleId, 'SCOPE_OPTIONAL_TO_REQUIRED');
}));

test('ignores uncommitted changes', () => fixture(({ dir, run }) => {
  writeFileSync(join(dir, 'shopify.app.toml'), original);
  assert.equal(JSON.parse(run(args()).stdout).findings[0].ruleId, 'SCOPE_OPTIONAL_TO_REQUIRED');
}));

test('rejects unknown revisions', () => fixture(({ run }) => {
  assert.notEqual(run(args('shopify.app.toml', 'missing-ref')).status, 0);
}));

test('rejects missing files and traversal', () => fixture(({ run }) => {
  assert.notEqual(run(args('missing.toml')).status, 0);
  assert.notEqual(run(args('../private.toml')).status, 0);
}));

test('rejects mixed input modes', () => fixture(({ run }) => {
  assert.notEqual(run([...args(), '--before', 'a.toml', '--after', 'b.toml']).status, 0);
}));

test('redacts malformed committed TOML', () => fixture(({ dir, git, run }) => {
  const marker = 'PRIVATE_TEST_MARKER_83FA';
  writeFileSync(join(dir, 'shopify.app.toml'), `application_url = "${marker}\n`);
  git('add', '.');
  git('commit', '-q', '-m', 'invalid TOML');
  const result = run(args());
  assert.notEqual(result.status, 0);
  assert.ok(!(result.stdout + result.stderr).includes(marker));
}));
