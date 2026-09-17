import type { Finding } from './core.js';

type Config = Record<string, unknown>;

function applicationUrl(config: Config): string | undefined {
  const value = config.application_url;
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error('application_url must be a non-empty string when provided');
  }
  return value;
}

function redirectUrls(config: Config): Set<string> {
  const auth = config.auth;
  if (auth === undefined) return new Set();
  if (typeof auth !== 'object' || auth === null || Array.isArray(auth)) {
    throw new Error('[auth] must be a table when provided');
  }
  const value = (auth as Config).redirect_urls;
  if (value === undefined) return new Set();
  if (!Array.isArray(value) || !value.every((url) => typeof url === 'string' && url.trim())) {
    throw new Error('[auth].redirect_urls must be an array of non-empty strings');
  }
  return new Set(value as string[]);
}

export function compareUrls(before: Config, after: Config): Finding[] {
  // Validate both sides before returning any findings.
  const oldApplicationUrl = applicationUrl(before);
  const newApplicationUrl = applicationUrl(after);
  const oldRedirects = redirectUrls(before);
  const newRedirects = redirectUrls(after);
  const findings: Finding[] = [];

  if (oldApplicationUrl !== newApplicationUrl) {
    const action = oldApplicationUrl === undefined ? 'added'
      : newApplicationUrl === undefined ? 'removed' : 'changed';
    findings.push({
      ruleId: 'APPLICATION_URL_CHANGED',
      severity: 'review',
      field: 'application_url',
      summary: `application_url ${action}; review the intended app environment and destination`,
    });
  }

  const added = [...newRedirects].filter((url) => !oldRedirects.has(url)).length;
  const removed = [...oldRedirects].filter((url) => !newRedirects.has(url)).length;
  if (added || removed) {
    findings.push({
      ruleId: 'AUTH_REDIRECT_URLS_CHANGED',
      severity: 'review',
      field: 'auth.redirect_urls',
      summary: `authorization redirect URL set changed (added: ${added}; removed: ${removed}); review OAuth callback configuration`,
    });
  }

  // Deliberately avoid logging URL values: they may contain secrets in query strings.
  // This is an exact-string comparison, not a URL validity or deployment check.
  return findings;
}
