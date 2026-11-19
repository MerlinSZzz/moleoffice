// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE OFFICE NAMES EVERY FILE UNDER A SANDBOX'S out/ FOLDER THAT HOLDS A KEY IT MADE, REMOVES EVERY ONE WHOSE KEY IS
 * REVOKED, AND NEVER TOUCHES ONE WHOSE KEY IS LIVE. Problem 296sqTPPdWsQ; message pEcpMdlrsJr6: name every such file
 * whose run still runs, and every one whose run has ended; tell the supervisor and the one above it; delete nothing. The
 * owner's decision of 29 September 2026 then had a file whose key is revoked removed as it is
 * found.
 *
 * WHAT IS REAL. The keys are real: an agent's registration key and run keys minted through the office's own doors, on a
 * throwaway database, one of them revoked by its run's end. The sandboxes are a folder of this test's own, laid out as
 * the launcher lays out instance folders, and the check is the office's own (src/server/lib/key-files.ts), given that
 * folder as its root. Nothing reads the machine's own sandboxes, and no live office is reached.
 *
 *   1. The walk finds the three key files under out/, by what they hold: a running run's key, an ended run's key and an
 *      agent's own key. Not a key outside out/, not one reached only through a link, and not a file of other words or of
 *      a key this office never made.
 *   2. The supervisor and the agent above it are each told once, naming every file, whose key it holds, its run and
 *      whether that run still runs, and never a key, though an agent's own message already claims the live file was
 *      told (problem kRDCnFmhBSpc). Nor does that message, edited afterwards to say Mole Office sent it, or a note
 *      carrying such a sender changed into a message, stop the notice. Two guards stand in the way, each enough alone:
 *      both writes are refused (problem KBKHHtTTnaMY), and what was told is read off each notice as the office wrote it.
 *      The file whose key is revoked is removed, and the notice says so; the files whose keys are live are untouched: a
 *      watch on each of their folders sees no event the whole walk long, the removal included, and after it each is the
 *      same bytes, the same file, the same time.
 *   3. A second walk tells nobody anything new.
 *   4. The file reader answers at once for a named pipe and a link, and reads words only from a regular file, in a
 *      process of its own bounded by time (problem PrEssiyVNlf_).
 *   5. When the running run ends, its file is told again, as ended, to both, though the supervisor first changed its own
 *      notice from case 2 to say the file was told, as ended, to the agent above it: what was told is read off each
 *      notice as the office wrote it. Its key revoked by the run's end, the file is removed.
 *   6. The removal keeps a live key's file it is handed as if the walk had read the key as revoked, and a revoked key's
 *      file reached through a folder that is now a link: a watch on each folder sees no event while it runs, and each
 *      file is the same after.
 *   7. Between the walk and the removal, a folder on the path is swapped for a link to a folder outside the sandboxes
 *      folder that holds a file of the same name and the same revoked key; and a revoked key's file is replaced by a live
 *      key's. The removal touches neither: a watch on each folder sees no event while it runs, and each file is the same
 *      inode after (the inspector's refusal of check gGNrx-Uqdqcc).
 *
 * ---------------------------------------------------------------------------------------
 * MUTATION PROOF (after a green control), each alone in src/server/lib/key-files.ts, g in src/server/lib/a-small-file.ts,
 * and h and i in src/server/lib/records.ts; k and l are two of them at once, one guard of case 2's in each file
 * ---------------------------------------------------------------------------------------
 *
 *   a. The walk made to follow links, by reading each entry through stat rather than as the folder lists it: cases 1, 2
 *      and 5 go red, on a fourth file. (A folder's own listing never calls a link a file or a folder, so the link rule
 *      guards what that listing already says; the mutation is the way a walk comes to follow links.)
 *   b. A revoked key dropped from the walk: cases 1, 2 and 5 go red.
 *   c. What was already told not read: cases 3 and 5 go red.
 *   d. Only the nearest agent above told, and the person in the second place: cases 2 and 5 go red.
 *   e. Each file deleted once it is found: cases 2 and 5 go red.
 *   f. What was told read off every message, not only the office's own notices, as before: case 2 goes red, on the
 *      agent's message that names the live file (problem kRDCnFmhBSpc).
 *   g. The reader checking the size on the path and then reading the path again, as before: case 4 goes red,
 *      its reader stopped by the time bound (problem PrEssiyVNlf_).
 *   h. A message's sender not asked about on the update path (refuseASenderThisWriteWouldChange), as before: case 2
 *      goes red, at the edit it no longer refuses. Its notice to the supervisor still names the live file, because the
 *      edited message is read as its writer wrote it.
 *   i. A record that becomes a message not asked about its sender, as before: case 2 goes red, at the change of kind it
 *      no longer refuses, the notice again as it should be.
 *   j. What was told read off each notice as it stands now, not as the office wrote it, as before: case 5 goes red, the
 *      agent above the supervisor not told.
 *   m. Nothing removed, as before the owner's decision of 29 September 2026: cases 2 and 5 go red, the revoked key's
 *      file still there.
 *   n. The removal's check that the key is still revoked taken out: case 6 goes red, the live key's file removed.
 *   o. The folder opened by its path, following links, rather than held open part by part: cases 6 and 7 go red, the file
 *      outside the sandboxes folder removed.
 *   q. Every file the walk finds handed to the removal, and the removal's live-key check taken out, two at once: case 2
 *      goes red, its watch seeing the live keys' files removed during the walk. (Either alone leaves them: the removal
 *      asks again.) Case 6 goes red with it, having no live-key check, and case 5 after it, its file already gone.
 *   r. The removal's checks for the same key row and for a revoked row both taken out: case 7 goes red, the live key's
 *      file swapped in after the walk removed. (Either alone leaves it.) Case 6 goes red with it, having no live-key
 *      check.
 *   k. h and j at once: case 2 goes red at the notice to the supervisor, which leaves the live file out.
 *   l. i and j at once: case 2 goes red the same way.
 */

