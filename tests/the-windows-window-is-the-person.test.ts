// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * ON WINDOWS, ONLY THE INSTALLED APP'S OWN WINDOW COUNTS AS THE PERSON'S PROGRAM, AND THE READING HOLDS NO THREAD,
 * RUNS ONLY WHERE IT IS ASKED AND WAITS ONLY SO LONG.
 *
 * Wave 13t, round W32, item 1. The Mac's probe recognises its own window inside the installed Mac app
 * (tests/a-mac-counts-only-its-own-window-as-the-person.test.ts). This file holds the same rule for the Windows probe.
 * Inside the installed Windows app, a connection counts as one of this computer's own programs only when all of these
 * hold: both ends are loopback; Windows lists exactly one connection from the far end's port to the server's port
 * between those two addresses; the process that owns it runs as the same user as this server; its program file is the
 * app's own mole-office.exe; its parent is the process its row names, also runs mole-office.exe, and started before it;
 * and a second reading of the connection finds the same owner. Every other answer is "a program Mole Office could not
 * find", which is not the person (src/server/lib/from-a-sandbox.ts).
 *
 * WHAT IS HELD HERE. The Windows probe and the real Windows reader (src/config/systems/windows-processes.mjs) over a
 * stand-in for PowerShell. The stand-in answers the one script that reads a connection with what that script prints.
 * Each refusal case makes every fact match the window but one, so each refusal is held by its own case:
 *
 *   W1 the owner's program is another program;      W2 the owner runs as another user, or as no user Windows names;
 *   W3 the owner's parent is not the app;            W4 the owner's parent started after it, so its number was reused;
 *   W5 no row names the connection;                  W6 the second reading finds the connection gone or changed;
 *   W7 two rows name the same connection;            W8 a far end on another computer, or a port that is no port;
 *   W9 PowerShell exits 1, though it printed the window; W10 the office runs from a checkout or a loose folder;
 *   W11 a path Windows spells another way is the same path;  W12 the program's name is the one the build gives it.
 *
 * ONE SPELLING OF A WINDOWS PATH. Round W33 added these. The installer's question
 * (src/config/systems/the-installer-of-a-folder.mjs) and the window's rule compare Windows paths, and both read one
 * spelling of a path:
 *
 *   W13 over a grid of the office's folders and the folders Windows may list the app in, the installer counts the
 *       folder as its own exactly when the window's rule counts the app's program in it.
 *
 * NO READING HOLDS THE THREAD. Round W33 added these too. Every case below reads by the way that waits, and the
 * stand-in records any script given to the way that holds the thread, so a case fails if one is:
 *
 *   D1 the installed probe has only the way that waits, and still finds only the app's own window;
 *   D2 the question that holds the thread refuses in words when the answer was not read first, and runs no script;
 *   D3 the press of an update (lib/the-update.ts), D4 a secretary's terminal doors (api/terminals.ts) and D5 the
 *      ledger's program behind a request (api/resources.ts) each read by the way that waits;
 *   D7 a door that asks on the thread with nothing read first gets the refusal's sentence back, and not a bare error.
 *
 * AND OVER A REAL LISTENER, with the installed probe in the server:
 *
 *   L1 every door the window's page calls before it is paired, and that asks who sent it, reads the connection by the
 *      way that waits;
 *   L2 a request that carries the person's key, or an agent's name, starts no PowerShell at all;
 *   L3 two requests on one connection read it once;
 *   L4 a keyless request the window would count is read first at every door that may ask. A door that asks reads it
 *      once, and a door that never asks but is not declared so (T1) may read it once too. No door holds the thread.
 *
 * A READING WAITS ONLY AT A DOOR THAT ASKS, AND ONLY SO LONG. Round W35 added these. The installed office had stopped
 * answering `mole-office start`: every keyless request from this computer waited for a reading of about four and a
 * half seconds, health included, and the command waits three seconds for each answer. Each case reads by a stand-in
 * that takes five seconds:
 *
 *   T1 a door declared never to ask, and an address outside /api, answer at once and start no reading;
 *   T2 health and a second request answer while another request waits for its reading;
 *   T3 a reading that runs past its time is refused in words, and nothing is paired;
 *   T4 `mole-office stop` asks health as it does, and finds this office answering. The uninstaller runs that stop.
 *
 * A READING THAT RAN PAST ITS TIME, AS THE PAGE AND THE LOG READ IT. Round W37 added these. On one start in four after
 * an install, the window's first page was only the refusal's sentence, and the service log said nothing about it:
 *
 *   T5 the refusal carries a code the page reads, and each refusal leaves one line in the log, written when its reading
 *      has ended, with how long the reading took;
 *   T6 the next request on the same connection is read again and answered, so a page that asks again can be answered,
 *      and only the refused request leaves a line in the log.
 *
 * THE DATA FOLDER MOVER'S ASK IS NOT HELD BY A READING. On Windows a reading took longer than the mover's ask waits, so
 * every ask was refused and no move could finish:
 *
 *   T7 the data folder mover's ask names the database this office opened while a reading takes longer than the ask
 *      waits.
 *
 * THE POWERSHELL THAT STAYS. On a Windows 11 machine a reading took 10.6 to 14.1 seconds, and each reading started a
 * PowerShell of its own. Now the reading runs in one PowerShell that stays open (src/config/systems/windows-commands.mjs).
 * Each case gives the stand-in that way as well, and it answers there what it answers a PowerShell started for the
 * reading:
 *
 *   S1 for the same answer, the way that stays finds the same sender, or fails with the same words, as a PowerShell
 *      started for the reading, and the script goes only to the way that stays;
 *   S2 a script the PowerShell that stays did not run, because it ran past its time or was stopped before its turn, is
 *      a reading that failed, in words, and not an answer: the probe throws the reason, the request is not the
 *      person's, and nothing is paired;
 *   S3 the thread goes on while a reading waits for the PowerShell that stays, and no script holds it;
 *   S4 each reading leaves one line in the log, with how long it took and where the time went, and the measuring tool
 *      (tests/installed/time-the-sender-reading.mjs) reads the same numbers from that line;
 *   S5 a reading that failed leaves one line that says why, and the measuring tool reads it as a reading that failed.
 *
 * THE MUTATIONS, each run after a control and then restored, are listed in the commit message that added the code and
 * in the round's report.
 *
 * NOTHING HERE RAN ON WINDOWS. Each answer is what the script would print, handed back by the stand-in. That a real
 * Windows prints these rows for the window's connection, that Electron's network process is the owner, and that no
 * other program of the same user runs as the app's own mole-office.exe need a Windows machine.
 */
import { readFileSync } from 'node:fs'
import { request, Agent } from 'node:http'
import type { AddressInfo } from 'node:net'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import Fastify, { type FastifyInstance } from 'fastify'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import type { WhatACommandDid } from '../src/config/process-reader.mjs'
import type { WhatTheOneThatStaysDid } from '../src/config/systems/windows-commands.mjs'
import { THE_WINDOWS_EXECUTABLE } from '../scripts/the-windows-build.mjs'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { readTheLine } from './installed/time-the-sender-reading.mjs'

type SharedWithLinux = import('../src/server/lib/darwin-probe.ts').SharedWithLinux
type OsProbe = import('../src/server/lib/resources.ts').OsProbe

// ---------------------------------------------------------------------------- the stand-in Windows machine

