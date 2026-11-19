// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** A real terminal and server prove hidden-prompt privacy. Note edits, counters and keeping reads
 * drain through the production holder/keeping seam, with no fixed pause for an empty queue. */
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { theRoleCardsFile } from '../src/server/lib/roles.ts'
import type { TerminalReading } from '../src/shared/terminals.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import {
  AS_AN_AGENT,
  AS_THE_PERSON,
  aPlace,
  ask,
  groups,
  holder,
  startAHolder,
  startAServer,
  stopEverything,
  theStreamsScreen,
  until,
  type Place,
  type ScratchServer,
} from './terminal-holder-stand.ts'

let place: Place
let server: ScratchServer
let someAgent: string
let seam: typeof import('../src/server/lib/terminal-keeping.ts')
let client: typeof import('../src/server/db/client.ts')

afterAll(async () => { client?.sqlite.close(); await stopEverything() }, 60_000)

beforeAll(async () => {
  place = aPlace('kept')
  await startAHolder(place)
  server = await startAServer(place)
  process.env['MOLE_OFFICE_DB'] = place.database
  process.env['XDG_CONFIG_HOME'] = place.config
  seam = await import('../src/server/lib/terminal-keeping.ts')
  client = await import('../src/server/db/client.ts')
  const card = (JSON.parse(readFileSync(theRoleCardsFile(), 'utf8')) as { elevation: { onlyThisCardCanHoldIt: string } }).elevation.onlyThisCardCanHoldIt
  const quill = await ask(server.api, '/api/agents/started', { method: 'POST', body: { handle: 'quill', name: 'Quill', role: card } })
  if (quill.status !== 201) throw new Error(`The secretary could not be registered: ${JSON.stringify(quill.body)}`)
  const other = await ask(server.api, '/api/agents/started', { method: 'POST', body: { handle: 'some-agent', name: 'Some agent', role: 'worker' } })
  if (other.status !== 201) throw new Error(`The agent could not be registered: ${JSON.stringify(other.body)}`)
  someAgent = ((other.body['agent'] ?? other.body) as { id: string }).id
}, 120_000)

const AS_QUILL = { ...AS_THE_PERSON, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'quill' }

/** A bash terminal the person opened with keeping as it opens, its process group recorded. */
async function aShell(): Promise<{ id: string; pid: number; keeping: boolean }> {
  const opened = await ask(server.api, '/api/terminals', { method: 'POST', body: { folder: place.dir, command: '/bin/bash', args: ['--noprofile', '--norc'], cols: 100, rows: 30 } })
  expect(opened.status, JSON.stringify(opened.body)).toBe(201)
  const terminal = opened.body['terminal'] as { id: string; pid: number; keeping: boolean }
  groups.add(terminal.pid)
  return terminal
}

/** Type into a terminal as the person, and wait until the screen shows `shows`. */
async function type(id: string, data: string, shows: string, wrapped = false): Promise<void> {
  const typed = await ask(server.api, `/api/terminals/${id}/input`, { method: 'POST', body: { data } })
  expect(typed.status, JSON.stringify(typed.body)).toBe(200)
  await until(() => theStreamsScreen(server.api, id), (lines) => lines.join(wrapped ? '' : '\n').includes(shows), 10_000)
}

interface Keeping {
  on: boolean
  note: { id: string; title: string; lines: number; keyLike: number; leftOut: { notShown: number; edited: number; tooLong: number; typedByAnother: number; before: number } } | null
}

const keeping = async (id: string): Promise<Keeping> => {
  await seam.takeTheLines(id, { type: 'human', id: THE_PERSON })
  const listed = await holder(place, { op: 'list' })
  const reading = (listed['terminals'] as TerminalReading[]).find(one => one.id === id)
  expect(reading).toBeDefined()
  return seam.theKeepingOf(reading!)
}

/** Wait until the terminal's note holds `lines` lines and `left` lines left out. */
const untilKept = (id: string, lines: number, left = 0): Promise<Keeping> =>
  until(
    () => keeping(id),
    (k) => k.note !== null && k.note.lines === lines && k.note.leftOut.notShown + k.note.leftOut.edited + k.note.leftOut.tooLong === left,
    10_000,
  )

const theNote = async (id: string): Promise<{ title: string; data: Record<string, unknown> }> =>
  (await ask(server.api, `/api/records/${id}`)).body['record'] as { title: string; data: Record<string, unknown> }

/** Every change row of a note: who wrote it. Chapter 8, rule 1: each must be the person who typed, as a person. */
const whoWroteTheNote = async (id: string): Promise<{ actorType: string; actorId: string }[]> => {
  const read = await ask(server.api, `/api/records/${id}`)
  const rows = read.body['changes'] as { actorType: string; actorId: string }[]
  expect(rows.length).toBeGreaterThan(0)
  return rows.map(({ actorType, actorId }) => ({ actorType, actorId }))
}

