#!/usr/bin/env node
/**
 * M0-B: install scheme-A probe suite into Desktop profile via local tarballs.
 * Does NOT publish. Refuses if DeepSeek Harness is running.
 *
 *   node spikes/loader-m0/scripts/install-desktop-lab.mjs
 *   node spikes/loader-m0/scripts/install-desktop-lab.mjs --uninstall
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

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const dist = join(root, 'dist')
const profile = join(homedir(), '.dsh', 'profiles', 'desktop')
const localDir = join(profile, '.dsh-local-plugins')
const DESKTOP_PROFILE_BUNDLES = ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app']
const PROBE_NAMES = [
  'dsh-claw-loader-probe-core',
  'dsh-claw-loader-probe-a',
  'dsh-claw-loader-probe-suite',
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

const pack = spawnSync(process.execPath, [join(root, 'scripts', 'run-pack.mjs')], {
  cwd: root,
  encoding: 'utf8',
})
if (pack.status !== 0) {
  process.stdout.write(pack.stdout || '')
  process.stderr.write(pack.stderr || '')
  die('run-pack failed', pack.status ?? 1)
}

mkdirSync(localDir, { recursive: true })

function tarballFor(name) {
  const pkg = JSON.parse(readFileSync(join(root, name, 'package.json'), 'utf8'))
  return { pkg, file: `${name}-${pkg.version}.tgz`, version: pkg.version }
}

const staged = {}
for (const name of PROBE_NAMES) {
  const { pkg, file, version } = tarballFor(name)
  const src = join(dist, file)
  if (!existsSync(src)) die(`missing packed tarball ${src}`)
  const dest = join(localDir, file)
  copyFileSync(src, dest)
  staged[name] = {
    version,
    dest,
    rel: `file:./.dsh-local-plugins/${file}`,
    abs: `file:${dest}`,
  }
}

/** Restage a packed tarball so selected deps use absolute file: URLs (Desktop rejects relative). */
function restageWithAbsoluteDeps(name, depMap) {
  const stagingDir = mkdtempSync(join(tmpdir(), `claw-desktop-${name}-`))
  try {
    const srcTg = staged[name].dest
    const extract = spawnSync('tar', ['-xzf', srcTg, '-C', stagingDir], { encoding: 'utf8' })
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

const absCore = `file:${staged['dsh-claw-loader-probe-core'].dest}`
restageWithAbsoluteDeps('dsh-claw-loader-probe-a', {
  'dsh-claw-loader-probe-core': absCore,
})
restageWithAbsoluteDeps('dsh-claw-loader-probe-suite', {
  'dsh-claw-loader-probe-a': staged['dsh-claw-loader-probe-a'].abs,
  'dsh-claw-loader-probe-core': absCore,
})

const manifestPath = join(profile, 'package.json')
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
const previous = { ...(manifest.dependencies || {}) }

if (uninstall) {
  for (const name of PROBE_NAMES) delete previous[name]
  const plugins = Object.keys(previous).sort()
  const installDeps = {}
  for (const [name, spec] of Object.entries(previous)) {
    const current = String(spec || '')
    if (current.startsWith('file:')) installDeps[name] = current
    else {
      const tgz = `${name}-${current}.tgz`
      installDeps[name] = existsSync(join(localDir, tgz))
        ? `file:./.dsh-local-plugins/${tgz}`
        : current
    }
  }
  manifest.dependencies = installDeps
  manifest.dsh = {
    ...(manifest.dsh || {}),
    profile: { bundles: [...DESKTOP_PROFILE_BUNDLES, ...plugins] },
  }
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
  const install = spawnSync('pnpm', ['install', '--config.strict-dep-builds=false', '--no-frozen-lockfile'], {
    cwd: profile,
    encoding: 'utf8',
    env: { ...process.env, CI: '' },
  })
  process.stdout.write(install.stdout || '')
  process.stderr.write(install.stderr || '')
  if (install.status !== 0) process.exit(install.status ?? 1)

  const exact = {}
  for (const [name, spec] of Object.entries(installDeps)) {
    const m = String(spec).match(/[/]([^/]+)-(\d+\.\d+\.\d+[^/]*)\.tgz$/)
    exact[name] = m ? m[2] : spec
  }
  manifest.dependencies = exact
  manifest.dsh.profile.bundles = [...DESKTOP_PROFILE_BUNDLES, ...Object.keys(exact).sort()]
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
  console.log(JSON.stringify({
    event: 'claw.loader-m0.desktop.uninstall',
    profile,
    remainingBundles: manifest.dsh.profile.bundles,
    ok: true,
  }, null, 2))
  process.exit(0)
}

const installDeps = {}
for (const [name, spec] of Object.entries(previous)) {
  if (PROBE_NAMES.includes(name)) continue
  const current = String(spec || '')
  if (current.startsWith('file:')) installDeps[name] = current
  else {
    const tgz = `${name}-${current}.tgz`
    installDeps[name] = existsSync(join(localDir, tgz))
      ? `file:./.dsh-local-plugins/${tgz}`
      : current
  }
}
// Only add meta suite to profile deps; its package.json pulls a + core
installDeps['dsh-claw-loader-probe-suite'] = staged['dsh-claw-loader-probe-suite'].rel

const plugins = Object.keys(installDeps).sort()
manifest.dependencies = installDeps
manifest.dsh = {
  ...(manifest.dsh || {}),
  profile: { bundles: [...DESKTOP_PROFILE_BUNDLES, ...plugins] },
}
writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)

const install = spawnSync('pnpm', ['install', '--config.strict-dep-builds=false', '--no-frozen-lockfile'], {
  cwd: profile,
  encoding: 'utf8',
  env: { ...process.env, CI: '' },
})
process.stdout.write(install.stdout || '')
process.stderr.write(install.stderr || '')
if (install.status !== 0) process.exit(install.status ?? 1)

const exact = {}
for (const [name, spec] of Object.entries(installDeps)) {
  if (name === 'dsh-claw-loader-probe-suite') {
    exact[name] = staged[name].version
    continue
  }
  const m = String(spec).match(/[/]([^/]+)-(\d+\.\d+\.\d+[^/]*)\.tgz$/)
  exact[name] = m ? m[2] : spec
}
manifest.dependencies = exact
manifest.dsh.profile.bundles = [...DESKTOP_PROFILE_BUNDLES, ...Object.keys(exact).sort()]
writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)

const nm = join(profile, 'node_modules')
const present = {
  suite: existsSync(join(nm, 'dsh-claw-loader-probe-suite')),
  a: existsSync(join(nm, 'dsh-claw-loader-probe-a')),
  core: existsSync(join(nm, 'dsh-claw-loader-probe-core')),
}

console.log(JSON.stringify({
  event: 'claw.loader-m0.desktop.install',
  profile,
  package: `dsh-claw-loader-probe-suite@${staged['dsh-claw-loader-probe-suite'].version}`,
  nodeModules: present,
  bundles: manifest.dsh.profile.bundles,
  ok: present.suite && present.a && present.core,
  next: 'Reopen DeepSeek Harness Desktop; confirm probe rows ACTIVE and marker ~/.dsh/lab/loader-m0/probe-a.active',
}, null, 2))

if (!present.suite || !present.a || !present.core) process.exit(1)
