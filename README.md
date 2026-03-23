# intodns

CLI tool for DNS and email security scanning powered by [IntoDNS.ai](https://intodns.ai).

Checks DNS configuration, DNSSEC, SPF, DKIM, DMARC, IPv6, and more — right from your terminal or CI pipeline.

## Installation

```bash
npm install -g intodns
```

Or run directly with npx:

```bash
npx intodns example.com
```

## Usage

```bash
# Scan a single domain
intodns example.com

# Scan multiple domains at once
intodns site1.com site2.com site3.com

# Get raw JSON output
intodns example.com --json

# Save results to a file
intodns example.com --output report.json

# Fail if score is below a threshold (CI/CD)
intodns example.com --fail-below 80

# Filter to a specific category
intodns example.com --category email

# Disable colored output
intodns example.com --no-color
```

## Baseline Comparison

Track DNS configuration changes over time by saving a baseline and comparing later scans against it.

```bash
# Save current scan as baseline
intodns example.com --save-baseline baseline.json

# (Later) Compare against the baseline
intodns example.com --baseline baseline.json
```

The comparison report highlights new issues and fixed issues since the baseline was saved.

## Watch Mode

Continuously re-scan a domain to monitor for changes in real time.

```bash
# Re-scan every 5 minutes (default)
intodns example.com --watch

# Re-scan every 60 seconds
intodns example.com --watch 60
```

Press `Ctrl+C` to stop.

## Example Output

```
IntoDNS.ai Scan Report
──────────────────────────────────────────────────
Domain:  example.com
Grade:   A
Score:   ████████████████████████████░░ 93/100

Categories
──────────────────────────────────────────────────
  DNS                   ████████████████████░ 100/100
  Email Security        ███████████████░░░░░░  75/100
  DNSSEC                ████████████████████░ 100/100

Issues (1)
──────────────────────────────────────────────────
  ▲ [MEDIUM] DMARC policy is not set to reject

Full report: https://intodns.ai/scan/example.com
```

## Multi-Domain Summary

```
IntoDNS.ai Multi-Domain Summary
────────────────────────────────────────────────────────────
  A  site1.com                    ████████████████████░  93/100  1 issue
  B  site2.com                    ███████████████░░░░░░  75/100  3 issues
  C  site3.com                    ████████░░░░░░░░░░░░░  40/100  8 issues
```

## CI/CD Integration

### GitHub Actions

```yaml
name: DNS Security Check
on:
  schedule:
    - cron: '0 8 * * 1'  # Weekly on Monday
  workflow_dispatch:

jobs:
  dns-check:
    runs-on: ubuntu-latest
    steps:
      - name: Check DNS configuration
        run: npx intodns mysite.com --fail-below 70
```

### GitLab CI

```yaml
dns-security:
  image: node:20-alpine
  script:
    - npx intodns mysite.com --fail-below 70
  only:
    - schedules
```

### Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Grade A or B (or score above `--fail-below` threshold) |
| 1 | Grade C, D, or F (or score below `--fail-below` threshold) |
| 2 | Error (invalid domain, network error, etc.) |

## All Options

| Flag | Description |
|------|-------------|
| `--json` | Output raw JSON from the API |
| `--output <file>` | Save results to a JSON file |
| `--fail-below N` | Exit with code 1 if score is below N (0-100) |
| `--category <name>` | Show only a specific category (dns, email, dnssec, ipv6, security) |
| `--save-baseline <file>` | Save current scan results as a baseline file |
| `--baseline <file>` | Compare results against a saved baseline |
| `--watch [seconds]` | Re-scan periodically (default: 300s) |
| `--timeout <ms>` | API request timeout in milliseconds (default: 30000) |
| `--no-color` | Disable colored output |
| `--help` | Show help |
| `--version` | Show version |

## Requirements

- Node.js 18 or higher (uses native `fetch`)

## Links

- [IntoDNS.ai](https://intodns.ai) — Full web-based DNS analysis
- [GitHub](https://github.com/RoscoNL/intodns) — Source code
- [Cobytes](https://cobytes.com) — Security solutions by Cobytes B.V.

## License

MIT — Cobytes B.V.
