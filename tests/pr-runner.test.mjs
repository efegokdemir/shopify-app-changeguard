import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const runner = fileURLToPath(new URL('../scripts/check-pr.mjs', import.meta.url));
const oldConfig = '[access_scopes]\nscopes = "read_orders"\n';
const newConfig = '[access_scopes]\nscopes = "read_orders,read_products"\n';

function fixture(check) {
  const dir = mkdtempSync(join(tmpdir(), 'changeguard-pr-'));
  const git = (...args) => execFileSync('git', args, {
    cwd: dir, encoding: 'utf8', stdio: 'pipe',
  }).trim();
  const commit = (message) => {
    git('add', '.');
    git('commit', '-q', '-m', message);
    return git('rev-parse', 'HEAD');
  };
  const run = (base, head) => spawnSync(process.execPath, [runner], {
    cwd: dir,
    encoding: 'utf8',
    env: {
      ...process.env,
      CHANGEGUARD_BASE_SHA: base,
      CHANGEGUARD_HEAD_SHA: head,
    },
  });

  try {
    git('init', '-q', '-b', 'main');
    git('config', 'user.name', 'ChangeGuard Tests');
    git('config', 'user.email', 'tests@example.invalid');
    writeFileSync(join(dir, 'shopify.app.toml'), oldConfig);
    const base = commit('Initial configuration');
    writeFileSync(join(dir, 'shopify.app.toml'), newConfig);
    const head = commit('Update configuration');
    check({ dir, git, commit, run, base, head });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('reports changes in modified Shopify configuration', () => {
  fixture(({ run, base, head }) => {
    const result = run(base, head);
    assert.equal(result.status, 0, result.stderr);
    const report = JSON.parse(result.stdout);
    assert.equal(report.files.length, 1);
    assert.equal(report.files[0].findings[0].ruleId, 'SCOPE_REQUIRED_ADDED');
  });
});

test('ignores changes to unrelated files', () => {
  fixture(({ dir, commit, run, head }) => {
    writeFileSync(join(dir, 'notes.txt'), 'Unrelated change\n');
    const next = commit('Update notes');
    const result = run(head, next);
    assert.equal(result.status, 0, result.stderr);
    const report = JSON.parse(result.stdout);
    assert.deepEqual(report.files, []);
    assert.deepEqual(report.unreviewed, []);
  });
});

test('fails closed when a Shopify configuration is added', () => {
  fixture(({ dir, commit, run, head }) => {
    writeFileSync(join(dir, 'shopify.app.production.toml'), oldConfig);
    const next = commit('Add production configuration');
    const result = run(head, next);
    assert.equal(result.status, 2);
    assert.equal(JSON.parse(result.stdout).unreviewed.length, 1);
  });
});

test('fails closed for malformed Shopify configuration', () => {
  fixture(({ dir, commit, run, head }) => {
    const marker = 'PRIVATE_MARKER_91BC';
    writeFileSync(join(dir, 'shopify.app.toml'), `bad = "${marker}\n`);
    const next = commit('Invalid configuration');
    const result = run(head, next);
    assert.equal(result.status, 2);
    assert.equal(JSON.parse(result.stdout).unreviewed.length, 1);
    assert.ok(!(result.stdout + result.stderr).includes(marker));
  });
});

test('rejects invalid commit identifiers', () => {
  fixture(({ run, head }) => {
    assert.equal(run('invalid-sha', head).status, 2);
  });
});
