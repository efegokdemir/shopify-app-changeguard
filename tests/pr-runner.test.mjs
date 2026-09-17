import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
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
  const run = (base, head, extraEnv = {}) => spawnSync(process.execPath, [runner], {
    cwd: dir,
    encoding: 'utf8',
    env: {
      ...process.env,
      GITHUB_STEP_SUMMARY: '',
      CHANGEGUARD_BASE_SHA: base,
      CHANGEGUARD_HEAD_SHA: head,
      ...extraEnv,
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

test('excludes unrelated changes added to the base branch', () => {
  fixture(({ dir, git, commit, run, base, head }) => {
    git('switch', '-q', '-c', 'updated-base', base);

    writeFileSync(
      join(dir, 'shopify.app.toml'),
      '[access_scopes]\nscopes = "read_orders,write_orders"\n',
    );

    const updatedBase = commit('Unrelated base branch update');
    const result = run(updatedBase, head);

    assert.equal(result.status, 0, result.stderr);

    const report = JSON.parse(result.stdout);
    assert.equal(report.files.length, 1);
    assert.deepEqual(
      report.files[0].findings.map((finding) => finding.ruleId),
      ['SCOPE_REQUIRED_ADDED'],
    );
    assert.ok(report.files[0].findings[0].summary.includes('read_products'));
  });
});

test('writes a summary for a scope change', () => {
  fixture(({ dir, run, base, head }) => {
    const summaryPath = join(dir, 'summary.md');
    const result = run(base, head, {
      GITHUB_STEP_SUMMARY: summaryPath,
    });

    assert.equal(result.status, 0, result.stderr);
    assert.equal(JSON.parse(result.stdout).files.length, 1);

    const summary = readFileSync(summaryPath, 'utf8');
    assert.match(summary, /Configuration files reviewed: 1/);
    assert.match(summary, /Review findings: 1/);
    assert.match(summary, /\| SCOPE_REQUIRED_ADDED \| 1 \|/);
    assert.doesNotMatch(summary, /shopify\.app\.toml/);
  });
});

test('writes a summary when no Shopify configuration changed', () => {
  fixture(({ dir, commit, run, head }) => {
    const summaryPath = join(dir, 'summary.md');
    writeFileSync(join(dir, 'notes.txt'), 'Documentation only\n');
    const next = commit('Update documentation');

    const result = run(head, next, {
      GITHUB_STEP_SUMMARY: summaryPath,
    });

    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(result.stdout).files, []);

    const summary = readFileSync(summaryPath, 'utf8');
    assert.match(summary, /Review findings: 0/);
    assert.match(summary, /Unreviewable configurations: 0/);
  });
});

test('writes a redacted summary and fails for malformed TOML', () => {
  fixture(({ dir, commit, run, head }) => {
    const marker = 'PRIVATE_MARKER_STEP_SUMMARY';
    const summaryPath = join(dir, 'summary.md');

    writeFileSync(
      join(dir, 'shopify.app.toml'),
      `broken = "${marker}\n`,
    );

    const next = commit('Introduce malformed configuration');
    const result = run(head, next, {
      GITHUB_STEP_SUMMARY: summaryPath,
    });

    assert.equal(result.status, 2);
    assert.equal(JSON.parse(result.stdout).unreviewed.length, 1);

    const summary = readFileSync(summaryPath, 'utf8');
    assert.match(summary, /Unreviewable configurations: 1/);

    assert.ok(
      !(result.stdout + result.stderr + summary).includes(marker),
    );
  });
});

test('fails safely when the summary cannot be written', () => {
  fixture(({ dir, run, base, head }) => {
    const result = run(base, head, {
      GITHUB_STEP_SUMMARY: dir,
    });

    assert.equal(result.status, 2);
    assert.equal(JSON.parse(result.stdout).files.length, 1);
    assert.match(result.stderr, /Unable to write GitHub Actions summary/);
    assert.ok(!result.stderr.includes(dir));
  });
});
