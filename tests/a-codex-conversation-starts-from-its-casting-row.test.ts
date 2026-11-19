// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A CODEX CONVERSATION STARTS FROM ITS CASTING ROW, NEVER FROM A COMPILED GUESS.
 *
 * Before this change the office passed a Codex run answering a message no model. The door answered "Codex uses its own
 * configuration", the launcher started Codex with no -m, and it took the effort for a model named in
 * src/config/launcher-model-compatibility.json, which nobody chose for the run. Now, when nothing names a model, a Codex
 * conversation takes its model from the agent's Casting row in force, when that row's program is codex and its native
 * selection is complete, and the launcher passes the row's native model and effort. Otherwise the start is refused in a
 * sentence that names the agent, the place, the program, what the row lacks and the Casting page, and nothing starts. A
 * Codex model the agent's own profile names is the model, with the row's selection when the row's program and model are
 * the same, as for Claude Code and OpenCode.
 *
 * WHAT IS REAL AND WHAT IS NOT. The office is the real server on a fresh test database, and every row and model is
 * written through its doors as the person. The launcher's aCommandsStartFromTheOffice reaches the office through a relay
 * this file starts on a free port, which hands each request to the same server in this process. The only program started
 * is a stand-in named codex, in a folder of this file's own under the temporary directory, which writes the words it was
 * given and ends. No model runs. Every model name and effort is made up for each case, and the case checks that the
 * compatibility list names none of them before it relies on that. Case (e) is the one exception. With no selection, the
 * launcher starts a Codex model only when the compatibility list names it, so case (e) needs such a model, and it reads
 * one the list names both alone and with Codex's provider in front.
 *
 * WHAT GOES RED WHEN THE CODE IS REMOVED. Without the office's Codex block, the door answers a Codex conversation that
 * nothing names a model for with no model and a 200, so cases (a), (b) and (d) go red on the door's answer. Cases (c)
 * and (e) stay green then, because the profile's model is read before that block. Without the -m that the CodexAdapter
 * passes, case (e) goes red: the office names the profile's model with no selection, so the launcher has no native model
 * to put in its place, and the start is refused. Case (d) stays green then, because the launcher passes the row's native
 * model from the selection.
 */
import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { LAUNCHER_MODEL_COMPATIBILITY } from '../src/config/model-efforts.mjs'
import { runtimeShownName } from '../src/shared/participants.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { THE_WORKER } from '../src/shared/roles.ts'
import type { TheModelARunGets } from '../src/shared/run-models.ts'
import { theProviderTheLauncherAdds } from '../src/shared/worker-runs.ts'
import { adapterFor } from '../src/worker/runtimes/index.ts'
import { aCommandsStartFromTheOffice } from '../tools/sandbox-common.mjs'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

const WORKSPACE = 'default'
const AGENT = 'codex-conversing-one'
const AS_THE_PERSON = { 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON, 'x-mole-office-workspace': WORKSPACE }
const AS_THE_AGENT = { 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': AGENT, 'x-mole-office-workspace': WORKSPACE }

let t: TestDb
let app: FastifyInstance
let relay: Server
let api = ''
/** This file's own folder: the stand-in's bin, the runs' working folder and their output. */
let folder = ''
const groups = new Set<number>()

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  const made = await app.inject({ method: 'POST', url: '/api/agents/started', headers: AS_THE_PERSON, payload: { handle: AGENT, name: 'Codex Conversing One', role: THE_WORKER, runtime: 'codex', workArea: ['src'] } })
  expect(made.statusCode, made.body).toBe(201)
  relay = createServer((request, response) => {
    const headers = Object.fromEntries(Object.entries(request.headers).filter(([name]) => name.startsWith('x-mole-office-'))) as Record<string, string>
    void app.inject({ method: request.method as 'GET', url: request.url ?? '/', headers }).then((reply) => {
      response.writeHead(reply.statusCode, { 'content-type': 'application/json' })
      response.end(reply.body)
    })
  })
  await new Promise<void>((done) => relay.listen(0, '127.0.0.1', done))
  api = `http://127.0.0.1:${String((relay.address() as AddressInfo).port)}`
  folder = mkdtempSync(join(tmpdir(), 'a-codex-conversation-'))
  mkdirSync(join(folder, 'bin'))
  mkdirSync(join(folder, 'work'))
  // THE STAND-IN: it writes the words it was given beside the answer file Codex is asked for (-o), and ends.
  writeFileSync(join(folder, 'bin', 'codex'), `#!${process.execPath}
const fs = process.getBuiltinModule('node:fs')
const args = process.argv.slice(2)
fs.writeFileSync(args[args.indexOf('-o') + 1] + '.seen.json', JSON.stringify(args))
console.log(JSON.stringify({ type: 'thread.started', thread_id: '${randomUUID()}' }))
`, { mode: 0o755 })
})
afterAll(async () => {
  for (const group of groups) {
    try { process.kill(-group, 'SIGTERM') } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error }
  }
  await new Promise<void>((done) => relay.close(() => done()))
  await app.close()
  t.close()
  rmSync(folder, { recursive: true, force: true })
})