/** The installed folder, as the installer makes it for one person, and the office in it as settings.mjs writes it. */
const APP = 'C:\\Users\\someone\\AppData\\Local\\Programs\\Mole Office'
const INSTALLED = { from: 'bundle' as const, root: `${APP}\\resources\\office/` }
const THE_APP = `${APP}\\mole-office.exe`
/** The Node the installed office runs on, which is this server's program. */
const ITS_NODE = `${APP}\\resources\\office\\runtime\\node.exe`
/** This server's user, and another user of the same computer. */
const THE_PERSONS_SID = 'S-1-5-21-1004336348-1177238915-682003330-1001'
const ANOTHER_SID = 'S-1-5-21-1004336348-1177238915-682003330-1002'
const A_BROWSER = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const A_CONTAINERS_PROXY = 'C:\\Program Files\\Docker\\Docker\\resources\\com.docker.backend.exe'
/** When the window's main program started. */
const STARTED = Date.UTC(2026, 10, 4, 9, 0, 0)
/** The window's network process is 42 and its main program 41. The window's socket is 60001, the server's 8787. */
const WINDOW = { address: '::ffff:127.0.0.1', port: 60001 }
const SERVER = { address: '127.0.0.1', port: 8787 }

/** One row of Get-NetTCPConnection, in the fields the script prints. */
interface AConnection {
  LocalAddress: string
  LocalPort: number
  RemoteAddress: string
  RemotePort: number
  OwningProcess: number
}
/** One process, in the fields the script prints. Sid is null when Windows would not say whose it is. */
interface AProcess {
  ProcessId: number
  ParentProcessId: number
  CreationDate: number | null
  ExecutablePath: string | null
  Sid: string | null
}
/** What the script prints: the connection, each owner with its parent, this server, and the connection again. */
interface WhatTheScriptPrints {
  Before: AConnection[]
  Holders: { ProcessId: number; Holder: AProcess | null; Parent: AProcess | null }[]
  Server: AProcess | null
  After: AConnection[]
}

const aProcess = (pid: number, ppid: number, created: number | null, program: string | null, sid: string | null): AProcess => ({
  ProcessId: pid,
  ParentProcessId: ppid,
  CreationDate: created,
  ExecutablePath: program,
  Sid: sid,
})

const bare = (address: string): string => (address.startsWith('::ffff:') ? address.slice(7) : address)

/**
 * THE WINDOW, as the script prints it when every fact matches. A case changes one fact. Another connection between the
 * same two ports, from another loopback address and owned by a browser, is listed too: only the exact one counts.
 */
function theWindow(peer = WINDOW, ours = SERVER): WhatTheScriptPrints {
  const itsConnection: AConnection = { LocalAddress: bare(peer.address), LocalPort: peer.port, RemoteAddress: bare(ours.address), RemotePort: ours.port, OwningProcess: 42 }
  const another: AConnection = { LocalAddress: '127.0.0.2', LocalPort: peer.port, RemoteAddress: bare(ours.address), RemotePort: ours.port, OwningProcess: 77 }
  return {
    Before: [itsConnection, another],
    Holders: [
      { ProcessId: 42, Holder: aProcess(42, 41, STARTED + 5_000, THE_APP, THE_PERSONS_SID), Parent: aProcess(41, 9, STARTED, THE_APP, THE_PERSONS_SID) },
      { ProcessId: 77, Holder: aProcess(77, 76, STARTED, A_BROWSER, THE_PERSONS_SID), Parent: aProcess(76, 9, STARTED, A_BROWSER, THE_PERSONS_SID) },
    ],
    Server: aProcess(process.pid, 4000, STARTED + 1_000, ITS_NODE, THE_PERSONS_SID),
    After: [itsConnection, another],
  }
}

/** The window with the owner's row, or its parent's, changed in one field. */
function theWindowWith(change: { holder?: Partial<AProcess>; parent?: Partial<AProcess> | null; server?: Partial<AProcess> }): WhatTheScriptPrints {
  const window = theWindow()
  const [ours, ...rest] = window.Holders
  return {
    ...window,
    Holders: [
      {
        ProcessId: ours!.ProcessId,
        Holder: { ...ours!.Holder!, ...change.holder },
        Parent: change.parent === null ? null : { ...ours!.Parent!, ...change.parent },
      },
      ...rest,
    ],
    Server: { ...window.Server!, ...change.server },
  }
}

const printed = (stdout: string, status = 0, stderr = ''): WhatACommandDid => ({ command: 'powershell.exe', ran: true, status, stdout, stderr })

/**
 * What the stand-in prints for the script about a connection. A function of the two ports the script names, so the
 * listener's cases can answer for a port the test did not choose.
 */
let answering: (peerPort: number, ourPort: number) => WhatTheScriptPrints | WhatACommandDid = (peerPort, ourPort) =>
  theWindow({ address: '127.0.0.1', port: peerPort }, { address: '127.0.0.1', port: ourPort })

/** What each script asked: run in the way that holds the thread, and run in the way that waits for it. */
const held: string[] = []
const waited: string[] = []

/** The one script this stand-in knows: the reading of one connection, which names both ports and this server. */
function theAnswerTo(script: string): { asks: string; answer: WhatACommandDid } {
  const ports = /Get-NetTCPConnection -LocalPort (\d+) -RemotePort (\d+)/u.exec(script)
  if (ports === null) {
    throw new Error(`This stand-in for PowerShell does not know the script that begins ${JSON.stringify(script.slice(0, 160))}.`)
  }
  if (!new RegExp(`\\b${String(process.pid)}\\b`, 'u').test(script)) {
    throw new Error("The script about a connection does not read this server's own process.")
  }
  const said = answering(Number(ports[1]), Number(ports[2]))
  const answer = 'Before' in said ? printed(`${JSON.stringify(said)}\r\n`) : said
  return { asks: `the connection from port ${ports[1]!} to port ${ports[2]!}`, answer }
}

/** How long the way that waits takes to answer, in milliseconds, when a case makes it slow. Null is the next turn. */
let theReadTakes: number | null = null

/**
 * PowerShell, stood in, both ways. The way that waits answers on a later turn of the event loop, as a process does,
 * or after `theReadTakes`.
 */
const commands = {
  powershell: (script: string): WhatACommandDid => {
    const { asks, answer } = theAnswerTo(script)
    held.push(asks)
    return answer
  },
  startPowerShell: async (script: string): Promise<WhatACommandDid> => {
    const { asks, answer } = theAnswerTo(script)
    waited.push(asks)
    const takes = theReadTakes
    await new Promise((later) => (takes === null ? setImmediate(later) : setTimeout(later, takes)))
    return answer
  },
}

/** The borrowed half of the Windows probe. Nothing here asks it about a process. */
function theBorrowedHalf(): SharedWithLinux {
  const notAsked = (what: string) => (): never => {
    throw new Error(`this test does not ask the probe's ${what}`)
  }
  return {
    checkout: () => ({ head: null, branch: null, dirty: null, isWorktree: null, couldNotRead: [] }),
    gpu: () => ({ available: false, reason: 'a stand-in Windows machine has no GPU' }),
    containers: () => ({ available: false, reason: 'a stand-in Windows machine has no docker' }),
    locks: () => ({ files: [], unreadable: [] }),
    machineName: () => 'a-windows-machine',
    ownAddresses: () => [],
    whatAnAgentToolSaysAboutItsKey: () => ({ state: 'nobody-has-looked', says: 'test', asked: 'test' }),
    startTheRestartCommand: notAsked('restart command'),
    runAvatarCodec: notAsked('avatar codec'),
    startTheMessageWorker: notAsked('worker start'),
    tmuxPanes: () => Promise.resolve({ ok: true, out: '' }),
    killProcessGroup: notAsked('group stop'),
    stopContainer: notAsked('container stop'),
    theVersionOfAProgram: () => Promise.resolve({ path: null, version: 'test', versionWasRead: false }),
  }
}

// ---------------------------------------------------------------------------- the office

