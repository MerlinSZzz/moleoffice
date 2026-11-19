// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import type { TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { THE_SECRETARY, THE_SUPERVISOR } from '../src/shared/roles.ts'
import { OFFICE_STEP_DOES } from '../src/shared/flow-run.ts'
import { localStamp } from '../src/shared/time.ts'
import { generateCWholeAppearance } from '../src/shared/pixel-office.ts'
import { generatePixelScale } from '../src/shared/pixel-scale.ts'

export const STATUS_PERSON = { 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }
export const STATUS_FIXTURE = {
  all: 'status-keeper', presence: 'status-presence', unrecorded: 'status-unrecorded', retired: 'status-retired',
  personal: 'Preparing the night ledger with one line as long as allowed.',
  duty: 'Keeps the night ledger and answers the late bells, files every closing count before dawn, checks the stores against the day books, and tells the day keeper which pages still wait for a second reading.',
  step: OFFICE_STEP_DOES.started,
  currentStep: 'Read the ledger',
  unrecordedRun: 'Archive run without a flow log',
  latestStart: localStamp(new Date(2026, 9, 20, 9, 2, 0)),
  olderStart: localStamp(new Date(2026, 9, 20, 9, 1, 0)),
  currentStepAt: localStamp(new Date(2026, 9, 20, 9, 3, 0)),
  at: localStamp(new Date(2026, 9, 20, 9, 0, 0)),
} as const

