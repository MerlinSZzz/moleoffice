// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A DATA FOLDER MOVE THAT IS STILL COPYING KEEPS BOTH STARTS CLOSED (DF13 of design/window/the-data-folder-move.criteria.md).
 *
 * tests/the-data-folder-move.test.ts proves the check, `whyADataFolderMoveKeepsTheOfficeClosed`, alone. This file proves
 * that both starts ask it: the service command's `start` and the server's own start. Each is run for real.
 *
 * HOW. The mark is read beside the `.env` a start reads, and this worktree reads no `.env` of its own, so a start from it
 * would read the mark in a folder no test may write to. So the starts run from a copy of this checkout, made under the
 * temporary folder, as tests/the-stable-office-checks-its-tag-before-the-database.test.ts copies one. The copy's `.env`
 * names a database in an empty folder of its own, so an empty folder after the start shows that nothing was opened. The
 * mark says `copying` and names this test's own process as the mover, so the mover is alive while the start runs.
 *
 * MUTATIONS, each planted alone with this file run: drop the check from the service command's start, and the first case
 * goes red; drop it from the server's start, and the second case goes red.
 */
import { spawnSync } from 'node:child_process'
import { cpSync, mkdirSync, mkdtempSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, expect, it } from 'vitest'

import { theProcessAt } from '../src/config/session-process.mjs'
import { localStampOf } from '../src/config/stopped-run-cause.mjs'
import { THE_MOVE_MARK, theOfficeStaysClosedWords, writeTheMoveMark } from '../src/config/the-data-folder-move.mjs'

const SOURCE = fileURLToPath(new URL('..', import.meta.url))

let root = ''
let checkout = ''
let port = 0

/** A port nothing listens on now. Only a planted mutation that lets the server go on would use it. */
async function aFreePort(): Promise<number> {
  return await new Promise((done, failed) => {
    const server = createServer()
    server.once('error', failed)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      server.close(() => (address !== null && typeof address === 'object' ? done(address.port) : failed(new Error('no port'))))
    })
  })
}

beforeAll(async () => {
  root = mkdtempSync(join(tmpdir(), 'a-data-folder-move-keeps-both-starts-closed-'))
  checkout = join(root, 'checkout')
  mkdirSync(checkout)
  mkdirSync(join(root, 'home'))
  for (const name of ['src', 'tools', 'for-agents', 'package.json', 'tsconfig.json']) {
    cpSync(join(SOURCE, name), join(checkout, name), { recursive: true })
  }
  symlinkSync(join(SOURCE, 'node_modules'), join(checkout, 'node_modules'))
  port = await aFreePort()
}, 60_000)

afterAll(() => {
  if (root !== '') rmSync(root, { recursive: true, force: true })
})

/**
 * A copying mark beside the copy's `.env`, whose mover is this test's process, and a database in a new empty folder.
 * Returns the sentence a start must print and the folder that must stay empty.
 */
function aMoveThatIsCopying(): { sentence: string; data: string } {
  const data = mkdtempSync(join(root, 'data-'))
  writeFileSync(join(checkout, '.env'), `MOLE_OFFICE_PORT=${String(port)}\nMOLE_OFFICE_DB=${join(data, 'mole-office.db')}\n`)
  const at = theProcessAt(process.pid)
  if (!at.here || at.startedAt === null) throw new Error('this test process has no readable start time')
  const mark = {
    from: join(root, 'old-data'),
    to: join(root, 'new-data'),
    database: 'mole-office.db',
    state: 'copying' as const,
    mover: { pid: process.pid, startedAt: localStampOf(new Date(at.startedAt)) },
    earlier: [],
    manifest: null,
    says: null,
    at: '2026-11-12 00:00:00',
  }
  const markPath = writeTheMoveMark(join(checkout, THE_MOVE_MARK), mark)
  return { sentence: theOfficeStaysClosedWords(markPath, { version: 1, ...mark }), data }
}

/** Runs one of the copy's starts to its end, at most 30 seconds, with no office variable of this process. */
function aStart(args: string[]) {
  const env: Record<string, string | undefined> = { ...process.env, HOME: join(root, 'home'), LANG: 'C' }
  for (const key of Object.keys(env)) if (key.startsWith('MOLE_') || key.startsWith('VITEST')) delete env[key]
  return spawnSync(process.execPath, args, {
    cwd: checkout,
    env: { ...env, MOLE_OFFICE_MESSAGE_WORKER: 'off' },
    encoding: 'utf8',
    timeout: 30_000,
  })
}

it("refuses the service command's start with the mark's sentence and exit 1, and opens nothing in the data folder", () => {
  const { sentence, data } = aMoveThatIsCopying()

  const start = aStart(['src/config/the-service-command.mjs', 'start'])

  expect(start.status, start.stderr).toBe(1)
  expect(start.stderr).toBe(`${sentence}\n`)
  expect(readdirSync(data), 'no database, service lock, log or key was made').toEqual([])
}, 60_000)

it("refuses the server's own start with the mark's sentence and exit 1, and opens nothing in the data folder", () => {
  const { sentence, data } = aMoveThatIsCopying()

  const start = aStart(['--import', 'tsx', 'src/server/index.ts', `--stop-with-pid=${String(process.pid)}`])

  expect(start.status, start.stderr).toBe(1)
  expect(start.stderr).toBe(`${sentence}\n`)
  expect(readdirSync(data), 'no database, service lock, log or key was made').toEqual([])
}, 60_000)
