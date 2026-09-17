import { execFileSync } from 'node:child_process';
import { parse } from '@iarna/toml';

const MAX_BYTES = 1024 * 1024;

function git(args: string[], cwd: string): Buffer {
  try {
    return execFileSync('git', args, {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: MAX_BYTES + 4096,
    });
  } catch {
    throw new Error('Unable to read the requested Git revision or file');
  }
}

export function readConfigAtRef(
  ref: string,
  file: string,
): Record<string, unknown> {
  if (
    !/^[A-Za-z0-9][A-Za-z0-9._/~^-]*$/.test(ref) ||
    ref.includes('..')
  ) {
    throw new Error('Invalid Git revision');
  }

  if (
    !file ||
    file.startsWith('/') ||
    file.includes('\\') ||
    file.includes(':') ||
    file.split('/').some((part) => !part || part === '.' || part === '..')
  ) {
    throw new Error('Invalid repository-relative file path');
  }

  const root = git(
    ['rev-parse', '--show-toplevel'],
    process.cwd(),
  ).toString('utf8').trim();

  const commit = git(
    ['rev-parse', '--verify', '--end-of-options', `${ref}^{commit}`],
    root,
  ).toString('utf8').trim();

  if (!/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(commit)) {
    throw new Error('Invalid resolved Git commit');
  }

  const contents = git(
    ['cat-file', 'blob', `${commit}:${file}`],
    root,
  );

  if (contents.length > MAX_BYTES || contents.includes(0)) {
    throw new Error('Git configuration must be a text file up to 1 MiB');
  }

  try {
    return parse(contents.toString('utf8')) as Record<string, unknown>;
  } catch {
    throw new Error('Invalid TOML in Git revision; contents were not printed');
  }
}
