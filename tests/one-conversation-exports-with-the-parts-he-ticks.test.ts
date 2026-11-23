// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * ONE RUN'S CONVERSATION LEAVES AS ONE FILE, WITH THE PARTS HE TICKS. Wave 13s, point C1A-2, the export slice.
 *
 * WHAT IS REAL: a scratch office in process (`freshDb` and `apiApp`), never the live office, and a made-up home
 * folder under the test's own temporary directory for the conversation files and the memory folders. A personal
 * space is made beside the scratch database, where the office keeps one. No file is written into the owner's home.
 *
 * WHAT THE FILE IS: a zip with a manifest, the run's conversation read whole and scrubbed, the agent's current
 * handover, and four parts the person ticks: the notebook, the memory folder, the whole personal space, and the
 * name and address. A part the agent lacks is not there, and the manifest says so; that is not an error.
 *
 * THE CASES, in order:
 *  1. the look first answers what the file would hold, part by part, and writes nothing in the office or the space;
 *  2. with every part ticked, the file holds every entry, and the manifest names the run, the runtime, the office,
 *     the scrub and each part as carried; the handover's writer is a kind and a name, never an id;
 *  3. each part he unticks is left out of the file and named as not asked for;
 *  4. a part the agent lacks is named not there, and a run that serves no agent still makes a file;
 *  5. a file in the space that is not text travels byte for byte and is named as not screened;
 *  6. a home path in a space text file and in the handover is replaced by its token;
 *  7. a home path the scrub could not replace stops the export, in the handover, the run title and a memory file;
 *  8. a look-first finding is refused until the ask says he looked;
 *  9. a key hash this office issued, inside a file that is not text, stops the export and is never printed;
 * 10. a file over the line, a name a zip cannot hold, and a memory folder's other file and folder are left out
 *     and named;
 * 11. the conversation is read whole, past the size the sync copies;
 * 12. a Codex run is read where the sync reads it;
 * 13. a runtime the sync cannot read is refused by name, and nothing is made;
 * 14. an agent may not use either door;
 * 15. another computer may not use either door.
 */

import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, truncateSync, writeFileSync } from 'node:fs'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { theTranscriptFolder } from '../src/config/claude-code-served.mjs'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { entriesOfZip, type ReadZipEntry } from './zip-export-read.ts'
import {
  CONVERSATION_EXPORT_PARTS,
  type ConversationExportLeftOutWhy,
  type ConversationExportLook,
  type ConversationExportManifest,
  type ConversationExportPart,
  type ConversationExportPartState,
  type ConversationExportPiece,
  type ConversationExportRefusalCode,
} from '../src/shared/conversation-export.ts'
import type { RefusalCode } from '../src/shared/refusal-codes.ts'
import type { ScreenCheckName, ScreenSeverity } from '../src/shared/screen-closed-set.ts'

const oldHome = process.env['HOME']
const oldCodexHome = process.env['CODEX_HOME']
let home = ''

beforeAll(() => {
  home = mkdtempSync(join(tmpdir(), 'conversation-export-'))
  process.env['HOME'] = home
  process.env['CODEX_HOME'] = join(home, '.codex')
})

afterAll(() => {
  if (oldHome === undefined) delete process.env['HOME']
  else process.env['HOME'] = oldHome
  if (oldCodexHome === undefined) delete process.env['CODEX_HOME']
  else process.env['CODEX_HOME'] = oldCodexHome
  rmSync(home, { recursive: true, force: true })
})

// THE WORDS OF THE FILE'S CONTRACT, each held to its declared type, so a renamed word fails the type check rather
// than leaving a copy here that passes on the old one.
const CARRIED = 'carried' satisfies ConversationExportPartState
const NOT_ASKED_FOR = 'not-asked-for' satisfies ConversationExportPartState
const NOT_THERE = 'not-there' satisfies ConversationExportPartState
const REFUSED = 'refused' satisfies ScreenSeverity
const LOOK_FIRST = 'look_before_you_paste' satisfies ScreenSeverity
const HOME_PATH = 'home_directory_path' satisfies ScreenCheckName
const EMAIL = 'email_address' satisfies ScreenCheckName
const OTHER_PEOPLES_NAMES = 'other_peoples_names' satisfies ScreenCheckName
const REFUSED_FOR_A_HOME_PATH = 'conversationExportHomePath' satisfies ConversationExportRefusalCode
const REFUSED_UNTIL_LOOKED = 'conversationExportLookFirst' satisfies ConversationExportRefusalCode
const REFUSED_FOR_A_KEY_HASH = 'conversationExportKeyHash' satisfies ConversationExportRefusalCode
const REFUSED_FOR_THE_RUNTIME = 'conversationExportRuntimeNotRead' satisfies ConversationExportRefusalCode
const KEPT_HERE = 'keptOnTheOfficesComputer' satisfies RefusalCode
const OVER_THE_LINE = 'over-the-line' satisfies ConversationExportLeftOutWhy
const NAME_UNFIT = 'name-unfit' satisfies ConversationExportLeftOutWhy
const NOT_MARKDOWN = 'not-a-markdown-file' satisfies ConversationExportLeftOutWhy
const A_FOLDER = 'a-folder' satisfies ConversationExportLeftOutWhy

