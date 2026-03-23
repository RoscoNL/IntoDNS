#!/usr/bin/env node

'use strict';

const API_BASE = 'https://intodns.ai/api/scan/quick';
const SITE_URL = 'https://intodns.ai';
const VERSION = '2.0.0';

const fs = require('fs');
const path = require('path');

// ANSI color codes
const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  bgRed: '\x1b[41m',
  bgGreen: '\x1b[42m',
  bgYellow: '\x1b[43m',
};

function showHelp() {
  console.log(`
${c.bold}intodns${c.reset} v${VERSION} - DNS & email security scanner powered by IntoDNS.ai

${c.bold}USAGE${c.reset}
  intodns <domain> [domains...]         Scan one or more domains
  intodns scan <domain> [domains...]    Scan one or more domains

${c.bold}OUTPUT OPTIONS${c.reset}
  --json                                Output raw JSON
  --output <file>                       Save results to a JSON file
  --no-color                            Disable colored output
  --category <name>                     Show only a specific category
                                        (dns, email, dnssec, ipv6, security)

${c.bold}SCORING OPTIONS${c.reset}
  --fail-below <score>                  Exit with code 1 if score is below N (0-100)

${c.bold}BASELINE / COMPARISON${c.reset}
  --save-baseline <file>                Save current scan results as a baseline
  --baseline <file>                     Compare results against a saved baseline
                                        (shows what changed since baseline)

${c.bold}WATCH MODE${c.reset}
  --watch [seconds]                     Re-scan periodically (default: 300s / 5 min)
                                        Ctrl+C to stop

${c.bold}EXAMPLES${c.reset}
  ${c.dim}# Single domain scan${c.reset}
  ${c.dim}$ intodns example.com${c.reset}

  ${c.dim}# Scan multiple domains${c.reset}
  ${c.dim}$ intodns site1.com site2.com site3.com${c.reset}

  ${c.dim}# Save baseline and compare later${c.reset}
  ${c.dim}$ intodns example.com --save-baseline baseline.json${c.reset}
  ${c.dim}$ intodns example.com --baseline baseline.json${c.reset}

  ${c.dim}# Watch mode (re-scan every 60 seconds)${c.reset}
  ${c.dim}$ intodns example.com --watch 60${c.reset}

  ${c.dim}# Filter to email security category only${c.reset}
  ${c.dim}$ intodns example.com --category email${c.reset}

  ${c.dim}# Save results to file${c.reset}
  ${c.dim}$ intodns example.com --output report.json${c.reset}

  ${c.dim}# CI/CD: fail if score below 70${c.reset}
  ${c.dim}$ npx intodns mysite.com --fail-below 70${c.reset}

${c.bold}CI/CD INTEGRATION${c.reset}
  Exit codes:
    0  Grade A or B (or score >= --fail-below threshold)
    1  Grade C, D, or F (or score < --fail-below threshold)
    2  Error (invalid domain, network error, etc.)

${c.bold}MORE INFO${c.reset}
  ${c.cyan}${SITE_URL}${c.reset}
`);
}

function gradeColor(grade) {
  if (!grade) return c.dim;
  const g = grade.toUpperCase();
  if (g.startsWith('A')) return c.green;
  if (g === 'B') return c.yellow;
  if (g === 'C' || g === 'D') return c.red;
  if (g === 'F') return c.red;
  return c.white;
}

function severityColor(severity) {
  switch (severity?.toLowerCase()) {
    case 'critical': return c.red;
    case 'high': return c.red;
    case 'medium': return c.yellow;
    case 'low': return c.cyan;
    case 'info': return c.dim;
    default: return c.white;
  }
}

function severityIcon(severity) {
  switch (severity?.toLowerCase()) {
    case 'critical': return '\u2718';
    case 'high': return '\u2718';
    case 'medium': return '\u25B2';
    case 'low': return '\u25CB';
    case 'info': return '\u2139';
    default: return '\u2022';
  }
}

function scoreBar(score, width = 30) {
  const clamped = Math.max(0, Math.min(100, score));
  const filled = Math.round((clamped / 100) * width);
  const empty = Math.max(0, width - filled);
  let color = c.green;
  if (score < 70) color = c.yellow;
  if (score < 50) color = c.red;
  return `${color}${'█'.repeat(filled)}${'░'.repeat(empty)}${c.reset} ${color}${score}/100${c.reset}`;
}

function getPercentage(data) {
  return data.percentage ?? Math.round((data.score / (data.maxScore || 1)) * 100) ?? 0;
}

function getCategories(data) {
  return data.categories || data.categoryScores || {};
}

function getIssues(data) {
  return data.issues || [];
}

