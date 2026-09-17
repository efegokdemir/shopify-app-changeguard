#!/usr/bin/env node
import { readFile, stat } from 'node:fs/promises';
import { parse } from '@iarna/toml';
import { compareConfigs } from './core.js';

function usage(): never {
  console.error('Usage: changeguard --before FILE --after FILE [--json]');
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
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--json') json = true;
    else if (arg === '--before' && args[i + 1]) before = args[++i];
    else if (arg === '--after' && args[i + 1]) after = args[++i];
    else usage();
  }
  if (!before || !after) usage();
  const [oldConfig, newConfig] = await Promise.all([readConfig(before), readConfig(after)]);
  const findings = compareConfigs(oldConfig, newConfig);
  const note = 'Experimental: only access_scopes, application_url and auth.redirect_urls are examined; other fields are NOT checked.';
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
