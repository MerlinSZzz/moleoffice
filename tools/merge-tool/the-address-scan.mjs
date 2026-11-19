// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// @ts-check
/**
 * THE ADDRESS SCAN OF ONE COMMIT'S WHOLE TREE, BY HAND: `node tools/merge-tool/the-address-scan.mjs [<commit>]`, run in
 * the repository to scan, at HEAD when no commit is named. The merge queue runs the same scan at each landing
 * (integrate.mjs, guard 4), and addresses.mjs says what it refuses and lets through. This is for a round that cleans a
 * tree before its entry goes in.
 *
 * It prints each address it refuses on a line of its own, by the file, the line and column or the byte, and the kind of
 * its range, and never the address; then one sentence of what it read. It exits 1 when it refused one, 0 when it refused
 * none, and 2 when it could not scan: a commit the repository does not have, or more than one named.
 */
import { fileURLToPath } from 'node:url'
import { screenTheTree, theFindingSaid, theTreeSaid } from './addresses.mjs'

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const named = process.argv.slice(2)
  if (named.length > 1) {
    process.stderr.write(`The address scan reads one commit, and was named ${String(named.length)}: node tools/merge-tool/the-address-scan.mjs [<commit>].\n`)
    process.exit(2)
  }
  /** @type {import('./addresses.mjs').TheTreeScreen} */
  let screen
  try {
    screen = screenTheTree({ repo: process.cwd(), commit: named[0] ?? 'HEAD' })
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    process.exit(2)
  }
  for (const one of screen.refused) process.stdout.write(`${theFindingSaid(one)}\n`)
  process.stdout.write(`${theTreeSaid(screen)}\n`)
  process.exitCode = screen.refused.length === 0 ? 0 : 1
}