function formatCategoryName(name) {
  return name
    .replace(/([A-Z])/g, ' $1')
    .replace(/_/g, ' ')
    .replace(/^\w/, ch => ch.toUpperCase())
    .trim();
}

function formatOutput(data, domain, options) {
  const percentage = getPercentage(data);
  const grade = data.grade ?? '?';
  const categories = getCategories(data);
  const issues = getIssues(data);

  const lines = [];
  lines.push('');
  lines.push(`${c.bold}IntoDNS.ai Scan Report${c.reset}`);
  lines.push(`${c.dim}${'─'.repeat(50)}${c.reset}`);
  lines.push(`${c.bold}Domain:${c.reset}  ${c.cyan}${domain}${c.reset}`);
  lines.push(`${c.bold}Grade:${c.reset}   ${gradeColor(grade)}${c.bold}${grade}${c.reset}`);
  lines.push(`${c.bold}Score:${c.reset}   ${scoreBar(percentage)}`);
  lines.push('');

  // Category breakdown
  const catEntries = Object.entries(categories);
  const filterCat = options.category?.toLowerCase();

  if (catEntries.length > 0) {
    const filtered = filterCat
      ? catEntries.filter(([name]) => name.toLowerCase().includes(filterCat))
      : catEntries;

    if (filtered.length > 0) {
      lines.push(`${c.bold}Categories${c.reset}`);
      lines.push(`${c.dim}${'─'.repeat(50)}${c.reset}`);
      for (const [name, value] of filtered) {
        const catScore = typeof value === 'object'
          ? (value.percentage ?? Math.round((value.score / (value.maxScore || 1)) * 100) ?? 0)
          : value;
        const label = formatCategoryName(name);
        const padding = ' '.repeat(Math.max(1, 22 - label.length));
        lines.push(`  ${label}${padding}${scoreBar(catScore, 20)}`);
      }
      lines.push('');
    }
  }

  // Issues (filter by category if specified)
  const filteredIssues = filterCat
    ? issues.filter(i => (i.category || '').toLowerCase().includes(filterCat))
    : issues;

  if (filteredIssues.length > 0) {
    lines.push(`${c.bold}Issues (${filteredIssues.length})${c.reset}`);
    lines.push(`${c.dim}${'─'.repeat(50)}${c.reset}`);
    for (const issue of filteredIssues) {
      const sev = issue.severity || issue.level || 'info';
      const title = issue.title || issue.message || issue.description || 'Unknown issue';
      lines.push(`  ${severityColor(sev)}${severityIcon(sev)} [${sev.toUpperCase()}]${c.reset} ${title}`);
      if (issue.description && issue.title) {
        lines.push(`    ${c.dim}${issue.description}${c.reset}`);
      }
    }
    lines.push('');
  } else {
    lines.push(`  ${c.green}\u2714 No issues found${filterCat ? ` for category "${options.category}"` : ''}${c.reset}`);
    lines.push('');
  }

  lines.push(`${c.dim}Full report: ${c.cyan}${SITE_URL}/scan/${domain}${c.reset}`);
  lines.push('');

  return lines.join('\n');
}

function formatDiff(current, baseline, domain) {
  const curPct = getPercentage(current);
  const basePct = getPercentage(baseline);
  const delta = curPct - basePct;

  const lines = [];
  lines.push('');
  lines.push(`${c.bold}IntoDNS.ai Comparison Report${c.reset}`);
  lines.push(`${c.dim}${'─'.repeat(50)}${c.reset}`);
  lines.push(`${c.bold}Domain:${c.reset}  ${c.cyan}${domain}${c.reset}`);

  const deltaStr = delta > 0 ? `${c.green}+${delta}${c.reset}` : delta < 0 ? `${c.red}${delta}${c.reset}` : `${c.dim}0${c.reset}`;
  lines.push(`${c.bold}Score:${c.reset}   ${scoreBar(curPct)} (${deltaStr} vs baseline)`);
  lines.push('');

  const curIssues = getIssues(current);
  const baseIssues = getIssues(baseline);
  const baseTitles = new Set(baseIssues.map(i => i.title || i.message || i.description));
  const curTitles = new Set(curIssues.map(i => i.title || i.message || i.description));

  const newIssues = curIssues.filter(i => !baseTitles.has(i.title || i.message || i.description));
  const fixedIssues = baseIssues.filter(i => !curTitles.has(i.title || i.message || i.description));

  if (fixedIssues.length > 0) {
    lines.push(`${c.green}${c.bold}Fixed (${fixedIssues.length})${c.reset}`);
    for (const issue of fixedIssues) {
      lines.push(`  ${c.green}\u2714${c.reset} ${issue.title || issue.message || issue.description}`);
    }
    lines.push('');
  }

  if (newIssues.length > 0) {
    lines.push(`${c.red}${c.bold}New Issues (${newIssues.length})${c.reset}`);
    for (const issue of newIssues) {
      const sev = issue.severity || issue.level || 'info';
      lines.push(`  ${severityColor(sev)}${severityIcon(sev)} [${sev.toUpperCase()}]${c.reset} ${issue.title || issue.message || issue.description}`);
    }
    lines.push('');
  }

  if (fixedIssues.length === 0 && newIssues.length === 0) {
    lines.push(`  ${c.dim}No changes since baseline.${c.reset}`);
    lines.push('');
  }

  return lines.join('\n');
}

