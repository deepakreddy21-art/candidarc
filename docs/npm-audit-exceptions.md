# npm audit exceptions

Last reviewed: 2026-09-06  
**Expiry: 2026-12-01** — re-run `npm audit` before this date and remove or refresh entries.

CI fails on **critical** and **high** (`npm audit --audit-level=high`). Moderate findings below are accepted until expiry because the only available fix is a breaking `npm audit fix --force` that downgrades `drizzle-kit`.

## Accepted findings

| Package / chain | Severity | Advisory | Justification | Expiry |
| --- | --- | --- | --- | --- |
| `esbuild` ≤0.24.2 via `@esbuild-kit/*` → `drizzle-kit` | moderate | [GHSA-67mh-4wv8-2f99](https://github.com/advisories/GHSA-67mh-4wv8-2f99) | Dev-only tooling dependency. Force-fix pulls breaking `drizzle-kit@0.18.1`. Not in production runtime image path for customer traffic. Track upstream drizzle-kit bump. | 2026-12-01 |

## Policy

- Prefer `npm audit --audit-level=high` (blocks high + critical).
- Do not use `--force` in CI to clear moderates.
- If a **high** or **critical** appears that cannot be fixed immediately, document it here with owner, mitigation, and expiry — do not silently ignore.
