#!/usr/bin/env node
/**
 * Install dsh-claw-suite@0.3.0-rc.1 (scheme A meta + components) into the
 * Desktop profile via local tarballs. Does NOT publish.
 *
 * Desktop rejects relative file: for nested deps — every claw package is
 * restaged so its dsh-claw-* dependencies use absolute file: URLs.
 *
 *   node scripts/install-desktop-local.mjs
 *   node scripts/install-desktop-local.mjs --uninstall
 */
import { spawnSync } from 'node:child_process'
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { META_PACKAGE as META, componentDir, metaDir } from '../contract/package-shape.mjs'

const suiteRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const profile = join(homedir(), '.dsh', 'profiles', 'desktop')
const localDir = join(profile, '.dsh-local-plugins')
const DESKTOP_PROFILE_BUNDLES = ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app']

function packageDir(name) {
  return name === META ? metaDir(suiteRoot) : componentDir(suiteRoot, name)
}

/** Build order: leaves first so restage can point at absolute tarballs. */
const PACKAGES = [
  'dsh-claw-core',
  'dsh-claw-policy',
  'dsh-claw-observability',
  'dsh-claw-identity',
  'dsh-claw-permissions',
  'dsh-claw-memory',
  'dsh-claw-gate',
  'dsh-claw-delegate',
  'dsh-claw-registry',
  'dsh-claw-suite',
]

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

const uninstall = process.argv.includes('--uninstall')

function die(msg, code = 1) {
  console.error(msg)
  process.exit(code)
}

if (!existsSync(join(profile, 'package.json'))) {
  die(`Desktop profile missing: ${profile}`)
}

const running = spawnSync('pgrep', ['-f', 'DeepSeek Harness.app/Contents/MacOS/DeepSeek Harness'], {
  encoding: 'utf8',
})
if (running.status === 0) {
  die('Quit DeepSeek Harness completely (Cmd+Q) before mutating the Desktop profile.', 2)
}

mkdirSync(localDir, { recursive: true })

const staged = {}

function packOne(name) {
  const dir = packageDir(name)
  if (!existsSync(join(dir, 'package.json'))) die(`missing package dir ${dir}`)
  const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'))
  const file = `${name}-${pkg.version}.tgz`
  const dest = join(localDir, file)
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
  staged[name] = {
    version: pkg.version,
    dest,
    rel: `file:./.dsh-local-plugins/${file}`,
    abs: `file:${dest}`,
  }
}

function restageWithAbsoluteDeps(name) {
  const pkgPathOnDisk = join(packageDir(name), 'package.json')
  const original = JSON.parse(readFileSync(pkgPathOnDisk, 'utf8'))
  const depNames = Object.keys(original.dependencies || {}).filter((d) => d.startsWith('dsh-claw-'))
  if (depNames.length === 0) return

  const depMap = {}
  for (const dep of depNames) {
    if (!staged[dep]) die(`restage ${name}: missing staged dep ${dep}`)
    depMap[dep] = staged[dep].abs
  }

  const stagingDir = mkdtempSync(join(tmpdir(), `claw-desktop-${name}-`))
  try {
    const extract = spawnSync('tar', ['-xzf', staged[name].dest, '-C', stagingDir], { encoding: 'utf8' })
    if (extract.status !== 0) die(extract.stderr || `tar extract failed for ${name}`)
    const pkgPath = join(stagingDir, 'package', 'package.json')
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'))
    pkg.dependencies = { ...(pkg.dependencies || {}), ...depMap }
    writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`)
    const out = join(localDir, `${name}-${pkg.version}.tgz`)
    const packTar = spawnSync('tar', ['-czf', out, '-C', stagingDir, 'package'], { encoding: 'utf8' })
    if (packTar.status !== 0) die(packTar.stderr || `tar pack failed for ${name}`)
    staged[name].dest = out
    staged[name].rel = `file:./.dsh-local-plugins/${name}-${pkg.version}.tgz`
    staged[name].abs = `file:${out}`
  } finally {
    rmSync(stagingDir, { recursive: true, force: true })
  }
}

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
  const manifestPath = join(profile, 'package.json')
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  const plugins = Object.keys(deps).sort()
  manifest.dependencies = deps
  manifest.dsh = {
    ...(manifest.dsh || {}),
    profile: { bundles: [...DESKTOP_PROFILE_BUNDLES, ...plugins] },
  }
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
  return manifest
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

function finalizeExact(installDeps) {
  const exact = {}
  for (const [name, spec] of Object.entries(installDeps)) {
    exact[name] = exactVersion(name, spec)
  }
  writeManifest(exact)
  return exact
}

const manifestPath = join(profile, 'package.json')
const previous = { ...(JSON.parse(readFileSync(manifestPath, 'utf8')).dependencies || {}) }

if (uninstall) {
  const installDeps = {}
  for (const [name, spec] of Object.entries(previous)) {
    if (LEGACY_NAMES.includes(name) || name === META || name.startsWith('dsh-claw-')) continue
    installDeps[name] = localFileSpec(name, spec)
  }
  writeManifest(installDeps)
  pnpmInstall()
  const exact = finalizeExact(installDeps)
  console.log(JSON.stringify({
    event: 'dsh-claw-suite.desktop.uninstall',
    profile,
    remaining: Object.keys(exact).sort(),
    ok: true,
  }, null, 2))
  process.exit(0)
}

for (const name of PACKAGES) {
  packOne(name)
  restageWithAbsoluteDeps(name)
}

const installDeps = {}
for (const [name, spec] of Object.entries(previous)) {
  if (LEGACY_NAMES.includes(name) || name === META || name.startsWith('dsh-claw-')) continue
  installDeps[name] = localFileSpec(name, spec)
}
installDeps[META] = staged[META].rel

writeManifest(installDeps)
pnpmInstall()
const exact = finalizeExact(installDeps)

const nm = join(profile, 'node_modules')
const present = Object.fromEntries(PACKAGES.map((name) => [name, existsSync(join(nm, name))]))
const allPresent = PACKAGES.every((name) => present[name])

console.log(JSON.stringify({
  event: 'dsh-claw-suite.desktop.local-install',
  profile,
  package: `${META}@${staged[META].version}`,
  nodeModules: present,
  bundles: [...DESKTOP_PROFILE_BUNDLES, ...Object.keys(exact).sort()],
  ok: allPresent,
  next: 'Reopen DeepSeek Harness Desktop; confirm claw rows ACTIVE under Plugins.',
}, null, 2))

if (!allPresent) process.exit(1)
