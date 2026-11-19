// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE NAMED-INSIDE DOOR SAYS WHAT EACH RECORD NAMES INSIDE A WORKTREE (wave 13s round 115, item 25).
 *
 * The owner's rule, as they changed it in point 1 of a decision: a worktree whose branch or keep ref holds every
 * tracked file may be removed even when a record names it, but a record naming an untracked or ignored file inside
 * keeps it. So the door, asked about the top of a git worktree,
 * compares each record it lists or counts with the worktree's HEAD and puts it in a class: it names a path it could not
 * compare, an untracked or ignored path, a path no longer there, only paths the commit holds, or only the folder.
 * tools/remove-a-worktree.mjs decides on those classes
 * (tests/removing-a-branch-held-worktree-that-records-name.test.ts). The worktree here is a real one in a temporary
 * folder.
 *
 * THE MUTATIONS THAT TURN THIS RED, WITH A CONTROL RUN FIRST
 * ---------------------------------------------------------------------------------------
 *
 * Wave 13s round 115. Before the code, at this file's criterion commit, all 7 cases were red at their own assertions.
 * With the code, after a control run with all 7 cases green, each mutation in src/server/lib/what-a-record-names-inside.ts
 * run alone and put back before the next:
 *   M1.  a path that is there is held, whatever git lists as untracked or ignored: the untracked-or-ignored and
 *        first-class cases red;
 *   M2.  prose holding a wildcard is read as one path: the not-compared case red;
 *   M3.  prose naming the folder itself is read as naming tracked files: the folder-only case red;
 *   M4.  a folder HEAD holds is never held: the tracked case red;
 *   M5.  a path no longer there is not compared: the missing-path and first-class cases red;
 *   M6.  a folder below the top of a worktree is compared: the compares-nothing case red.
 *
 * Wave 13s round 116 (problem ZhPkuwkiTxqd). A record written in Chinese has no space around a path and has
 * full-width marks, so three cases more. At their criterion commit the path case and the folder case were red, and the
 * control case was green, as it must be before and after. With the code, after a control run with all 10 cases green,
 * each mutation in src/server/api/reportfiles.ts or src/server/lib/what-a-record-names-inside.ts run alone and put back
 * before the next:
 *   M7.  a character outside ASCII does not lead a path: the path case red, and the folder case by its "：" text;
 *   M8.  a character outside ASCII does not end the folder's name: the folder case red;
 *   M9.  a path in prose ends only at a space, a quote or a backtick: the path and folder cases red;
 *   M10. any character leads a path: the control case red;
 *   M11. any character but "/" ends the folder's name: the control case red.
 */
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { afterAll, afterEach, beforeAll, expect, it } from 'vitest'
import { apiApp, freshDb, writeDataBypassingTheGate, type TestDb } from './helpers.ts'

const headers = { 'x-mole-office-workspace': 'default' }
const elsewhere = 'named-inside-hidden-project'
let t: TestDb
let app: FastifyInstance
let root: string
let tree: string
let head: string
let made: string[] = []

function git(...args: string[]) {
  const result = spawnSync('git', args, { encoding: 'utf8', env: { ...process.env, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_AUTHOR_NAME: 'Test builder', GIT_AUTHOR_EMAIL: 'test@example.invalid', GIT_COMMITTER_NAME: 'Test builder', GIT_COMMITTER_EMAIL: 'test@example.invalid' } })
  if (result.status !== 0) throw new Error(result.stderr)
  return result.stdout.trim()
}

