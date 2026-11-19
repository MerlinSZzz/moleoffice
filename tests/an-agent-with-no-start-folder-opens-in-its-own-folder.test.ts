// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * AN AGENT WITH NO START FOLDER OPENS IN A FOLDER OF ITS OWN, WHICH THE OFFICE MAKES IN ITS DATA FOLDER AND RECORDS.
 * Wave 13s, round 205: POST /api/terminals/agents (src/server/lib/terminal-agents.ts,
 * src/server/lib/terminals/an-agents-own-folder.ts).
 *
 * NO REAL AGENT PROGRAM IS STARTED. Stand-ins named claude and codex are put first on the PATH the scratch server gives
 * its terminals, and each prints its folder. A real holder and a real scratch server run on a database in `d/` inside
 * the test's own folder, so `d/` is the office's data folder, and HOME is beside it. The config folder is beside it as
 * well, unless the stand made it under /tmp because the holder's socket would not fit; the walk of the test's folder
 * walks it there too.
 *
 *   1. A codex agent with no start folder opens in `d/agents/<handle>`, its program starts there, and the folder is
 *      recorded as its start folder, with a mark saying the office made it at the person's press.
 *   2. Nothing is made outside the data folder: the only new paths anywhere in the test's folder are `d/agents` and
 *      `d/agents/<handle>`, and HOME and the config folder get nothing.
 *   3. Both folders have the mode 700.
 *   4. A second open uses the same folder, and the mark is not written again.
 *   5. A recorded folder is kept: an agent registered with one opens there, and no folder of its own is made; one whose
 *      recorded folder is gone is refused with terminalAgentStartFolderGone, and no folder of its own is made in its
 *      place; an agent whose own folder was made and then recorded elsewhere opens where it was recorded.
 *   6. A claude-code agent opens in its own folder, not another agent's, and the trust written into HOME's
 *      `.claude.json` gains that one folder and no other.
 *   7. A handle Windows keeps for a device is refused in words with terminalAgentNoStartFolder; nothing is made,
 *      recorded or opened.
 *   8. A handle free again after its agent was retired is refused in words, because the folder of that name is the
 *      retired agent's; nothing new is recorded or opened.
 *   9. Asked with "resume", an agent with no start folder is refused in words, and nothing is made.
 *  10. The folder maker alone: a data folder inside a git working tree is refused, and so is an agent's folder that
 *      other users may open or that is a link; nothing is made or changed.
 *  11. The folder maker on Windows, with a stand-in for PowerShell: the script carries the path and passes its one
 *      entry on to what is made inside; a list read back that is not passed on, or a script that fails, is refused, and
 *      the folder made for it is removed.
 *
 * EACH CASE COMPARES ONE OBJECT of what it saw, so a mutation that turns any part of it red shows in that one expect, and
 * the status and the office's words are in it to say why. Registering an agent, recording a folder and closing a
 * terminal are steps, not criteria, and fail with the office's answer.
 *
 * MUTATIONS (each after a control run, 11 passed, and before a restore run, 11 passed; the commit message has the logs).
 * In src/server/lib/terminal-agents.ts:
 *   - a no-folder open refused as before, with nothing made: cases 1 to 8 go red;
 *   - the folder made but never recorded: cases 1, 4, 6 and 8 go red;
 *   - a recorded folder replaced by one of its own: cases 4 and 5 go red;
 *   - a recorded folder that is gone read as none, or refused with the no-folder code: case 5 goes red;
 *   - a folder another agent's record names not refused, or a retired agent's record not counted: case 8 goes red;
 *   - "resume" with no folder not refused, or refused with another code: case 9 goes red;
 *   - a claude-code agent's own folder not trusted: case 6 goes red.
 * In src/server/lib/terminals/an-agents-own-folder.ts:
 *   - the folders made beside the data folder, not in it: every case but 7 and 9 goes red;
 *   - the mode 755: cases 3, 5, 6 and 8 go red;
 *   - a device name not refused: case 7 goes red;
 *   - a data folder in a git working tree not refused: case 10 goes red; `agents` made before that check: cases 10
 *     and 11 go red;
 *   - a folder other users may open not refused, or a link followed: case 10 goes red;
 *   - a list read back that is not passed on accepted, the script passing nothing on, or the folder made for a failed
 *     list left there: case 11 goes red.
 */

import { chmodSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, realpathSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import Database from 'better-sqlite3'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { theTerminalHolderLog, theTerminalHolderSocket } from '../src/config/the-terminal-holder.mjs'
import { AS_THE_PERSON, aPlace, ask, groups, startAHolder, startAServer, stopEverything, theStreamsScreen, until, type Place, type ScratchServer } from './terminal-holder-stand.ts'
import { thePersonsKeyHeader } from './helpers.ts'

let place: Place
let server: ScratchServer
let personsKey: Record<string, string>
/** The office's data folder, by its real path, as the office names the folders it makes there. */
let data = ''
const agents: Record<string, { id: string; record: string }> = {}
const firstOpen: { terminal: string; session: string; mark: unknown; before: string[]; after: string[] } = { terminal: '', session: '', mark: null, before: [], after: [] }

/** A stand-in agent program: it prints its folder, then waits until it is stopped. */
function aStandIn(name: string): string {
  return `#!${process.execPath}
process.stdout.write('STAND-IN ${name} ARGS ' + JSON.stringify(process.argv.slice(2)) + '\\r\\n')
process.stdout.write('CWD ' + process.cwd() + '\\r\\n')
process.stdout.write('STAND-IN READY\\r\\n')
setInterval(() => undefined, 1 << 30)
`
}

/**
 * Every path in the test's folder, and in its config folder when that is under /tmp, files and folders, relative to the
 * test's folder, except the database's own files.
 */
function everyPath(): string[] {
  const found: string[] = []
  const walk = (at: string) => {
    for (const entry of readdirSync(at, { withFileTypes: true })) {
      const path = join(at, entry.name)
      found.push(relative(place.dir, path))
      if (entry.isDirectory()) walk(path)
    }
  }
  for (const folder of place.everyFolder) walk(folder)
  return found.filter((path) => !/^d\/office\.db/u.test(path)).sort()
}

function theDatabase<T>(read: (db: Database.Database) => T): T {
  const db = new Database(place.database, { readonly: true, fileMustExist: true })
  try {
    return read(db)
  } finally {
    db.close()
  }
}

function theData(id: string): Record<string, unknown> {
  const row = theDatabase((db) => db.prepare('SELECT data FROM records WHERE id = ?').get(id)) as { data: string }
  return JSON.parse(row.data) as Record<string, unknown>
}

/** The mark the start folder door writes on an agent's record when its start folder changes. */
function theMarkOn(record: string): Record<string, unknown> | undefined {
  return (theData(record)['extra'] as Record<string, unknown> | undefined)?.['startFolderChange'] as Record<string, unknown> | undefined
}

function theSessionsOf(agentId: string): number {
  return (theDatabase((db) => db.prepare("SELECT COUNT(*) AS n FROM records WHERE kind = 'session' AND json_extract(data, '$.servingAgentId') = ?").get(agentId)) as { n: number }).n
}

/** Register an agent as the person, with a runtime and, when given, a start folder. */
async function register(handle: string, runtime: string, startFolder: string | null): Promise<{ id: string; record: string }> {
  const registered = await ask(server.api, '/api/agents/started', { method: 'POST', body: { handle, name: handle, role: 'worker', runtime } })
  expect(registered.status, JSON.stringify(registered.body)).toBe(201)
  const made = { id: String((registered.body['agent'] as { id: string }).id), record: String(registered.body['record']) }
  if (startFolder !== null) await recordAStartFolder(handle, startFolder)
  return made
}

async function recordAStartFolder(handle: string, startFolder: string): Promise<void> {
  mkdirSync(startFolder, { recursive: true })
  const set = await ask(server.api, `/api/participants/agent/${handle}/start-folder`, { method: 'POST', body: { startFolder, because: 'the test opens it in a terminal' } })
  expect(set.status, JSON.stringify(set.body)).toBe(200)
}

async function open(agent: string, more: Record<string, unknown> = {}): Promise<{ status: number; body: Record<string, unknown> }> {
  const opened = await ask(server.api, '/api/terminals/agents', { method: 'POST', headers: { ...AS_THE_PERSON, ...personsKey }, body: { agent, cols: 200, rows: 40, ...more } })
  const terminal = opened.body['terminal'] as { pid?: number } | undefined
  if (typeof terminal?.pid === 'number') groups.add(terminal.pid)
  return opened
}

/**
 * Close a terminal as the person once its program has started, and wait until its run has ended. A close sent at once
 * after the open left the run running past ten seconds in one run of this file, so the program's start is waited for
 * first, as tests/an-agent-opens-in-a-terminal.test.ts does.
 */
async function close(terminal: string, session: string): Promise<void> {
  await theScreen(terminal)
  const closed = await ask(server.api, `/api/terminals/${terminal}/close`, { method: 'POST', headers: { ...AS_THE_PERSON, ...personsKey }, body: {} })
  expect(closed.status, JSON.stringify(closed.body)).toBe(200)
  expect(await until(() => theData(session)['state'], (state) => state !== 'running', 10_000)).not.toBe('running')
}

async function theScreen(terminal: string): Promise<string> {
  return (await until(() => theStreamsScreen(server.api, terminal), (lines) => lines.some((line) => line.includes('STAND-IN READY')))).join('\n')
}

/** Whether the program in a terminal said it started in `folder`, and in no folder below or beside it. */
async function itStartedIn(terminal: string, folder: string): Promise<boolean> {
  return (await theScreen(terminal)).split('\n').some((line) => line.trimEnd() === `CWD ${folder}`)
}

beforeAll(async () => {
  const base = aPlace('own')
  const database = join(base.dir, 'd', 'office.db')
  mkdirSync(dirname(database))
  place = { ...base, database, socket: theTerminalHolderSocket(database, base.env), log: theTerminalHolderLog(database, base.env) }
  data = realpathSync(dirname(database))
  const bin = join(place.dir, 'b')
  mkdirSync(bin)
  for (const name of ['claude', 'codex']) {
    writeFileSync(join(bin, name), aStandIn(name))
    chmodSync(join(bin, name), 0o755)
  }
  await startAHolder(place)
  server = await startAServer(place, undefined, { PATH: `${bin}:${process.env['PATH'] ?? '/usr/bin:/bin'}` })
  personsKey = thePersonsKeyHeader(join(dirname(place.database), 'keys.json'))
  agents['codex'] = await register('own-codex', 'codex', null)
  agents['claude'] = await register('own-claude', 'claude-code', null)
  agents['kept'] = await register('own-kept', 'codex', join(place.dir, 'kept'))
  agents['moved'] = await register('own-moved', 'codex', null)
  agents['gone'] = await register('own-gone', 'codex', join(place.dir, 'gone'))
  agents['again'] = await register('own-again', 'codex', null)
  agents['resumed'] = await register('own-resumed', 'codex', null)
  agents['nul'] = await register('nul', 'codex', null)
}, 180_000)

afterAll(stopEverything, 60_000)

describe('an agent with no start folder', () => {
  it('1: opens in a folder of its own in the data folder, its program starts there, and the folder is recorded', async () => {
    firstOpen.before = everyPath()
    const opened = await open('own-codex')
    firstOpen.after = everyPath()
    const own = join(data, 'agents', 'own-codex')
    const terminal = opened.body['terminal'] as { id: string; folder: string } | undefined
    const session = String(opened.body['session'])
    const mark = theMarkOn(agents['codex']!.record)
    expect({
      status: opened.status,
      error: opened.body['error'],
      folder: terminal?.folder,
      startedIn: terminal === undefined ? null : await itStartedIn(terminal.id, own),
      workingDirectory: terminal === undefined ? null : theData(session)['workingDirectory'],
      startFolder: theData(agents['codex']!.record)['startFolder'],
      mark: { how: mark?.['how'], before: mark?.['before'], after: mark?.['after'], because: mark?.['because'] },
    }).toEqual({
      status: 201,
      error: undefined,
      folder: own,
      startedIn: true,
      workingDirectory: own,
      startFolder: own,
      mark: { how: 'the-owner', before: null, after: own, because: 'The office made this folder for it when the person opened it in a terminal with no start folder recorded.' },
    })
    Object.assign(firstOpen, { terminal: terminal?.id ?? '', session, mark })
  }, 60_000)

  it('2: makes nothing outside the data folder: the only new paths are the two folders', () => {
    expect(firstOpen.after.filter((path) => !firstOpen.before.includes(path))).toEqual(['d/agents', 'd/agents/own-codex'])
  })

  it('3: gives both folders the mode 700', () => {
    expect([join(data, 'agents'), join(data, 'agents', 'own-codex')].map((folder) => existsSync(folder) && (statSync(folder).mode & 0o777).toString(8))).toEqual(['700', '700'])
  })

  it('4: opens in the same folder a second time, and does not record it again', async () => {
    await close(firstOpen.terminal, firstOpen.session)
    const again = await open('own-codex')
    const own = join(data, 'agents', 'own-codex')
    const terminal = again.body['terminal'] as { id: string; folder: string } | undefined
    expect({
      status: again.status,
      error: again.body['error'],
      folder: terminal?.folder,
      startedIn: terminal === undefined ? null : await itStartedIn(terminal.id, own),
      mark: theMarkOn(agents['codex']!.record),
    }).toEqual({ status: 201, error: undefined, folder: own, startedIn: true, mark: firstOpen.mark })
    if (terminal !== undefined) await close(terminal.id, String(again.body['session']))
  }, 60_000)
})

describe('an agent with a recorded start folder', () => {
  it('5: opens where it was recorded, is refused when that folder is gone, and no folder of its own is made for either', async () => {
    const kept = await open('own-kept')
    const keptSeen = { status: kept.status, error: kept.body['error'], folder: (kept.body['terminal'] as { folder?: string } | undefined)?.folder }
    if (kept.status === 201) await close((kept.body['terminal'] as { id: string }).id, String(kept.body['session']))

    rmSync(join(place.dir, 'gone'), { recursive: true })
    const gone = await open('own-gone')
    const goneSeen = { status: gone.status, code: gone.body['code'] }

    // ITS OWN FOLDER WAS MADE AND RECORDED, AND THEN THE PERSON RECORDED ANOTHER: it opens in the other.
    const first = await open('own-moved')
    const firstSeen = { status: first.status, error: first.body['error'], folder: (first.body['terminal'] as { folder?: string } | undefined)?.folder }
    if (first.status === 201) await close((first.body['terminal'] as { id: string }).id, String(first.body['session']))
    await recordAStartFolder('own-moved', join(place.dir, 'moved'))
    const moved = await open('own-moved')
    const movedSeen = { status: moved.status, error: moved.body['error'], folder: (moved.body['terminal'] as { folder?: string } | undefined)?.folder }
    if (moved.status === 201) await close((moved.body['terminal'] as { id: string }).id, String(moved.body['session']))

    expect({
      kept: keptSeen,
      gone: goneSeen,
      first: firstSeen,
      moved: movedSeen,
      startFolders: [theData(agents['kept']!.record)['startFolder'], theData(agents['gone']!.record)['startFolder'], theData(agents['moved']!.record)['startFolder']],
      ownFolders: ['own-kept', 'own-gone'].filter((handle) => existsSync(join(data, 'agents', handle))),
    }).toEqual({
      kept: { status: 201, error: undefined, folder: join(place.dir, 'kept') },
      gone: { status: 409, code: 'terminalAgentStartFolderGone' },
      first: { status: 201, error: undefined, folder: join(data, 'agents', 'own-moved') },
      moved: { status: 201, error: undefined, folder: join(place.dir, 'moved') },
      startFolders: [join(place.dir, 'kept'), join(place.dir, 'gone'), join(place.dir, 'moved')],
      ownFolders: [],
    })
  }, 90_000)
})

describe("a claude-code agent's own folder", () => {
  it("6: is its own, and the trust written into HOME gains that folder and no other", async () => {
    const settings = join(place.home, '.claude.json')
    const projects = (): Record<string, { hasTrustDialogAccepted?: boolean }> =>
      existsSync(settings) ? ((JSON.parse(readFileSync(settings, 'utf8')) as { projects?: Record<string, { hasTrustDialogAccepted?: boolean }> }).projects ?? {}) : {}
    const before = Object.keys(projects())
    const opened = await open('own-claude')
    const own = join(data, 'agents', 'own-claude')
    const after = projects()
    expect({
      status: opened.status,
      error: opened.body['error'],
      folder: (opened.body['terminal'] as { folder?: string } | undefined)?.folder,
      notAnothersFolder: own !== theData(agents['codex']!.record)['startFolder'],
      trustGained: Object.keys(after).filter((one) => !before.includes(one)),
      accepted: after[own]?.hasTrustDialogAccepted,
    }).toEqual({ status: 201, error: undefined, folder: own, notAnothersFolder: true, trustGained: [own], accepted: true })
    if (opened.status === 201) await close((opened.body['terminal'] as { id: string }).id, String(opened.body['session']))
  }, 60_000)
})

describe('what is refused, in words, with nothing made', () => {
  it('7: refuses a handle Windows keeps for a device', async () => {
    const before = everyPath()
    const refused = await open('nul')
    expect({
      status: refused.status,
      code: refused.body['code'],
      error: refused.body['error'],
      paths: everyPath(),
      startFolder: theData(agents['nul']!.record)['startFolder'],
      sessions: theSessionsOf(agents['nul']!.id),
    }).toEqual({
      status: 409,
      code: 'terminalAgentNoStartFolder',
      error:
        'nul has no start folder recorded in this project, and the office could not make one of its own for it: Windows keeps the name "nul" ' +
        'for a device, so no folder may have it there. Nothing was opened. Record a start folder with POST /api/participants/agent/nul/start-folder, and it opens there.',
      paths: before,
      startFolder: undefined,
      sessions: 0,
    })
  }, 60_000)

  it("8: refuses a handle free again after its agent was retired, because the folder of that name is the retired agent's", async () => {
    const first = await open('own-again')
    if (first.status === 201) await close((first.body['terminal'] as { id: string }).id, String(first.body['session']))
    const retired = await ask(server.api, '/api/participants/agent/own-again/retire', { method: 'POST', headers: { ...AS_THE_PERSON, ...personsKey }, body: { because: 'the test frees its handle' } })
    const newer = await register('own-again', 'codex', null)
    const refused = await open('own-again')
    const own = join(data, 'agents', 'own-again')
    expect({
      first: first.status,
      retired: retired.status,
      anotherAgent: newer.id !== agents['again']!.id,
      status: refused.status,
      code: refused.body['code'],
      error: refused.body['error'],
      startFolder: theData(newer.record)['startFolder'],
      sessions: theSessionsOf(newer.id),
    }).toEqual({
      first: 201,
      retired: 200,
      anotherAgent: true,
      status: 409,
      code: 'terminalAgentNoStartFolder',
      error:
        `own-again has no start folder recorded in this project, and the office could not make one of its own for it: ${own} is the start folder of another ` +
        `agent, ${agents['again']!.id}, and two agents never share one. Nothing was opened. Record a start folder with ` +
        'POST /api/participants/agent/own-again/start-folder, and it opens there.',
      startFolder: undefined,
      sessions: 0,
    })
  }, 90_000)

  it('9: refuses "resume" for an agent with no start folder, and makes nothing', async () => {
    const refused = await open('own-resumed', { resume: true })
    expect({
      status: refused.status,
      code: refused.body['code'],
      error: refused.body['error'],
      made: existsSync(join(data, 'agents', 'own-resumed')),
      startFolder: theData(agents['resumed']!.record)['startFolder'],
    }).toEqual({
      status: 409,
      code: 'terminalAgentNoStartFolder',
      error:
        'own-resumed has no start folder recorded in this project, so there is no conversation of it to continue, and it was not opened. ' +
        'Open it without "resume", and the office makes a folder of its own for it.',
      made: false,
      startFolder: undefined,
    })
  }, 60_000)
})

/** What a call threw, in its own words, or null when it threw nothing. */
function whyItThrew(call: () => unknown): string | null {
  try {
    call()
    return null
  } catch (error) {
    return (error as Error).message
  }
}

describe('the folder maker alone', () => {
  it('10: refuses a data folder inside a git working tree, and a folder other users may open or that is a link, and makes or changes nothing', async () => {
    const { makeTheAgentsOwnFolder } = await import('../src/server/lib/terminals/an-agents-own-folder.ts')
    const byItsMode = { by: 'its-mode' as const }
    const tree = join(place.dir, 'g')
    mkdirSync(join(tree, '.git'), { recursive: true })
    mkdirSync(join(tree, 'data'))
    const inATree = whyItThrew(() => makeTheAgentsOwnFolder('own-unit', { databasePath: join(tree, 'data', 'office.db'), privately: byItsMode }))

    const shared = join(place.dir, 'u')
    mkdirSync(join(shared, 'agents', 'own-open'), { recursive: true, mode: 0o700 })
    chmodSync(join(shared, 'agents'), 0o700)
    chmodSync(join(shared, 'agents', 'own-open'), 0o755)
    const othersMayOpen = whyItThrew(() => makeTheAgentsOwnFolder('own-open', { databasePath: join(shared, 'office.db'), privately: byItsMode }))
    symlinkSync(join(shared, 'agents', 'own-open'), join(shared, 'agents', 'own-link'))
    const aLink = whyItThrew(() => makeTheAgentsOwnFolder('own-link', { databasePath: join(shared, 'office.db'), privately: byItsMode }))

    expect({
      inATree,
      madeInTheTree: readdirSync(join(tree, 'data')),
      othersMayOpen,
      itsMode: (statSync(join(shared, 'agents', 'own-open')).mode & 0o777).toString(8),
      aLink,
      stillALink: lstatSync(join(shared, 'agents', 'own-link')).isSymbolicLink(),
    }).toEqual({
      inATree: `the office's data folder ${join(tree, 'data')} is inside the git working tree ${realpathSync(tree)}, so a folder made there would belong to that repository`,
      madeInTheTree: [],
      othersMayOpen: `${join(realpathSync(shared), 'agents', 'own-open')} is there and other users may open it (its mode is 755)`,
      itsMode: '755',
      aLink: `${join(realpathSync(shared), 'agents', 'own-link')} is there and is not a folder of its own`,
      stillALink: true,
    })
  })

  it('11: on Windows passes its one entry on to what is made inside, and removes a folder whose list could not be set', async () => {
    const { makeTheAgentsOwnFolder, windowsPrivateFolders } = await import('../src/server/lib/terminals/an-agents-own-folder.ts')
    const scripts: string[] = []
    const answering = (stdout: string, status = 0) => ({
      powershell: (script: string) => {
        scripts.push(script)
        return { command: 'powershell', ran: true as const, status, stdout, stderr: status === 0 ? '' : 'Access to the path is denied.' }
      },
      startPowerShell: () => Promise.reject(new Error('a folder is made private on the thread')),
    })
    const me = 'S-1-5-21-1000'
    const windows = join(place.dir, 'w')
    mkdirSync(windows)
    const made = whyItThrew(() => makeTheAgentsOwnFolder('own-windows', { databasePath: join(windows, 'office.db'), privately: windowsPrivateFolders(answering(`me ${me}\nprotected True\nentry ${me} Allow 2032127 False 3\n`)) }))
    const folder = join(realpathSync(windows), 'agents', 'own-windows')
    const madeScripts = scripts.splice(0)

    const notPassedOn = windowsPrivateFolders(answering(`me ${me}\nprotected True\nentry ${me} Allow 2032127 False 0\n`)).set(folder)

    const failing = join(place.dir, 'x')
    mkdirSync(failing)
    const notSet = whyItThrew(() => makeTheAgentsOwnFolder('own-failing', { databasePath: join(failing, 'office.db'), privately: windowsPrivateFolders(answering('', 1)) }))

    expect({
      made,
      there: existsSync(folder),
      scripts: madeScripts.length,
      carriesThePath: madeScripts[1]?.includes(Buffer.from(folder, 'utf8').toString('base64')),
      passesItOn: madeScripts[1]?.includes("[System.Security.AccessControl.InheritanceFlags]'ContainerInherit, ObjectInherit'"),
      notPassedOn,
      notSet,
      leftWhereItFailed: readdirSync(failing),
    }).toEqual({
      made: null,
      there: true,
      scripts: 2,
      carriesThePath: true,
      passesItOn: true,
      notPassedOn: { ok: false, says: 'its access list was set, but its one entry is not passed on to what is made inside it' },
      notSet: `${join(realpathSync(failing), 'agents')} could not be made this user's alone: its access list could not be set: Access to the path is denied.`,
      leftWhereItFailed: [],
    })
  })
})
