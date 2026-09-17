import { spawnSync } from 'node:child_process';
import { compareConfigs } from '../dist/core.js';
import { readConfigAtRef } from '../dist/git-refs.js';

const base = process.env.CHANGEGUARD_BASE_SHA;
const head = process.env.CHANGEGUARD_HEAD_SHA;
const validSha = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/;

function stop(message) {
  console.error(`ChangeGuard: ${message}`);
  process.exit(2);
}

if (!validSha.test(base ?? '') || !validSha.test(head ?? '')) {
  stop('Valid base and head commit SHAs are required.');
}

const result = spawnSync('git', [
  'diff', '--no-renames', '--name-status', '-z',
  base, head, '--',
], {
  encoding: 'buffer',
  maxBuffer: 4 * 1024 * 1024,
});

if (result.error || result.status !== 0) {
  stop('Unable to inspect the Git changes.');
}

const parts = result.stdout.toString('utf8').split('\0');
if (parts.at(-1) === '') parts.pop();

if (parts.length % 2 !== 0) {
  stop('Unexpected Git diff output.');
}

const matches = /(^|\/)shopify\.app(\.[^/]+)?\.toml$/;
const changed = [];

for (let i = 0; i < parts.length; i += 2) {
  const [status, path] = [parts[i], parts[i + 1]];
  if (matches.test(path)) changed.push({ status, path });
}

if (changed.length > 50) {
  stop('Too many configuration changes for this review.');
}

const files = [];
const unreviewed = [];

for (const { status, path } of changed) {
  if (status !== 'M') {
    unreviewed.push({
      path,
      reason: 'Added, deleted or otherwise unsupported change.',
    });
    continue;
  }

  try {
    files.push({
      path,
      findings: compareConfigs(
        readConfigAtRef(base, path),
        readConfigAtRef(head, path),
      ),
    });
  } catch {
    unreviewed.push({
      path,
      reason: 'Configuration could not be analyzed.',
    });
  }
}

console.log(JSON.stringify({
  schemaVersion: 1,
  note: 'Experimental review only; not deployment approval.',
  files,
  unreviewed,
}, null, 2));

if (unreviewed.length > 0) {
  process.exitCode = 2;
}