function write(path: string, text: string) {
  mkdirSync(join(path, '..'), { recursive: true })
  writeFileSync(path, text)
}

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  const { createWorkspace } = await import('../src/server/lib/workspaces.ts')
  createWorkspace({ id: elsewhere, title: 'Synthetic project the caller does not read' })
  root = realpathSync(mkdtempSync(join(tmpdir(), 'named-inside-worktree-test-')))
  const repository = join(root, 'repository')
  git('init', '-q', repository)
  write(join(repository, 'tracked.txt'), 'Synthetic tracked file.\n')
  write(join(repository, 'dir', 'inner.txt'), 'Synthetic tracked file in a tracked folder.\n')
  write(join(repository, 'mixed', 'held.txt'), 'Synthetic tracked file beside an untracked one.\n')
  write(join(repository, '.gitignore'), '*.log\n')
  git('-C', repository, 'add', '--', '.')
  git('-C', repository, 'commit', '-q', '-m', 'Synthetic root')
  tree = join(root, 'tree')
  git('-C', repository, 'worktree', 'add', '-q', '--detach', tree)
  head = git('-C', tree, 'rev-parse', 'HEAD')
  write(join(tree, 'build.log'), 'Synthetic ignored file.\n')
  write(join(tree, 'notes.txt'), 'Synthetic untracked file.\n')
  write(join(tree, 'scratch', 'one.txt'), 'Synthetic file in an untracked folder.\n')
  write(join(tree, 'mixed', 'loose.txt'), 'Synthetic untracked file in a tracked folder.\n')
  write(join(tree, 'two words.txt'), 'Synthetic untracked file whose name holds a space.\n')
}, 60_000)

afterEach(() => {
  for (const id of made) t.api.deleteRecord(id, t.api.HUMAN)
  made = []
})

afterAll(async () => {
  await app.close()
  t.close()
  rmSync(root, { recursive: true, force: true })
})

/** A report in this project, which the caller reads, or in a project it does not. */
function report(title: string, data: Record<string, unknown>, workspaceId = 'default') {
  const row = t.api.createRecord({ workspaceId, kind: 'report', title, actor: t.api.HUMAN })
  writeDataBypassingTheGate(t, row.id, data)
  made.push(row.id)
  return row
}

function hidden(title: string, text: string) { return report(title, { text }, elsewhere) }

const none = { notCompared: 0, anotherPath: 0, aPathNotThere: 0, trackedFilesOnly: 0, theFolderOnly: 0 }

async function ask(folder = tree) {
  const reply = await app.inject({ method: 'GET', url: `/api/report-files/named-inside?folder=${encodeURIComponent(folder)}`, headers })
  expect(reply.statusCode, reply.body).toBe(200)
  const answer = reply.json()
  if (answer.hiddenCiters !== null && answer.hiddenCiters !== undefined) {
    expect(Object.values(answer.hiddenCiters as Record<string, number>).reduce((sum, one) => sum + one, 0), reply.body).toBe(answer.hiddenCount)
  }
  return answer
}

/** Each listed record's class, by id. */
function namesOf(answer: { records: { id: string; names?: string }[] }) {
  return Object.fromEntries(answer.records.map((record) => [record.id, record.names]))
}

it('puts a record that names only the worktree folder in theFolderOnly, readable or hidden', async () => {
  report('Synthetic readable mention of the folder', { text: `Synthetic work was kept in ${tree}.` })
  hidden('Synthetic hidden mention of the folder', `Synthetic run folder: ${tree}/`)
  expect(await ask()).toMatchObject({ records: [], hiddenCount: 2, comparedWith: head, notComparedBecause: null,
    hiddenCiters: { ...none, theFolderOnly: 2 } })
})

it('puts a record that names only tracked files, or a tracked folder holding nothing else, in trackedFilesOnly', async () => {
  const file = report('Synthetic tracked file', { blocks: [{ id: 'kept', type: 'image', path: `${tree}/tracked.txt`, alt: 'Synthetic' }] })
  const folder = report('Synthetic tracked folder', { files: [{ path: `${tree}/dir` }] })
  hidden('Synthetic hidden tracked prose', `See ${tree}/tracked.txt. And ${tree}/dir/inner.txt:12, then ${tree}/dir/.`)
  const answer = await ask()
  expect(answer).toMatchObject({ comparedWith: head, notComparedBecause: null, hiddenCount: 1, hiddenCiters: { ...none, trackedFilesOnly: 1 } })
  expect(namesOf(answer)).toEqual({ [file.id]: 'trackedFilesOnly', [folder.id]: 'trackedFilesOnly' })
})