let t: TestDb
let app: FastifyInstance
let thisMachine = { host: '127.0.0.1', port: 0 }
let res: typeof import('../src/server/lib/resources.ts')
let windows: typeof import('../src/server/lib/windows-probe.ts')
let reading: typeof import('../src/config/systems/windows-processes.mjs')
let sandbox: typeof import('../src/server/lib/from-a-sandbox.ts')
let before: OsProbe

beforeAll(async () => {
  // Imported after freshDb, because importing lib/resources.ts opens the database it points at.
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  // THE FIRST LISTENER, which stamps `this machine`.
  await app.listen({ host: '127.0.0.1', port: 0 })
  thisMachine = { host: '127.0.0.1', port: (app.server.address() as AddressInfo).port }
  res = await import('../src/server/lib/resources.ts')
  windows = await import('../src/server/lib/windows-probe.ts')
  reading = await import('../src/config/systems/windows-processes.mjs')
  sandbox = await import('../src/server/lib/from-a-sandbox.ts')
  before = res.osProbe()
}, 120_000)

afterEach(() => {
  // Put the probe back, so the next case starts where this one found the office.
  res.useOsProbe(before)
  answering = (peerPort, ourPort) => theWindow({ address: '127.0.0.1', port: peerPort }, { address: '127.0.0.1', port: ourPort })
  theReadTakes = null
})

afterAll(async () => {
  await app.close()
  t.close()
})

/** A Windows probe over the stand-in, with a reader of its own, for the install given. */
function aWindowsProbe(install: { from: 'bundle' | 'checkout'; root: string } = INSTALLED): OsProbe {
  return new windows.WindowsProbe(theBorrowedHalf(), reading.windowsProcessReader(commands), commands, install)
}

/** A new socket from `peer` to `ours`, so no answer kept on an earlier one is read. */
function aSocket(peer = WINDOW, ours = SERVER): { remoteAddress: string; remotePort: number; localAddress: string; localPort: number } {
  return { remoteAddress: peer.address, remotePort: peer.port, localAddress: ours.address, localPort: ours.port }
}

/**
 * Ask who sent a request on the connection from `peer` to `ours`, with the probe built for the install given and the
 * stand-in printing `given`. Both are read by the way that waits, as the doors read it. Answers the probe's own
 * answer, the doors' verdict, how many scripts were started, and the ones that held the server's thread.
 */
async function ask(given: WhatTheScriptPrints | WhatACommandDid, peer = WINDOW, ours = SERVER, install: { from: 'bundle' | 'checkout'; root: string } = INSTALLED) {
  answering = () => given
  held.length = 0
  waited.length = 0
  res.useOsProbe(aWindowsProbe(install))
  const verdict = await sandbox.readWhoSentItFromThisComputer({ socket: aSocket(peer, ours) } as never)
  const probe = aWindowsProbe(install)
  let sender: unknown = 'the probe has no question'
  if (probe.readSenderOfAConnection !== undefined) {
    try {
      sender = await probe.readSenderOfAConnection(peer, ours)
    } catch (why) {
      sender = `the probe threw: ${String(why)}`
    }
  }
  return { sender, verdict, scripts: held.length + waited.length, heldTheThread: [...held] }
}

const NOT_FOUND = 'a program Mole Office could not find'
const THE_WINDOWS_SENDER = { sid: THE_PERSONS_SID, serversSid: THE_PERSONS_SID, pid: 42, inAnotherContainer: false }

describe('the installed window on Windows', () => {
  it("counts as one of this computer's own programs when every fact matches (the control for every case below)", async () => {
    const { sender, verdict, scripts, heldTheThread } = await ask(theWindow())
    expect(sender).toEqual(THE_WINDOWS_SENDER)
    expect(verdict).toBe(sandbox.THEIR_OWN_PROGRAM)
    expect(scripts, 'each reading of the connection is one script').toBe(2)
    expect(heldTheThread, "these readings held the server's thread").toEqual([])
  })

  it('is read the same way by the reading that waits without holding the thread', async () => {
    held.length = 0
    waited.length = 0
    answering = () => theWindow()
    const probe = aWindowsProbe()
    expect(typeof probe.readSenderOfAConnection, 'the installed Windows probe has no reading that waits').toBe('function')
    expect(await probe.readSenderOfAConnection!(WINDOW, SERVER)).toEqual(THE_WINDOWS_SENDER)
    expect(held).toEqual([])
    expect(waited).toEqual(['the connection from port 60001 to port 8787'])
  })
})

describe('every other sender is refused, one fact at a time', () => {
  it("W1: the connection's owner is a container's proxy, a browser, or the program of another copy of the app", async () => {
    for (const program of [A_CONTAINERS_PROXY, A_BROWSER, 'C:\\Users\\someone\\Downloads\\Mole Office\\mole-office.exe']) {
      const { sender, verdict } = await ask(theWindowWith({ holder: { ExecutablePath: program } }))
      expect(sender, program).toBeNull()
      expect(verdict, program).toBe(NOT_FOUND)
    }
  })

  it('W2: the owner runs as another user, Windows will not say whose it is, or will not say whose this server is', async () => {
    for (const change of [{ holder: { Sid: ANOTHER_SID } }, { holder: { Sid: null } }, { server: { Sid: null } }]) {
      const { sender, verdict } = await ask(theWindowWith(change))
      expect(sender, JSON.stringify(change)).toBeNull()
      expect(verdict, JSON.stringify(change)).toBe(NOT_FOUND)
    }
  })

  it("W3: the owner's parent is another program, is gone, or is a process its row does not name", async () => {
    for (const change of [{ parent: { ExecutablePath: 'C:\\Windows\\explorer.exe' } }, { parent: null }, { parent: { ProcessId: 40 } }]) {
      const { sender, verdict } = await ask(theWindowWith(change))
      expect(sender, JSON.stringify(change)).toBeNull()
      expect(verdict, JSON.stringify(change)).toBe(NOT_FOUND)
    }
  })

  it("W4: the owner's parent started after it, so the parent's number was given to the app later", async () => {
    for (const change of [{ parent: { CreationDate: STARTED + 6_000 } }, { parent: { CreationDate: null } }]) {
      const { sender, verdict } = await ask(theWindowWith(change))
      expect(sender, JSON.stringify(change)).toBeNull()
      expect(verdict, JSON.stringify(change)).toBe(NOT_FOUND)
    }
  })

  it('W5: no row names the connection', async () => {
    const { sender, verdict } = await ask({ ...theWindow(), Before: [], Holders: [], After: [] })
    expect(sender).toBeNull()
    expect(verdict).toBe(NOT_FOUND)
  })

  it('W6: the second reading finds the connection gone, or owned by another process', async () => {
    const window = theWindow()
    for (const after of [[], [{ ...window.Before[0]!, OwningProcess: 77 }]]) {
      const { sender, verdict } = await ask({ ...window, After: after })
      expect(sender, JSON.stringify(after)).toBeNull()
      expect(verdict, JSON.stringify(after)).toBe(NOT_FOUND)
    }
  })

  it('W7: two rows name the same connection', async () => {
    const window = theWindow()
    const { sender, verdict } = await ask({ ...window, Before: [...window.Before, { ...window.Before[0]!, OwningProcess: 77 }] })
    expect(sender).toBeNull()
    expect(verdict).toBe(NOT_FOUND)
  })

  it('W8: a far end on another computer, or a port that is no port, starts no PowerShell', async () => {
    const elsewhere = { address: '192.0.2.10', port: 60001 }
    const ours = { address: '198.51.100.20', port: 8787 }
    const noPort = { address: '127.0.0.1', port: 70000 }
    for (const [peer, server] of [[elsewhere, ours], [noPort, SERVER]] as const) {
      const { sender, verdict, scripts } = await ask(theWindow(peer, server), peer, server)
      expect(sender, peer.address).toBeNull()
      expect(verdict, peer.address).toBe(NOT_FOUND)
      expect(scripts, peer.address).toBe(0)
    }
  })

  it('W9: PowerShell exits 1, though it printed the window; or prints what is not JSON', async () => {
    // A failure to look is said, and not read as an absence: the probe throws, and the doors' verdict is "not found".
    for (const did of [printed(`${JSON.stringify(theWindow())}\r\n`, 1, 'Get-NetTCPConnection : Access is denied.'), printed('Access is denied.\r\n')]) {
      const { sender, verdict } = await ask(did)
      expect(String(sender), did.ran ? did.stdout : '').toMatch(/^the probe threw: /u)
      expect(verdict, did.ran ? did.stdout : '').toBe(NOT_FOUND)
    }
  })

  it('W10: the office runs from a checkout, or from a bundle that is not the installed folder, and starts no PowerShell', async () => {
    for (const install of [
      { from: 'checkout' as const, root: INSTALLED.root },
      { from: 'bundle' as const, root: 'C:\\Users\\someone\\office\\' },
      { from: 'bundle' as const, root: `${APP}\\resources\\another\\` },
    ]) {
      const { sender, verdict, scripts } = await ask(theWindow(), WINDOW, SERVER, install)
      expect(sender, install.root).toBe('the probe has no question')
      expect(verdict, install.root).toBe(NOT_FOUND)
      expect(scripts, install.root).toBe(0)
    }
  })

  it('W11: a path Windows spells another way is the same path', async () => {
    const spelt = 'c:/users/SOMEONE/appdata/local/programs/mole office/MOLE-OFFICE.EXE'
    const { sender, verdict } = await ask(theWindowWith({ holder: { ExecutablePath: spelt }, parent: { ExecutablePath: spelt } }), WINDOW, SERVER, {
      from: 'bundle',
      root: `${APP.toLowerCase()}/RESOURCES/office`,
    })
    expect(sender).toEqual(THE_WINDOWS_SENDER)
    expect(verdict).toBe(sandbox.THEIR_OWN_PROGRAM)
  })

  it("W12: the program the probe looks for is the one the Windows build names the window's", () => {
    expect(reading.THE_WINDOWS_APPS_PROGRAM).toBe(THE_WINDOWS_EXECUTABLE)
  })
})

