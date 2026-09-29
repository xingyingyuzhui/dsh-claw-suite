# PACKAGING_ADR — Claw suite Desktop / meta Loader packaging

**Status: decided — scheme A**

| Field | Value |
|---|---|
| Decision date | 2026-09-29 |
| Winner | **A** — `dsh-claw-suite` meta bundle + component `dependencies` + patch rows naming dependency package ids |
| Plan floor | Desktop product **`0.2.0-rc.1`** / contract + Web lab **`0.2.0-rc.2`** (`dsh-v0.2.0-rc.2` @ `639ed015`) |
| peerDependency | **`^0.2.0-rc.1`** (prerelease-aware; matches rc.1 + rc.2; not bare `^0.2.0`) |
| Fallback | B then C only if A regresses on a future Host; not required for 0.3.0 now |

## Decision table

| Scheme | Meaning | Result |
|---|---|---|
| **A** | Meta + component dependencies; patch rows name dependency package ids | **Accepted** |
| **B** | Single package, subpath export rows | Ready as spike only; not needed |
| **C** | Single package, single Loader row | Not needed |

## Evidence (scheme A)

### Web lab `0.2.0-rc.2` (`web-claw-v02`)

1. Installing only `dsh-claw-loader-probe-suite` pulled `probe-a` + `probe-core`.
2. `--dump-config` composed both rows from the meta patch.

### Desktop product `0.2.0-rc.1`

Script: `spikes/loader-m0/scripts/install-desktop-lab.mjs` (app quit for mutate; reopen for apply).

| Check | Result |
|---|---|
| Cold install meta → nested deps in `node_modules` | Pass |
| Cold start Host apply writes `~/.dsh/lab/loader-m0/probe-a.active` | Pass |
| Profile `cordis.patch.yml` `disabled: true` on `dsh-claw-loader-probe-a` → no marker | Pass |
| Uninstall meta → packages/bundles gone; cold start no marker | Pass |
| Meta depending on unpublished exact `probe-a@9.9.9` → pnpm 404 / install fail; profile restored | Pass |

Nested Desktop deps must use **absolute** `file:` tarball URLs during lab install (relative `file:./…` is rejected by Desktop packaging rules for dependency resolution from registry path). Published 0.3.0 will use exact semver on npmjs, not `file:`.

## Implications for 0.3.0

1. User installs **one** public package: `dsh-claw-suite@<exact>`.
2. Components ship as normal npm dependencies of that meta (plus `dsh-claw-core`).
3. Each component keeps its own `cordis.patch.yml` row id/name; meta may also insert dependency row ids (as the probe suite did) **or** rely on each dependency package’s own `dsh.bundle` contribution — product 0.3.0 should follow whatever Desktop Loader actually composes for dependency bundles (probe proved row-by-name resolution of installed dependency packages).
4. Do not tell users to install 8+1 packages manually.
5. Old `dsh-agent-*` and new `dsh-claw-*` must not be ACTIVE together (install gate).

## Spikes / lab (keep for regression)

- `spikes/loader-m0/` — unpublished probes; `install-desktop-lab.mjs` / `install-web-lab.mjs`
- `scripts/lab/create-v02-web-profile.mjs` — `web-claw-v02`
- Obsolete historical lab: `web-claw-rc2` (0.1.7-rc.2)

## Safety

- Spikes stay `private` / unpublished.
- Lab scripts refuse default targets except the intentional Desktop lab installer (mutates `profiles/desktop` only when app is quit).
- Production claw components were not modified for this ADR.