function formatMultiSummary(results) {
  const lines = [];
  lines.push('');
  lines.push(`${c.bold}IntoDNS.ai Multi-Domain Summary${c.reset}`);
  lines.push(`${c.dim}${'─'.repeat(60)}${c.reset}`);

  for (const { domain, data, error } of results) {
    if (error) {
      lines.push(`  ${c.red}\u2718${c.reset} ${c.cyan}${domain}${c.reset}  ${c.dim}(error: ${error})${c.reset}`);
      continue;
    }
    const pct = getPercentage(data);
    const grade = data.grade ?? '?';
    const issueCount = getIssues(data).length;
    const padding = ' '.repeat(Math.max(1, 30 - domain.length));
    lines.push(`  ${gradeColor(grade)}${grade}${c.reset}  ${c.cyan}${domain}${padding}${c.reset}  ${scoreBar(pct, 20)}  ${c.dim}${issueCount} issue${issueCount !== 1 ? 's' : ''}${c.reset}`);
  }

  lines.push('');
  return lines.join('\n');
}

async function scanDomain(domain, options) {
  const url = `${API_BASE}?domain=${encodeURIComponent(domain)}`;

  let response;
  try {
    response = await fetch(url, {
      headers: {
        'User-Agent': `intodns-cli/${VERSION}`,
        'Accept': 'application/json',
      },
      signal: AbortSignal.timeout(options.timeout || 30000),
    });
  } catch (err) {
    throw new Error(`Could not connect to IntoDNS.ai API: ${err.message}`);
  }

  if (!response.ok) {
    if (response.status === 429) {
      throw new Error(`Rate limited (429). Please wait a moment and try again.`);
    }
    throw new Error(`API returned status ${response.status}`);
  }

  let data;
  try {
    data = await response.json();
  } catch (err) {
    throw new Error(`Invalid JSON response from API`);
  }

  return data;
}

function loadBaseline(file) {
  if (!fs.existsSync(file)) {
    console.error(`${c.red}Error: Baseline file not found: ${file}${c.reset}`);
    process.exit(2);
  }
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    console.error(`${c.red}Error: Could not parse baseline file: ${err.message}${c.reset}`);
    process.exit(2);
  }
}

function saveBaseline(file, data) {
  try {
    const dir = path.dirname(file);
    if (dir && dir !== '.') fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
    console.log(`${c.green}\u2714 Baseline saved to ${file}${c.reset}`);
  } catch (err) {
    console.error(`${c.red}Error: Could not save baseline: ${err.message}${c.reset}`);
  }
}

async function runScan(domains, options) {
  const multi = domains.length > 1;
  const results = [];

  for (const domain of domains) {
    if (multi) {
      process.stdout.write(`${c.dim}Scanning ${domain}...${c.reset}\r`);
    }

    let data;
    try {
      data = await scanDomain(domain, options);
    } catch (err) {
      results.push({ domain, error: err.message });
      if (!multi) {
        console.error(`${c.red}Error: ${err.message}${c.reset}`);
        process.exit(2);
      }
      continue;
    }

    results.push({ domain, data });
  }

  // Save all results if --output specified
  if (options.output) {
    const output = multi ? results : results[0]?.data;
    try {
      const dir = path.dirname(options.output);
      if (dir && dir !== '.') fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(options.output, JSON.stringify(output, null, 2));
      console.log(`${c.green}\u2714 Results saved to ${options.output}${c.reset}`);
    } catch (err) {
      console.error(`${c.red}Warning: Could not save output file: ${err.message}${c.reset}`);
    }
  }

  // Handle single domain output
  if (!multi && results[0]?.data) {
    const { data } = results[0];
    const domain = domains[0];

    if (options.saveBaseline) {
      saveBaseline(options.saveBaseline, data);
    }

    if (options.baseline) {
      const base = loadBaseline(options.baseline);
      console.log(formatDiff(data, base, domain));
    } else if (options.json) {
      console.log(JSON.stringify(data, null, 2));
    } else {
      console.log(formatOutput(data, domain, options));
    }

    const pct = getPercentage(data);
    const grade = (data.grade ?? 'F').toUpperCase();

    if (options.failBelow !== null && pct < options.failBelow) {
      if (!options.json) {
        console.error(`${c.red}Score ${pct}% is below threshold ${options.failBelow}%${c.reset}`);
      }
      return 1;
    }

    if (options.failBelow === null) {
      return (grade.startsWith('A') || grade === 'B') ? 0 : 1;
    }

    return 0;
  }

  // Multi-domain summary
  if (multi) {
    process.stdout.write(' '.repeat(50) + '\r'); // clear progress line

    if (options.json) {
      console.log(JSON.stringify(results.map(r => ({ domain: r.domain, ...r })), null, 2));
    } else {
      console.log(formatMultiSummary(results));

      // Show detailed report for each domain
      for (const { domain, data, error } of results) {
        if (!error && data) {
          console.log(formatOutput(data, domain, options));
        }
      }
    }

    const hasFailure = results.some(r => {
      if (r.error) return true;
      if (!r.data) return true;
      const pct = getPercentage(r.data);
      const grade = (r.data.grade ?? 'F').toUpperCase();
      if (options.failBelow !== null) return pct < options.failBelow;
      return !grade.startsWith('A') && grade !== 'B';
    });

    return hasFailure ? 1 : 0;
  }

  return 0;
}

