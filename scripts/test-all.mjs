#!/usr/bin/env node
/**
 * Run `npm test` in each runtime component + core; collect all results; exit non-zero if any fail.
 */
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { listRuntimePackages, SUITE_ROOT } from '../contract/package-shape.mjs'

function main() {
  const results = []
  for (const { name, dir, pkg } of listRuntimePackages(SUITE_ROOT)) {
    if (!pkg.scripts || !pkg.scripts.test) {
      results.push({ name, status: 'skip', reason: 'no test script' })
      continue
    }
    if (!existsSync(join(dir, 'package.json'))) {
      results.push({ name, status: 'skip', reason: 'missing package.json' })
      continue
    }
    console.log(`\n=== npm test (${name}) ===`)
    const r = spawnSync('npm', ['test'], {
      cwd: dir,
      encoding: 'utf8',
      stdio: 'inherit',
      shell: process.platform === 'win32',
    })
    results.push({
      name,
      status: r.status === 0 ? 'pass' : 'fail',
      code: r.status == null ? 1 : r.status,
    })
  }

  console.log('\n=== test-all summary ===')
  let failed = 0
  for (const r of results) {
    if (r.status === 'fail') failed += 1
    console.log(`  ${r.status.padEnd(4)}  ${r.name}${r.reason ? ` (${r.reason})` : ''}`)
  }
  if (failed > 0) {
    console.error(`test-all: FAIL (${failed} package(s))`)
    process.exit(1)
  }
  console.log('test-all: OK')
  process.exit(0)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main()
}
