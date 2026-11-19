// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE EARLIER DATA FOLDERS NEVER NAME THE FOLDER THE OFFICE RUNS FROM.
 *
 * DF16 of design/window/the-data-folder-move.criteria.md keeps a confirmed move's old folder among the mark's earlier
 * data folders, and Settings lists them as earlier data folders still on this computer. A move away and a move back
 * would list the folder the office runs from again, so the mark leaves that folder out. Every folder is made under the
 * temporary directory and removed after the case. The mover is given fake stop, start and runtime readings, so no
 * office is started and no real data folder is touched.
 *
 * Its cases:
 *   1. a move away and a move back, each confirmed, leave the folder in use out of the earlier folders at every
 *      step, and keep the other folder among them; the old folder itself is still there after the confirm;
 *   2. the earlier folders of a mark leave out the new folder from `switched` on, and the old one before it and after
 *      a switch back.
 *
 * MUTATIONS: none has been run on this file yet.
 */
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { afterEach, expect, it } from 'vitest'

import { forgetWhatTheEnvFileSupplied } from '../src/config/settings.mjs'

type TheMove = typeof import('../src/config/the-data-folder-move.mjs')

const folders: string[] = []

/** A folder this case made, removed after it. */
function made(prefix: string): string {
  const folder = mkdtempSync(join(tmpdir(), prefix))
  folders.push(folder)
  return folder
}

afterEach(() => {
  for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true })
  delete process.env['MOLE_OFFICE_DB']
  forgetWhatTheEnvFileSupplied()
})

/** The engine, imported inside a case so the test file loads and a red run still counts. */
async function theMove(): Promise<TheMove> {
  return await import('../src/config/the-data-folder-move.mjs')
}

/** A data folder with a real database and one stored file. */
function aDataFolder(): string {
  const folder = join(made('earlier-data-folders-'), 'a-data')
  mkdirSync(folder)
  const db = new Database(join(folder, 'mole-office.db'))
  db.pragma('journal_mode = DELETE')
  db.exec("CREATE TABLE a (value TEXT); INSERT INTO a (value) VALUES ('one');")
  db.close()
  mkdirSync(join(folder, 'report-files'))
  writeFileSync(join(folder, 'report-files', 'stored.txt'), 'a stored file\n')
  return folder
}

/** Move the data folder to `to` with fake stop, start and runtime readings, and answer the last mark. */
async function aMoveTo(move: TheMove, to: string, envFile: string) {
  const last = await move.moveTheDataFolder(to, {
    envFile,
    markPath: move.theMoveMarkPath(envFile),
    stop: async () => ({ ok: true, says: '' }),
    start: async () => ({ ok: true, says: '' }),
    theRuntimeDatabase: async () => join(to, 'mole-office.db'),
    theLoginUnit: async () => ({ unit: 'none', unitPath: '', startsAtLogin: false, activeWord: null }),
  })
  if ('refused' in last) throw new Error(`the move to ${to} was refused: ${last.refused}`)
  return last
}

/** Confirm the move, as the person does in Settings, and answer the mark the confirm wrote. */
function theConfirm(move: TheMove, envFile: string, to: string) {
  const markPath = move.theMoveMarkPath(envFile)
  const answer = move.confirmTheMove(markPath, join(to, 'mole-office.db'))
  if ('refused' in answer) throw new Error(`the confirm was refused: ${answer.refused}`)
  const read = move.readTheMoveMark(markPath)
  if (read.state !== 'read') throw new Error(`the mark after the confirm is ${read.state}`)
  return { answer, mark: read.mark }
}

it('DF16: a move away and a move back, each confirmed, never list the folder in use as an earlier data folder', async () => {
  const move = await theMove()
  const first = aDataFolder()
  const second = join(made('earlier-data-folders-target-'), 'b-data')
  const envFile = join(made('earlier-data-folders-env-'), '.env')
  writeFileSync(envFile, `MOLE_OFFICE_DB=${join(first, 'mole-office.db')}\n`)

  const away = await aMoveTo(move, second, envFile)
  expect(away.state).toBe('started')
  expect(away.earlier).toEqual([])
  const awayConfirmed = theConfirm(move, envFile, second)
  expect(awayConfirmed.mark.earlier).toEqual([first])

  // The confirm removes the old folder's files and the folders they leave empty, and the old folder itself stays.
  expect(awayConfirmed.answer.kept).toEqual([])
  expect(existsSync(first), 'the old folder is still on this computer').toBe(true)
  expect(readdirSync(first)).toEqual([])

  // In the product each move is its own process, so each names its own .env backup; both moves here run in this one
  // process and would share the name. Removing the first move's backup lets the move back write its own.
  rmSync(`${envFile}.before-data-folder-move-${String(process.pid)}`)

  const back = await aMoveTo(move, first, envFile)
  expect(back.state).toBe('started')
  expect(back.earlier, 'the office runs from the first folder again, so it is not an earlier one').toEqual([])

  const backConfirmed = theConfirm(move, envFile, first)
  expect(backConfirmed.mark.earlier).toEqual([second])
  expect(backConfirmed.mark.earlier).not.toContain(first)
})

it('DF16: the earlier folders of a mark leave out the folder the office runs from at that state', async () => {
  const move = await theMove()
  const from = '/a/old/data'
  const to = '/a/new/data'
  const earlier = [from, to, '/an/earlier/data']

  for (const state of ['switched', 'started', 'confirmed'] as const) {
    expect(move.theEarlierFoldersOf(earlier, state, { from, to }), state).toEqual([from, '/an/earlier/data'])
  }
  for (const state of ['stopping', 'copying', 'checking', 'switching', 'stopped-before-the-switch', 'switched-back'] as const) {
    expect(move.theEarlierFoldersOf(earlier, state, { from, to }), state).toEqual([to, '/an/earlier/data'])
  }
  expect(move.theEarlierFoldersOf(['/a/new/data/'], 'confirmed', { from, to }), 'a spelling with a slash at the end is the same folder').toEqual([])
})
