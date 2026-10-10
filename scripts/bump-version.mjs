#!/usr/bin/env node
/**
 * Set one version on every dsh-claw-* package and the meta bundle, and pin
 * intra-suite dependencies to it exactly (Desktop rejects ranges and links).
 *
 *   node scripts/bump-version.mjs 0.3.0-rc.2 [--dry-run]
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { listRuntimePackages, META_PACKAGE, metaDir, SUITE_ROOT } from '../contract/package-shape.mjs'

const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/
const DEP_FIELDS = ['dependencies', 'peerDependencies', 'optionalDependencies', 'devDependencies']

export function bumpManifest(pkg, version) {
  const next = { ...pkg, version }
  for (const field of DEP_FIELDS) {
    if (!pkg[field]) continue
    next[field] = Object.fromEntries(Object.entries(pkg[field]).map(([name, spec]) => [
      name,
      name === META_PACKAGE || name.startsWith('dsh-claw-') ? version : spec,
    ]))
  }
  return next
}

export function bumpSuite(version, { suiteRoot = SUITE_ROOT, dryRun = false } = {}) {
  if (!SEMVER.test(version)) throw new Error('not a semver version: ' + version)
  const files = [
    ...listRuntimePackages(suiteRoot).map((row) => row.pkgPath),
    join(metaDir(suiteRoot), 'package.json'),
  ]
  const changed = []
  for (const file of files) {
    const text = readFileSync(file, 'utf8')
    const pkg = JSON.parse(text)
    const out = JSON.stringify(bumpManifest(pkg, version), null, 2) + '\n'
    if (out === text) continue
    changed.push({ file, from: pkg.version })
    if (!dryRun) writeFileSync(file, out)
  }
  return changed
}

function main() {
  const args = process.argv.slice(2)
  const version = args.find((arg) => !arg.startsWith('--'))
  const dryRun = args.includes('--dry-run')
  if (!version) {
    console.error('usage: node scripts/bump-version.mjs <version> [--dry-run]')
    process.exit(2)
  }
  const changed = bumpSuite(version, { dryRun })
  for (const row of changed) console.log(`${dryRun ? 'would bump' : 'bumped'} ${row.file} (${row.from} -> ${version})`)
  if (changed.length === 0) console.log('bump-version: already at ' + version)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main()
}