// Parse arguments
function parseArgs(argv) {
  const args = argv.slice(2);
  const options = {
    json: false,
    failBelow: null,
    noColor: false,
    output: null,
    saveBaseline: null,
    baseline: null,
    watch: null,
    category: null,
    timeout: 30000,
  };
  const domains = [];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--help' || arg === '-h') {
      showHelp();
      process.exit(0);
    } else if (arg === '--version' || arg === '-v') {
      console.log(VERSION);
      process.exit(0);
    } else if (arg === '--json') {
      options.json = true;
    } else if (arg === '--no-color') {
      options.noColor = true;
    } else if (arg === '--output') {
      options.output = args[++i];
      if (!options.output) {
        console.error('Error: --output requires a file path');
        process.exit(2);
      }
    } else if (arg === '--save-baseline') {
      options.saveBaseline = args[++i];
      if (!options.saveBaseline) {
        console.error('Error: --save-baseline requires a file path');
        process.exit(2);
      }
    } else if (arg === '--baseline') {
      options.baseline = args[++i];
      if (!options.baseline) {
        console.error('Error: --baseline requires a file path');
        process.exit(2);
      }
    } else if (arg === '--watch') {
      const next = args[i + 1];
      if (next && !next.startsWith('-') && /^\d+$/.test(next)) {
        options.watch = parseInt(next, 10);
        i++;
      } else {
        options.watch = 300; // default 5 minutes
      }
    } else if (arg === '--category') {
      options.category = args[++i];
      if (!options.category) {
        console.error('Error: --category requires a category name');
        process.exit(2);
      }
    } else if (arg === '--timeout') {
      const val = parseInt(args[++i], 10);
      if (isNaN(val) || val < 1000) {
        console.error('Error: --timeout requires a number in milliseconds (minimum 1000)');
        process.exit(2);
      }
      options.timeout = val;
    } else if (arg === '--fail-below') {
      const val = parseInt(args[++i], 10);
      if (isNaN(val) || val < 0 || val > 100) {
        console.error('Error: --fail-below requires a number between 0 and 100');
        process.exit(2);
      }
      options.failBelow = val;
    } else if (arg === 'scan') {
      // skip subcommand keyword, domains follow
      continue;
    } else if (!arg.startsWith('-')) {
      // Basic domain validation
      if (!/^[a-zA-Z0-9][a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(arg)) {
        console.error(`${c.red}Error: Invalid domain "${arg}"${c.reset}`);
        process.exit(2);
      }
      domains.push(arg);
    }
  }

  return { domains, options };
}

function disableColors() {
  for (const key of Object.keys(c)) {
    c[key] = '';
  }
}

// Main
(async () => {
  const { domains, options } = parseArgs(process.argv);

  if (options.noColor || process.env.NO_COLOR !== undefined || !process.stdout.isTTY) {
    disableColors();
  }

  if (domains.length === 0) {
    showHelp();
    process.exit(2);
  }

  if (options.watch !== null) {
    // Watch mode: run indefinitely
    console.log(`${c.bold}Watch mode${c.reset} — scanning every ${options.watch}s. Press Ctrl+C to stop.`);
    while (true) {
      const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
      console.log(`\n${c.dim}[${now}]${c.reset}`);
      await runScan(domains, options);
      await new Promise(resolve => setTimeout(resolve, options.watch * 1000));
    }
  } else {
    const code = await runScan(domains, options);
    process.exit(code);
  }
})();
