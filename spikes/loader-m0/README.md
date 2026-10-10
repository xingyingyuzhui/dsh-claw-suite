# M0-B Loader probe spikes (unpublished)

Local-only packages for deciding Desktop packaging schemes **A / B / C**.  
**Do not publish to npmjs.org.**

## Layout

| Path | Role |
|---|---|
| `dsh-claw-loader-probe-core/` | Tiny shared helper (marker paths); not a Cordis row |
| `dsh-claw-loader-probe-a/` | Thin component: `cordis.patch.yml` + `host.js` that logs apply + writes ACTIVE marker |
| `dsh-claw-loader-probe-suite/` | **Scheme A** meta: depends on probe-a (exact semver in publishable shape); patch rows name the dependency package id |
| `dsh-claw-loader-probe-mono/` | **Scheme B** alternate: one package, subpath export `./row-a`, patch row `name: dsh-claw-loader-probe-mono/row-a` |
| `scripts/run-pack.mjs` | `npm pack` all into `dist/` |
| `scripts/install-web-lab.mjs` | Install meta (scheme A) into **`web-claw-v02` only** via `file:` tarballs |

Scheme **C** (single package, single Loader row) is the mono package with only the root export / one insert — exercise by disabling subpath rows; no third package required for the spike.

Peer floor on spike packages: `@deepseek-ai/dsh@^0.2.0-rc.1`.

## Marker

On `apply`, probe-a (and mono `row-a`) write:

```text
$DSH_HOME/lab/loader-m0/probe-a.active
```

Presence means the Host row reached ACTIVE. Dispose logs; marker is left for inspection.

## Pack

```sh
node spikes/loader-m0/scripts/run-pack.mjs
ls spikes/loader-m0/dist/
```

## Install into Web lab (after M0-D profile exists)

```sh
node scripts/lab/create-v02-web-profile.mjs   # once
node spikes/loader-m0/scripts/run-pack.mjs
node spikes/loader-m0/scripts/install-web-lab.mjs
```

Uses the lab-local `0.2.0-rc.2` CLI from `scripts/lab/.cli-0.2.0-rc.2/` when present.

## Desktop

Desktop product on this machine is **`0.2.0-rc.1`** (acceptance surface); Web lab + contract tag are **`0.2.0-rc.2`**. Version floor no longer blocks Desktop Loader experiments — run the Desktop checklist and record A/B/C in `../../PACKAGING_ADR.md`. Do **not** claim A/B/C from Web-only evidence.