import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, statSync, symlinkSync, watch, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { A_RECORD_BECOMES_A_MESSAGE_FROM_ITS_WRITER, WHO_SENT_A_MESSAGE_IS_SET_WHEN_WRITTEN } from '../src/shared/messages.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

let t: TestDb
let app: FastifyInstance
let root = ''
// THE CHECK, imported once the throwaway database is made, as tests/helpers.ts asks.
let checks: typeof import('../src/server/lib/key-files.ts')

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

function asAgent(handle: string, key: string, session?: string): Record<string, string> {
  return {
    'content-type': 'application/json',
    'x-mole-office-workspace': 'default',
    'x-mole-office-actor-type': 'agent',
    'x-mole-office-actor-id': handle,
    'x-mole-office-key': key,
    ...(session === undefined ? {} : { 'x-mole-office-session': session }),
  }
}

async function ask(method: 'POST' | 'PATCH', url: string, headers: Record<string, string>, payload: unknown): Promise<{ status: number; body: Record<string, unknown> }> {
  const reply = await app.inject({ method, url, headers, payload: payload as never })
  return { status: reply.statusCode, body: reply.json() as Record<string, unknown> }
}

async function register(handle: string, by: Record<string, string>, role?: string): Promise<string> {
  const made = await ask('POST', '/api/agents/started', by, { handle, name: handle, runtime: 'claude-code', ...(role === undefined ? {} : { role }) })
  expect(made.status, JSON.stringify(made.body)).toBe(201)
  return String((made.body['whatToGiveIt'] as { key?: string } | undefined)?.key)
}

function idOf(handle: string): string {
  return (t.client.sqlite.prepare('SELECT id FROM agents WHERE handle = ? AND retired = 0').get(handle) as { id: string }).id
}