it('puts a record that names an ignored or untracked path in anotherPath, readable or hidden', async () => {
  const ignored = report('Synthetic ignored file', { blocks: [{ id: 'log', type: 'image', path: `${tree}/build.log`, alt: 'Synthetic' }] })
  const mixed = report('Synthetic tracked folder with an untracked file', { files: [{ path: `${tree}/mixed` }] })
  hidden('Synthetic hidden untracked file', `Synthetic notes in ${tree}/notes.txt.`)
  hidden('Synthetic hidden untracked folder', `Synthetic scratch in ${tree}/scratch/one.txt`)
  hidden('Synthetic hidden ignored file', `Synthetic log: "${tree}/build.log"`)
  const answer = await ask()
  expect(answer).toMatchObject({ comparedWith: head, hiddenCount: 3, hiddenCiters: { ...none, anotherPath: 3 } })
  expect(namesOf(answer)).toEqual({ [ignored.id]: 'anotherPath', [mixed.id]: 'anotherPath' })
})

it('puts a record that names a path no longer there in aPathNotThere', async () => {
  const gone = report('Synthetic missing picture', { blocks: [{ id: 'gone', type: 'image', path: `${tree}/gone.png`, alt: 'Synthetic' }] })
  hidden('Synthetic hidden missing file', `Synthetic: ${tree}/dir/gone.txt`)
  hidden('Synthetic hidden missing folder', `Synthetic: ${tree}/no-folder/deeper/file.txt`)
  const answer = await ask()
  expect(answer).toMatchObject({ comparedWith: head, hiddenCount: 2, hiddenCiters: { ...none, aPathNotThere: 2 } })
  expect(namesOf(answer)).toEqual({ [gone.id]: 'aPathNotThere' })
})

it('puts prose it cannot read as one path in notCompared', async () => {
  hidden('Synthetic name with a space', `Synthetic: ${tree}/two words.txt`)
  hidden('Synthetic wildcard', `Synthetic: ${tree}/*.log`)
  hidden('Synthetic climb', `Synthetic: ${tree}/dir/../tracked.txt`)
  expect(await ask()).toMatchObject({ comparedWith: head, hiddenCount: 3, hiddenCiters: { ...none, notCompared: 3 } })
})

it('puts a record in the first class any path it names is in', async () => {
  const both = report('Synthetic tracked and ignored', { blocks: [
    { id: 'tracked', type: 'image', path: `${tree}/tracked.txt`, alt: 'Synthetic' },
    { id: 'ignored', type: 'image', path: `${tree}/build.log`, alt: 'Synthetic' },
  ] })
  const prose = report('Synthetic tracked path with untracked prose', {
    blocks: [{ id: 'tracked', type: 'image', path: `${tree}/tracked.txt`, alt: 'Synthetic' }],
    note: `Synthetic: the notes are in ${tree}/notes.txt`,
  })
  hidden('Synthetic hidden tracked and missing', `Synthetic: ${tree}/tracked.txt and ${tree}/gone.png and ${tree}`)
  const answer = await ask()
  expect(answer).toMatchObject({ comparedWith: head, hiddenCount: 1, hiddenCiters: { ...none, aPathNotThere: 1 } })
  expect(namesOf(answer)).toEqual({ [both.id]: 'anotherPath', [prose.id]: 'anotherPath' })
})

