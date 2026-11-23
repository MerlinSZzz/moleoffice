// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE REVIEW KEEPS ITS DATABASE IN A FOLDER OF ITS OWN, AND REMOVES THE WHOLE FOLDER WHEN IT STOPS.
 *
 * WHAT WENT WRONG. tools/review.mjs put its throwaway database straight in the temporary folder, as
 * mole-office-review-<process id>.db. The API server it starts writes more beside its database: keys.json, the lock
 * <database>.service.json or the note <database>.ended.json, and the folders avatars and portrait-copies. The review's
 * shutdown removed only the database and its -wal and -shm files. So after each review with TMPDIR unset, /tmp held a
 * keys file of the throwaway office and three more entries. keys.json, avatars and portrait-copies had the same path for
 * every review, so two reviews in one /tmp wrote into the same three paths.
 *
 * WHAT THIS FILE HOLDS.
 *   (a) aFolderForTheReview makes a new, empty folder in the folder it is given, and names a database in it. So
 *       everything the server writes beside its database is in that folder.
 *   (b) Two calls make two folders, so two reviews share no path.
 *   (c) The review's shutdown removes that folder whole. This one is read from the file's text, because the shutdown
 *       stops real process groups and is not run here.
 *
 * It fails on main's code, where tools/review.mjs has no aFolderForTheReview and its shutdown removes three files.
 *
 * MADE UP. The folders here are made in a temporary folder of this test and removed after it. No review is run.
 */
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { aFolderForTheReview } from '../tools/review.mjs'

const REVIEW = fileURLToPath(new URL('../tools/review.mjs', import.meta.url))

let under = ''

beforeAll(() => {
  under = mkdtempSync(join(tmpdir(), 'the-review-folder-test-'))
})

afterAll(() => {
  rmSync(under, { recursive: true, force: true })
})

it('(a) makes a new empty folder in the folder it is given, and names the database in it', () => {
  const made = aFolderForTheReview(under)
  expect(dirname(made.folder)).toBe(under)
  expect(basename(made.folder).startsWith('mole-office-review-')).toBe(true)
  expect(existsSync(made.folder)).toBe(true)
  expect(readdirSync(made.folder)).toEqual([])
  expect(dirname(made.db), 'the database is not in the review\'s own folder, so the files beside it are not either').toBe(made.folder)
  expect(existsSync(made.db)).toBe(false)
})

it('(b) makes another folder each time it is asked', () => {
  const first = aFolderForTheReview(under)
  const second = aFolderForTheReview(under)
  expect(second.folder).not.toBe(first.folder)
  expect(second.db).not.toBe(first.db)
})

it('(c) the review\'s shutdown removes its folder whole', () => {
  const source = readFileSync(REVIEW, 'utf8')
  const start = source.indexOf('async function shutdown()')
  expect(start, 'tools/review.mjs has no shutdown function').toBeGreaterThan(-1)
  const shutdown = source.slice(start, source.indexOf('\n}\n', start))
  expect(shutdown, 'the shutdown still removes only the database and its two journal files').not.toMatch(/-wal`/)
  expect(shutdown).toMatch(/rmSync\(runFolder, \{ recursive: true, force: true \}\)/)
})