/** A model, its native name and an effort made up for this case, none of which the compatibility list names. */
function unseen() {
  const key = randomUUID()
  const made = { model: `office-${key}`, native: `native-${key}`, effort: `effort-${key}` }
  const listed = LAUNCHER_MODEL_COMPATIBILITY as { aliases: Record<string, string>; startValues: Record<string, unknown> }
  for (const name of [made.model, made.native]) expect(listed.aliases[name] ?? listed.startValues[name]).toBeUndefined()
  return made
}

/** EVERY ROW OF THE WORKER CARD, in every scope, removed as the person, so the card has no row in force anywhere. */
async function noRow(): Promise<void> {
  const table = (await app.inject({ method: 'GET', url: '/api/casting', headers: AS_THE_PERSON })).json() as { roles: { role: string; scopes: { castings: { id: number; marked: boolean }[] }[] }[] }
  for (const scope of table.roles.find((one) => one.role === THE_WORKER)?.scopes ?? []) {
    // The marked row last: the office refuses to remove it while another row of its scope is left.
    for (const row of [...scope.castings].sort((one, other) => Number(one.marked) - Number(other.marked))) {
      const removed = await app.inject({ method: 'DELETE', url: `/api/casting/rows/${String(row.id)}`, headers: AS_THE_PERSON })
      expect(removed.statusCode, removed.body).toBe(200)
    }
  }
  const left = (await app.inject({ method: 'GET', url: `/api/casting/for/${THE_WORKER}?project=${WORKSPACE}`, headers: AS_THE_PERSON })).json() as { casting: unknown }
  expect(left.casting).toBeNull()
}

/**
 * THE WORKER CARD'S ROW IN FORCE, written as the person after every other row is removed, so it is the first row of its
 * scope and carries the mark. `native: false` writes no native data, and `effort: false` no effort. Its id.
 */
async function theWorkersRow(program: 'claude-code' | 'codex', made: ReturnType<typeof unseen>, cells: { native?: boolean; effort?: boolean } = {}): Promise<number> {
  const row = {
    program: { value: program }, model: { value: made.model }, effort: { value: cells.effort === false ? null : made.effort },
    ...(cells.native === false ? {} : { native: { model: made.native, provider: null, variant: null } }),
  }
  await noRow()
  const written = await app.inject({ method: 'POST', url: `/api/casting/${THE_WORKER}`, headers: AS_THE_PERSON, payload: row })
  expect(written.statusCode, written.body).toBe(201)
  const casting = (written.json() as { casting: { id: number; marked: boolean } }).casting
  expect(casting.marked).toBe(true)
  return casting.id
}

/** The agent's own model, set on its profile as the person sets it, or cleared with null. */
async function theAgentsOwnModel(model: string | null): Promise<void> {
  const reply = await app.inject({ method: 'POST', url: `/api/office/run-models/agent/${AGENT}`, headers: AS_THE_PERSON, payload: { model } })
  expect(reply.statusCode, reply.body).toBe(200)
}

