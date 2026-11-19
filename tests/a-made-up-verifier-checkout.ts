// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A MADE-UP CHECKOUT OF THE CLOSED UPGRADE'S VERIFIER, FOR ITS DRY FORM (tools/stable/upgrade-stable.criteria.md, "A
 * closed rollback opens the old version (item 24)", (c)).
 *
 * It holds a copy of tools/stable/verify-the-target.mjs and, by a link, this repository's src, which is all the copy
 * imports besides better-sqlite3. It has either no better-sqlite3 at all, or a stand-in whose database cannot be
 * opened. It is made in the test folder, and a test first asks Node whether better-sqlite3 can be found from there.
 */
import { copyFileSync, mkdirSync, realpathSync, symlinkSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { aTestDatabaseFolder } from './a-test-folder.ts'

const REPO = realpathSync(fileURLToPath(new URL('..', import.meta.url)))
export const THE_VERIFIER = join(REPO, 'tools/stable/verify-the-target.mjs')
/** What the stand-in says when it is asked to open a database. */
export const THE_STAND_IN_SAYS = 'This made-up better-sqlite3 cannot open a database.'

/** The copy of the verifier in a new made-up checkout, with no better-sqlite3 or with the stand-in. */
export function aMadeUpVerifierCheckout(betterSqlite: 'none' | 'cannot open'): string {
  const checkout = realpathSync(aTestDatabaseFolder('verifier-checkout'))
  mkdirSync(join(checkout, 'tools/stable'), { recursive: true })
  const verifier = join(checkout, 'tools/stable/verify-the-target.mjs')
  copyFileSync(THE_VERIFIER, verifier)
  symlinkSync(join(REPO, 'src'), join(checkout, 'src'))
  if (betterSqlite === 'cannot open') {
    const module = join(checkout, 'node_modules/better-sqlite3')
    mkdirSync(module, { recursive: true })
    writeFileSync(join(module, 'package.json'), JSON.stringify({ name: 'better-sqlite3', version: '0.0.0', type: 'module', exports: './index.js' }))
    writeFileSync(join(module, 'index.js'), `export default class Database { constructor() { throw new Error(${JSON.stringify(THE_STAND_IN_SAYS)}) } }\n`)
  }
  return verifier
}

/** Where Node finds better-sqlite3 from the copy, or null when it finds none. */
export function whereBetterSqliteIsFoundFrom(verifier: string): string | null {
  try { return createRequire(verifier).resolve('better-sqlite3') } catch (error) { if ((error as { code?: string }).code === 'MODULE_NOT_FOUND') return null; throw error }
}
