#!/usr/bin/env node
/**
 * M0-D: create an isolated Web lab profile pinned to Host/CLI 0.2.0-rc.2.
 *
 * Does NOT touch ~/.dsh/profiles/web or desktop.
 * Does NOT install any Claw production components.
 * Does NOT delete obsolete web-claw-rc2 (0.1.7-rc.2 lab); leave it in place.
 *
 * Usage:
 *   node scripts/lab/create-v02-web-profile.mjs
 *   node scripts/lab/create-v02-web-profile.mjs --force
 */

import { spawnSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const PROFILE_NAME = 'web-claw-v02'
const HOST_PIN = '0.2.0-rc.2'
const DSH_PKG = `@deepseek-ai/dsh@${HOST_PIN}`

const __dirname = dirname(fileURLToPath(import.meta.url))
const labRoot = __dirname
const cliRoot = join(labRoot, `.cli-${HOST_PIN}`)
const force = process.argv.includes('--force')

const dshHome = process.env.DSH_HOME || join(homedir(), '.dsh')
const profilesRoot = join(dshHome, 'profiles')
const profileDir = join(profilesRoot, PROFILE_NAME)

const reserved = new Set(['web', 'desktop', 'headless', 'tui', 'acp', 'sdk', 'sdk-minimal'])

function die(msg, code = 1) {
  console.error(`[create-v02-web-profile] ${msg}`)
  process.exit(code)
}

function log(msg) {
  console.log(`[create-v02-web-profile] ${msg}`)
}

if (reserved.has(PROFILE_NAME)) {
  die(`refusing reserved profile name ${PROFILE_NAME}`)
}

if (existsSync(join(profileDir, 'package.json'))) {
  if (!force) {
    die(
      `profile already exists at ${profileDir}\n` +
        `  Pass --force to recreate (removes only ${PROFILE_NAME}, never web/desktop).`,
    )
  }
  log(`--force: removing ${profileDir}`)
  rmSync(profileDir, { recursive: true, force: true })
}

if (!existsSync(profilesRoot)) {
  try {
    mkdirSync(profilesRoot, { recursive: true })
  } catch (err) {
    die(
      `cannot create ${profilesRoot}: ${err?.code || err?.message || err}\n` +
        `  If EPERM, create the directory manually then re-run this script.`,
    )
  }
}

function ensureV02Cli() {
  const bin = join(cliRoot, 'node_modules', '.bin', 'dsh')
  const pkgJson = join(cliRoot, 'node_modules', '@deepseek-ai', 'dsh', 'package.json')
  if (existsSync(bin) && existsSync(pkgJson)) {
    try {
      const ver = JSON.parse(readFileSync(pkgJson, 'utf8')).version
      if (ver === HOST_PIN) {
        log(`reusing lab CLI ${DSH_PKG} at ${cliRoot}`)
        return bin
      }
      log(`lab CLI version ${ver} != ${HOST_PIN}; reinstalling`)
    } catch {
      log('lab CLI package.json unreadable; reinstalling')
    }
  }

  mkdirSync(cliRoot, { recursive: true })
  const marker = join(cliRoot, 'package.json')
  // Registry gap: dsh-web-app@0.2.0-rc.2 depends on
  // @deepseek-ai/dsh-client-ui-settings-account@0.2.0-rc.2 which was never published.
  // Override to the last published 0.2.0-rc.1 so the lab CLI (dsh@0.2.0-rc.2) can install.
  const labManifest = {
    name: 'dsh-claw-lab-cli-v02',
    private: true,
    description: `Lab-only pin of ${DSH_PKG}; not for production profiles.`,
    overrides: {
      '@deepseek-ai/dsh-client-ui-settings-account': '0.2.0-rc.1',
    },
  }
  writeFileSync(marker, JSON.stringify(labManifest, null, 2) + '\n')

  log(`installing ${DSH_PKG} into ${cliRoot} (may take a minute)…`)
  const install = spawnSync(
    'npm',
    ['install', DSH_PKG, '--no-fund', '--no-audit', '--no-save'],
    {
      cwd: cliRoot,
      stdio: 'inherit',
      env: { ...process.env, npm_config_fund: 'false' },
    },
  )
  if (install.status !== 0) {
    die(`npm install ${DSH_PKG} failed (exit ${install.status})`)
  }
  if (!existsSync(bin)) {
    die(`expected dsh binary missing after install: ${bin}`)
  }
  return bin
}

const dshBin = ensureV02Cli()

const verCheck = spawnSync(dshBin, ['--version'], { encoding: 'utf8' })
const reported = (verCheck.stdout || '').trim()
if (verCheck.status !== 0 || reported !== HOST_PIN) {
  die(`lab dsh --version expected ${HOST_PIN}, got ${JSON.stringify(reported)} (status ${verCheck.status})`)
}
log(`lab CLI reports ${reported}`)

log(`creating profile ${PROFILE_NAME} via --from-default-profile web`)
const create = spawnSync(
  dshBin,
  [PROFILE_NAME, '--from-default-profile', 'web', '--dump-config'],
  {
    encoding: 'utf8',
    env: {
      ...process.env,
      DSH_HOME: dshHome,
      DSH_TELEMETRY_DISABLED: process.env.DSH_TELEMETRY_DISABLED || '1',
    },
    maxBuffer: 8 * 1024 * 1024,
  },
)

if (create.status !== 0) {
  const err = (create.stderr || create.stdout || '').trim()
  if (/EPERM|permission denied/i.test(err) || create.error?.code === 'EPERM') {
    die(
      `writing under ${dshHome} failed with permission error.\n` +
        `  Script is ready; fix ownership of ~/.dsh/profiles then re-run.\n` +
        `  Detail: ${err || create.error?.message || 'EPERM'}`,
    )
  }
  die(
    `profile create failed (exit ${create.status})\n` +
      (create.stderr || create.stdout || create.error?.message || ''),
  )
}

const manifestPath = join(profileDir, 'package.json')
if (!existsSync(manifestPath)) {
  die(`profile create reported success but missing ${manifestPath}`)
}

let manifest
try {
  manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
} catch (err) {
  die(`cannot parse ${manifestPath}: ${err.message}`)
}

const bundles = manifest?.dsh?.profile?.bundles
if (!Array.isArray(bundles) || !bundles.includes('@deepseek-ai/dsh-base') || !bundles.includes('@deepseek-ai/dsh-web-app')) {
  die(`unexpected bundles in ${manifestPath}: ${JSON.stringify(bundles)}`)
}
if (Object.keys(manifest.dependencies || {}).length > 0) {
  die(`refusing non-empty dependencies on fresh lab profile: ${JSON.stringify(manifest.dependencies)}`)
}

const notePath = join(profileDir, 'CLAW_LAB_NOTE.json')
writeFileSync(
  notePath,
  JSON.stringify(
    {
      profile: PROFILE_NAME,
      hostPin: HOST_PIN,
      contractTag: 'dsh-v0.2.0-rc.2',
      desktopProduct: '0.2.0-rc.1',
      peerFloor: '^0.2.0-rc.1',
      labCli: dshBin,
      createdAt: new Date().toISOString(),
      purpose: 'M0 isolated Web lab for Claw 0.3.0 / Loader experiments on DSH 0.2.0',
      obsoleteSibling: 'web-claw-rc2 (0.1.7-rc.2 historical lab; do not use for 0.2 acceptance)',
      doNotUse: [
        'default web profile',
        'default desktop profile',
        'obsolete web-claw-rc2 (0.1.7-rc.2)',
        'global `dsh` binary unless it reports 0.2.0-rc.2',
      ],
      clawComponentsInstalled: false,
    },
    null,
    2,
  ) + '\n',
)

log(`created ${profileDir}`)
log(`wrote ${notePath}`)
console.log('')
console.log('Next steps (Host pin = lab CLI, not global `dsh`):')
console.log(`  export PATH="/opt/homebrew/opt/node@24/bin:$PATH"`)
console.log(`  LAB_DSH="${dshBin}"`)
console.log(`  "$LAB_DSH" --version                    # must print ${HOST_PIN}`)
console.log(`  "$LAB_DSH" --profile ${PROFILE_NAME} --dump-config | head`)
console.log(`  "$LAB_DSH" --profile ${PROFILE_NAME} --no-open --port 0`)
console.log('')
console.log('Acceptance note:')
console.log(`  Floor is Desktop product 0.2.0-rc.1 / Web lab + contract 0.2.0-rc.2.`)
console.log(`  Obsolete web-claw-rc2 (0.1.7-rc.2) is left in place; do not use for 0.2 acceptance.`)
console.log(`  Loader spike install: spikes/loader-m0/scripts/install-web-lab.mjs`)
console.log('')
console.log('Desktop Loader checklist still needed on product 0.2.0-rc.1 before A/B/C (see PACKAGING_ADR.md).')