/** All rows here are invented. The extra roster makes an accidental whole-profile reader visible. */
export async function seedStatusOffice(t: TestDb, app: FastifyInstance, roster = 240): Promise<void> {
  const registered = await app.inject({ method: 'POST', url: '/api/agents/started', headers: STATUS_PERSON, payload: { handle: 'status-template', name: 'Status template' } })
  if (registered.statusCode !== 201) throw new Error(registered.body)
  const sql = t.client.sqlite
  const template = sql.prepare('SELECT * FROM agents WHERE handle = ?').get('status-template') as Record<string, unknown>
  const columns = Object.keys(template)
  const add = sql.prepare(`INSERT INTO agents (${columns.join(',')}) VALUES (${columns.map(() => '?').join(',')})`)
  const record = (id: string, kind: string, title: string, data: object, project = 'default') => sql.prepare(
    'INSERT INTO records (id,workspace_id,owner_id,kind,title,data,origin,created_at,updated_at) VALUES (?,?,?,?,?,?,\'fixture\',?,?)',
  ).run(id, project, THE_PERSON, kind, title, JSON.stringify(data), STATUS_FIXTURE.at, STATUS_FIXTURE.at)
  for (const [id, name] of [[STATUS_FIXTURE.all, 'Ledger Keeper'], [STATUS_FIXTURE.presence, 'Bell Listener'], [STATUS_FIXTURE.unrecorded, 'Archive Reader'], [STATUS_FIXTURE.retired, 'Retired Keeper'], ...Array.from({length:roster}, (_, i) => [`status-extra-${i}`, `Invented colleague ${i}`])] as [string, string][]) {
    const row: Record<string, unknown> = { ...template, id, handle: id, name, credential: null, created_at: STATUS_FIXTURE.at, pixel_appearance: JSON.stringify(generateCWholeAppearance('status-fixture','registration')), pixel_scale: JSON.stringify(generatePixelScale('status-fixture','worker')), role: id === STATUS_FIXTURE.all ? THE_SECRETARY : 'worker', retired: Number(id === STATUS_FIXTURE.retired), state: id === STATUS_FIXTURE.all ? STATUS_FIXTURE.personal : null, state_at: STATUS_FIXTURE.at, state_by_kind: id === STATUS_FIXTURE.all ? 'person' : null, state_by_id: id === STATUS_FIXTURE.all ? THE_PERSON : null }
    add.run(...columns.map(c => row[c as keyof typeof row]))
    record(`${id}-record`, 'agent', name!, { handle:id, runtime:'codex', state:'active' })
    sql.prepare('INSERT INTO agent_records (record_id,agent_id) VALUES (?,?)').run(`${id}-record`, id)
  }
  record('status-duties','secretary_duties','Duties for the made-up ledger', {secretary:{kind:'agent',id:STATUS_FIXTURE.all},area:STATUS_FIXTURE.duty,restsOn:[]})
  record('status-flow','flow','Night ledger flow', {steps:[]})
  for (const suffix of ['one','two']) {
    record(`status-run-${suffix}`,'session',`Ledger run ${suffix}`,{state:'running',startedAt:suffix==='one'?STATUS_FIXTURE.latestStart:STATUS_FIXTURE.olderStart,servingAgentId:STATUS_FIXTURE.all,ranAs:[{workspaceId:'default',agentId:`${STATUS_FIXTURE.all}-record`}]})
    record(`status-flow-run-${suffix}`,'flow_run',`Recorded ledger flow ${suffix}`,{run:`status-run-${suffix}`,flow:'status-flow',stepsTaken:[{does:STATUS_FIXTURE.step,startedAt:STATUS_FIXTURE.at,how:'by the office',outcome:'done'}]})
  }
  record('status-run-unrecorded','session',STATUS_FIXTURE.unrecordedRun,{state:'running',servingAgentId:STATUS_FIXTURE.unrecorded})
  record('status-entered','flow_run','Entered ledger flow',{run:'status-run-one',flow:'status-flow',entered:{about:'status-flow',endsOn:'sealed'},stepsTaken:[{does:STATUS_FIXTURE.currentStep,startedAt:STATUS_FIXTURE.currentStepAt,how:'by an agent',outcome:'still open'}]})
  record('status-other-project','session','Must stay in another project',{state:'running',servingAgentId:STATUS_FIXTURE.all},'message-centre')
  // Closed runs are history, not unsettled work.
  record('status-closed','session','Settled ledger run',{state:'finished',servingAgentId:STATUS_FIXTURE.all,closedUnchecked:{at:STATUS_FIXTURE.at,by:{kind:'person',id:THE_PERSON},because:'A made-up closure.'}})
  // The template's registration notice has random ids. It is not one of this fixture's conversations.
  sql.prepare("DELETE FROM message_delivery WHERE message_id IN (SELECT id FROM records WHERE kind='message')").run()
  sql.prepare("DELETE FROM records WHERE kind='message'").run()
  sql.prepare('DELETE FROM records WHERE id IN (SELECT record_id FROM agent_records WHERE agent_id=?)').run(template.id)
  sql.prepare('DELETE FROM agent_records WHERE agent_id=?').run(template.id)
  sql.prepare('DELETE FROM agents WHERE id=?').run(template.id)
}

/** The second project of `seedASecondProject`, empty, and the area the keeper's duties give the supervisor. */
export const SECOND_PROJECT = { id: 'second-desk', title: 'Second desk (made-up)', supervisorArea: 'The lamps of the night ledger.' } as const

/**
 * A SECOND PROJECT BESIDE THE STATUS OFFICE, AND TWO AGENTS THAT READ GREEN IN "default" (wave 13y round 111, item 44).
 * Called after `seedStatusOffice`. All rows here are invented.
 *
 * THE KEEPER IS HELD BY A LIVE SESSION, as a secretary answering in a terminal is: a session filed in "default" names the
 * caller's own process, and holds the keeper's handle. The office trusts a recorded pid only while its command line names
 * the claude program, so the caller renames its process "claude" and puts the title back after. A hold lapses after 90
 * seconds without a beat, so a caller that reads for longer beats it (POST /api/handles/<handle>/beat).
 *
 * THE SUPERVISOR HAS ITS OWN CONVERSATION, a run the message worker started for it in "default", which a message to a
 * supervisor picks up there. The keeper's duties name it with an area.
 */
