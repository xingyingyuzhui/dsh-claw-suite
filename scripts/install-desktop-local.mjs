#!/usr/bin/env node
/**
 * Install dsh-claw-suite (scheme A meta + components) into a DSH profile from local tarballs.
 * Does NOT publish and never touches the npm registry for dsh-claw-* packages.
 *
 * The profile manifest keeps an exact semver pin (Desktop rejects file:/link: there); a pnpm
 * override in the profile's pnpm-workspace.yaml points that pin at the local tarball so later
 * installs in the same profile (e.g. adding another plugin from the GUI) still resolve offline.
 * Every claw tarball is restaged so its dsh-claw-* dependencies use absolute file: URLs.
 *
 *   node scripts/install-desktop-local.mjs                    # release bundle: ./packages; else source tree
 *   node scripts/install-desktop-local.mjs --from <dir>       # prebuilt tarballs elsewhere
 *   node scripts/install-desktop-local.mjs --uninstall
 *   DSH_HOME=~/.dsh-claw-lab node scripts/install-desktop-local.mjs --profile web-claw-v02
 */
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { INSTALL_ORDER, META_PACKAGE as META, componentDir, metaDir } from '../contract/package-shape.mjs'
import { removeOverrides, setOverride } from './profile-overrides.mjs'

const suiteRoot = join(dirname(fileURLToPath(import.meta.url)), '..')

function argValue(flag) {
  const index = process.argv.indexOf(flag)
  return index > 0 ? process.argv[index + 1] : undefined
}

const profileName = argValue('--profile') ?? 'desktop'
const bundledPackages = join(suiteRoot, 'packages')
const fromDir = argValue('--from')
  ? resolve(argValue('--from'))
  : existsSync(bundledPackages) ? bundledPackages : undefined
const uninstall = process.argv.includes('--uninstall')
const profile = join(process.env.DSH_HOME || join(homedir(), '.dsh'), 'profiles', profileName)
const localDir = join(profile, '.dsh-local-plugins')
const workspaceFile = join(profile, 'pnpm-workspace.yaml')
const manifestPath = join(profile, 'package.json')
const DESKTOP_PROFILE_BUNDLES = ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app']

const PACKAGES = INSTALL_ORDER

const LEGACY_NAMES = [
  'dsh-agent-registry',
  'dsh-agent-policy',
  'dsh-session-permissions',
  'dsh-agent-gate',
  'dsh-agent-delegate',
  'dsh-agent-identity',
  'dsh-agent-memory',
  'dsh-observability',
  'dsh-claw-loader-probe-suite',
  'dsh-claw-loader-probe-a',
  'dsh-claw-loader-probe-core',
  // component rows must come only from meta deps — strip direct pins if any
  ...PACKAGES.filter((n) => n !== META),
]

function die(msg, code = 1) {
  console.error(msg)
  process.exit(code)
}

function isClawRow(name) {
  return LEGACY_NAMES.includes(name) || name === META || name.startsWith('dsh-claw-')
}

if (!existsSync(manifestPath)) die(`profile missing: ${profile}`)

const running = profileName === 'desktop'
  ? spawnSync('pgrep', ['-f', 'DeepSeek Harness.app/Contents/MacOS/DeepSeek Harness'], { encoding: 'utf8' })
  : { status: 1 }
if (running.status === 0) {
  die('Quit DeepSeek Harness completely (Cmd+Q) before mutating the Desktop profile.', 2)
}

mkdirSync(localDir, { recursive: true })

const staged = {}

function sourceDir(name) {
  return name === META ? metaDir(suiteRoot) : componentDir(suiteRoot, name)
}

function packFromSource(name) {
  const dir = sourceDir(name)
  if (!existsSync(join(dir, 'package.json'))) die(`missing package dir ${dir}`)
  const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'))
  const dest = join(localDir, `${name}-${pkg.version}.tgz`)
  const cache = mkdtempSync(join(tmpdir(), 'npm-cache-'))
  try {
    const pack = spawnSync('npm', ['pack', '--cache', cache, '--pack-destination', localDir], {
      cwd: dir,
      encoding: 'utf8',
    })
    if (pack.status !== 0) {
      process.stdout.write(pack.stdout || '')
      process.stderr.write(pack.stderr || '')
      die(`npm pack failed for ${name}`, pack.status ?? 1)
    }
  } finally {
    rmSync(cache, { recursive: true, force: true })
  }
  if (!existsSync(dest)) die(`expected ${dest}`)
  return dest
}

/** Exactly one `<name>-<semver>.tgz` must exist in the prebuilt directory. */
function prebuiltTarball(name) {
  const pattern = new RegExp(`^${name.replace(/[-]/g, '\\-')}-(\\d+\\.\\d+\\.\\d+[^/]*)\\.tgz$`)
  const matches = readdirSync(fromDir).filter((file) => pattern.test(file))
  if (matches.length !== 1) die(`--from ${fromDir}: expected exactly one ${name}-<version>.tgz, found ${matches.length}`)
  return join(fromDir, matches[0])
}

