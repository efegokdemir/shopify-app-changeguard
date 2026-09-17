import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const cli = fileURLToPath(new URL('../dist/cli.js', import.meta.url));
const before = fileURLToPath(new URL('../examples/before.toml', import.meta.url));
const after = fileURLToPath(new URL('../examples/after.toml', import.meta.url));

function run(args) {
  return spawnSync(process.execPath, [cli, ...args], {
    encoding: 'utf8',
  });
}

test('CLI returns valid JSON for the documented example', () => {
  const result = run(['--before', before, '--after', after, '--json']);

  assert.equal(result.status, 0, result.stderr);

  const report = JSON.parse(result.stdout);

  assert.equal(report.schemaVersion, 1);
  assert.ok(Array.isArray(report.findings));
  assert.ok(
    report.findings.some(
      (finding) => finding.ruleId === 'SCOPE_OPTIONAL_TO_REQUIRED',
    ),
  );
});

test('CLI rejects missing required arguments', () => {
  const result = run([]);

  assert.notEqual(result.status, 0);
});

test('CLI rejects malformed TOML', () => {
  const directory = mkdtempSync(join(tmpdir(), 'changeguard-invalid-'));

  try {
    const invalidFile = join(directory, 'invalid.toml');

    writeFileSync(invalidFile, 'application_url = [\n');

    const result = run([
      '--before', invalidFile,
      '--after', after,
      '--json',
    ]);

    assert.notEqual(result.status, 0);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('CLI does not reveal changed application URL values', () => {
  const directory = mkdtempSync(join(tmpdir(), 'changeguard-private-'));

  const oldSecret = 'CHANGEGUARD_PRIVATE_OLD_5D8';
  const newSecret = 'CHANGEGUARD_PRIVATE_NEW_7F2';

  try {
    const oldFile = join(directory, 'before.toml');
    const newFile = join(directory, 'after.toml');

    const makeConfig = (secret) => [
      `application_url = "https://example.test/?token=${secret}"`,
      '',
      '[access_scopes]',
      'scopes = "read_orders"',
      '',
    ].join('\n');

    writeFileSync(oldFile, makeConfig(oldSecret));
    writeFileSync(newFile, makeConfig(newSecret));

    const result = run([
      '--before', oldFile,
      '--after', newFile,
      '--json',
    ]);

    assert.equal(result.status, 0, result.stderr);

    const output = result.stdout + result.stderr;
    const report = JSON.parse(result.stdout);

    assert.ok(report.findings.length > 0);
    assert.ok(!output.includes(oldSecret));
    assert.ok(!output.includes(newSecret));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