async function fileARun(handle: string, headers: Record<string, string>, extra: Record<string, unknown> = {}): Promise<{ id: string; key: string }> {
  const filed = await ask('POST', '/api/records', headers, {
    kind: 'session',
    title: `${handle} at work`,
    data: { state: 'running', runtime: 'claude-code', servingAgentId: idOf(handle), servingAgent: handle, ...extra },
  })
  expect(filed.status, JSON.stringify(filed.body)).toBe(201)
  const key = (filed.body['runKey'] as { key?: string } | undefined)?.key ?? ''
  expect(/^[0-9a-f]{64}$/.test(key), `the run of ${handle} was minted no key`).toBe(true)
  return { id: String((filed.body['record'] as { id?: string }).id), key }
}

/** A file with these words, made with its folders. */
function aFile(path: string, words: string): void {
  mkdirSync(join(path, '..'), { recursive: true })
  writeFileSync(path, words)
}

/** The office's notices about key files: which record, to whom, what they say in full, and what they keep. */
function theNotices(): { id: string; to: string; said: string; files: { path: string; ended: boolean }[] }[] {
  const rows = t.client.sqlite
    .prepare("SELECT id, data FROM records WHERE kind = 'message' AND json_extract(data, '$.extra.keyFiles') IS NOT NULL AND json_extract(data, '$.sentBy.id') = (SELECT id FROM agents WHERE handle = 'mole-office' AND retired = 0) ORDER BY created_at")
    .all() as { id: string; data: string }[]
  return rows.map((row) => {
    const data = JSON.parse(row.data) as { to: { id: string }[]; saidInFull?: string; extra: { keyFiles: { path: string; ended: boolean }[] } }
    return { id: row.id, to: data.to[0]?.id ?? '', said: data.saidInFull ?? '', files: data.extra.keyFiles }
  })
}

/** A record's kind and the sender its data names, as stored. */
function asStored(id: string): { kind: string; sentBy: unknown } {
  const row = t.client.sqlite.prepare('SELECT kind, data FROM records WHERE id = ?').get(id) as { kind: string; data: string }
  return { kind: row.kind, sentBy: (JSON.parse(row.data) as { sentBy?: unknown }).sentBy ?? null }
}

/**
 * WHAT A WATCH ON EACH FOLDER SAW WHILE `act` RAN, and what `act` answered. A rename or a removal in a folder is an
 * event, even one undone at once; a read is none. The watch stays a moment after, for the last events to arrive.
 */
async function whatTheFoldersSaw<T>(folders: string[], act: () => T): Promise<{ said: T; events: string[] }> {
  const events: string[] = []
  const watchers = folders.map((folder) => watch(folder, (type, name) => events.push(`${type} ${join(folder, String(name))}`)))
  try {
    const said = act()
    await new Promise((done) => setTimeout(done, 300))
    return { said, events }
  } finally {
    for (const watcher of watchers) watcher.close()
  }
}

const keys: Record<string, string> = {}
const paths: Record<string, string> = {}
let liveRun = ''
let endedRun = ''
let launcherKey = ''
let supervisorsRunKey = ''
const logged: string[] = []