describe('what the person types into the office\'s terminal, with keeping on', () => {
  it('1: is kept line by line in one note of the person\'s, which a secretary may cite as the person\'s words', async () => {
    const shell = await aShell()
    expect(shell.keeping).toBe(true)
    expect(await keeping(shell.id)).toMatchObject({ on: true, note: null })
    await type(shell.id, 'echo the kiln fires on friday\r', 'the kiln fires on friday\n')
    await type(shell.id, 'echo glaze the bowls first\r', 'glaze the bowls first\n')
    const kept = await untilKept(shell.id, 2)
    // AN ORDINARY LINE BRINGS NO WARNING (round 12). MUTATION: count every kept line as key-like in theKeepingOf.
    expect(kept.note!.keyLike).toBe(0)
    const note = await theNote(kept.note!.id)
    expect(note.data['body']).toBe('echo the kiln fires on friday\necho glaze the bowls first')
    expect(note.data['kept_from_terminal']).toBe(shell.id)
    expect(String(note.data['typed_in_terminal'])).toContain(`/bin/bash --noprofile --norc in ${place.dir}`)
    expect(note.data['typed_to_agent']).toBeUndefined()
    for (const row of await whoWroteTheNote(kept.note!.id)) expect(row).toEqual({ actorType: 'human', actorId: THE_PERSON })

    const cited = await ask(server.api, '/api/records', {
      method: 'POST',
      headers: AS_QUILL,
      body: {
        kind: 'decision',
        title: 'The kiln fires on Friday',
        data: { replaces: [], decided_by: 'the owner', authority: 'the owner said so', authority_reference: kept.note!.id, option_taken: 'Friday.', because: 'The person typed it.' },
      },
    })
    expect(cited.status, JSON.stringify(cited.body)).toBe(201)
  }, 60_000)

  it('2: keeps a line that looks like a key and says so; never stores one the screen did not show, one edited with an arrow key or one too long, and counts each', async () => {
    // MUTATIONS (round 12): leave a key-like line out again in takeTheLines, and the body and keyLike fail; keep a
    // not-shown line, and the password is found in the note.
    const shell = await aShell()
    const tooLong = `echo ${'a'.repeat(2000)}`
    await type(shell.id, 'export DB_PASSWORD=hunter2\r', 'export DB_PASSWORD=hunter2')
    await type(shell.id, "read -s -p 'pw: ' x; echo; echo read-done\r", 'pw: ')
    await type(shell.id, 'plain-words-for-a-password\r', 'read-done')
    await type(shell.id, 'echo moved\x1b[D\x1b[C-here\r', 'moved-here\n')
    await type(shell.id, `${tooLong}\r`, 'a'.repeat(2000), true)
    await type(shell.id, 'echo after the four\r', 'after the four\n')
    const kept = await untilKept(shell.id, 3, 3)
    expect(kept.note!.leftOut).toEqual({ notShown: 1, edited: 1, tooLong: 1, typedByAnother: 0, before: 0 })
    expect(kept.note!.keyLike).toBe(1)
    const note = await theNote(kept.note!.id)
    expect(note.data['body']).toBe("export DB_PASSWORD=hunter2\nread -s -p 'pw: ' x; echo; echo read-done\necho after the four")
    expect(note.data).toMatchObject({ left_out_not_shown: 1, left_out_edited: 1, left_out_too_long: 1 })
    expect(note.data['left_out_secret']).toBeUndefined()

    // NOWHERE: not the note, not its history, not the database's files, not the server's log.
    const history = await ask(server.api, `/api/records/${kept.note!.id}/history`)
    for (const secret of ['plain-words-for-a-password', 'moved-here', 'a'.repeat(2000)]) {
      expect(JSON.stringify(note), secret).not.toContain(secret)
      expect(JSON.stringify(history.body), secret).not.toContain(secret)
      expect(server.output(), secret).not.toContain(secret)
      for (const file of [place.database, `${place.database}-wal`]) {
        let bytes = ''
        try {
          bytes = readFileSync(file).toString('latin1')
        } catch {
          continue
        }
        expect(bytes.includes(secret), `${secret} in ${file}`).toBe(false)
      }
    }
    // AND THE HOLDER HAS LET THEM GO: nothing waits to be taken.
    expect(await holder(place, { op: 'takeLines', terminal: shell.id })).toMatchObject({ lines: [], waiting: 0 })
  }, 60_000)

  it('3: the switch turns keeping off and on again, and while it is off the one-line press works', async () => {
    const shell = await aShell()
    await type(shell.id, 'echo kept before\r', 'kept before\n')
    const before = await untilKept(shell.id, 1)
    const off = await ask(server.api, `/api/terminals/${shell.id}/keeping`, { method: 'PUT', body: { on: false } })
    expect(off.status, JSON.stringify(off.body)).toBe(200)
    expect(off.body['on']).toBe(false)
    await type(shell.id, 'echo not kept while off\r', 'not kept while off\n')
    await until(() => holder(place, { op: 'lastLine', terminal: shell.id }), answer => (answer['line'] as { text?: string } | null)?.text === 'echo not kept while off', 10_000)
    expect(await seam.takeTheLines(shell.id, { type: 'human', id: THE_PERSON }), 'the holder acknowledged an empty drain while keeping is off').toBe(0)
    expect((await theNote(before.note!.id)).data['body']).toBe('echo kept before')
    expect(await keeping(shell.id)).toMatchObject({ on: false, note: { lines: 1 } })
    const offered = await ask(server.api, `/api/terminals/${shell.id}/last-line`)
    expect(offered.body).toMatchObject({ line: { text: 'echo not kept while off' }, why: null })

    const on = await ask(server.api, `/api/terminals/${shell.id}/keeping`, { method: 'PUT', body: { on: true } })
    expect(on.body['on']).toBe(true)
    await type(shell.id, 'echo kept again\r', 'kept again\n')
    await untilKept(shell.id, 2)
    expect((await theNote(before.note!.id)).data['body']).toBe('echo kept before\necho kept again')
  }, 60_000)

  it('4: typed into an agent\'s terminal, is kept as the person\'s words to that agent', async () => {
    const opened = await holder(place, {
      op: 'open',
      who: { kind: 'person', id: THE_TEST_OFFICES_OWNER.id },
      agent: { kind: 'agent', id: someAgent },
      project: 'default',
      command: '/bin/bash',
      args: ['--noprofile', '--norc'],
      folder: place.dir,
      env: { PATH: process.env['PATH'] ?? '/usr/bin:/bin', HOME: place.home, TERM: 'xterm-256color', HISTFILE: '/dev/null' },
      cols: 100,
      rows: 30,
      keeping: true,
    })
    const terminal = opened['terminal'] as { id: string; pid: number }
    groups.add(terminal.pid)
    await type(terminal.id, 'echo please look at the kiln log\r', 'please look at the kiln log\n')
    const kept = await untilKept(terminal.id, 1)
    const note = await theNote(kept.note!.id)
    expect(note.data['body']).toBe('echo please look at the kiln log')
    expect(note.data['typed_to_agent']).toBe(someAgent)
    expect(note.title).toBe('Typed to some-agent in a terminal')
    // THE PERSON'S WORDS TO THE AGENT, NOT THE AGENT'S: the agent is named in a field and never as the writer.
    for (const row of await whoWroteTheNote(kept.note!.id)) expect(row).toEqual({ actorType: 'human', actorId: THE_PERSON })
  }, 60_000)

  it('5: the person deletes one line or the whole note, and later lines go on from what the person left', async () => {
    const shell = await aShell()
    await type(shell.id, 'echo one\r', 'one\n')
    await type(shell.id, 'echo two\r', 'two\n')
    const first = await untilKept(shell.id, 2)
    const edited = await ask(server.api, `/api/records/${first.note!.id}`, { method: 'PATCH', body: { dataPatch: { body: 'echo two' } } })
    expect(edited.status, JSON.stringify(edited.body)).toBe(200)
    await type(shell.id, 'echo three\r', 'three\n')
    await untilKept(shell.id, 2)
    expect((await theNote(first.note!.id)).data['body']).toBe('echo two\necho three')

    const deleted = await ask(server.api, `/api/records/${first.note!.id}`, { method: 'DELETE' })
    expect(deleted.status, JSON.stringify(deleted.body)).toBe(200)
    await type(shell.id, 'echo four\r', 'four\n')
    const second = await untilKept(shell.id, 1)
    expect(second.note!.id).not.toBe(first.note!.id)
    expect((await theNote(second.note!.id)).data['body']).toBe('echo four')
  }, 60_000)

  it('6: refuses an agent at both keeping doors with its code', async () => {
    const shell = await aShell()
    const read = await ask(server.api, `/api/terminals/${shell.id}/keeping`, { headers: AS_AN_AGENT })
    expect(read.status, JSON.stringify(read.body)).toBe(403)
    expect(read.body['code']).toBe('terminalsOnlyThePerson')
    const turned = await ask(server.api, `/api/terminals/${shell.id}/keeping`, { method: 'PUT', body: { on: false }, headers: AS_AN_AGENT })
    expect(turned.status, JSON.stringify(turned.body)).toBe(403)
    expect(turned.body['code']).toBe('terminalsOnlyThePerson')
    expect((await keeping(shell.id)).on).toBe(true)
  }, 60_000)
})