// ---------------------------------------------------------------------------- one spelling of a Windows path

describe('a Windows path is spelt in one place, for the installer and for the window', () => {
  it("W13: the installer's question and the window's rule agree on every spelling of the installed folder", async () => {
    const installer = await import('../src/config/systems/the-installer-of-a-folder.mjs')
    // The office's folder as the installed app may give it, and the folder Windows may list the app in.
    const roots = [INSTALLED.root, `${APP}\\resources\\office`, `${APP.toUpperCase()}\\RESOURCES\\OFFICE\\`, `${APP.replaceAll('\\', '/')}/resources/office`]
    const listed = [
      APP,
      APP.toLowerCase(),
      APP.toUpperCase(),
      APP.replaceAll('\\', '/'),
      `${APP}\\`,
      APP.replace('\\Programs\\', '\\Programs\\\\'),
      APP.replace('\\Programs\\', '\\Programs\\.\\'),
      APP.replace('\\Programs\\', '\\Programs\\another\\..\\'),
      `${APP} 2`,
      'C:\\Program Files\\Mole Office',
    ]
    const differ: string[] = []
    const answers = new Set<boolean>()
    for (const root of roots) {
      for (const location of listed) {
        const made = await installer.windowsInstallerQuestion({ startPowerShell: async () => printed(`entry\tthe-app\t${location}\r\nlisted\r\n`) } as never)(root, `${root}\\package.json`)
        const program = `${location}\\${reading.THE_WINDOWS_APPS_PROGRAM}`
        const { verdict } = await ask(theWindowWith({ holder: { ExecutablePath: program }, parent: { ExecutablePath: program } }), WINDOW, SERVER, { from: 'bundle', root })
        const theInstallerMadeIt = made.made === 'by-windows'
        answers.add(theInstallerMadeIt)
        if (theInstallerMadeIt !== (verdict === sandbox.THEIR_OWN_PROGRAM)) differ.push(`${root} with ${location}: the installer says ${made.made}, the window's rule says ${verdict}`)
      }
    }
    expect(differ, 'the installer and the window spell a Windows path differently').toEqual([])
    expect([...answers].sort(), 'the grid holds no folder of each kind').toEqual([false, true])
  })
})

// ---------------------------------------------------------------------------- no door holds the thread

/** Start a case with the stand-in printing `given`, nothing read yet, and the installed probe in the server. */
function theWindowPrints(given: WhatTheScriptPrints): void {
  answering = () => given
  held.length = 0
  waited.length = 0
  res.useOsProbe(aWindowsProbe())
}

describe("inside the installed app, no door reads who sent a request on the server's thread", () => {
  it('D1: the probe reads who sent a connection only by the way that waits', () => {
    const probe = aWindowsProbe()
    expect(probe.senderOfAConnection, 'the installed Windows probe still has a way that holds the thread').toBeUndefined()
    expect(typeof probe.readSenderOfAConnection).toBe('function')
    expect(sandbox.whomThisComputerFinds(probe)).toBe("only the installed app's own window")
  })

  it("D2: the question that holds the thread refuses when the answer was not read first, and starts no script", async () => {
    theWindowPrints(theWindow())
    const req = { socket: aSocket() } as never
    expect(() => sandbox.whoSentItFromThisComputer(req)).toThrow(/server's thread/u)
    expect(held).toEqual([])
    expect(waited).toEqual([])
    expect(await sandbox.readWhoSentItFromThisComputer(req)).toBe(sandbox.THEIR_OWN_PROGRAM)
    expect(sandbox.whoSentItFromThisComputer(req), 'the answer read first was not kept').toBe(sandbox.THEIR_OWN_PROGRAM)
    expect(held).toEqual([])
    expect(waited.length).toBe(1)
  })

  it('D3: the press of an update reads who sent it by the way that waits', async () => {
    const { mayPressTheUpdate } = await import('../src/server/lib/the-update.ts')
    for (const [owner, may] of [[THE_APP, true], [A_BROWSER, false]] as const) {
      theWindowPrints(theWindowWith({ holder: { ExecutablePath: owner } }))
      expect(await mayPressTheUpdate({ headers: {}, socket: aSocket() } as never), owner).toBe(may)
      expect(held, `${owner}: these readings held the server's thread`).toEqual([])
      expect(waited.length, owner).toBe(1)
    }
  })

  it("D4: a secretary's terminal doors read who sent it by the way that waits", async () => {
    const { assertATerminalAgentIsHere } = await import('../src/server/api/terminals.ts')
    const anAgent = { type: 'agent', id: 'an-agent', from: 'this machine' } as never
    const theAssert = (): Promise<void> => Promise.resolve().then(() => assertATerminalAgentIsHere({ socket: aSocket() } as never, anAgent))
    theWindowPrints(theWindow())
    await expect(theAssert()).resolves.toBeUndefined()
    expect(held, "the window's reading held the server's thread").toEqual([])
    expect(waited.length).toBe(1)
    theWindowPrints(theWindowWith({ holder: { ExecutablePath: A_BROWSER } }))
    await expect(theAssert()).rejects.toThrow()
    expect(held, "the browser's reading held the server's thread").toEqual([])
    expect(waited.length).toBe(1)
  })

  it('D5: the ledger reads the program behind a request by the way that waits', async () => {
    theWindowPrints(theWindow())
    expect(await sandbox.readTheProgramBehind({ socket: aSocket() } as never)).toEqual({ pid: 42, inAnotherContainer: false })
    expect(held).toEqual([])
    expect(waited.length).toBe(1)
  })

  it("D7: a door that asks on the thread with nothing read first gets the refusal's sentence back", async () => {
    // A door of its own, with the office's error handling, that asks on the thread and reads nothing first.
    const { installErrorHandling } = await import('../src/server/lib/http.ts')
    const door = Fastify()
    installErrorHandling(door)
    door.get('/a-door-that-did-not-read-first', async (req) => ({ sender: sandbox.whoSentItFromThisComputer(req) }))
    await door.listen({ host: '127.0.0.1', port: 0 })
    try {
      res.useOsProbe(aWindowsProbe())
      held.length = 0
      waited.length = 0
      const answer = await new Promise<{ status: number; body: string }>((done, failed) => {
        const port = (door.server.address() as AddressInfo).port
        const asked = request({ host: '127.0.0.1', port, path: '/a-door-that-did-not-read-first', agent: false }, (got) => {
          let body = ''
          got.setEncoding('utf8')
          got.on('data', (piece: string) => (body += piece))
          got.on('end', () => done({ status: got.statusCode ?? 0, body }))
        })
        asked.on('error', failed)
        asked.end()
      })
      const said = JSON.parse(answer.body) as { error?: string; sender?: string }
      expect(said.sender, 'the door was answered as if the sender had been read').toBeUndefined()
      expect(said.error, 'the refusal lost its sentence').toMatch(/this request was not read that way first\. .* The door that asked must read the sender first\.$/u)
      expect(answer.status).toBe(500)
      expect(held).toEqual([])
      expect(waited).toEqual([])
    } finally {
      await door.close()
    }
  })
})

// ---------------------------------------------------------------------------- over a real listener

/** The person's headers and no key, as the window's page sends them before it is paired (src/web/api.ts). */
const THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
}