export async function seedASecondProject(t: TestDb, app: FastifyInstance): Promise<{ supervisor: string; terminal: string }> {
  const made = await app.inject({ method: 'POST', url: '/api/workspaces', headers: STATUS_PERSON, payload: { id: SECOND_PROJECT.id, title: SECOND_PROJECT.title } })
  if (made.statusCode !== 201) throw new Error(made.body)
  const started = await app.inject({ method: 'POST', url: '/api/agents/started', headers: STATUS_PERSON, payload: { handle: 'status-lamps', name: 'Lamp Supervisor', role: THE_SUPERVISOR } })
  if (started.statusCode !== 201) throw new Error(started.body)
  const supervisor = (started.json() as { agent: { id: string } }).agent.id
  const sql = t.client.sqlite
  sql.prepare("UPDATE records SET data=json_set(data,'$.supervisors',json(?)) WHERE id='status-duties'")
    .run(JSON.stringify([{ agent: { kind: 'agent', id: supervisor }, area: SECOND_PROJECT.supervisorArea }]))
  sql.prepare("INSERT INTO records (id,workspace_id,owner_id,kind,title,data,origin,created_at,updated_at) VALUES (?,'default',?,'session',?,?,'fixture',?,?)").run(
    'status-lamps-conversation', THE_PERSON, 'Trimming the lamps',
    JSON.stringify({ state: 'finished', servingAgentId: supervisor, deliveringMessage: 'status-lamps-message', providerSession: 'r111-lamps-conversation', runtime: 'claude-code', startedAt: STATUS_FIXTURE.latestStart }),
    STATUS_FIXTURE.at, STATUS_FIXTURE.at,
  )
  const terminal = await aTerminalHolding(t, app, { agent: STATUS_FIXTURE.all, project: 'default', name: 'keeper', title: "The keeper's made-up terminal" })
  // The supervisor's registration notice has random ids. It is not one of this fixture's conversations.
  sql.prepare("DELETE FROM message_delivery WHERE message_id IN (SELECT id FROM records WHERE kind='message')").run()
  sql.prepare("DELETE FROM records WHERE kind='message'").run()
  return { supervisor, terminal }
}

/**
 * A TERMINAL SESSION IN `project` THAT HOLDS `agent`'s HANDLE, and the session's id. Its process is the caller's own, so
 * the caller renames its process "claude" first (see `seedASecondProject`). `name` names its transcript and its id in the
 * terminal. `data` is added to the session's own data, as `servingAgentId` to make the terminal one of the agent's runs.
 * All rows here are invented.
 */
export async function aTerminalHolding(t: TestDb, app: FastifyInstance, terminal: { agent: string; project: string; name: string; title: string; data?: Record<string, unknown> }): Promise<string> {
  const { agent, project, name, title, data = {} } = terminal
  const transcript = join(dirname(t.file), `${name}-terminal.jsonl`)
  writeFileSync(transcript, `${JSON.stringify({ type: 'assistant', timestamp: new Date().toISOString(), message: { role: 'assistant', content: [{ type: 'text', text: 'A made-up answer.' }] } })}\n`)
  // THE CALLER'S OWN PROCESS AS MOLE OFFICE READS IT, so the office finds the terminal's process alive, and nothing is
  // started to read it.
  const { osProbe } = await import('../src/server/lib/resources.ts')
  const me = osProbe().processById(process.pid)
  if (me === null) throw new Error('this test process could not be read, so the terminal would hold the handle with no live process')
  const session = t.api.createRecord({
    workspaceId: project, kind: 'session', title,
    data: { state: 'running', runtime: 'claude-code', doing: 'open in a terminal', ...data, extra: { discovered: {
      tool: 'claude-code', externalId: `r111-${name}-terminal`, logPath: transcript, resumeCommand: null, startedAt: null, entryPoint: null,
      pid: process.pid, pidStartedAt: me.startedAt,
    } } },
    actor: { type: 'human', id: THE_PERSON },
  }).id
  const held = await app.inject({ method: 'POST', url: `/api/handles/${agent}/hold`, headers: { ...STATUS_PERSON, 'x-mole-office-workspace': project }, payload: { session, machine: 'a-machine', runtime: 'claude-code' } })
  if (held.statusCode !== 201) throw new Error(held.body)
  return session
}
