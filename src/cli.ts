#!/usr/bin/env node
import { readFile, stat } from 'node:fs/promises';
import { parse } from '@iarna/toml';
import { compareConfigs } from './core.js';
import { readConfigAtRef } from './git-refs.js';

function usage(): never {
  console.error('Usage: changeguard --before FILE --after FILE [--json]\n       changeguard --base-ref REF --head-ref REF --file PATH [--json]');
  process.exit(2);
}

async function readConfig(path: string): Promise<Record<string, unknown>> {
  const info = await stat(path);
  if (!info.isFile() || info.size > 1024 * 1024) {
    throw new Error('Input must be a regular TOML file up to 1 MiB: ' + path);
  }
  const source = await readFile(path, 'utf8');
  try {
    return parse(source) as Record<string, unknown>;
  } catch {
    // Parser errors may echo TOML source lines. Do not print their messages.
    throw new Error('Invalid TOML in ' + path + '; file contents were not printed');
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  let before: string | undefined;
  let after: string | undefined;
  let json = false;
  let baseRef: string | undefined;
  let headRef: string | undefined;
  let file: string | undefined;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--json') json = true;
    else if (arg === '--before' && args[i + 1]) before = args[++i];
    else if (arg === '--after' && args[i + 1]) after = args[++i];
    else if (arg === '--base-ref' && args[i + 1]) baseRef = args[++i];
    else if (arg === '--head-ref' && args[i + 1]) headRef = args[++i];
    else if (arg === '--file' && args[i + 1]) file = args[++i];
    else usage();
  }
  const fileMode = before !== undefined || after !== undefined;
  const gitMode = baseRef !== undefined || headRef !== undefined || file !== undefined;

  if (fileMode === gitMode) usage();

  let oldConfig: Record<string, unknown>;
  let newConfig: Record<string, unknown>;

  if (gitMode) {
    if (!baseRef || !headRef || !file) usage();
    oldConfig = readConfigAtRef(baseRef, file);
    newConfig = readConfigAtRef(headRef, file);
  } else {
    if (!before || !after) usage();
    [oldConfig, newConfig] = await Promise.all([
      readConfig(before),
      readConfig(after),
    ]);
  }
  const findings = compareConfigs(oldConfig, newConfig);
  const note = 'Experimental: only access_scopes, application_url, auth.redirect_urls and app-specific webhooks are examined; other fields are NOT checked.';
  if (json) console.log(JSON.stringify({ schemaVersion: 1, note, findings }, null, 2));
  else {
    console.log('ChangeGuard v0.1 (local prototype)');
    console.log(note);
    if (!findings.length) console.log('No supported-field changes found; this is NOT a deployment approval.');
    for (const finding of findings) console.log(`[REVIEW] ${finding.ruleId}: ${finding.summary}`);
    console.log(`${findings.length} finding(s).`);
  }
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : 'Unexpected failure';
  console.error('ChangeGuard error: ' + message);
  process.exitCode = 2;
});
