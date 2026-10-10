#!/usr/bin/env node
/**
 * Build the self-contained GitHub Release asset: prebuilt npm tarballs for every claw package plus
 * the local installer. GitHub source archives omit submodules, so this asset is the install path.
 *
 *   node scripts/build-release.mjs            # → dist/dsh-claw-suite-<version>.tar.gz
 */
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { INSTALL_ORDER, META_PACKAGE as META, componentDir, metaDir } from '../contract/package-shape.mjs'

const suiteRoot = join(dirname(fileURLToPath(import.meta.url)), '..')

const BUNDLED_FILES = [
  'scripts/install-desktop-local.mjs',
  'scripts/profile-overrides.mjs',
  'contract/package-shape.mjs',
]

function die(msg) {
  console.error(msg)
  process.exit(1)
}

function sourceDir(name) {
  return name === META ? metaDir(suiteRoot) : componentDir(suiteRoot, name)
}

function readPkg(name) {
  return JSON.parse(readFileSync(join(sourceDir(name), 'package.json'), 'utf8'))
}

function installGuide(version) {
  return `# dsh-claw-suite ${version}

Claw 治理套件离线安装包（不经过 npm）。Offline install bundle for the Claw governance suite (no npm).

## 安装 / Install

1. 完全退出 DeepSeek Harness（Cmd+Q）。Quit DeepSeek Harness completely.
2. 在本目录运行 / Run in this folder (Node 20+ and pnpm required):

   \`\`\`sh
   node scripts/install-desktop-local.mjs
   \`\`\`

3. 重新打开 DeepSeek Harness，插件页里 9 个 \`dsh-claw-*\` 和 \`dsh-claw-suite\` 应为运行中。
   Reopen DeepSeek Harness; the claw rows should be active under Plugins.

其他 profile / other profile: \`node scripts/install-desktop-local.mjs --profile <name>\`
卸载 / uninstall: \`node scripts/install-desktop-local.mjs --uninstall\`

安装包放在 profile 的 \`.dsh-local-plugins/\`，并在 \`pnpm-workspace.yaml\` 写入一条 \`overrides\`，
这样以后在同一个 profile 里装别的插件也不会去 npm 找 \`dsh-claw-suite\`。
Tarballs are copied into the profile's \`.dsh-local-plugins/\` and a pnpm \`overrides\` entry keeps later
installs in that profile from looking up \`dsh-claw-suite\` on npm.

校验 / verify: \`shasum -a 256 -c SHA256SUMS\`
`
}

const version = readPkg(META).version
for (const name of INSTALL_ORDER) {
  const pkg = readPkg(name)
  if (pkg.version !== version) die(`${name}@${pkg.version} does not match ${META}@${version}; run scripts/bump-version.mjs`)
}

const dist = join(suiteRoot, 'dist')
const bundleName = `${META}-${version}`
const bundleDir = join(dist, bundleName)
rmSync(bundleDir, { recursive: true, force: true })
mkdirSync(join(bundleDir, 'packages'), { recursive: true })

for (const name of INSTALL_ORDER) {
  const cache = mkdtempSync(join(tmpdir(), 'npm-cache-'))
  try {
    const pack = spawnSync('npm', ['pack', '--cache', cache, '--pack-destination', join(bundleDir, 'packages')], {
      cwd: sourceDir(name),
      encoding: 'utf8',
    })
    if (pack.status !== 0) die(`npm pack failed for ${name}\n${pack.stderr}`)
  } finally {
    rmSync(cache, { recursive: true, force: true })
  }
}

for (const rel of BUNDLED_FILES) {
  mkdirSync(dirname(join(bundleDir, rel)), { recursive: true })
  copyFileSync(join(suiteRoot, rel), join(bundleDir, rel))
}
const license = [join(suiteRoot, 'LICENSE'), join(metaDir(suiteRoot), 'LICENSE')].find(existsSync)
if (license) copyFileSync(license, join(bundleDir, 'LICENSE'))
writeFileSync(join(bundleDir, 'INSTALL.md'), installGuide(version))

const sums = readdirSync(join(bundleDir, 'packages'))
  .sort()
  .map((file) => {
    const hash = createHash('sha256').update(readFileSync(join(bundleDir, 'packages', file))).digest('hex')
    return `${hash}  packages/${file}`
  })
if (sums.length !== INSTALL_ORDER.length) die(`expected ${INSTALL_ORDER.length} tarballs, got ${sums.length}`)
writeFileSync(join(bundleDir, 'SHA256SUMS'), `${sums.join('\n')}\n`)

const archive = join(dist, `${bundleName}.tar.gz`)
const tar = spawnSync('tar', ['-czf', archive, '-C', dist, bundleName], { encoding: 'utf8' })
if (tar.status !== 0) die(tar.stderr || 'tar failed')
const archiveSha = createHash('sha256').update(readFileSync(archive)).digest('hex')

console.log(JSON.stringify({ event: 'dsh-claw-suite.release.bundle', version, archive, sha256: archiveSha, packages: sums.length }, null, 2))