/** What the row's own selection door answers, which is what the launcher checks a selection against. */
async function theRowsSelection(id: number): Promise<unknown> {
  const reply = await app.inject({ method: 'GET', url: `/api/casting/rows/${String(id)}/selection`, headers: AS_THE_PERSON })
  expect(reply.statusCode, reply.body).toBe(200)
  return (reply.json() as { selection: unknown }).selection
}

/** The door a start asks, as the agent: its status and its body. */
async function forAConversation(query: string): Promise<{ status: number; body: TheModelARunGets & { error?: string } }> {
  const reply = await app.inject({ method: 'GET', url: `/api/office/run-models/for/${AGENT}?place=conversation&${query}`, headers: AS_THE_AGENT })
  return { status: reply.statusCode, body: reply.json() }
}

/** The value after `flag`, where the command has it once. */
function theOne(command: string[], flag: string): string | undefined {
  expect(command.filter((word) => word === flag), `${flag} in ${JSON.stringify(command)}`).toHaveLength(1)
  return command[command.indexOf(flag) + 1]
}

/** Start the Codex adapter the message worker would make for this answer, with the stand-in on its PATH. */
async function aCodexConversation(chosen: { model: string | null; variant: string | null }) {
  const name = randomUUID()
  const outputPath = join(folder, `${name}.out`)
  const adapter = adapterFor('codex', { PATH: `${join(folder, 'bin')}:${process.env['PATH'] ?? ''}`, HOME: folder }, chosen)!
  const seen = `${outputPath}.answer.seen.json`
  let handle: Awaited<ReturnType<typeof adapter.start>>
  try {
    handle = await adapter.start({ session: `synthetic-${name}`, agent: AGENT, prompt: 'Synthetic: a made-up message.', cwd: join(folder, 'work'), api, workspace: WORKSPACE, outputPath })
  } catch (error) {
    return { argv: null, refused: (error as Error).message, started: existsSync(seen) }
  }
  groups.add(handle.pgid)
  const until = Date.now() + 10_000
  while (!existsSync(seen) && Date.now() < until) await new Promise((done) => setTimeout(done, 20))
  return { argv: JSON.parse(readFileSync(seen, 'utf8')) as string[], refused: null, started: true }
}