// A RECORD IN CHINESE HAS NO SPACE AROUND A PATH AND HAS FULL-WIDTH MARKS (wave 13s round 116, problem
// ZhPkuwkiTxqd). Each text is written as the owner's records are. The folder case's last text has the form of one of their records:
// the folder, its "/", then 。 and more words. Before round 116 the door counted none of these texts but that last one,
// and that one it read as naming a file "。规矩…" that is not there.
it('counts a path inside the folder after Chinese text, a curly quote or a full-width bracket, and reads it to the mark', async () => {
  hidden('Synthetic ignored file after Chinese text', `日志在${tree}/build.log`)
  hidden('Synthetic untracked file in curly quotes', `见“${tree}/notes.txt”，然后再看`)
  hidden('Synthetic untracked folder in full-width brackets', `草稿（${tree}/scratch/one.txt）里有`)
  hidden('Synthetic tracked file in curly quotes', `只改了“${tree}/tracked.txt”，别的没动。`)
  expect(await ask()).toMatchObject({ comparedWith: head, hiddenCount: 4, hiddenCiters: { ...none, anotherPath: 3, trackedFilesOnly: 1 } })
})

it('counts the folder itself before 。 or ，, after a full-width colon, and with its "/" before 。', async () => {
  hidden('Synthetic folder before a Chinese stop', `结果在 ${tree}。`)
  hidden('Synthetic folder between full-width marks', `工作目录：${tree}，分支见上`)
  hidden('Synthetic folder and its slash before a Chinese stop', `本机原件备份在 ${tree}/。规矩和偏好另见决定记录`)
  expect(await ask()).toMatchObject({ comparedWith: head, hiddenCount: 3, hiddenCiters: { ...none, theFolderOnly: 3 } })
})

// The control, green before round 116 and after: in the same kind of text, a longer name after the folder's own, the
// folder's name at the end of a longer one, and the folder's whole path under another folder are each another folder.
it('still counts no other folder in Chinese text: a longer name, a name ending in the folder\'s, or its path under another', async () => {
  hidden('Synthetic longer name', `另一个在${tree}0/notes.txt，结果在${tree}0。`)
  hidden('Synthetic name ending in the folder\'s', `日志在${root}/subtree/notes.txt。`)
  hidden('Synthetic path under another folder', `旧的在/elsewhere${tree}/notes.txt，`)
  expect(await ask()).toMatchObject({ hiddenCount: 0 })
})

it('compares nothing, and says why, for a folder that is not the top of a worktree or that nothing names', async () => {
  const plain = join(root, 'plain')
  mkdirSync(plain)
  const inner = report('Synthetic file below the top', { files: [{ path: `${tree}/dir/inner.txt` }] })
  report('Synthetic file in a folder git does not hold', { files: [{ path: `${plain}/kept.txt` }] })
  hidden('Synthetic hidden file below the top', `Synthetic: ${tree}/dir/inner.txt`)
  for (const [folder, listed] of [[join(tree, 'dir'), inner.id], [plain, undefined], [join(root, 'not-there'), undefined]] as const) {
    if (folder.endsWith('not-there')) hidden('Synthetic missing folder', `Synthetic: ${folder}/kept.txt`)
    const answer = await ask(folder)
    expect(answer.hiddenCount + answer.records.length, JSON.stringify(answer)).toBeGreaterThan(0)
    expect(answer).toMatchObject({ comparedWith: null, hiddenCiters: null })
    expect(typeof answer.notComparedBecause === 'string' && answer.notComparedBecause.trim() !== '', JSON.stringify(answer)).toBe(true)
    for (const record of answer.records) expect(record).not.toHaveProperty('names')
    if (listed !== undefined) expect(answer.records.map((record: { id: string }) => record.id)).toContain(listed)
  }
  const nobody = await ask(join(root, 'repository'))
  expect(nobody).toMatchObject({ records: [], hiddenCount: 0, comparedWith: null, hiddenCiters: null })
  expect(typeof nobody.notComparedBecause === 'string' && nobody.notComparedBecause.trim() !== '').toBe(true)
})
