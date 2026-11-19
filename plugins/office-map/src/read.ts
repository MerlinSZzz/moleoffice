// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { z } from 'zod'
import { string } from 'zod/mini'
import {
  PLUGIN_READ_INTERFACE,
  type PluginAsleepView,
  type PluginOnlineView,
  type PluginPeopleView,
  type PluginProjectsView,
  type PluginTalkView,
  type PluginWorkView,
} from '../../../src/shared/plugin-read.ts'
import type { PluginReadView, RosterView } from './contracts.ts'
import { onFirstUse } from './startup.ts'

// Plain strings use the same core parser without bundling unused classic format methods.
// Built on first use, not while the module evaluates (startup.ts).
const schemas = onFirstUse(() => {
  const participant = z.object({ kind: z.enum(['person', 'agent']), id: string().check(z.minLength(1)) })
  // JSON may supply null or any future value here, but a required published field may not disappear.
  const suppliedUnknown = z.unknown().refine(value => value !== undefined)
  const leftOut = z.object({
    cause: z.enum(['selection', 'budget', 'permission']), bucket: string(),
    count: z.number().int().nonnegative(), ids: z.array(string()).nullable(),
  })
  const counts = z.object({
    candidates: z.number().int().nonnegative(), carried: z.number().int().nonnegative(),
    leftOut: z.number().int().nonnegative(), shortened: z.number().int().nonnegative(), atLeast: z.boolean().optional(),
  })
  const common = { interface: z.literal(PLUGIN_READ_INTERFACE), narrowedByPermission: z.array(leftOut).nullable() }
  const projects = z.object({ ...common, view: z.literal('projects'), projects: z.array(z.object({ id: string().check(z.minLength(1)), name: string() })) })
  const people = z.object({
    ...common, view: z.literal('people'),
    notAgents: z.array(string()).optional(),
    people: z.array(z.object({ kind: z.literal('person'), id: string().check(z.minLength(1)), handle: string(), name: string() })),
    agents: z.array(z.object({
      kind: z.literal('agent'), id: string().check(z.minLength(1)), handle: string(), name: string(), role: z.nullable(string()),
      retired: z.boolean(), visitor: z.boolean(), startedBy: participant.nullable(), createdAt: string(),
      projects: z.array(string()), appearance: suppliedUnknown, appearanceChosen: z.boolean(),
      scale: z.object({ version: z.literal(1), roleAtGeneration: z.nullable(string()), value: z.number().finite().positive() }).nullable(),
      presence: z.array(z.object({ project: string(), colour: string(), word: string() })),
    })),
  })
  const roster = z.object({ interface: z.literal(PLUGIN_READ_INTERFACE), view: z.literal('roster'),
    narrowedByPermission: common.narrowedByPermission,
    people: people.shape.people, agents: z.array(people.shape.agents.element.pick({ kind: true, id: true, handle: true, name: true, role: true, retired: true, visitor: true, startedBy: true, createdAt: true })),
  })
  const work = z.object({
    ...common, view: z.literal('work'), notAgents: z.array(string()).optional(), work: z.array(z.object({
      id: string().check(z.minLength(1)), project: string(), agent: string().check(z.minLength(1)), title: string(), detail: string(),
      recordedState: suppliedUnknown, doing: z.nullable(string()), executing: z.boolean(), association: string(),
      updatedAt: string(), runStanding: z.nullable(string()),
    })),
  })
  const talk = z.object({
    ...common, view: z.literal('talk'),
    messages: z.array(z.object({ id: string().check(z.minLength(1)), project: string(), at: string(), from: participant, to: z.array(participant) })).max(1000),
    last: z.nullable(string().check(z.maxLength(200), z.regex(/^[^~]+~[^~]+$/))), more: z.boolean(), subtraction: counts,
    leftOutGroups: z.array(leftOut.extend({ bucket: z.literal('message_limit') })), refusal: z.nullable(string()),
    withdrawn: z.object({
      ids: z.array(string()).max(1000), last: string().check(z.regex(/^\d{1,15}$/)), more: z.boolean(), subtraction: counts,
      leftOutGroups: z.array(leftOut.extend({ bucket: z.literal('withdrawal_limit') })),
    }),
  })
  const online = z.object({ ...common, view: z.literal('online'), agents: z.array(z.object({ id: string().check(z.minLength(1)), online: z.boolean() })) })
  const asleep = z.object({ ...common, view: z.literal('asleep'), agents: z.array(z.object({ id: string().check(z.minLength(1)), since: string() })) })
  return { projects, roster, people, work, talk, online, asleep }
})

/** Future workflow words are retained verbatim; they never become a guessed workflow state. */
export type ReadWork = Omit<PluginWorkView, 'work'> & {
  work: (Omit<PluginWorkView['work'][number], 'detail' | 'runStanding'> & { detail: string; runStanding: string | null })[]
}
export interface Views {
  roster: RosterView
  projects: PluginProjectsView
  people: PluginPeopleView & { notAgents?: string[] }
  work: ReadWork & { notAgents?: string[] }
  talk: PluginTalkView
  online: PluginOnlineView
  asleep: PluginAsleepView
}

/** Validate bounded row batches, keeping the result private until every row is valid.
 * The schemas still project exactly the published fields and reject the same bodies. */
export function* readViewSlices<V extends PluginReadView>(view: V, body: unknown): Generator<void, Views[V] | null> {
  if (view === 'talk') return readView(view, body) // Both talk pages are capped at 1000 entries.
  if (body === null || typeof body !== 'object' || Array.isArray(body)) return null
  const raw = body as Record<string, unknown>
  const fields = view === 'people' || view === 'roster' ? ['people', 'agents'] : view === 'work' ? ['work'] : view === 'online' || view === 'asleep' ? ['agents'] : ['projects']
  // Parse the envelope once. Never spread extra body fields into the projected result.
  const header: Record<string, unknown> = { interface: raw['interface'], view: raw['view'], narrowedByPermission: raw['narrowedByPermission'] }
  if (view === 'people' || view === 'work') header['notAgents'] = raw['notAgents']
  for (const field of fields) { if (!Array.isArray(raw[field])) return null; header[field] = [] }
  const parsed = schemas()[view].safeParse(header)
  if (!parsed.success) return null
  const result = parsed.data as unknown as Record<string, unknown[]>
  for (const field of fields) {
    const rows = raw[field] as unknown[]
    const schema = (schemas()[view].shape as unknown as Record<string, z.ZodArray>)[field]!
    for (let at = 0; at < rows.length; at += 32) {
      const batch = schema.safeParse(rows.slice(at, at + 32))
      if (!batch.success) return null
      result[field]!.push(...batch.data)
      yield
    }
  }
  return parsed.data as Views[V]
}

/** Project only published fields. Extra data, including accidental talk text, never enters the drawing model. */
export function readView<V extends PluginReadView>(view: V, body: unknown): Views[V] | null {
  const result = schemas()[view].safeParse(body)
  return result.success ? result.data as Views[V] : null
}