interface AnAnswer {
  status: number
  setCookie: string | null
  /** What the answer said, or nothing for a stream. */
  body: string
}

/**
 * Send one request to the listener for this machine. With no agent, each request goes on a connection of its own, so
 * nothing kept on an earlier connection answers it. A stream is answered once its headers arrive, and then closed.
 */
function send(method: string, path: string, headers: Record<string, string>, options: { body?: string; agent?: Agent; stream?: boolean } = {}): Promise<AnAnswer> {
  return new Promise((done, failed) => {
    const asked = request(
      { ...thisMachine, method, path, headers, agent: options.agent ?? false },
      (answer) => {
        const setCookie = answer.headers['set-cookie']?.[0] ?? null
        if (options.stream === true) {
          answer.destroy()
          done({ status: answer.statusCode ?? 0, setCookie, body: '' })
          return
        }
        let body = ''
        answer.setEncoding('utf8')
        answer.on('data', (piece: string) => (body += piece))
        answer.on('end', () => done({ status: answer.statusCode ?? 0, setCookie, body }))
      },
    )
    asked.on('error', failed)
    if (options.body !== undefined) asked.write(options.body)
    asked.end()
  })
}

/** Run one request and say what its readings were. */
async function theReadingsOf(act: () => Promise<AnAnswer>): Promise<{ answer: AnAnswer; held: string[]; waited: string[] }> {
  held.length = 0
  waited.length = 0
  const answer = await act()
  return { answer, held: [...held], waited: [...waited] }
}

/**
 * THE DOORS THE WINDOW'S PAGE CALLS BEFORE IT IS PAIRED THAT ASK WHO SENT THE REQUEST, each with the answer it gives
 * the person. The owner of the test office is already named, so naming them answers 409, which is the answer to the
 * person and not to a stranger. The connection's state asks only when the page names a connection it is starting.
 */
const THE_DOORS_THAT_ASK: { method: string; path: string; body?: string; status: number; stream?: boolean }[] = [
  { method: 'POST', path: '/api/office/owner', body: JSON.stringify({ name: 'A made-up name' }), status: 409 },
  { method: 'GET', path: '/api/office/pairing', status: 200 },
  { method: 'GET', path: '/api/waiting', status: 200 },
  { method: 'GET', path: '/api/attention?machine=omit&shape=home', status: 200 },
  { method: 'GET', path: '/api/messages/forced', status: 200 },
  { method: 'GET', path: '/api/messages?only=waiting-for-me&leads=1', status: 200 },
  { method: 'GET', path: '/api/events', status: 200, stream: true },
  { method: 'POST', path: '/api/office/pairing', status: 200 },
  { method: 'GET', path: '/api/events/state?tag=a-window&connectingFor=500', status: 200 },
]

describe("over a real listener, inside the installed app, the window's doors read without holding the thread", () => {
  it("L1: each door the window's page calls before it is paired reads the connection by the way that waits", async () => {
    for (const door of THE_DOORS_THAT_ASK) {
      res.useOsProbe(aWindowsProbe())
      const said = `${door.method} ${door.path}`
      const read = await theReadingsOf(() => send(door.method, door.path, THE_PERSON, { ...(door.body === undefined ? {} : { body: door.body }), ...(door.stream === true ? { stream: true } : {}) }))
      expect(read.held, `${said}: these readings held the server's thread`).toEqual([])
      expect(read.waited.length, `${said}: the connection was read ${String(read.waited.length)} times`).toBe(1)
      expect(read.answer.status, `${said} was not answered as the person`).toBe(door.status)
    }
  })

  it('L2: a request that is never asked who sent it starts no PowerShell', async () => {
    res.useOsProbe(aWindowsProbe())
    const paired = await send('POST', '/api/office/pairing', THE_PERSON)
    expect(paired.status).toBe(200)
    const theKey = paired.setCookie?.split(';')[0]
    expect(theKey?.startsWith('mole-office-key='), 'the pairing press set no key').toBe(true)
    const neverAsked: [string, string, Record<string, string>][] = [
      // A door that asks, from a browser that holds the person's key.
      ['GET', '/api/office/pairing', { ...THE_PERSON, cookie: theKey! }],
      ['GET', '/api/waiting', { ...THE_PERSON, cookie: theKey! }],
      // A door that asks, under an agent's name: an agent's own claim is not narrowed.
      ['GET', '/api/office/pairing', { 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'a-made-up-agent' }],
    ]
    for (const [method, path, headers] of neverAsked) {
      res.useOsProbe(aWindowsProbe())
      const read = await theReadingsOf(() => send(method, path, headers))
      const said = `${method} ${path} with ${Object.keys(headers).join(', ') || 'no headers'}`
      expect(read.held, `${said} held the thread`).toEqual([])
      expect(read.waited, `${said} started PowerShell`).toEqual([])
    }
  })

  it('L3: two requests on one connection read it once', async () => {
    res.useOsProbe(aWindowsProbe())
    const oneConnection = new Agent({ keepAlive: true, maxSockets: 1 })
    try {
      const read = await theReadingsOf(async () => {
        await send('GET', '/api/office/pairing', THE_PERSON, { agent: oneConnection })
        return send('GET', '/api/waiting', THE_PERSON, { agent: oneConnection })
      })
      expect(read.answer.status).toBe(200)
      expect(read.held).toEqual([])
      expect(read.waited.length, 'the second request on the same connection read it again').toBe(1)
    } finally {
      oneConnection.destroy()
    }
  })

  it('L4: a keyless request the window would count holds no thread at any door, and a door that asks reads once', async () => {
    // Each door with whether it asks who sent the request. The window's keyless request is read first wherever the
    // window would count it, so a door that never asks may be read once too; it holds no thread either way.
    const doors: [string, string, Record<string, string>, { asks: boolean; status: number }][] = [
      // A door the window's page calls only after it is paired, which asks who is asking.
      ['GET', '/api/records?kind=decision&limit=1', THE_PERSON, { asks: true, status: 200 }],
      // The page's first read, which sends no headers, and the same read under the person's name.
      ['GET', '/api/office/owner', {}, { asks: false, status: 200 }],
      ['GET', '/api/office/owner', THE_PERSON, { asks: false, status: 200 }],
      // The connection's state, asked without the two values that make it ask who is asking.
      ['GET', '/api/events/state', THE_PERSON, { asks: false, status: 200 }],
    ]
    for (const [method, path, headers, door] of doors) {
      res.useOsProbe(aWindowsProbe())
      const read = await theReadingsOf(() => send(method, path, headers))
      const said = `${method} ${path} with ${Object.keys(headers).join(', ') || 'no headers'}`
      expect(read.held, `${said}: these readings held the server's thread`).toEqual([])
      if (door.asks) expect(read.waited.length, `${said}: the connection was read ${String(read.waited.length)} times`).toBe(1)
      else expect(read.waited.length, `${said}: the connection was read ${String(read.waited.length)} times`).toBeLessThanOrEqual(1)
      expect(read.answer.status, said).toBe(door.status)
    }
  })
})

