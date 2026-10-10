# M0-D: isolated 0.2 Web lab

Creates **`web-claw-v02`** under `~/.dsh/profiles/` without touching production `web` or `desktop`.

**Obsolete:** `web-claw-rc2` (Host pin `0.1.7-rc.2`) may still exist on disk from the prior floor. Leave it; do **not** use it for 0.2 acceptance.

## Why a separate profile + CLI pin

| Surface | This machine | Claw 0.3.0 floor |
|---|---|---|
| Global `dsh` | often older (e.g. alpha.2) | **not** acceptable for 0.3.0 |
| Default `web` profile | production plugins | do not use for acceptance |
| Desktop app (product) | **`0.2.0-rc.1`** | acceptance surface |
| Contract / Web lab Host | **`0.2.0-rc.2`** (`dsh-v0.2.0-rc.2`) | lab CLI pin |
| peerDependency | **`^0.2.0-rc.1`** | matches rc.1 + rc.2 (not bare `^0.2.0`) |

Host version follows **which `dsh` binary boots the profile**, not the profile directory name alone. This script therefore installs a lab-local `@deepseek-ai/dsh@0.2.0-rc.2` under `scripts/lab/.cli-0.2.0-rc.2/` (gitignored) and uses that binary to run `--from-default-profile web`.

**Registry note:** npm currently omits `@deepseek-ai/dsh-client-ui-settings-account@0.2.0-rc.2` while `dsh-web-app@0.2.0-rc.2` depends on it. The create script applies an npm `overrides` pin of that one package to `0.2.0-rc.1` so the lab CLI can install; the reported `dsh --version` remains `0.2.0-rc.2`.

## Create

```sh
export PATH="/opt/homebrew/opt/node@24/bin:$PATH"
cd /Users/qin/DSH/plugins/dsh-claw-suite
node scripts/lab/create-v02-web-profile.mjs
# recreate:
node scripts/lab/create-v02-web-profile.mjs --force
```

(`create-rc2-web-profile.mjs` redirects here for compatibility.)

Fresh profile shape (from official `--from-default-profile web`):

```json
{
  "name": "dsh-profile-web-claw-v02",
  "private": true,
  "dependencies": {},
  "dsh": {
    "profile": {
      "bundles": ["@deepseek-ai/dsh-base", "@deepseek-ai/dsh-web-app"]
    }
  }
}
```

M0 does **not** install Claw production components into this profile.

## Run

```sh
LAB_DSH="/Users/qin/DSH/plugins/dsh-claw-suite/scripts/lab/.cli-0.2.0-rc.2/node_modules/.bin/dsh"
"$LAB_DSH" --version   # must be 0.2.0-rc.2
"$LAB_DSH" --profile web-claw-v02 --dump-config
# Custom profile already is a web template — do NOT append a trailing `web` arg.
"$LAB_DSH" --profile web-claw-v02 --no-open --port 0
```

Only safe if that `dsh` reports `0.2.0-rc.2`. Do not use the Homebrew global CLI for lab acceptance unless it matches the pin.

## Loader spike (optional, after create)

```sh
node spikes/loader-m0/scripts/run-pack.mjs
node spikes/loader-m0/scripts/install-web-lab.mjs
```

`install-web-lab.mjs` targets **only** `web-claw-v02` via `file:` tarballs.

## Safety

- Never writes `~/.dsh/profiles/web` or `desktop`
- Refuses overwrite unless `--force`
- On `EPERM` writing `~/.dsh`, the script exits with instructions; fix ownership and re-run
- Does not publish to npmjs
- Does not delete obsolete `web-claw-rc2`
