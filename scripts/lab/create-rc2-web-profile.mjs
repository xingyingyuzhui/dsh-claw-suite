#!/usr/bin/env node
/**
 * Thin redirect: preferred entry is create-v02-web-profile.mjs (web-claw-v02 / 0.2.0-rc.2).
 * Kept so older docs/commands still work.
 */
import { spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const target = join(dirname(fileURLToPath(import.meta.url)), 'create-v02-web-profile.mjs')
console.error('[create-rc2-web-profile] redirecting → create-v02-web-profile.mjs (web-claw-v02 / 0.2.0-rc.2)')
const result = spawnSync(process.execPath, [target, ...process.argv.slice(2)], { stdio: 'inherit' })
process.exit(result.status ?? 1)
