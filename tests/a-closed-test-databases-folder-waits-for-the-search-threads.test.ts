// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A CLOSED TEST DATABASE'S FOLDER IS REMOVED ONCE THE SEARCH THREADS BEING STOPPED HAVE STOPPED.
 *
 * A server starts its search thread when it is built, and its close asks the thread to stop without waiting for it
 * (src/server/api/search.ts). A thread still loading when its server closed goes on to open the server's database
 * file. So a test that closed its server and then its test database could remove the database's folder while the
 * thread opened the file in it, and the removal failed with ENOTEMPTY after the file's cases had passed.
 *
 * HELD HERE, with a stop this file holds itself, so that no case waits on a thread's timing:
 *   1. a stop held under the key tests/helpers.ts exports is one the search thread module waits for, so the helper
 *      and the module read the same threads;
 *   2. a test database closed while a stop is held keeps its folder until the stop has settled, and then the folder
 *      is gone;
 *   3. a test database closed while no stop is held has its folder removed at once.
 *
 * MUTATION: remove the folder at once in freshDb's close, whatever is being stopped → case 2 red.
 */
import { existsSync } from 'node:fs'
import { dirname } from 'node:path'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { freshDb, SEARCH_THREADS_BEING_STOPPED, type TestDb } from './helpers.ts'
import { A_HOOK_THAT_IMPORTS_THE_SERVER } from './how-long-a-test-may-take.ts'

let office: TestDb
let theSearchThreadsHaveStopped: () => Promise<void>

beforeAll(async () => {
  office = await freshDb()
  // Imported after freshDb, so the database client it loads is this file's test database.
  const searchThread = await import('../src/server/lib/search-thread.ts')
  theSearchThreadsHaveStopped = searchThread.theSearchThreadsHaveStopped
}, A_HOOK_THAT_IMPORTS_THE_SERVER)

afterAll(() => {
  office?.close()
})

/** The search threads being stopped in this process, read under the key the helper exports. */
function beingStopped(): Set<Promise<void>> {
  const global = globalThis as typeof globalThis & { [SEARCH_THREADS_BEING_STOPPED]?: Set<Promise<void>> }
  return (global[SEARCH_THREADS_BEING_STOPPED] ??= new Set())
}

/** A stop this file holds, kept with the threads being stopped until it is settled, as a thread's own stop is. */
function aHeldStop(): { settle: () => void } {
  let settle = (): void => {}
  const stop = new Promise<void>((resolveIt) => {
    settle = resolveIt
  })
  const stops = beingStopped()
  stops.add(stop)
  void stop.finally(() => stops.delete(stop))
  return { settle }
}

it('is waited for by the search thread module when a stop is held under the key the helper reads', async () => {
  const held = aHeldStop()
  let stopped = false
  const waited = theSearchThreadsHaveStopped().then(() => {
    stopped = true
  })
  try {
    await new Promise((next) => setImmediate(next))
    expect(stopped, 'the module did not wait for a stop held under the helper’s key').toBe(false)
  } finally {
    held.settle()
  }
  await waited
  expect(stopped).toBe(true)
})

it('keeps a closed test database’s folder while a search thread is being stopped, and removes it once the stop settles', async () => {
  const second = await freshDb()
  const folder = dirname(second.file)
  const held = aHeldStop()
  try {
    second.close()
    expect(existsSync(folder), 'the folder was removed while a search thread was being stopped').toBe(true)
  } finally {
    held.settle()
  }
  await expect.poll(() => existsSync(folder), { timeout: 2_000 }).toBe(false)
})

it('removes a closed test database’s folder at once while no search thread is being stopped', async () => {
  const third = await freshDb()
  const folder = dirname(third.file)
  expect(beingStopped().size, 'a search thread is being stopped, so this case would not test the plain close').toBe(0)
  third.close()
  expect(existsSync(folder)).toBe(false)
})