beforeAll(async () => {
  t = await freshDb()
  checks = await import('../src/server/lib/key-files.ts')
  app = (await apiApp()).app
  await app.ready()
  // THE CHAIN: the person started the launcher, the launcher the supervisor, the supervisor its subagent.
  launcherKey = await register('the-launcher', AS_THE_PERSON, 'supervisor')
  await register('a-supervisor', asAgent('the-launcher', launcherKey), 'supervisor')
  const supervisors = await fileARun('a-supervisor', asAgent('the-launcher', launcherKey))
  supervisorsRunKey = supervisors.key
  keys['subagent'] = await register('a-subagent', asAgent('a-supervisor', supervisors.key))
  const live = await fileARun('a-subagent', asAgent('a-supervisor', supervisors.key, supervisors.id), { parentAttachment: supervisors.id })
  const ended = await fileARun('a-subagent', asAgent('a-supervisor', supervisors.key, supervisors.id), { parentAttachment: supervisors.id })
  liveRun = live.id
  endedRun = ended.id
  keys['live'] = live.key
  keys['ended'] = ended.key
  const over = await ask('PATCH', `/api/records/${endedRun}`, asAgent('a-supervisor', supervisors.key), { dataPatch: { state: 'crashed' } })
  expect(over.status, JSON.stringify(over.body)).toBe(200)

  // THE SANDBOXES, laid out as the launcher lays them out, in a folder of this test's own.
  root = mkdtempSync(join(tmpdir(), 'mole-key-files-'))
  paths['live'] = join(root, 'sb-one', 'out', 'w-sub-scratch', 'run-key')
  paths['ended'] = join(root, 'sb-one', 'out', 'w-old-scratch', 'run-key')
  paths['agent'] = join(root, 'sb-one', 'out', 'deep', 'a', 'b', 'k.txt')
  aFile(paths['live'], `${keys['live'] ?? ''}\n`)
  aFile(paths['ended'], keys['ended'] ?? '')
  aFile(paths['agent'], `  ${keys['subagent'] ?? ''}  \n`)
  aFile(join(root, 'sb-one', 'out', 'notes.txt'), 'nothing to see here')
  aFile(join(root, 'sb-one', 'out', 'not-ours'), 'a'.repeat(64))
  // OUTSIDE out/, and a link inside out/ that leads to it: neither is looked at.
  aFile(join(root, 'sb-one', 'home', 'run-key'), keys['live'] ?? '')
  symlinkSync(join(root, 'sb-one', 'home', 'run-key'), join(root, 'sb-one', 'out', 'linked-key'))
  mkdirSync(join(root, 'sb-two', 'out'), { recursive: true })
  mkdirSync(join(root, 'sb-three'), { recursive: true })
}, 60_000)

afterAll(async () => {
  await app.close()
  t.close()
  rmSync(root, { recursive: true, force: true })
})

