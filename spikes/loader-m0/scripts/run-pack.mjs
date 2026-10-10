#!/usr/bin/env node
/**
 * npm pack all M0 loader spike packages into spikes/loader-m0/dist/
 */

import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const spikeRoot = dirname(__dirname)
const distDir = join(spikeRoot, 'dist')

const PACKAGES = [
  'dsh-claw-loader-probe-core',
  'dsh-claw-loader-probe-a',
  'dsh-claw-loader-probe-suite',
  'dsh-claw-loader-probe-mono',
]

function die(msg, code = 1) {
  console.error(`[run-pack] ${msg}`)
  process.exit(code)
}

rmSync(distDir, { recursive: true, force: true })
mkdirSync(distDir, { recursive: true })

for (const name of PACKAGES) {
  const dir = join(spikeRoot, name)
  if (!existsSync(join(dir, 'package.json'))) {
    die(`missing package: ${dir}`)
  }
  console.log(`[run-pack] packing ${name}…`)
  const result = spawnSync('npm', ['pack', '--pack-destination', distDir], {
    cwd: dir,
    encoding: 'utf8',
    env: {
      ...process.env,
      npm_config_cache: process.env.npm_config_cache || join(process.env.TMPDIR || '/tmp', 'dsh-claw-m0-npm-cache'),
    },
  })
  if (result.status !== 0) {
    die(`${name}: npm pack failed\n${result.stderr || result.stdout || ''}`)
  }
  const line = (result.stdout || '').trim().split('\n').filter(Boolean).at(-1)
  console.log(`[run-pack]   → ${line}`)
}

const tarballs = readdirSync(distDir).filter((f) => f.endsWith('.tgz')).sort()
console.log(`[run-pack] wrote ${tarballs.length} tarball(s) to ${distDir}`)
for (const f of tarballs) console.log(`  ${f}`)
if (tarballs.length !== PACKAGES.length) {
  die(`expected ${PACKAGES.length} tarballs, got ${tarballs.length}`)
}