// ---------------------------------------------------------------------------- a reading that is slow

/** How long each reading takes in the cases below: longer than the three seconds `mole-office start` waits. */
const A_SLOW_READING = 5_000

/** Run one request and say what its readings were, and how long its answer took. */
async function theTimedReadingsOf(act: () => Promise<AnAnswer>): Promise<{ answer: AnAnswer; held: string[]; waited: string[]; ms: number }> {
  const started = performance.now()
  const read = await theReadingsOf(act)
  return { ...read, ms: performance.now() - started }
}

describe('inside the installed app, a reading waits only at a door that asks, and only so long', () => {
  it('T1: a door that never asks answers at once and starts no reading', async () => {
    const doors: [string, string, Record<string, string>, number][] = [
      // Health, as `mole-office start`, `status` and `stop` ask it, and under the person's name.
      ['GET', '/api/health', {}, 200],
      ['GET', '/api/health', THE_PERSON, 200],
      // The window's page's first read, which sends no headers, and the same read under the person's name.
      ['GET', '/api/office/owner', {}, 200],
      ['GET', '/api/office/owner', THE_PERSON, 200],
      // An address outside /api, which the app's own files answer. The test office serves no app, so it answers 404.
      ['GET', '/a-page-of-the-app', {}, 404],
    ]
    for (const [method, path, headers, status] of doors) {
      res.useOsProbe(aWindowsProbe())
      theReadTakes = A_SLOW_READING
      const read = await theTimedReadingsOf(() => send(method, path, headers))
      const said = `${method} ${path} with ${Object.keys(headers).join(', ') || 'no headers'}`
      expect(read.waited, `${said} started a reading`).toEqual([])
      expect(read.held, `${said} held the thread`).toEqual([])
      expect(read.ms, `${said} waited ${String(Math.round(read.ms))} ms`).toBeLessThan(A_SLOW_READING)
      expect(read.answer.status, said).toBe(status)
    }
  }, 60_000)

  it('T2: health and a second request answer while another request waits for its reading', async () => {
    res.useOsProbe(aWindowsProbe())
    theReadTakes = A_SLOW_READING
    held.length = 0
    waited.length = 0
    let theSlowOneAnswered = false
    const theSlowOne = send('GET', '/api/office/pairing', THE_PERSON).then((answer) => {
      theSlowOneAnswered = true
      return answer
    })
    for (let looked = 0; waited.length === 0 && looked < 100; looked += 1) await new Promise((later) => setTimeout(later, 10))
    expect(waited.length, 'the slow request started no reading').toBe(1)
    const health = await send('GET', '/api/health', {})
    const theSecond = await send('GET', '/api/office/owner', {})
    expect(theSlowOneAnswered, 'health and the second request waited for the slow reading').toBe(false)
    expect(health.status).toBe(200)
    expect(theSecond.status).toBe(200)
    expect(waited.length, 'health or the second request started a reading').toBe(1)
    expect((await theSlowOne).status, 'the slow request was not answered as the person').toBe(200)
    expect(held).toEqual([])
  }, 60_000)

  it('T3: a reading that runs past its time is refused in words, and nothing is paired', async () => {
    sandbox.useTheLongestAReadingWaits(2_000)
    try {
      for (const [method, path] of [['GET', '/api/office/pairing'], ['POST', '/api/office/pairing']] as const) {
        res.useOsProbe(aWindowsProbe())
        theReadTakes = A_SLOW_READING
        const read = await theTimedReadingsOf(() => send(method, path, THE_PERSON))
        const said = `${method} ${path}`
        expect(read.waited.length, `${said} started ${String(read.waited.length)} readings`).toBe(1)
        expect(read.ms, `${said} answered before its reading's time ran out`).toBeGreaterThanOrEqual(1_900)
        expect(read.ms, `${said} waited for the whole reading`).toBeLessThan(A_SLOW_READING)
        expect(read.answer.status, said).toBe(503)
        expect((JSON.parse(read.answer.body) as { error?: string }).error, `${said}: the refusal lost its sentence`).toMatch(
          /^This request was refused, and nothing was done\. The operating system did not say within 2 seconds which program on this computer sent it\b/u,
        )
        expect(read.answer.setCookie, `${said} set a cookie`).toBeNull()
        expect(read.held).toEqual([])
      }
    } finally {
      sandbox.useTheLongestAReadingWaits(sandbox.THE_LONGEST_A_READING_WAITS)
    }
  }, 60_000)

  it('T4: `mole-office stop` asks health as it does, and finds this office answering', async () => {
    const { theWorldTheDeclarationNames, whatAnswersForThisOffice } = await import('../src/config/the-self-check.mjs')
    const waitMs = theWaitOfOneQuestion()
    expect(waitMs, 'the command waits as long as a reading takes, so this case cannot tell').toBeLessThan(A_SLOW_READING)
    res.useOsProbe(aWindowsProbe())
    theReadTakes = A_SLOW_READING
    held.length = 0
    waited.length = 0
    // As askThePort in the command asks it: once, with no key, waiting ONE_QUESTION_MS for the answer, and expecting the
    // world the declaration names. The test office listens on a port of its own and names the declared port, which in
    // the installed app is the port it listens on.
    const found = await whatAnswersForThisOffice({
      address: `http://${thisMachine.host}:${String(thisMachine.port)}`,
      expected: theWorldTheDeclarationNames(),
      asks: 1,
      waitMs,
    })
    const said =
      found.answer === 'not-answering'
        ? found.why
        : found.answer === 'wrong-world'
          ? `a wrong world: ${found.differences.map((one) => `${one.key} ${String(one.expected)}, answered ${String(one.answered)}`).join('; ') || String(found.notSaid)}`
          : found.answer
    expect(said, 'stop did not find this office answering').toMatch(/^(?:healthy|unhealthy)$/u)
    expect(waited, "stop's health ask started a reading").toEqual([])
    expect(held).toEqual([])
  }, 60_000)

  it("T7: the data folder mover's ask names the database this office opened while a reading takes longer than the ask waits", async () => {
    const { askWhichDatabaseTheOfficeNames } = await import('../src/config/the-service-command.mjs')
    sandbox.useTheLongestAReadingWaits(2_000)
    try {
      res.useOsProbe(aWindowsProbe())
      theReadTakes = A_SLOW_READING
      held.length = 0
      waited.length = 0
      const started = performance.now()
      const answer = await askWhichDatabaseTheOfficeNames(thisMachine.port)
      const took = performance.now() - started
      expect(answer, 'the ask did not name the database this test office opened').toBe(resolve(t.file))
      expect(waited, 'the ask started a reading').toEqual([])
      expect(held, 'the ask held the thread').toEqual([])
      expect(took, `the ask took ${String(Math.round(took))} ms, so a reading held it`).toBeLessThan(2_000)
    } finally {
      sandbox.useTheLongestAReadingWaits(sandbox.THE_LONGEST_A_READING_WAITS)
    }
  }, 60_000)
})