describe('a Codex conversation starts from its Casting row, never from a compiled guess', () => {
  // (a)
  it("gives a Codex conversation that nothing names a model the codex row's model and its complete native selection", async () => {
    await theAgentsOwnModel(null)
    const made = unseen()
    const id = await theWorkersRow('codex', made)
    const exact = await theRowsSelection(id)
    expect(exact).toMatchObject({ runtime: 'codex', model: made.model, native: { model: made.native, provider: null, variant: null, effort: made.effort }, casting: { id } })
    const answered = await forAConversation('runtime=codex')
    expect(answered.status, JSON.stringify(answered.body)).toBe(200)
    expect(answered.body).toMatchObject({ runtime: 'codex', model: made.model, from: 'the role', casting: { id }, effort: made.effort, effortFrom: 'Casting' })
    expect(answered.body.selection).toEqual(exact)
  })

  // (b)
  it.each([
    ['no row in force', async () => { await noRow() }, `no row in force for ${THE_WORKER}`],
    ['a row of another program', async () => { await theWorkersRow('claude-code', unseen()) }, `is for ${runtimeShownName('claude-code')}, not ${runtimeShownName('codex')}`],
    ['a row with no native data', async () => { await theWorkersRow('codex', unseen(), { native: false }) }, 'has no native model'],
    ['a row with no effort', async () => { await theWorkersRow('codex', unseen(), { effort: false }) }, 'has no effort'],
  ])('refuses a Codex conversation with %s in words, and nothing starts', async (_, row, lacks) => {
    await theAgentsOwnModel(null)
    await row()
    const answered = await forAConversation('runtime=codex')
    expect(answered.status, JSON.stringify(answered.body)).toBe(409)
    // THE SENTENCE NAMES the agent, the place, the program, what the row lacks, and the page where it is filled in.
    const says = answered.body.error ?? ''
    for (const part of [AGENT, 'answer a message', runtimeShownName('codex'), lacks, 'Casting page']) expect(says, says).toContain(part)
    // AS THE MESSAGE WORKER STARTS IT, with no model: the start is refused in the same words, and the stand-in never runs.
    const started = await aCodexConversation({ model: null, variant: null })
    expect(started.refused, JSON.stringify(started.argv)).toContain(lacks)
    expect(started.started).toBe(false)
  })

  // (c)
  it("starts a Codex conversation on the model the agent's profile names, with the row's selection only when they match", async () => {
    const made = unseen()
    const id = await theWorkersRow('codex', made)
    await theAgentsOwnModel(made.model)
    const matching = await forAConversation('runtime=codex')
    expect(matching.status, JSON.stringify(matching.body)).toBe(200)
    expect(matching.body).toMatchObject({ runtime: 'codex', model: made.model, from: 'the agent' })
    expect(matching.body.selection).toEqual(await theRowsSelection(id))

    const other = unseen()
    await theAgentsOwnModel(other.model)
    const differing = await forAConversation('runtime=codex')
    expect(differing.status, JSON.stringify(differing.body)).toBe(200)
    expect(differing.body).toMatchObject({ runtime: 'codex', model: other.model, from: 'the agent' })
    expect(differing.body).not.toHaveProperty('selection')
    await theAgentsOwnModel(null)
  })

  // (d)
  it("passes -m and model_reasoning_effort from the row's selection through the Codex adapter and the launcher", async () => {
    await theAgentsOwnModel(null)
    const made = unseen()
    await theWorkersRow('codex', made)
    const answered = await forAConversation('runtime=codex')
    expect(answered.status, JSON.stringify(answered.body)).toBe(200)
    // AS THE MESSAGE WORKER STARTS IT: the queue's answer is the adapter's chosen model.
    const started = await aCodexConversation({ model: answered.body.model, variant: answered.body.variant })
    expect(started.refused).toBeNull()
    const argv = started.argv!
    expect(theOne(argv, '-m')).toBe(made.native)
    expect(argv).toContain(`model_reasoning_effort=${JSON.stringify(made.effort)}`)
    expect(argv).not.toContain(made.model)
    // And the launcher alone, asked with the adapter's command and no model, gives the same.
    const given = await aCommandsStartFromTheOffice(['codex', 'exec', '--json', '--', 'Synthetic: a made-up message.'], {
      api, agent: AGENT, workspace: WORKSPACE, runtime: 'codex', env: {}, place: 'conversation', headers: AS_THE_AGENT,
    })
    const command = given.command as string[]
    expect(theOne(command, '-m')).toBe(made.native)
    expect(command).toContain(`model_reasoning_effort=${JSON.stringify(made.effort)}`)
  })

  // (e)
  it("starts a Codex conversation on the profile's model with no selection, on the -m the Codex adapter passes", async () => {
    const listed = Object.keys(LAUNCHER_MODEL_COMPATIBILITY.aliases).find((name) => Object.hasOwn(LAUNCHER_MODEL_COMPATIBILITY.aliases, `${String(theProviderTheLauncherAdds('codex'))}/${name}`))
    expect(listed, 'a Codex model the compatibility list names').toBeDefined()
    // The row in force names a made-up model, so the profile's model matches no row and the office gives no selection.
    await theWorkersRow('codex', unseen())
    await theAgentsOwnModel(listed!)
    const answered = await forAConversation('runtime=codex')
    expect(answered.status, JSON.stringify(answered.body)).toBe(200)
    expect(answered.body).toMatchObject({ runtime: 'codex', model: listed, from: 'the agent' })
    expect(answered.body).not.toHaveProperty('selection')
    // AS THE MESSAGE WORKER STARTS IT: no selection puts a native model in place of the adapter's -m, so the -m the
    // command carries is the adapter's own.
    const started = await aCodexConversation({ model: answered.body.model, variant: answered.body.variant })
    expect(started.refused).toBeNull()
    expect(theOne(started.argv!, '-m')).toBe(listed)
    await theAgentsOwnModel(null)
  })
})
