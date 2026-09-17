export function renderSummary(report) {
  const files = report.files;
  const unreviewed = report.unreviewed;

  if (!Array.isArray(files) || !Array.isArray(unreviewed)) {
    throw new Error('Invalid ChangeGuard report.');
  }

  const counts = new Map();
  let total = 0;

  for (const file of files) {
    if (!Array.isArray(file.findings)) {
      throw new Error('Invalid findings.');
    }

    for (const finding of file.findings) {
      const id = finding.ruleId;

      if (typeof id !== 'string' ||
          !/^[A-Z][A-Z0-9_]{0,79}$/.test(id)) {
        throw new Error('Invalid rule ID.');
      }

      counts.set(id, (counts.get(id) ?? 0) + 1);
      total++;
    }
  }

  const lines = [
    '## ChangeGuard review',
    '',
    '> Experimental review only; not deployment approval.',
    '',
    `- Configuration files reviewed: ${files.length}`,
    `- Review findings: ${total}`,
    `- Unreviewable configurations: ${unreviewed.length}`,
  ];

  lines.push('', '### Review status', '');

  if (unreviewed.length > 0) {
    lines.push(
      '**Review incomplete:** Some configurations could not be analysed. The check fails.',
    );
  } else if (total > 0) {
    lines.push(
      '**Manual review recommended:** Supported-field changes were found. Findings are informational and do not fail the check.',
    );
  } else {
    lines.push(
      '**No supported-field changes detected.** This is not a deployment or security approval.',
    );
  }

  if (counts.size) {
    lines.push('', '### Findings by rule', '');
    lines.push('| Rule | Count |', '| --- | ---: |');

    for (const [rule, count] of [...counts].sort()) {
      lines.push(`| ${rule} | ${count} |`);
    }
  }

  if (unreviewed.length) {
    lines.push(
      '',
      'Some configurations could not be reviewed.',
      'See the JSON logs for details.',
    );
  }

  return `${lines.join('\n')}\n`;
}