describe('inside the installed app, a reading that ran past its time is told to the page and to the log', () => {
  /** The lines written to the log about a late reading, which each name the program the system did not name. */
  const theLateReadingLines = (warned: { mock: { calls: unknown[][] } }): string[] =>
    warned.mock.calls.map((call) => String(call[0])).filter((line) => line.includes('which program sent it'))

  it('T5: the refusal carries a code the page reads, and each refusal is logged once, with how long its reading took', async () => {
    // The readings of the cases before this one end within A_SLOW_READING of their start, and their lines are not this case's.
    await new Promise((later) => setTimeout(later, A_SLOW_READING))
    sandbox.useTheLongestAReadingWaits(2_000)
    const warned = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    try {
      for (const [method, path] of [['GET', '/api/waiting'], ['POST', '/api/office/pairing']] as const) {
        res.useOsProbe(aWindowsProbe())
        theReadTakes = A_SLOW_READING
        warned.mockClear()
        const read = await theTimedReadingsOf(() => send(method, path, THE_PERSON))
        const said = `${method} ${path}`
        expect(read.answer.status, said).toBe(503)
        expect(JSON.parse(read.answer.body), `${said}: the refusal carries no code the page reads`).toMatchObject({
          code: 'senderNotReadInTime',
          values: { seconds: 2 },
        })
        // The reading ends A_SLOW_READING after it began. The line is waited for until a second after that.
        await new Promise((later) => setTimeout(later, A_SLOW_READING - read.ms + 1_000))
        const lines = theLateReadingLines(warned)
        expect(lines, `${said} was logged ${String(lines.length)} times`).toHaveLength(1)
        expect(lines[0], 'the line does not name the request it refused').toContain(`${said} was refused`)
        const took = /The reading ended after (\d+\.\d) seconds/u.exec(lines[0]!)
        expect(took, `the line does not say how long the reading took: ${lines[0]!}`).not.toBeNull()
        expect(Number(took![1]), 'the line says another time than the reading took').toBeGreaterThanOrEqual(4.9)
        expect(Number(took![1]), 'the line says another time than the reading took').toBeLessThan(A_SLOW_READING / 1000 + 1)
        expect(read.held).toEqual([])
      }
    } finally {
      warned.mockRestore()
      sandbox.useTheLongestAReadingWaits(sandbox.THE_LONGEST_A_READING_WAITS)
    }
  }, 60_000)

  it('T6: the next request on the same connection is read again and answered, and only the refused one is logged', async () => {
    sandbox.useTheLongestAReadingWaits(2_000)
    const warned = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const oneConnection = new Agent({ keepAlive: true, maxSockets: 1 })
    try {
      res.useOsProbe(aWindowsProbe())
      held.length = 0
      waited.length = 0
      theReadTakes = A_SLOW_READING
      const first = await send('GET', '/api/office/pairing', THE_PERSON, { agent: oneConnection })
      expect(first.status, 'the first reading did not run past its time').toBe(503)
      theReadTakes = null
      const second = await send('GET', '/api/office/pairing', THE_PERSON, { agent: oneConnection })
      expect(waited, 'the second request was not read again on the same connection').toHaveLength(2)
      expect(waited[1], 'the second request went on another connection').toBe(waited[0])
      expect(second.status, 'the second request was not answered as the person').toBe(200)
      expect(held).toEqual([])
      // The first reading ends A_SLOW_READING after it began. Only the refused request is told to the log.
      await new Promise((later) => setTimeout(later, A_SLOW_READING + 1_000))
      const lines = theLateReadingLines(warned)
      expect(lines, `the log has ${String(lines.length)} lines about a late reading, and only the first request was refused`).toHaveLength(1)
      expect(lines[0], 'the line does not name the refused request').toContain('GET /api/office/pairing was refused')
    } finally {
      oneConnection.destroy()
      warned.mockRestore()
      sandbox.useTheLongestAReadingWaits(sandbox.THE_LONGEST_A_READING_WAITS)
    }
  }, 60_000)
})

// ---------------------------------------------------------------------------- the PowerShell that stays

/** Each script given to the way that stays, as the stand-in's other two ways record theirs. */
const stayed: string[] = []

/** The time the stand-in's way that stays says each script took, as the PowerShell that stays measures it. */
const A_TIME = { queuedMs: 12.4, startingMs: 0, ranMs: 803.6, scriptMs: 790 }

/** How the script's four steps were timed in PowerShell, as the script prints them. */
const THE_STEPS = { Before: 101, Holders: 402, Server: 55, After: 98 }

/**
 * The stand-in with the way that stays as well. It answers on a later turn, or after `theReadTakes`, what the way that
 * waits answers for the same script. With `refusing`, it answers as a PowerShell that stays and did not run the script.
 */
let refusing: string | null = null
const withTheOneThatStays = {
  ...commands,
  askThePowerShellThatStays: async (script: string): Promise<WhatTheOneThatStaysDid> => {
    const { asks, answer } = theAnswerTo(script)
    stayed.push(asks)
    const takes = theReadTakes
    await new Promise((later) => (takes === null ? setImmediate(later) : setTimeout(later, takes)))
    if (refusing !== null) return { command: 'powershell.exe', ran: false, reason: refusing, took: { ...A_TIME, scriptMs: null } }
    return { ...answer, took: A_TIME }
  },
}

/** A Windows probe over the stand-in with the way that stays, as the installed app has it. */
function aProbeThatStays(): OsProbe {
  return new windows.WindowsProbe(theBorrowedHalf(), reading.windowsProcessReader(withTheOneThatStays), withTheOneThatStays, INSTALLED)
}

/** What a probe answers for the window's connection: the sender, or the words it threw. */
async function theSenderBy(probe: OsProbe): Promise<unknown> {
  try {
    return await probe.readSenderOfAConnection!(WINDOW, SERVER)
  } catch (why) {
    return `the probe threw: ${String(why)}`
  }
}

/** The answer of each way for the same script, with the scripts each way was given. */
async function theAnswerOfEachWay(given: WhatTheScriptPrints | WhatACommandDid) {
  answering = () => given
  for (const list of [held, waited, stayed]) list.length = 0
  const started = await theSenderBy(aWindowsProbe())
  const byTheOneThatStays = await theSenderBy(aProbeThatStays())
  return { started, byTheOneThatStays, held: [...held], waited: [...waited], stayed: [...stayed] }
}

/** The log's lines about a reading, from a spy on console.log or console.warn. */
const theReadingLines = (spy: { mock: { calls: unknown[][] } }): string[] =>
  spy.mock.calls.map((call) => String(call[0])).filter((line) => line.startsWith('Windows said who holds') || line.startsWith('Windows did not say who holds'))

