#!/usr/bin/env node
/**
 * Package graph gate: sibling imports, forbidden dep specs, patch identity, files field.
 * Current suite is expected to fail (sibling import debt) until M1+ migrates to dsh-claw-core.
 */
import { pathToFileURL } from 'node:url'
import {
  scanSiblingImports,
  scanForbiddenDepSpecs,
  scanPatchIdentity,
  scanMissingFilesField,
  SUITE_ROOT,
} from '../contract/package-shape.mjs'

export function collectPackageGraphViolations(suiteRoot = SUITE_ROOT) {
  return {
    siblingImports: scanSiblingImports(suiteRoot),
    forbiddenDeps: scanForbiddenDepSpecs(suiteRoot),
    patchIdentity: scanPatchIdentity(suiteRoot),
    missingFiles: scanMissingFilesField(suiteRoot),
  }
}

function main() {
  const v = collectPackageGraphViolations()
  const total =
    v.siblingImports.length
    + v.forbiddenDeps.length
    + v.patchIdentity.length
    + v.missingFiles.length

  console.log(`sibling imports: ${v.siblingImports.length}`)
  for (const h of v.siblingImports) {
    console.error(`  ${h.file}:${h.line}  ${h.match}`)
  }
  console.log(`forbidden dep specs: ${v.forbiddenDeps.length}`)
  for (const h of v.forbiddenDeps) {
    console.error(`  ${h.file}  ${h.field}.${h.dep}=${h.spec}`)
  }
  console.log(`patch identity: ${v.patchIdentity.length}`)
  for (const h of v.patchIdentity) {
    console.error(`  ${h.file}  ${h.issue} ${h.packageName || ''} ${h.patchId || ''}`)
  }
  console.log(`files field gaps: ${v.missingFiles.length}`)
  for (const h of v.missingFiles) {
    console.error(`  ${h.package}  ${h.issue} ${h.target || ''}`)
  }

  if (total === 0) {
    console.log('verify-package-graph: OK')
    process.exit(0)
  }
  console.error(`verify-package-graph: FAIL (${total} violation(s))`)
  process.exit(1)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main()
}