/** Extract, point dsh-claw-* deps at already-staged absolute tarballs, repack with a content hash. */
function stage(name, tarball) {
  const stagingDir = mkdtempSync(join(tmpdir(), `claw-desktop-${name}-`))
  try {
    const extract = spawnSync('tar', ['-xzf', tarball, '-C', stagingDir], { encoding: 'utf8' })
    if (extract.status !== 0) die(extract.stderr || `tar extract failed for ${name}`)
    const pkgPath = join(stagingDir, 'package', 'package.json')
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'))
    if (pkg.name !== name) die(`${tarball}: package name is ${pkg.name}, expected ${name}`)
    const deps = { ...(pkg.dependencies || {}) }
    for (const dep of Object.keys(deps).filter((d) => d.startsWith('dsh-claw-'))) {
      if (!staged[dep]) die(`stage ${name}: missing staged dep ${dep}`)
      if (deps[dep] !== staged[dep].version) {
        die(`stage ${name}: depends on ${dep}@${deps[dep]} but ${staged[dep].version} is staged`)
      }
      deps[dep] = `file:${staged[dep].dest}`
    }
    pkg.dependencies = deps
    writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`)
    const repacked = join(stagingDir, 'out.tgz')
    const packTar = spawnSync('tar', ['-czf', repacked, '-C', stagingDir, 'package'], { encoding: 'utf8' })
    if (packTar.status !== 0) die(packTar.stderr || `tar pack failed for ${name}`)
    // pnpm keys file: tarballs by path and keeps the locked integrity, so a rebuilt tarball with an
    // unchanged version would be silently ignored. A content hash in the filename forces re-resolution.
    const hash = createHash('sha256').update(readFileSync(repacked)).digest('hex').slice(0, 10)
    const file = `${name}-${pkg.version}-${hash}.tgz`
    for (const old of readdirSync(localDir)) {
      if (old !== file && old.startsWith(`${name}-`) && old.endsWith('.tgz')) rmSync(join(localDir, old), { force: true })
    }
    const dest = join(localDir, file)
    renameSync(repacked, dest)
    staged[name] = { version: pkg.version, dest }
  } finally {
    rmSync(stagingDir, { recursive: true, force: true })
  }
}

/** Other local plugins are pinned exactly in the manifest; feed pnpm their tarball when it exists. */
function localFileSpec(name, spec) {
  const current = String(spec || '')
  if (current.startsWith('file:')) return current
  const tgz = `${name}-${current}.tgz`
  if (existsSync(join(localDir, tgz))) return `file:./.dsh-local-plugins/${tgz}`
  return current
}

function exactVersion(name, spec) {
  if (staged[name]) return staged[name].version
  const match = String(spec || '').match(/[/]([^/]+)-(\d+\.\d+\.\d+[^/]*)\.tgz$/)
  return match ? match[2] : spec
}

function writeManifest(deps) {
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  manifest.dependencies = deps
  manifest.dsh = {
    ...(manifest.dsh || {}),
    profile: { bundles: [...DESKTOP_PROFILE_BUNDLES, ...Object.keys(deps).sort()] },
  }
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
}

function writeClawOverride(spec) {
  const current = existsSync(workspaceFile) ? readFileSync(workspaceFile, 'utf8') : ''
  const cleared = removeOverrides(current, isClawRow)
  writeFileSync(workspaceFile, spec === undefined ? cleared : setOverride(cleared, META, spec))
}

function pnpmInstall() {
  const install = spawnSync('pnpm', ['install', '--config.strict-dep-builds=false', '--no-frozen-lockfile'], {
    cwd: profile,
    encoding: 'utf8',
    env: { ...process.env, CI: '' },
  })
  process.stdout.write(install.stdout || '')
  process.stderr.write(install.stderr || '')
  if (install.status !== 0) process.exit(install.status ?? 1)
}

/** Install with local file specs, then pin every row back to an exact version for Desktop boot. */
function installAndPin(installDeps) {
  writeManifest(installDeps)
  pnpmInstall()
  const exact = Object.fromEntries(Object.entries(installDeps).map(([name, spec]) => [name, exactVersion(name, spec)]))
  writeManifest(exact)
  return exact
}

const previous = { ...(JSON.parse(readFileSync(manifestPath, 'utf8')).dependencies || {}) }
const installDeps = {}
for (const [name, spec] of Object.entries(previous)) {
  if (!isClawRow(name)) installDeps[name] = localFileSpec(name, spec)
}

if (uninstall) {
  writeClawOverride(undefined)
  const exact = installAndPin(installDeps)
  console.log(JSON.stringify({
    event: 'dsh-claw-suite.desktop.uninstall',
    profile,
    remaining: Object.keys(exact).sort(),
    ok: true,
  }, null, 2))
  process.exit(0)
}

for (const name of PACKAGES) {
  stage(name, fromDir ? prebuiltTarball(name) : packFromSource(name))
}

const metaSpec = `file:${staged[META].dest}`
writeClawOverride(metaSpec)
installDeps[META] = metaSpec
const exact = installAndPin(installDeps)

const nm = join(profile, 'node_modules')
const present = Object.fromEntries(PACKAGES.map((name) => [name, existsSync(join(nm, name))]))
const allPresent = PACKAGES.every((name) => present[name])

console.log(JSON.stringify({
  event: 'dsh-claw-suite.desktop.local-install',
  profile,
  source: fromDir ?? 'source tree',
  package: `${META}@${staged[META].version}`,
  override: metaSpec,
  nodeModules: present,
  bundles: [...DESKTOP_PROFILE_BUNDLES, ...Object.keys(exact).sort()],
  ok: allPresent,
  next: 'Reopen DeepSeek Harness Desktop; confirm claw rows ACTIVE under Plugins.',
}, null, 2))

if (!allPresent) process.exit(1)