describe('inside the installed app, the reading runs in the PowerShell that stays, and finds what it found before', () => {
  afterEach(() => {
    refusing = null
    stayed.length = 0
  })

  it('S1: for the same answer, the way that stays finds the same sender, or fails with the same words', async () => {
    const window = theWindow()
    const answers: [string, WhatTheScriptPrints | WhatACommandDid][] = [
      ['the window', window],
      ['W1, a browser owns it', theWindowWith({ holder: { ExecutablePath: A_BROWSER } })],
      ['W2, another user', theWindowWith({ holder: { Sid: ANOTHER_SID } })],
      ['W5, no row', { ...window, Before: [], Holders: [], After: [] }],
      ['W6, gone at the second reading', { ...window, After: [] }],
      ['W7, two rows', { ...window, Before: [...window.Before, { ...window.Before[0]!, OwningProcess: 77 }] }],
      ['W9, PowerShell exits 1', printed(`${JSON.stringify(window)}\r\n`, 1, 'Get-NetTCPConnection : Access is denied.')],
      ['W9, not JSON', printed('Access is denied.\r\n')],
    ]
    for (const [which, given] of answers) {
      const each = await theAnswerOfEachWay(given)
      expect(each.byTheOneThatStays, which).toEqual(each.started)
      expect(each.stayed, `${which}: the script did not go to the way that stays`).toEqual(['the connection from port 60001 to port 8787'])
      expect(each.waited, `${which}: a PowerShell was started where one stays`).toEqual(['the connection from port 60001 to port 8787'])
      expect(each.held, `${which}: a reading held the thread`).toEqual([])
    }
    // THE CONTROL: the window is found, and each other answer is not the window.
    expect((await theAnswerOfEachWay(window)).byTheOneThatStays).toEqual(THE_WINDOWS_SENDER)
    expect((await theAnswerOfEachWay(answers[1]![1])).byTheOneThatStays).toBeNull()
    expect(String((await theAnswerOfEachWay(answers[6]![1])).byTheOneThatStays)).toMatch(/^the probe threw: Error: Who holds the connection from port 60001 to port 8787 is unknown: /u)
  })

  it('S2: a script the PowerShell that stays did not run is a reading that failed, in words, and pairs nothing', async () => {
    const reasons = [
      'powershell.exe did not finish (stopped, because it ran longer than 20000 ms)',
      'powershell.exe did not run this script, because it was stopped before its turn: powershell.exe ended (exit code 1) before it answered',
    ]
    const warned = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    try {
      for (const reason of reasons) {
        refusing = reason
        answering = () => theWindow()
        expect(await theSenderBy(aProbeThatStays()), reason).toBe(
          `the probe threw: Error: Who holds the connection from port 60001 to port 8787 is unknown: ${reason}`,
        )
        res.useOsProbe(aProbeThatStays())
        const verdict = await sandbox.readWhoSentItFromThisComputer({ socket: aSocket() } as never)
        expect(verdict, `${reason}: the door's verdict`).toBe(NOT_FOUND)
        expect(verdict, `${reason}: a reading that failed was taken as the person`).not.toBe(sandbox.THEIR_OWN_PROGRAM)
        // OVER THE LISTENER: the person's press to pair is not the person's, and sets no key.
        res.useOsProbe(aProbeThatStays())
        stayed.length = 0
        const paired = await send('POST', '/api/office/pairing', THE_PERSON)
        expect(stayed.length, `${reason}: the press was not read by the way that stays`).toBe(1)
        expect(paired.status, `${reason}: ${paired.body}`).toBe(403)
        expect(paired.setCookie, `${reason}: the press set a cookie`).toBeNull()
        expect((JSON.parse(paired.body) as { error?: string }).error, `${reason}: the refusal lost its sentence`).toMatch(
          /^Pairing gives the browser that asks the person's key, and this request came from a program Mole Office could not find\. .*Nothing was paired and no cookie was set\./su,
        )
      }
    } finally {
      warned.mockRestore()
    }
  }, 60_000)

  it('S3: the thread goes on while a reading waits for the PowerShell that stays, and no script holds it', async () => {
    answering = () => theWindow()
    theReadTakes = 400
    for (const list of [held, waited, stayed]) list.length = 0
    let ticks = 0
    const tick = setInterval(() => (ticks += 1), 20)
    try {
      expect(await theSenderBy(aProbeThatStays())).toEqual(THE_WINDOWS_SENDER)
    } finally {
      clearInterval(tick)
    }
    expect(ticks, `the thread ticked ${String(ticks)} times in a reading of 400 ms`).toBeGreaterThanOrEqual(5)
    expect(held, 'a script held the thread').toEqual([])
    expect(waited, 'a PowerShell was started where one stays').toEqual([])
    expect(stayed).toEqual(['the connection from port 60001 to port 8787'])
  })

  it('S4: each reading leaves one line in the log with where the time went, and the measuring tool reads it', async () => {
    const said = vi.spyOn(console, 'log').mockImplementation(() => undefined)
    try {
      // BY THE WAY THAT STAYS, with the steps PowerShell timed.
      answering = () => printed(`${JSON.stringify({ ...theWindow(), Took: THE_STEPS })}\r\n`)
      expect(await theSenderBy(aProbeThatStays())).toEqual(THE_WINDOWS_SENDER)
      const lines = theReadingLines(said)
      expect(lines, 'one reading did not leave one line').toHaveLength(1)
      const read = readTheLine(lines[0]!)
      expect(read, lines[0]).toMatchObject({
        peerPort: 60001,
        serverPort: 8787,
        failed: null,
        where: { queuedMs: 12, startingMs: 0, ranMs: 804 },
        steps: { connection: 101, owners: 402, server: 55, again: 98 },
        theWindow: true,
      })
      expect(read!.ms, lines[0]).toBeGreaterThanOrEqual(0)
      // A LINE THE SERVICE WROTE AS JSON is read from its message.
      expect(readTheLine(JSON.stringify({ level: 30, msg: lines[0] }))).toEqual(read)
      // BY A POWERSHELL STARTED FOR IT, for a browser's connection: no time but the whole, and not the window.
      said.mockClear()
      answering = () => theWindowWith({ holder: { ExecutablePath: A_BROWSER } })
      expect(await theSenderBy(aWindowsProbe())).toBeNull()
      const started = theReadingLines(said)
      expect(started).toHaveLength(1)
      expect(readTheLine(started[0]!), started[0]).toMatchObject({ peerPort: 60001, serverPort: 8787, failed: null, where: null, steps: null, theWindow: false })
      // Any other line is not about a reading.
      expect(readTheLine('Server listening at http://127.0.0.1:8787')).toBeNull()
    } finally {
      said.mockRestore()
    }
  })

  it('S5: a reading that failed leaves one line that says why, and the measuring tool reads it as failed', async () => {
    const warned = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const said = vi.spyOn(console, 'log').mockImplementation(() => undefined)
    try {
      refusing = 'powershell.exe did not finish (stopped, because it ran longer than 20000 ms)'
      answering = () => theWindow()
      await theSenderBy(aProbeThatStays())
      expect(theReadingLines(said), 'a reading that failed was logged as read').toEqual([])
      const lines = theReadingLines(warned)
      expect(lines, 'one failed reading did not leave one line').toHaveLength(1)
      expect(readTheLine(lines[0]!), lines[0]).toMatchObject({
        peerPort: 60001,
        serverPort: 8787,
        failed: `Who holds the connection from port 60001 to port 8787 is unknown: ${refusing}`,
      })
    } finally {
      warned.mockRestore()
      said.mockRestore()
    }
  })
})

/** How long `mole-office start`, `status` and `stop` wait for each answer, read from the command itself. */
function theWaitOfOneQuestion(): number {
  const command = readFileSync(fileURLToPath(new URL('../src/config/the-service-command.mjs', import.meta.url)), 'utf8')
  const said = /^const ONE_QUESTION_MS = ([\d_]+)$/mu.exec(command)
  if (said === null) throw new Error('src/config/the-service-command.mjs no longer says ONE_QUESTION_MS in one line.')
  return Number(said[1]!.replaceAll('_', ''))
}
