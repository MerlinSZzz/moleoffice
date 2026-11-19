// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { FLOW_PAGE_LIMIT_MOST } from '../flows.ts'
import { bytes, standingStagesText, type StandingFlow, type StandingStage, type StandingStages } from './manifest.ts'

/**
 * The launcher's own ask, in the sandbox's project unless another is named: a general flow may be filed in another
 * project, and the record door reads a record only in its own. `status` is null when nothing answered, and `why` then
 * says why.
 */
export type AskTheOfficeIn = (path: string, project?: string) => Promise<{ status: number | null; body?: unknown; why?: string }>

function fail(why: string): never { throw new Error(`Standing stages: ${why}. Nothing was started.`) }
const object = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x)
const words = (x: unknown): x is string => typeof x === 'string' && x.trim() !== ''

/** One answer of the office, or why it is not used. */
async function read(request: AskTheOfficeIn, path: string, project?: string): Promise<{ body: Record<string, unknown> } | { why: string }> {
  const reply = await request(path, project)
  if (reply.status === null) return { why: `GET ${path} had no answer (${reply.why ?? 'no reason was given'})` }
  const said = object(reply.body) && typeof reply.body['error'] === 'string' ? reply.body['error'] : JSON.stringify(reply.body ?? null)
  if (reply.status !== 200) return { why: `GET ${path} was answered ${reply.status} (${said})` }
  if (!object(reply.body)) return { why: `GET ${path} was answered with something that is not an object` }
  return { body: reply.body }
}

const noStageMarked = (role: string) => `No office flow for the role ${role} has a stage marked standing, so this start carries none.`

/** Whether the office answered every read: the stages are given, or no flow for the role marks one. */
export function theStandingStagesWereRead(standing: StandingStages): boolean {
  return standing.flows.length > 0 || (standing.role !== undefined && standing.says === noStageMarked(standing.role))
}

function notRead(role: string | undefined, why: string): StandingStages {
  return { ...(role === undefined ? {} : { role }), flows: [], text: '', bytes: 0, says: `The standing stages were not read, so this start carries none: ${why}.` }
}

/**
 * THE STANDING STAGES OF THE FLOWS THAT APPLY TO AN AGENT, read from the office when its round or its worker starts.
 * The agent's role is read first, then every flow the office lists for that role, then each of those flows. A stage
 * marked `standing: true` is given in the words it holds now, with its flow's title, id and the revision read.
 *
 * A start costs more when it stops than when it lacks a standing stage. So when the office refuses a read, does not
 * answer, or answers in a shape this cannot read, the start goes on without the stages, and `says` tells why. An
 * office that knows no mark answers stages without one, and that is no stage marked. Only a stage that is marked and
 * cannot be read stops the start.
 */
export async function readTheStandingStages(input: { agent: string; request: AskTheOfficeIn }): Promise<StandingStages> {
  const agent = await read(input.request, `/api/participants/agent/${encodeURIComponent(input.agent)}`)
  if ('why' in agent) return notRead(undefined, agent.why)
  const participant = agent.body['participant']
  const role = object(participant) ? participant['roleReadAs'] : undefined
  if (!words(role)) return notRead(undefined, `the office's answer for the agent ${input.agent} names no role`)

  const listed: { id: string; project?: string }[] = []
  for (let path: string | null = `/api/flows?role=${encodeURIComponent(role)}&limit=${FLOW_PAGE_LIMIT_MOST}`; path !== null;) {
    const page = await read(input.request, path)
    if ('why' in page) return notRead(role, page.why)
    const own = page.body['flows']
    const general = object(page.body['general']) ? page.body['general']['flows'] : undefined
    const next = page.body['next']
    if (!Array.isArray(own) || !Array.isArray(general) || (next !== null && !(typeof next === 'string' && next.startsWith('/api/flows?')))) {
      return notRead(role, `the office's list of flows for the role ${role} could not be read`)
    }
    for (const row of [...own, ...general] as unknown[]) {
      if (!object(row) || !words(row['id']) || (row['project'] !== undefined && !words(row['project']))) {
        return notRead(role, `a flow in the office's list for the role ${role} could not be read`)
      }
      if (!listed.some(one => one.id === row['id'])) listed.push({ id: row['id'] as string, ...(row['project'] === undefined ? {} : { project: row['project'] as string }) })
    }
    path = next
  }

  const flows: StandingFlow[] = []
  for (const { id, project } of listed) {
    const answer = await read(input.request, `/api/records/${encodeURIComponent(id)}`, project)
    if ('why' in answer) return notRead(role, answer.why)
    const flow = theMarkedStagesOf(id, answer.body)
    if (typeof flow === 'string') return notRead(role, flow)
    if (flow !== null) flows.push(flow)
  }
  if (flows.length === 0) return { role, flows, text: '', bytes: 0, says: noStageMarked(role) }
  const text = standingStagesText(role, flows)
  return { role, flows, text, bytes: bytes(text) }
}

/** The stages a flow marks standing; null when it marks none, or why its answer could not be read. */
function theMarkedStagesOf(id: string, body: Record<string, unknown>): StandingFlow | null | string {
  const record = body['record']
  const data = object(record) ? record['data'] : undefined
  if (!object(record) || record['kind'] !== 'flow' || !object(data) || !Array.isArray(data['stages'])) return `the office's answer for the flow ${id} could not be read`
  const stages: StandingStage[] = []
  for (const [i, stage] of (data['stages'] as unknown[]).entries()) {
    if (!object(stage) || stage['standing'] === undefined || stage['standing'] === false) continue
    if (stage['standing'] !== true) fail(`stage ${i + 1} of the flow ${id} is marked standing ${JSON.stringify(stage['standing'])}, which is not true or false`)
    if (!Number.isSafeInteger(stage['n']) || Number(stage['n']) < 1 || !words(stage['does'])) fail(`stage ${i + 1} of the flow ${id} is marked standing, and has no number or no words`)
    stages.push({ n: Number(stage['n']), does: stage['does'] as string })
  }
  if (stages.length === 0) return null
  const title = record['title']
  const version = body['version']
  if (!words(title) || !words(version)) fail(`the flow ${id} marks stages standing, and the office's answer names no title or no revision for it`)
  return { id, title, version, stages }
}