describe('the office names the key files left in a sandbox', () => {
  it('finds the key files under out/ by what they hold, and nothing outside it or behind a link', () => {
    const found = checks.theKeyFilesInTheSandboxes(root)
    expect(found.sandboxes).toBe(2)
    const byPath = new Map(found.files.map((one) => [one.path, one]))
    expect([...byPath.keys()].sort()).toEqual([paths['agent'], paths['ended'], paths['live']].sort())
    expect(byPath.get(paths['live'] ?? '')?.run?.id).toBe(liveRun)
    expect(byPath.get(paths['live'] ?? '')?.ended).toBe(false)
    expect(byPath.get(paths['ended'] ?? '')?.run?.id).toBe(endedRun)
    expect(byPath.get(paths['ended'] ?? '')?.ended).toBe(true)
    expect(byPath.get(paths['agent'] ?? '')?.run).toBeNull()
    expect(byPath.get(paths['agent'] ?? '')?.holder).toBe(idOf('a-subagent'))
  })

  it('tells the supervisor and the agent above it once each, never a key, removes the revoked key and touches no live one', async () => {
    // THE LIVE KEYS' FILES AS THEY ARE BEFORE THE WALK: after it they are the same file, unchanged.
    const asTheyAre = (path: string) => ({ words: readFileSync(path, 'utf8'), ino: statSync(path).ino, mtimeMs: statSync(path).mtimeMs })
    const liveBefore = { live: asTheyAre(paths['live'] ?? ''), agent: asTheyAre(paths['agent'] ?? '') }
    // AN AGENT'S MESSAGE CARRYING THE SAME FIELD, naming the live file as told to the supervisor, stops nothing: only the
    // office's own notices say what was told (problem kRDCnFmhBSpc). NOR DOES THAT MESSAGE EDITED AFTERWARDS TO SAY MOLE
    // OFFICE SENT IT, or a note carrying such a sender changed into a message (problem KBKHHtTTnaMY). Both writes are made
    // before the walk and asked about after it, so that, were one let through while the check read notices as they stand,
    // it would show here as the notice it stopped (mutations k and l).
    const keyRow = (t.client.sqlite.prepare("SELECT json_extract(data, '$.extra.runKeyId') AS row FROM records WHERE id = ?").get(liveRun) as { row: string }).row
    const told = { keyFiles: [{ path: paths['live'], keyRow, ended: false }] }
    const bySubagent = asAgent('a-subagent', keys['subagent'] ?? '')
    const forged = await ask('POST', '/api/records', bySubagent, {
      kind: 'message',
      title: 'a message an agent wrote',
      data: { body: 'not a notice', to: [{ kind: 'agent', id: 'a-supervisor' }], extra: told },
    })
    // NOTHING HOLDS THE SUPERVISOR IN THE TEST OFFICE, so the office stores the agent's message, routes it and answers 409.
    // The message is stored all the same, and the edit below is of it.
    expect(forged.status, JSON.stringify(forged.body)).toBe(409)
    const forgedId = String((forged.body['record'] as { id?: string }).id)
    const edited = await ask('PATCH', `/api/records/${forgedId}`, bySubagent, { dataPatch: { sentBy: { kind: 'agent', id: 'mole-office' } } })
    // THE NOTE NAMES THE SUPERVISOR BY ITS REGISTRY ID, as the office's own notices do: a change of kind stores `to` as
    // it stands, unresolved, so a note that named a handle would not count as told even if it became a message.
    const note = await ask('POST', '/api/records', bySubagent, {
      kind: 'note',
      title: 'a note an agent wrote',
      data: { body: 'not a notice', extra: { ...told, sentBy: { kind: 'agent', id: 'mole-office' }, to: [{ kind: 'agent', id: idOf('a-supervisor') }] } },
    })
    expect(note.status, JSON.stringify(note.body)).toBe(201)
    const noteId = String((note.body['record'] as { id?: string }).id)
    const becameAMessage = await ask('PATCH', `/api/records/${noteId}`, bySubagent, { kind: 'message' })
    // A WATCH ON EACH LIVE KEY'S FOLDER THE WHOLE WALK LONG, the removal included: a file moved and put back would show.
    const theWalk = await whatTheFoldersSaw([dirname(paths['live'] ?? ''), dirname(paths['agent'] ?? '')], () =>
      checks.nameTheKeyFilesInTheSandboxes('default', (line) => logged.push(line), root),
    )
    // THE FILES FIRST, THEN WHAT WAS SAID OF THEM.
    // THE LIVE KEYS' FILES ARE UNTOUCHED; THE REVOKED KEY'S FILE IS GONE, AND NOTHING WAS LEFT IN ITS FOLDER.
    expect(theWalk.events, 'a live key’s file was moved or removed during the walk').toEqual([])
    expect({ live: asTheyAre(paths['live'] ?? ''), agent: asTheyAre(paths['agent'] ?? '') }, 'a live key’s file was touched').toEqual(liveBefore)
    expect(existsSync(paths['ended'] ?? ''), 'the file of a revoked key is still there').toBe(false)
    expect(readdirSync(dirname(paths['ended'] ?? ''))).toEqual([])
    const notices = theNotices().filter((one) => one.id !== forgedId && one.id !== noteId)
    expect(notices.map((one) => one.to).sort()).toEqual([idOf('a-supervisor'), idOf('the-launcher')].sort())
    for (const notice of notices) {
      expect(notice.files.map((one) => one.path).sort()).toEqual([paths['agent'], paths['ended'], paths['live']].sort())
      expect(notice.said).toContain(`${paths['live'] ?? ''} holds the run key of "a-subagent" for run ${liveRun}, which is still running`)
      expect(notice.said).toContain(`${paths['ended'] ?? ''} holds the run key of "a-subagent" for run ${endedRun}, which has ended (crashed)`)
      expect(notice.said).toContain(`${paths['agent'] ?? ''} holds the key of "a-subagent" itself.`)
      expect(notice.said).toContain(`${paths['ended'] ?? ''} holds the run key of "a-subagent" for run ${endedRun}, which has ended (crashed). Its key is revoked, and the file was removed.`)
      expect(notice.said).toContain('a file whose key is live is never removed, only named')
      for (const [which, key] of Object.entries(keys)) {
        expect(notice.said.includes(key), `the notice printed the ${which} key`).toBe(false)
      }
    }
    expect(logged.join('\n')).toContain('The key-file check removed 1 file whose key is revoked')
    expect(logged.join('\n')).toContain('A file whose key is live is never removed.')
    // BOTH WRITES WERE REFUSED, each with its own sentence: the message still names its writer, and the note is a note.
    expect(edited.status, JSON.stringify(edited.body)).toBe(403)
    expect(edited.body['error']).toBe(WHO_SENT_A_MESSAGE_IS_SET_WHEN_WRITTEN)
    expect(asStored(forgedId)).toEqual({ kind: 'message', sentBy: { kind: 'agent', id: idOf('a-subagent') } })
    expect(becameAMessage.status, JSON.stringify(becameAMessage.body)).toBe(403)
    expect(becameAMessage.body['error']).toBe(A_RECORD_BECOMES_A_MESSAGE_FROM_ITS_WRITER)
    expect(asStored(noteId).kind).toBe('note')
  })

  it('tells nobody anything new on a second walk', () => {
    const before = theNotices().length
    checks.nameTheKeyFilesInTheSandboxes('default', () => undefined, root)
    expect(theNotices().length).toBe(before)
  })

  it('reads a named pipe, a link and a regular file each at once, and reads words only from the regular file', () => {
    // PROBLEM PrEssiyVNlf_: a path swapped for a named pipe between the walk and the read held the office on the read. The
    // reader is run in a process of its own, bounded by time, so a reader that waited fails here rather than holding the
    // test.
    const scratch = mkdtempSync(join(tmpdir(), 'mole-a-small-file-'))
    try {
      const pipe = join(scratch, 'a-pipe')
      expect(spawnSync('mkfifo', [pipe]).status, 'mkfifo is not on this machine').toBe(0)
      aFile(join(scratch, 'plain'), 'a few words\n')
      symlinkSync(join(scratch, 'plain'), join(scratch, 'a-link'))
      const reader = fileURLToPath(new URL('../src/server/lib/a-small-file.ts', import.meta.url))
      const read = (path: string) =>
        spawnSync(
          process.execPath,
          ['--input-type=module', '-e', `const m = await import(${JSON.stringify(reader)}); process.stdout.write(JSON.stringify(m.theWordsOfASmallFile(${JSON.stringify(path)}, 256)))`],
          { encoding: 'utf8', timeout: 10_000 },
        )
      const fromThePipe = read(pipe)
      expect(fromThePipe.signal, 'the reader waited on a named pipe until it was stopped').toBeNull()
      expect(fromThePipe.status, fromThePipe.stderr).toBe(0)
      expect(JSON.parse(fromThePipe.stdout)).toBeNull()
      expect(JSON.parse(read(join(scratch, 'a-link')).stdout), 'the reader followed a link').toBe('unread')
      expect(JSON.parse(read(join(scratch, 'plain')).stdout)).toBe('a few words\n')
    } finally {
      rmSync(scratch, { recursive: true, force: true })
    }
  })

  it('tells a file again, as ended, once its run has ended', async () => {
    const before = theNotices().length
    const over = await ask('PATCH', `/api/records/${liveRun}`, asAgent('a-supervisor', supervisorsRunKey), { dataPatch: { state: 'crashed' } })
    expect(over.status, JSON.stringify(over.body)).toBe(200)
    // A RECIPIENT'S CHANGE TO A NOTICE IT WAS SENT STOPS NOTHING. The supervisor first changes its own notice from case 2
    // to say the file was told, as ended, to the agent above it; whatever the office answers that write, both are told,
    // because what was told is read off each notice as the office wrote it.
    const mine = theNotices().find((one) => one.to === idOf('a-supervisor'))
    expect(mine, 'the supervisor has no notice from case 2').toBeDefined()
    const keyRow = (t.client.sqlite.prepare("SELECT json_extract(data, '$.extra.runKeyId') AS row FROM records WHERE id = ?").get(liveRun) as { row: string }).row
    await ask('PATCH', `/api/records/${mine?.id ?? ''}`, asAgent('a-supervisor', supervisorsRunKey), {
      dataPatch: { to: [{ kind: 'agent', id: idOf('the-launcher') }], extra: { keyFiles: [...(mine?.files ?? []), { path: paths['live'], keyRow, ended: true }] } },
    })
    checks.nameTheKeyFilesInTheSandboxes('default', () => undefined, root)
    expect(existsSync(paths['live'] ?? ''), 'the file of a key its run revoked is still there').toBe(false)
    const added = theNotices().slice(before)
    expect(added.map((one) => one.to).sort()).toEqual([idOf('a-supervisor'), idOf('the-launcher')].sort())
    for (const notice of added) {
      expect(notice.files).toEqual([{ path: paths['live'], keyRow: expect.any(String), ended: true }])
      expect(notice.said).toContain('Its key is revoked, and the file was removed.')
      expect(notice.said).toContain(`for run ${liveRun}, which has ended (crashed)`)
    }
  })

  it('keeps, and never moves, a live key’s file it is told is revoked, and a revoked key’s file behind a folder now a link', async () => {
    // THE REMOVAL ASKS AGAIN, whatever the walk saw: a file may change between the walk and its removal, and a folder on
    // its path may become a link. Each file here is handed to the removal as the walk would hand it, revoked.
    const { keyHash } = await import('../src/server/lib/keys.ts')
    const rowOf = (key: string) => (t.client.sqlite.prepare('SELECT id FROM held_keys WHERE key_hash = ?').get(keyHash(key)) as { id: string }).id
    const out = join(root, 'sb-one', 'out')
    const asTheWalkSawIt = (path: string, key: string) => ({
      path, sandbox: 'sb-one', keyRow: rowOf(key), holderKind: 'agent', holder: idOf('a-subagent'), run: null, ended: true, revoked: true, outFolder: out, removal: null,
    })
    // A LIVE KEY'S FILE: kept, never moved while the removal runs, the same file after, and nothing left beside it.
    const live = join(out, 'a-stale-view', 'k.txt')
    aFile(live, keys['subagent'] ?? '')
    const before = statSync(live)
    const liveKept = await whatTheFoldersSaw([dirname(live)], () => checks.removeARevokedKeysFile(asTheWalkSawIt(live, keys['subagent'] ?? '')))
    expect(liveKept.events, 'a live key’s file was moved or removed').toEqual([])
    expect(liveKept.said).toBe('its key is live, and a live key’s file is never removed')
    expect(readFileSync(live, 'utf8')).toBe(keys['subagent'])
    expect(statSync(live).ino).toBe(before.ino)
    expect(readdirSync(dirname(live))).toEqual(['k.txt'])
    // A REVOKED KEY'S FILE REACHED THROUGH A FOLDER THAT IS NOW A LINK to a folder outside out/: kept, and nothing in
    // that folder is touched while the removal runs.
    const elsewhere = join(root, 'sb-one', 'home', 'elsewhere')
    aFile(join(elsewhere, 'run-key'), keys['ended'] ?? '')
    symlinkSync(elsewhere, join(out, 'now-a-link'))
    const behindTheLink = await whatTheFoldersSaw([elsewhere], () => checks.removeARevokedKeysFile(asTheWalkSawIt(join(out, 'now-a-link', 'run-key'), keys['ended'] ?? '')))
    expect(behindTheLink.events, 'a file outside out/ was moved or removed').toEqual([])
    expect(behindTheLink.said).toBe('a link lies on its path inside the sandbox')
    expect(readFileSync(join(elsewhere, 'run-key'), 'utf8')).toBe(keys['ended'])
    expect(readdirSync(elsewhere)).toEqual(['run-key'])
    rmSync(join(out, 'a-stale-view'), { recursive: true, force: true })
    rmSync(join(out, 'now-a-link'))
  })

  it('touches nothing outside, and moves no live key’s file, when a folder or a file changes between the walk and the removal', async () => {
    // THE WHOLE WALK IS READ BEFORE ANY FILE IS REMOVED, so an agent has all that time to change its folder. Each change
    // here is made after the walk and before the removal, and a watch on the folder that must not be touched records
    // every event while the removal runs.
    const sb = join(root, 'sb-race')
    const outside = mkdtempSync(join(tmpdir(), 'mole-outside-the-sandboxes-'))
    try {
      aFile(join(sb, 'out', 'a', 'run-key'), keys['ended'] ?? '')
      aFile(join(sb, 'out', 'b', 'run-key'), keys['ended'] ?? '')
      const found = checks.theKeyFilesInTheSandboxes(root).files
      const inA = found.find((one) => one.path === join(sb, 'out', 'a', 'run-key'))
      const inB = found.find((one) => one.path === join(sb, 'out', 'b', 'run-key'))
      expect(inA?.revoked && inB?.revoked, 'the walk did not find both revoked keys').toBe(true)

      // A FOLDER SWAPPED FOR A LINK to a folder outside the sandboxes folder, holding the same name and the same revoked key.
      aFile(join(outside, 'run-key'), keys['ended'] ?? '')
      const outsideBefore = statSync(join(outside, 'run-key')).ino
      renameSync(join(sb, 'out', 'a'), join(sb, 'out', 'a-moved-away'))
      symlinkSync(outside, join(sb, 'out', 'a'))
      const throughTheLink = await whatTheFoldersSaw([outside], () => checks.removeARevokedKeysFile(inA!))
      expect(throughTheLink.events, 'a file outside the sandboxes folder was renamed or removed').toEqual([])
      expect(statSync(join(outside, 'run-key')).ino).toBe(outsideBefore)
      expect(readFileSync(join(outside, 'run-key'), 'utf8')).toBe(keys['ended'])
      expect(throughTheLink.said).toBe('a link lies on its path inside the sandbox')

      // A REVOKED KEY'S FILE REPLACED BY A LIVE KEY'S after the walk: never moved, the same file after.
      rmSync(join(sb, 'out', 'b', 'run-key'))
      aFile(join(sb, 'out', 'b', 'run-key'), keys['subagent'] ?? '')
      const liveBefore = statSync(join(sb, 'out', 'b', 'run-key')).ino
      const swappedIn = await whatTheFoldersSaw([join(sb, 'out', 'b')], () => checks.removeARevokedKeysFile(inB!))
      expect(swappedIn.events, 'a live key’s file was moved or removed').toEqual([])
      expect(statSync(join(sb, 'out', 'b', 'run-key')).ino).toBe(liveBefore)
      expect(readFileSync(join(sb, 'out', 'b', 'run-key'), 'utf8')).toBe(keys['subagent'])
      expect(swappedIn.said).toBe('it holds another key than the one the check found')
    } finally {
      rmSync(sb, { recursive: true, force: true })
      rmSync(outside, { recursive: true, force: true })
    }
  })
})
