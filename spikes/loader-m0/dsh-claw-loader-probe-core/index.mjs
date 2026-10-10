import { mkdirSync, writeFileSync, unlinkSync, existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

/** Lab marker directory under $DSH_HOME (never under production profile node_modules). */
export function markerDir(env = process.env) {
  const home = env.DSH_HOME || join(homedir(), '.dsh')
  return join(home, 'lab', 'loader-m0')
}

export function markerPath(id = 'probe-a', env = process.env) {
  return join(markerDir(env), `${id}.active`)
}

export function writeActiveMarker(id = 'probe-a', env = process.env) {
  const dir = markerDir(env)
  mkdirSync(dir, { recursive: true })
  const path = markerPath(id, env)
  writeFileSync(path, `${new Date().toISOString()}\nACTIVE\nid=${id}\n`, 'utf8')
  return path
}

export function clearActiveMarker(id = 'probe-a', env = process.env) {
  const path = markerPath(id, env)
  if (existsSync(path)) unlinkSync(path)
  return path
}
