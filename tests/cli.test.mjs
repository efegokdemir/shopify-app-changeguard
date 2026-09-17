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


test('CLI redacts client IDs in JSON and text output', () => {
  const directory = mkdtempSync(join(tmpdir(), 'changeguard-client-id-'));
  const oldId = 'SYNTHETIC_CLIENT_ID_OLD_4C9';
  const newId = 'SYNTHETIC_CLIENT_ID_NEW_8D2';

  try {
    const oldFile = join(directory, 'before.toml');
    const newFile = join(directory, 'after.toml');

    const config = (id) =>
      `client_id = "${id}"\n\n[access_scopes]\nscopes = "read_orders"\n`;

    writeFileSync(oldFile, config(oldId));
    writeFileSync(newFile, config(newId));

    const json = run([
      '--before', oldFile,
      '--after', newFile,
      '--json',
    ]);

    assert.equal(json.status, 0, json.stderr);

    const report = JSON.parse(json.stdout);
    assert.deepEqual(
      report.findings.map(({ ruleId }) => ruleId),
      ['CLIENT_ID_CHANGED'],
    );

    const plain = run([
      '--before', oldFile,
      '--after', newFile,
    ]);

    assert.equal(plain.status, 0, plain.stderr);
    assert.match(plain.stdout, /CLIENT_ID_CHANGED/);

    for (const output of [
      json.stdout,
      json.stderr,
      plain.stdout,
      plain.stderr,
    ]) {
      assert.equal(output.includes(oldId), false);
      assert.equal(output.includes(newId), false);
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('CLI rejects malformed client IDs without exposing their values', () => {
  const directory = mkdtempSync(join(tmpdir(), 'changeguard-bad-id-'));
  const secret = 'SYNTHETIC_INVALID_CLIENT_ID_6B1';

  try {
    const oldFile = join(directory, 'before.toml');
    const badFile = join(directory, 'after.toml');

    writeFileSync(
      oldFile,
      'client_id = "SYNTHETIC_VALID_ID"\n\n[access_scopes]\nscopes = "read_orders"\n',
    );

    writeFileSync(
      badFile,
      `client_id = ["${secret}"]\n\n[access_scopes]\nscopes = "read_orders"\n`,
    );

    const result = run([
      '--before', oldFile,
      '--after', badFile,
      '--json',
    ]);

    assert.equal(result.status, 2);
    assert.match(result.stderr, /client_id must be a non-empty string/);
    assert.equal((result.stdout + result.stderr).includes(secret), false);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
