#!/usr/bin/env node
/**
 * Install scheme-A meta spike into web-claw-v02 ONLY via file: tarballs.
 * Never touches default web / desktop profiles.
 */

import { spawnSync } from 'node:child_process'
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const PROFILE = 'web-claw-v02'
const VERSION = '0.0.0-m0.1'
const HOST_PIN = '0.2.0-rc.2'

const __dirname = dirname(fileURLToPath(import.meta.url))
const spikeRoot = dirname(__dirname)
const suiteRoot = dirname(dirname(spikeRoot))
const distDir = join(spikeRoot, 'dist')
const stagingRoot = join(spikeRoot, '.staging')
const labCliRoot = join(suiteRoot, 'scripts', 'lab', `.cli-${HOST_PIN}`)
const labDsh = join(labCliRoot, 'node_modules', '.bin', 'dsh')

const dshHome = process.env.DSH_HOME || join(homedir(), '.dsh')
const profileDir = join(dshHome, 'profiles', PROFILE)

function die(msg, code = 1) {
  console.error(`[install-web-lab] ${msg}`)
  process.exit(code)
}

function log(msg) {
  console.log(`[install-web-lab] ${msg}`)
}

function tarballName(pkg) {
  // npm pack uses name with / → - ; no scope here
  return `${pkg}-${VERSION}.tgz`
}

if (!existsSync(join(profileDir, 'package.json'))) {
  die(
    `profile ${PROFILE} missing at ${profileDir}\n` +
      `  Run: node scripts/lab/create-v02-web-profile.mjs`,
  )
}

if (!existsSync(labDsh)) {
  die(
    `lab CLI missing at ${labDsh}\n` +
      `  Run: node scripts/lab/create-v02-web-profile.mjs`,
  )
}

const reservedTargets = new Set(['web', 'desktop'])
if (reservedTargets.has(PROFILE)) {
  die(`refusing to install into reserved profile ${PROFILE}`)
}

// Ensure publishable packs exist
const need = [
  'dsh-claw-loader-probe-core',
  'dsh-claw-loader-probe-a',
  'dsh-claw-loader-probe-suite',
]
for (const pkg of need) {
  if (!existsSync(join(distDir, tarballName(pkg)))) {
    log('dist incomplete; running run-pack.mjs')
    const pack = spawnSync(process.execPath, [join(__dirname, 'run-pack.mjs')], {
      cwd: spikeRoot,
      stdio: 'inherit',
    })
    if (pack.status !== 0) die('run-pack.mjs failed')
    break
  }
}

rmSync(stagingRoot, { recursive: true, force: true })
mkdirSync(stagingRoot, { recursive: true })

function stagePackage(pkgName, depFileMap) {
  const src = join(spikeRoot, pkgName)
  const dest = join(stagingRoot, pkgName)
  cpSync(src, dest, { recursive: true })
  const manifestPath = join(dest, 'package.json')
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  if (depFileMap && manifest.dependencies) {
    for (const [dep, tgz] of Object.entries(depFileMap)) {
      if (manifest.dependencies[dep] !== undefined) {
        manifest.dependencies[dep] = `file:${tgz}`
      }
    }
  }
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n')
  const pack = spawnSync('npm', ['pack', '--pack-destination', stagingRoot], {
    cwd: dest,
    encoding: 'utf8',
    env: {
      ...process.env,
      npm_config_cache: process.env.npm_config_cache || join(process.env.TMPDIR || '/tmp', 'dsh-claw-m0-npm-cache'),
    },
  })
  if (pack.status !== 0) {
    die(`staging pack ${pkgName} failed\n${pack.stderr || pack.stdout || ''}`)
  }
  const out = (pack.stdout || '').trim().split('\n').filter(Boolean).at(-1)
  const stagedTgz = join(stagingRoot, out)
  if (!existsSync(stagedTgz)) die(`expected staged tarball ${stagedTgz}`)
  log(`staged ${pkgName} → ${stagedTgz}`)
  return stagedTgz
}

const coreTgz = resolve(distDir, tarballName('dsh-claw-loader-probe-core'))
const probeAStaged = stagePackage('dsh-claw-loader-probe-a', {
  'dsh-claw-loader-probe-core': coreTgz,
})
const suiteStaged = stagePackage('dsh-claw-loader-probe-suite', {
  'dsh-claw-loader-probe-core': coreTgz,
  'dsh-claw-loader-probe-a': probeAStaged,
})

log(`installing into profile ${PROFILE} via lab dsh ${HOST_PIN}`)
const add = spawnSync(
  labDsh,
  ['plugin', '--profile', PROFILE, 'add', `file:${suiteStaged}`],
  {
    stdio: 'inherit',
    env: {
      ...process.env,
      DSH_HOME: dshHome,
      DSH_TELEMETRY_DISABLED: process.env.DSH_TELEMETRY_DISABLED || '1',
    },
  },
)

if (add.status !== 0) {
  die(`dsh plugin add failed (exit ${add.status})`)
}

const after = JSON.parse(readFileSync(join(profileDir, 'package.json'), 'utf8'))
log(`profile dependencies: ${JSON.stringify(after.dependencies || {}, null, 2)}`)
log(`profile bundles: ${JSON.stringify(after?.dsh?.profile?.bundles || [], null, 2)}`)
console.log('')
console.log('Boot lab Web to verify ACTIVE marker:')
console.log(`  "${labDsh}" --profile ${PROFILE} --no-open --port 0`)
console.log(`  # then check: cat "${join(dshHome, 'lab', 'loader-m0', 'probe-a.active')}"`)
console.log('')
console.log('Scheme B mono is packed in dist/ but not auto-installed; add manually if needed:')
console.log(`  "${labDsh}" plugin --profile ${PROFILE} add file:${join(distDir, tarballName('dsh-claw-loader-probe-mono'))}`)
console.log('  (rewrite mono→core to file: first, same as suite staging)')
