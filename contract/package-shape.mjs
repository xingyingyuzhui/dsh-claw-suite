import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
export const SUITE_ROOT = resolve(HERE, '..')

export const RUNTIME_PACKAGE_DIRS = Object.freeze([
  'dsh-claw-core',
  'dsh-claw-observability',
  'dsh-claw-registry',
  'dsh-claw-identity',
  'dsh-claw-policy',
  'dsh-claw-permissions',
  'dsh-claw-gate',
  'dsh-claw-delegate',
  'dsh-claw-memory',
])

export const FORBIDDEN_DEP_PREFIXES = Object.freeze(['file:', 'link:', 'workspace:'])

export const SIBLING_IMPORT_RE = /from\s+['"]\.\.\/dsh-/g

const SKIP_DIR = new Set(['node_modules', '.git', 'dist', 'coverage', '.turbo', 'legacy', 'spikes'])

export const META_PACKAGE = 'dsh-claw-suite'

/** Leaves first: each package's dsh-claw-* deps are staged before it. */
export const INSTALL_ORDER = Object.freeze([
  'dsh-claw-core',
  'dsh-claw-policy',
  'dsh-claw-observability',
  'dsh-claw-identity',
  'dsh-claw-permissions',
  'dsh-claw-memory',
  'dsh-claw-gate',
  'dsh-claw-delegate',
  'dsh-claw-registry',
  META_PACKAGE,
])

/** Collection repo keeps components under plugins/; the flat dev workspace keeps them at the root. */
export function componentDir(suiteRoot, name) {
  const nested = join(suiteRoot, 'plugins', name)
  return existsSync(join(nested, 'package.json')) ? nested : join(suiteRoot, name)
}

/** Collection repo root is the meta package itself; the flat dev workspace has it in a subdir. */
export function metaDir(suiteRoot = SUITE_ROOT) {
  const rootPkg = join(suiteRoot, 'package.json')
  if (existsSync(rootPkg) && JSON.parse(readFileSync(rootPkg, 'utf8')).name === META_PACKAGE) return suiteRoot
  return join(suiteRoot, META_PACKAGE)
}

export function listRuntimePackages(suiteRoot = SUITE_ROOT) {
  const out = []
  for (const name of RUNTIME_PACKAGE_DIRS) {
    const dir = componentDir(suiteRoot, name)
    const pkgPath = join(dir, 'package.json')
    if (!existsSync(pkgPath)) continue
    out.push({ name, dir, pkgPath, pkg: JSON.parse(readFileSync(pkgPath, 'utf8')) })
  }
  return out
}

export function walkSourceFiles(root, { includeTests = false } = {}) {
  const files = []
  function walk(dir) {
    let entries
    try {
      entries = readdirSync(dir)
    } catch {
      return
    }
    for (const name of entries) {
      if (SKIP_DIR.has(name)) continue
      const full = join(dir, name)
      let st
      try {
        st = statSync(full)
      } catch {
        continue
      }
      if (st.isDirectory()) {
        if (!includeTests && name === 'test') continue
        walk(full)
        continue
      }
      if (!/\.(mjs|js|cjs|ts|tsx)$/.test(name)) continue
      files.push(full)
    }
  }
  walk(root)
  return files
}

export function scanSiblingImports(suiteRoot = SUITE_ROOT) {
  const hits = []
  for (const { name, dir } of listRuntimePackages(suiteRoot)) {
    if (name === 'dsh-claw-core') continue
    for (const file of walkSourceFiles(dir, { includeTests: true })) {
      const src = readFileSync(file, 'utf8')
      const re = new RegExp(SIBLING_IMPORT_RE.source, 'g')
      let m
      while ((m = re.exec(src))) {
        const line = src.slice(0, m.index).split('\n').length
        hits.push({
          package: name,
          file: relative(suiteRoot, file),
          line,
          match: m[0],
        })
      }
    }
  }
  return hits
}

export function scanForbiddenDepSpecs(suiteRoot = SUITE_ROOT) {
  const hits = []
  for (const { name, pkg, pkgPath } of listRuntimePackages(suiteRoot)) {
    for (const field of ['dependencies', 'optionalDependencies', 'peerDependencies', 'devDependencies']) {
      const block = pkg[field]
      if (!block || typeof block !== 'object') continue
      for (const [dep, spec] of Object.entries(block)) {
        const text = String(spec || '')
        if (FORBIDDEN_DEP_PREFIXES.some((p) => text.startsWith(p))) {
          hits.push({ package: name, file: relative(suiteRoot, pkgPath), field, dep, spec: text })
        }
      }
    }
  }
  return hits
}

export function scanPatchIdentity(suiteRoot = SUITE_ROOT) {
  const hits = []
  for (const { name, dir, pkg } of listRuntimePackages(suiteRoot)) {
    const patchPath = join(dir, 'cordis.patch.yml')
    if (!existsSync(patchPath)) continue
    const text = readFileSync(patchPath, 'utf8')
    const idMatch = text.match(/^\s*-?\s*id:\s*([^\s#]+)/m)
    const patchId = idMatch ? idMatch[1].trim() : ''
    if (!patchId) {
      hits.push({ package: name, issue: 'missing-patch-id', file: relative(suiteRoot, patchPath) })
      continue
    }
    if (pkg.name && patchId !== pkg.name) {
      hits.push({
        package: name,
        issue: 'name-id-mismatch',
        file: relative(suiteRoot, patchPath),
        packageName: pkg.name,
        patchId,
      })
    }
  }
  return hits
}

export function exportTargets(pkg) {
  const exports = pkg.exports
  if (!exports || typeof exports !== 'object') return []
  const targets = []
  for (const [key, value] of Object.entries(exports)) {
    if (key === './package.json') continue
    if (typeof value === 'string') targets.push(value)
    else if (value && typeof value === 'object') {
      for (const v of Object.values(value)) {
        if (typeof v === 'string') targets.push(v)
      }
    }
  }
  if (typeof pkg.main === 'string') targets.push(pkg.main)
  return [...new Set(targets.map((t) => t.replace(/^\.\//, '')))]
}

export function scanMissingFilesField(suiteRoot = SUITE_ROOT) {
  const hits = []
  for (const { name, dir, pkg } of listRuntimePackages(suiteRoot)) {
    const files = Array.isArray(pkg.files) ? pkg.files : null
    if (!files) {
      hits.push({ package: name, issue: 'missing-files-field' })
      continue
    }
    for (const target of exportTargets(pkg)) {
      if (!target || target === 'package.json') continue
      const abs = join(dir, target)
      if (!existsSync(abs)) {
        hits.push({ package: name, issue: 'export-target-missing', target })
        continue
      }
      const listed = files.some((f) => {
        const norm = String(f).replace(/^\.\//, '')
        return target === norm || target.startsWith(norm.replace(/\/$/, '') + '/')
      })
      if (!listed) {
        hits.push({ package: name, issue: 'files-omits-export', target })
      }
    }
  }
  return hits
}