/** This case's project title, which the manifest carries as the office's name. */
const PROJECT_TITLE = 'Conversation export'

/** Every part ticked, as the press starts. */
const EVERY_PART: Record<ConversationExportPart, boolean> = { notebook: true, memory: true, space: true, address: true }

/**
 * A home path the scrub cannot replace and the screen still finds. The scrub replaces the home folder's exact text;
 * the screen resolves a path before it compares, so `/tmp/./<home>/...` is the home folder to the screen and is
 * not the home folder's text to the scrub. This is how a refusing finding is made to reach the screen.
 */
const aHomePathTheScrubMisses = (): string => `${dirname(home)}/./${basename(home)}/private/plan.md`

/** A key hash this office holds, planted in the scratch database below. Never printed by the office. */
const PLANTED_KEY_HASH = '0123456789abcdef'.repeat(4)

describe('one conversation leaves as a file, with the parts he ticks', () => {
  let t: TestDb
  let app: FastifyInstance
  let workspace = ''
  let caseNumber = 0
  /** The file's fixed entry names, read from the product after the scratch office is made. */
  let entry: (typeof import('../src/shared/conversation-export.ts'))['CONVERSATION_EXPORT_ENTRY']
  /** The label a refusal gives for the run title, which the manifest carries. */
  let runTitleLabel = ''
  const inMemory = (name: string): string => `${entry.memory}${name}`
  const inSpace = (name: string): string => `${entry.space}${name}`
  const leftOutAs = (piece: ConversationExportPiece, file: string, why: ConversationExportLeftOutWhy): string[] => [piece, file, why]

  const human = (): Record<string, string> => ({
    'x-mole-office-actor-type': 'human',
    'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
    'x-mole-office-workspace': workspace,
  })

  const asAgent = (): Record<string, string> => ({
    'x-mole-office-actor-type': 'agent',
    'x-mole-office-actor-id': 'made-up-agent',
    'x-mole-office-workspace': workspace,
  })

  beforeAll(async () => {
    t = await freshDb()
    app = (await apiApp()).app
    await app.ready()
  }, 60_000)

  afterAll(async () => {
    await app.close()
    t.close()
  })

  beforeEach(async () => {
    const shared = await import('../src/shared/conversation-export.ts')
    entry = shared.CONVERSATION_EXPORT_ENTRY
    runTitleLabel = shared.CONVERSATION_EXPORT_RUN_FIELD.title
    caseNumber += 1
    workspace = `conversation-export-case-${String(caseNumber)}`
    const made = await app.inject({
      method: 'POST',
      url: '/api/workspaces',
      headers: human(),
      payload: { id: workspace, title: PROJECT_TITLE },
    })
    expect(made.statusCode, made.body).toBe(201)
  })

  /**
   * Every table's count and every record, as tests/by-id-boundary.test.ts reads it, without the request log: every
   * request writes one row there, a read as well, so counting it would say nothing about the door.
   */
  function databaseNow(): string {
    const tables = (t.client.sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").all() as {
      name: string
    }[])
      .map((row) => row.name)
      .filter((name) => name !== 'api_calls' && name !== 'hourly_calls')
    const counts = tables.map((name) => {
      const { n } = t.client.sqlite.prepare(`SELECT count(*) AS n FROM "${name}"`).get() as { n: number }
      return `${name}=${String(n)}`
    })
    const rows = t.client.sqlite.prepare('SELECT * FROM records ORDER BY id').all()
    return `${counts.join(' ')}\n${JSON.stringify(rows)}`
  }

  /** Every file and folder under one folder, with its size, so a read that wrote something is seen. */
  function everythingUnder(folder: string): string[] {
    const out: string[] = []
    const walk = (at: string, prefix: string): void => {
      for (const one of readdirSync(at, { withFileTypes: true })) {
        const name = `${prefix}${one.name}`
        if (one.isDirectory()) {
          out.push(`${name}/`)
          walk(join(at, one.name), `${name}/`)
        } else out.push(`${name} ${String(readFileSync(join(at, one.name)).length)}`)
      }
    }
    walk(folder, '')
    return out.sort()
  }

  async function createRun(runtime: string, providerSession: string, title: string): Promise<string> {
    const made = await app.inject({
      method: 'POST',
      url: '/api/records',
      headers: human(),
      payload: { kind: 'session', title, data: { state: 'finished', runtime, providerSession, workingDirectory: join(home, 'project') } },
    })
    expect(made.statusCode, made.body).toBe(201)
    return (made.json() as { record: { id: string } }).record.id
  }

  /** A made-up Claude Code transcript where the runtime keeps it, as the sync's own test writes one. */
  function writeClaude(providerSession: string, text: string): void {
    const folder = theTranscriptFolder(process.env, join(home, 'project'))
    expect(folder).not.toBeNull()
    mkdirSync(folder as string, { recursive: true })
    writeFileSync(join(folder as string, `${providerSession}.jsonl`), text, 'utf8')
  }

  /** A made-up Codex rollout where the runtime keeps it. */
  function writeCodex(providerSession: string, text: string): void {
    const file = join(home, '.codex', 'sessions', '2026', '11', '10', `rollout-2026-11-10T00-00-00-${providerSession}.jsonl`)
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, text, 'utf8')
  }

  /** An agent started by the person in this case's project. */
  async function startAgent(handle: string, role: string): Promise<string> {
    const made = await app.inject({ method: 'POST', url: '/api/agents/started', headers: human(), payload: { handle, name: handle, role } })
    expect(made.statusCode, made.body).toBe(201)
    return (made.json() as { agent: { id: string } }).agent.id
  }

  /** The run serves the agent, as a run its agent was started for says. */
  function serve(run: string, agentId: string, handle: string): void {
    t.client.sqlite
      .prepare("UPDATE records SET data = json_set(data, '$.servingAgentId', ?, '$.servingAgent', ?) WHERE id = ?")
      .run(agentId, handle, run)
  }

  async function writeHandover(handle: string, text: string): Promise<void> {
    const put = await app.inject({ method: 'PUT', url: `/api/agents/${handle}/handover`, headers: human(), payload: { text } })
    expect(put.statusCode, put.body).toBeLessThan(300)
  }

  async function writeNotebook(handle: string, text: string): Promise<void> {
    const put = await app.inject({
      method: 'POST',
      url: `/api/agents/${handle}/notebook/entries`,
      headers: human(),
      payload: { entryKind: 'how-he-wants-answers', text },
    })
    expect(put.statusCode, put.body).toBeLessThan(300)
  }

  /** The agent record's `notes` field names its memory folder. */
  async function setMemoryFolder(agentId: string, folder: string): Promise<void> {
    const { recordForAgentIn } = await import('../src/server/db/record-for-agent-in.ts')
    const record = recordForAgentIn(agentId, workspace)
    expect(record, 'the agent has a record in this project').not.toBeNull()
    t.client.sqlite.prepare("UPDATE records SET data = json_set(data, '$.notes', ?) WHERE id = ?").run(folder, record)
  }

  function setAddress(agentId: string): void {
    t.client.sqlite
      .prepare(
        'UPDATE agents SET address_name = ?, address_second_person = ?, address_third_person = ?, address_title = ? WHERE id = ?',
      )
      .run('Made-up name', 'you', 'it', 'clerk', agentId)
  }

  async function spaceOf(agentId: string): Promise<string> {
    const { theSpaceOf } = await import('../src/server/lib/residents.ts')
    return theSpaceOf(agentId)
  }

  /** The bytes of a file that is not text: a NUL byte, and a run that is not UTF-8. */
  const NOT_TEXT = Buffer.from([0x00, 0x01, 0x02, 0xc3, 0x28, 0xff, 0xfe, 0x00, 0x7f])

  /**
   * A secretary with every part: a run of its, a transcript, a handover, a notebook entry, a memory folder of two
   * markdown files, a personal space with a text file and a file that is not text, and a name and address.
   */
  async function aSecretaryWithEveryPart(): Promise<{ run: string; agentId: string; handle: string; memory: string; space: string }> {
    const handle = `exporting-secretary-${String(caseNumber)}`
    const agentId = await startAgent(handle, 'secretary')
    const session = `made-up-session-${String(caseNumber)}`
    const run = await createRun('claude-code', session, 'A made-up run')
    serve(run, agentId, handle)
    writeClaude(session, `{"type":"user","message":"the folder is ${join(home, 'project', 'src')}"}\n`)
    await writeHandover(handle, `Carry on from ${join(home, 'notes', 'plan.md')}.`)
    await writeNotebook(handle, 'He wants short answers.')
    const memory = join(home, `memory-${String(caseNumber)}`)
    mkdirSync(memory, { recursive: true })
    writeFileSync(join(memory, 'MEMORY.md'), '- [One fact](one-fact.md)\n', 'utf8')
    writeFileSync(join(memory, 'one-fact.md'), 'One made-up fact.\n', 'utf8')
    await setMemoryFolder(agentId, memory)
    setAddress(agentId)
    const space = await spaceOf(agentId)
    mkdirSync(join(space, 'pictures'), { recursive: true })
    writeFileSync(join(space, 'notes.txt'), `A note about ${join(home, 'notes', 'plan.md')}.\n`, 'utf8')
    writeFileSync(join(space, 'pictures', 'a.bin'), NOT_TEXT)
    return { run, agentId, handle, memory, space }
  }

  async function look(run: string, headers: Record<string, string> = human()): Promise<ConversationExportLook> {
    const res = await app.inject({ method: 'GET', url: `/api/conversations/${run}/export`, headers })
    expect(res.statusCode, res.body).toBe(200)
    return res.json() as ConversationExportLook
  }

  async function ask(
    run: string,
    parts: Record<ConversationExportPart, boolean> = EVERY_PART,
    looked = true,
    headers: Record<string, string> = human(),
  ): Promise<Awaited<ReturnType<FastifyInstance['inject']>>> {
    return app.inject({ method: 'POST', url: `/api/conversations/${run}/export`, headers, payload: { parts, looked } })
  }

  /** The zip an export answered, read back entry by entry. */
  async function exported(
    run: string,
    parts: Record<ConversationExportPart, boolean> = EVERY_PART,
  ): Promise<{ entries: Map<string, ReadZipEntry>; manifest: ConversationExportManifest }> {
    const res = await ask(run, parts)
    expect(res.statusCode, res.body).toBe(200)
    expect(res.headers['content-type']).toContain('application/zip')
    expect(String(res.headers['content-disposition'])).toMatch(/^attachment; filename=".+\.zip"$/u)
    const entries = entriesOfZip(res.rawPayload)
    const manifest = entries.get(entry.manifest)
    expect(manifest, 'the file has no manifest').toBeDefined()
    return { entries, manifest: JSON.parse(manifest!.bytes.toString('utf8')) as ConversationExportManifest }
  }

  /** An export that was refused: what it answered, and that no zip came back. */
  async function refused(
    run: string,
    parts: Record<ConversationExportPart, boolean> = EVERY_PART,
    looked = true,
  ): Promise<{ status: number; code: string; values: Record<string, unknown>; body: string }> {
    const res = await ask(run, parts, looked)
    expect(res.statusCode, 'the export was made').not.toBe(200)
    expect(String(res.headers['content-type'])).not.toContain('application/zip')
    const body = res.json() as { code?: string; values?: Record<string, unknown> }
    return { status: res.statusCode, code: body.code ?? '', values: body.values ?? {}, body: res.body }
  }

  /** The tokens the scrub writes for the made-up home and checkout, read from the sync's own path map. */
  async function theTokens(): Promise<{ home: string; checkout: string }> {
    const { conversationPathsFor } = await import('../src/shared/conversation-sync.ts')
    const paths = conversationPathsFor({ HOME: home }, [join(home, 'project')])
    const tokenOf = (original: string): string => {
      const found = paths.find((one) => one.original === original)
      expect(found, `the path map has no entry for ${original}`).toBeDefined()
      return found!.token
    }
    return { home: tokenOf(home), checkout: tokenOf(join(home, 'project')) }
  }

  const pieceOf = (said: ConversationExportLook, piece: ConversationExportPiece) => {
    const found = said.pieces.find((one) => one.piece === piece)
    expect(found, `the look first says nothing of the ${piece}`).toBeDefined()
    return found!
  }

  const namesUnder = (entries: Map<string, ReadZipEntry>, folder: string): string[] =>
    [...entries.keys()].filter((name) => name.startsWith(folder)).sort()

  it('1: answers what the file would hold, part by part, and writes nothing', async () => {
    const { run, space } = await aSecretaryWithEveryPart()
    const before = databaseNow()
    const spaceBefore = everythingUnder(space)

    const said = await look(run)

    expect(databaseNow(), 'the look first wrote in the office').toBe(before)
    expect(everythingUnder(space), 'the look first wrote in the personal space').toEqual(spaceBefore)
    expect(said.run.id).toBe(run)
    for (const piece of ['conversation', 'handover', 'notebook', 'memory', 'space', 'address'] as const) {
      expect(pieceOf(said, piece).state, `the ${piece}`).toBe(CARRIED)
      expect(pieceOf(said, piece).bytes, `the ${piece} carries nothing`).toBeGreaterThan(0)
    }
    expect(pieceOf(said, 'memory').entries.map((one) => one.name).sort()).toEqual([inMemory('MEMORY.md'), inMemory('one-fact.md')])
    expect(pieceOf(said, 'space').entries.map((one) => one.name).sort()).toEqual([inSpace('notes.txt'), inSpace('pictures/a.bin')])
    expect(pieceOf(said, 'conversation').scrub.pathsMapped, 'the conversation was not scrubbed').toBeGreaterThan(0)
    expect(said.notScreened.map((one) => one.entry)).toEqual([inSpace('pictures/a.bin')])
    expect(said.leftOut).toEqual([])
    // The screen always says it cannot check for other people's names; that finding is one for the whole file.
    const names = said.findings.filter((one) => one.check === OTHER_PEOPLES_NAMES)
    expect(names).toHaveLength(1)
    expect(names[0]!.severity).toBe(LOOK_FIRST)
    expect(names[0]!.piece).toBeNull()
    expect(said.findings.filter((one) => one.severity === REFUSED)).toEqual([])
  })

  it('2: holds every entry with every part ticked, and the manifest says what it holds', async () => {
    const { run, handle } = await aSecretaryWithEveryPart()
    const { CONVERSATION_EXPORT_FORMAT } = await import('../src/shared/conversation-export.ts')

    const { entries, manifest } = await exported(run)

    expect([...entries.keys()].sort()).toEqual(
      [
        entry.manifest,
        entry.conversationLines,
        entry.handover,
        entry.notebook,
        inMemory('MEMORY.md'),
        inMemory('one-fact.md'),
        inSpace('notes.txt'),
        inSpace('pictures/a.bin'),
        entry.address,
      ].sort(),
    )
    expect(manifest.format).toBe(CONVERSATION_EXPORT_FORMAT)
    expect(manifest.office.name).toBe(PROJECT_TITLE)
    expect(manifest.run).toEqual({ id: run, title: 'A made-up run', agentHandle: handle, cardName: 'secretary' })
    expect(manifest.runtime).toEqual({ word: 'claude-code', conversationId: `made-up-session-${String(caseNumber)}` })
    for (const part of ['notebook', 'memory', 'space', 'address'] as const) expect(manifest.parts[part].state, part).toBe(CARRIED)

    const conversation = entries.get(entry.conversationLines)!.bytes
    expect(manifest.conversation.entry).toBe(entry.conversationLines)
    expect(manifest.conversation.bytes).toBe(conversation.length)
    expect(manifest.conversation.sha256).toBe(createHash('sha256').update(conversation).digest('hex'))
    const tokens = await theTokens()
    expect(conversation.toString('utf8')).toContain(`${tokens.checkout}/src`)
    expect(manifest.scrub.tokens).toContain(tokens.checkout)

    // THE HANDOVER'S WRITER IS A KIND AND A NAME. An id names a row of this office, which the next one does not hold.
    expect(manifest.handover.state).toBe(CARRIED)
    expect(manifest.handover.writtenAt).not.toBeNull()
    expect(Object.keys(manifest.handover.writtenBy ?? {}).sort()).toEqual(['kind', 'name'])
    expect(manifest.handover.writtenBy?.kind).toBe('person')

    const notebook = entries.get(entry.notebook)!.bytes.toString('utf8')
    expect(notebook).toContain('He wants short answers.')
    expect(notebook, 'the notebook carries the writer’s id').not.toContain(THE_TEST_OFFICES_OWNER.id)

    // WHO SET THE ADDRESS IS AN ID, AND IT STAYS BEHIND.
    const address = JSON.parse(entries.get(entry.address)!.bytes.toString('utf8')) as Record<string, unknown>
    expect(address).toEqual({
      name: handle,
      addressAs: { name: 'Made-up name', secondPerson: 'you', thirdPerson: 'it', title: 'clerk' },
    })
  })

  it.each(CONVERSATION_EXPORT_PARTS)('3: leaves out the %s when he unticks it, and says so', async (part) => {
    const { run } = await aSecretaryWithEveryPart()

    const { entries, manifest } = await exported(run, { ...EVERY_PART, [part]: false })

    expect(manifest.parts[part].state).toBe(NOT_ASKED_FOR)
    expect(manifest.parts[part].entries).toEqual([])
    for (const other of CONVERSATION_EXPORT_PARTS) {
      if (other !== part) expect(manifest.parts[other].state, other).toBe(CARRIED)
    }
    const leftBehind = {
      notebook: () => expect(entries.has(entry.notebook)).toBe(false),
      memory: () => expect(namesUnder(entries, entry.memory)).toEqual([]),
      space: () => expect(namesUnder(entries, entry.space)).toEqual([]),
      address: () => expect(entries.has(entry.address)).toBe(false),
    }
    leftBehind[part]()
    // The conversation and the handover always travel.
    expect(entries.has(entry.conversationLines)).toBe(true)
    expect(entries.has(entry.handover)).toBe(true)
  })

  it('4: names a part the agent lacks as not there, and a run that serves no agent still makes a file', async () => {
    const handle = `exporting-worker-${String(caseNumber)}`
    const agentId = await startAgent(handle, 'worker')
    writeClaude(`worker-session-${String(caseNumber)}`, '{"type":"user","message":"hello"}\n')
    const run = await createRun('claude-code', `worker-session-${String(caseNumber)}`, 'A worker run')
    serve(run, agentId, handle)

    const said = await look(run)
    for (const piece of ['handover', 'notebook', 'memory', 'space'] as const) expect(pieceOf(said, piece).state, piece).toBe(NOT_THERE)
    expect(pieceOf(said, 'address').state).toBe(CARRIED)
    const { manifest } = await exported(run)
    for (const part of ['notebook', 'memory', 'space'] as const) expect(manifest.parts[part].state, part).toBe(NOT_THERE)
    expect(manifest.parts.address.state).toBe(CARRIED)
    expect(manifest.handover.state).toBe(NOT_THERE)
    expect(manifest.run.cardName).toBe('worker')

    writeClaude(`nobodys-session-${String(caseNumber)}`, '{"type":"user","message":"hello"}\n')
    const alone = await createRun('claude-code', `nobodys-session-${String(caseNumber)}`, 'A run nobody serves')
    const nobody = await exported(alone)
    for (const part of ['notebook', 'memory', 'space', 'address'] as const) expect(nobody.manifest.parts[part].state, part).toBe(NOT_THERE)
    expect(nobody.manifest.run.agentHandle).toBeNull()
    expect(nobody.entries.has(entry.conversationLines)).toBe(true)
  })

  it('5: carries a file that is not text byte for byte, and names it as not screened', async () => {
    const { run, space } = await aSecretaryWithEveryPart()
    const notUtf8 = Buffer.from([0x61, 0xc3, 0x28, 0x62])
    writeFileSync(join(space, 'not-utf8.txt'), notUtf8)

    const { entries, manifest } = await exported(run)

    expect(entries.get(inSpace('pictures/a.bin'))!.bytes.equals(NOT_TEXT)).toBe(true)
    expect(entries.get(inSpace('not-utf8.txt'))!.bytes.equals(notUtf8)).toBe(true)
    expect([...manifest.notScreened].sort()).toEqual([inSpace('not-utf8.txt'), inSpace('pictures/a.bin')])
  })

  it('6: replaces a home path in a space text file and in the handover by its token', async () => {
    const { run } = await aSecretaryWithEveryPart()

    const { entries, manifest } = await exported(run)
    const tokens = await theTokens()

    const handover = entries.get(entry.handover)!.bytes.toString('utf8')
    const note = entries.get(inSpace('notes.txt'))!.bytes.toString('utf8')
    for (const [what, text] of [['the handover', handover], ['the space file', note]] as const) {
      expect(text, `${what} still holds the home folder`).not.toContain(home)
      expect(text, `${what} has no token`).toContain(`${tokens.home}/notes/plan.md`)
    }
    expect(manifest.scrub.tokens).toContain(tokens.home)
    expect(manifest.scrub.pathsMapped).toBeGreaterThan(0)
  })

  it.each(['the handover', 'the run title', 'a memory file'] as const)(
    '7: stops at a home path the scrub could not replace, in %s, and names where',
    async (where) => {
      const { run, handle, memory } = await aSecretaryWithEveryPart()
      const planted = aHomePathTheScrubMisses()
      const file = { 'the handover': entry.handover, 'the run title': runTitleLabel, 'a memory file': inMemory('plan.md') }[where]
      if (where === 'the handover') await writeHandover(handle, `Carry on from ${planted}.`)
      if (where === 'the run title') t.client.sqlite.prepare('UPDATE records SET title = ? WHERE id = ?').run(`Work on ${planted}`, run)
      if (where === 'a memory file') writeFileSync(join(memory, 'plan.md'), `See ${planted}.\n`, 'utf8')

      const said = await look(run)
      const found = said.findings.filter((one) => one.severity === REFUSED)
      expect(found.map((one) => [one.check, one.file])).toEqual([[HOME_PATH, file]])

      const answer = await refused(run)
      expect(answer.status).toBe(409)
      expect(answer.code).toBe(REFUSED_FOR_A_HOME_PATH)
      expect(answer.values['file']).toBe(file)
    },
  )

  it('8: refuses a look-first finding until the ask says he looked', async () => {
    const { run, handle } = await aSecretaryWithEveryPart()
    await writeHandover(handle, 'Write to someone@example.com when it is done.')

    const said = await look(run)
    expect(said.findings.some((one) => one.check === EMAIL && one.piece === 'handover')).toBe(true)

    const notLooked = await refused(run, EVERY_PART, false)
    expect(notLooked.status).toBe(409)
    expect(notLooked.code).toBe(REFUSED_UNTIL_LOOKED)
    expect(notLooked.values['count']).toBe(said.findings.filter((one) => one.severity === LOOK_FIRST).length)

    const { entries } = await exported(run)
    expect(entries.has(entry.handover)).toBe(true)
  })

  it('9: stops at a key hash this office issued, inside a file that is not text, and never prints it', async () => {
    const { run, space } = await aSecretaryWithEveryPart()
    t.client.sqlite
      .prepare('INSERT INTO held_keys (id, whose_kind, whose_id, key_hash, made_at) VALUES (?, ?, ?, ?, ?)')
      .run(`made-up-key-row-${String(caseNumber)}`, 'agent', 'made-up-agent', PLANTED_KEY_HASH, '2026-10-30 20:00:00')
    mkdirSync(join(space, 'keys'), { recursive: true })
    writeFileSync(join(space, 'keys', 'held.bin'), Buffer.concat([Buffer.from([0x00]), Buffer.from(PLANTED_KEY_HASH, 'latin1'), Buffer.from([0x00])]))

    const answer = await refused(run)

    expect(answer.status).toBe(409)
    expect(answer.code).toBe(REFUSED_FOR_A_KEY_HASH)
    expect(answer.values['file']).toBe(inSpace('keys/held.bin'))
    expect(answer.body, 'the refusal printed the hash').not.toContain(PLANTED_KEY_HASH)
    const lookBody = (await app.inject({ method: 'GET', url: `/api/conversations/${run}/export`, headers: human() })).body
    expect(lookBody, 'the look first printed the hash').not.toContain(PLANTED_KEY_HASH)
  })

  it('10: leaves out a file over the line, a name a zip cannot hold, and a memory folder’s other things, and names each', async () => {
    const { run, memory, space } = await aSecretaryWithEveryPart()
    const { ZIP_EXPORT_FILE_BYTES_LINE } = await import('../src/shared/zip-export/manifest.ts')
    // A sparse file: it is over the line by its size, and the export must not read it to know that.
    writeFileSync(join(space, 'big.bin'), '')
    truncateSync(join(space, 'big.bin'), ZIP_EXPORT_FILE_BYTES_LINE + 1)
    writeFileSync(join(space, 'back\\slash.txt'), 'a name with a backslash\n', 'utf8')
    writeFileSync(join(memory, 'notes.txt'), 'not markdown\n', 'utf8')
    mkdirSync(join(memory, 'old'))
    writeFileSync(join(memory, 'old', 'older.md'), 'in a folder inside the folder\n', 'utf8')

    const said = await look(run)
    const { entries, manifest } = await exported(run)

    const leftOut = manifest.leftOut.map((one) => [one.piece, one.file, one.why]).sort()
    expect(leftOut).toEqual(
      [
        leftOutAs('memory', inMemory('notes.txt'), NOT_MARKDOWN),
        leftOutAs('memory', inMemory('old'), A_FOLDER),
        leftOutAs('space', inSpace('back\\slash.txt'), NAME_UNFIT),
        leftOutAs('space', inSpace('big.bin'), OVER_THE_LINE),
      ].sort(),
    )
    expect(said.leftOut.map((one) => [one.piece, one.file, one.why]).sort()).toEqual(leftOut)
    expect(manifest.leftOut.find((one) => one.file === inSpace('big.bin'))?.bytes).toBe(ZIP_EXPORT_FILE_BYTES_LINE + 1)
    for (const name of [inSpace('big.bin'), inMemory('notes.txt'), inMemory('old/older.md')]) expect(entries.has(name), name).toBe(false)
    expect(namesUnder(entries, entry.memory)).toEqual([inMemory('MEMORY.md'), inMemory('one-fact.md')])
  })

  it('11: reads the conversation whole, past the size the sync copies', async () => {
    const { CONVERSATION_SYNC_MAX_BYTES } = await import('../src/shared/conversation-sync.ts')
    const line = '{"type":"user","message":"a plain line of words"}\n'
    const text = line.repeat(Math.ceil((CONVERSATION_SYNC_MAX_BYTES + 4096) / line.length))
    writeClaude(`long-session-${String(caseNumber)}`, text)
    const run = await createRun('claude-code', `long-session-${String(caseNumber)}`, 'A long run')

    const { entries, manifest } = await exported(run)

    expect(entries.get(entry.conversationLines)!.bytes.toString('utf8')).toBe(text)
    expect(manifest.conversation.bytes).toBeGreaterThan(CONVERSATION_SYNC_MAX_BYTES)
  })

  it('12: reads a Codex run where the sync reads it', async () => {
    writeCodex(`codex-session-${String(caseNumber)}`, `{"type":"user","message":"in ${join(home, 'project')}"}\n`)
    const run = await createRun('codex', `codex-session-${String(caseNumber)}`, 'A Codex run')

    const { entries, manifest } = await exported(run)

    expect(manifest.runtime.word).toBe('codex')
    expect(entries.get(entry.conversationLines)!.bytes.toString('utf8')).toContain((await theTokens()).checkout)
  })

  it('13: refuses a runtime the sync cannot read, by name, and makes nothing', async () => {
    const run = await createRun('a-tool-this-office-does-not-know', 'made-up-session', 'A run of an unknown tool')

    const looked = await app.inject({ method: 'GET', url: `/api/conversations/${run}/export`, headers: human() })
    expect(looked.statusCode).toBe(409)
    expect((looked.json() as { code: string }).code).toBe(REFUSED_FOR_THE_RUNTIME)

    const answer = await refused(run)
    expect(answer.status).toBe(409)
    expect(answer.code).toBe(REFUSED_FOR_THE_RUNTIME)
    expect(answer.values['runtime']).toBe('a-tool-this-office-does-not-know')
  })

  it('14: an agent may use neither door', async () => {
    const { run } = await aSecretaryWithEveryPart()

    const looked = await app.inject({ method: 'GET', url: `/api/conversations/${run}/export`, headers: asAgent() })
    const made = await ask(run, EVERY_PART, true, asAgent())

    expect(looked.statusCode, looked.body).toBe(403)
    expect(made.statusCode, made.body).toBe(403)
    expect(String(made.headers['content-type'])).not.toContain('application/zip')
  })

  it('15: another computer may use neither door', async () => {
    const { run } = await aSecretaryWithEveryPart()
    await app.listen({ host: '127.0.0.1', port: 0 })
    const { listenForOtherMachines } = await import('../src/server/index.ts')
    const otherMachines = await listenForOtherMachines(app, 0, '127.0.0.1')
    const door = `http://127.0.0.1:${String((otherMachines.address() as AddressInfo).port)}`
    const headers = { 'content-type': 'application/json', ...human() }
    try {
      const looked = await fetch(`${door}/api/conversations/${run}/export`, { method: 'GET', headers })
      const made = await fetch(`${door}/api/conversations/${run}/export`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ parts: EVERY_PART, looked: true }),
      })
      for (const res of [looked, made]) {
        expect(res.status).toBe(403)
        expect(String(res.headers.get('content-type'))).not.toContain('application/zip')
        expect(((await res.json()) as { code: string }).code).toBe(KEPT_HERE)
      }
    } finally {
      await new Promise<void>((done) => {
        otherMachines.close(() => {
          done()
        })
      })
    }
  })
})
