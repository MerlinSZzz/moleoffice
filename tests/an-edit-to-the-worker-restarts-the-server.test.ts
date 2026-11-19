// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * XcXCy5MM-1q5: a worker-only edit belongs to the supervisor's restart set and names its cause.
 * Mutation: leave the worker's import graph out of theFilesThatRestartTheServer. The case "a
 * worker-only prompt edit counts as a restart and names the changed file" turns red on membership.
 * These are the functions serveDev uses to arm directory watches, classify events and log restarts;
 * the existing git-rewrite test drives the actual restart. No second server is needed here.
 */
import { expect, it } from 'vitest'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { theFilesBuiltFrom } from '../src/config/import-graph.mjs'
import { THE_SERVER_ENTRY, THE_WORKER_ENTRY } from '../src/config/newest-source.mjs'
import { theDirectoriesToWatch, theFilesThatRestartTheServer, theRestartLine, whatChanged } from '../tools/serve-dev.mjs'

const ROOT = fileURLToPath(new URL('..', import.meta.url))

it('a worker-only prompt edit counts as a restart and names the changed file', () => {
  const file = 'src/worker/prompt.ts'
  expect(theFilesBuiltFrom(THE_SERVER_ENTRY, ROOT).files).not.toContain(file)
  expect(theFilesBuiltFrom(THE_WORKER_ENTRY, ROOT).files).toContain(file)

  const restartFiles = new Set(theFilesThatRestartTheServer(ROOT))
  expect(restartFiles.has(file), 'the worker-only prompt cannot trigger a restart').toBe(true)
  const directory = theDirectoriesToWatch([...restartFiles], ROOT).find(({ path, recursive }) => {
    const name = relative(path, join(ROOT, file))
    return recursive ? !name.startsWith('..') : name === 'prompt.ts'
  })
  expect(directory, 'the worker prompt has no directory watch').toBeDefined()
  if (directory === undefined) throw new Error('the worker prompt has no directory watch')

  const changed = whatChanged(directory.path, relative(directory.path, join(ROOT, file)), ROOT)
  expect(changed).toBe(file)
  if (changed === null) throw new Error('the watch did not name the changed prompt')
  expect(restartFiles.has(changed)).toBe(true)
  expect(theRestartLine([changed])).toBe('src/worker/prompt.ts changed')
  expect(restartFiles.has('src/shared/colourroles.ts')).toBe(false)
})
