// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** Attach knowledge to a validated project flow step without changing its content history. */
import { z } from 'zod'
import { stepsOf } from '@shared/flow-steps.ts'
import { KNOWLEDGE_WORKSPACE } from '@shared/knowledge/constants.ts'
import { thePersonIsProved } from '@shared/the-person-proved.ts'
import { KNOWLEDGE_WORDS as w } from '@shared/words/en-wave-13u.ts'
import { isAProjectOnAList } from '@shared/workspaces.ts'
import { sqlite } from '../db/client.ts'
import { getWorkspace } from '../db/get-workspace.ts'
import { holdsTheSecretaryCard } from '../lib/holds-the-secretary-card.ts'
import { PanelError } from '../lib/panel-error.ts'
import { getRecord, patchRecord, type Actor } from '../lib/records.ts'
import { anAgentItsOwnKeyProves } from '../lib/who-may-act.ts'
import { knowledgeWrite } from './guard.ts'

const placeSchema = z.strictObject({ project: z.string().trim().min(1), flow: z.string().trim().min(1), step: z.number().int().positive() })
export type KnowledgePlace = z.infer<typeof placeSchema>
export function placesOf(data: Record<string, unknown>): KnowledgePlace[] {
  if (!Array.isArray(data['attachments'])) return []
  return data['attachments'].flatMap(value => { const result = placeSchema.safeParse(value); return result.success ? [result.data] : [] })
}
const samePlace = (a: KnowledgePlace, b: KnowledgePlace) => a.project === b.project && a.flow === b.flow && a.step === b.step

export function changeAttachment(id: string, input: unknown, actor: Actor, attach: boolean) {
  const agent = thePersonIsProved(actor) ? null : anAgentItsOwnKeyProves(actor)
  if (!thePersonIsProved(actor) && (agent === null || !holdsTheSecretaryCard({ kind: 'agent', id: agent }))) throw new PanelError(w.attachmentSecretary, 403)
  const parsed = placeSchema.safeParse(input)
  if (!parsed.success) throw new PanelError(w.attachmentInvalid, 400)
  const place = parsed.data
  return sqlite.transaction(() => knowledgeWrite(() => {
    const entry = getRecord(id)
    if (!entry || entry.deletedAt !== null || entry.workspaceId !== KNOWLEDGE_WORKSPACE || entry.kind !== 'knowledge_entry') throw new PanelError(w.missing, 404)
    const places = placesOf(entry.data)
    const exists = places.some(one => samePlace(one, place))
    if (attach && exists) throw new PanelError(w.attachmentExists, 409)
    if (!attach && !exists) throw new PanelError(w.attachmentAbsent, 409)
    if (attach) {
      if (!isAProjectOnAList(place.project) || getWorkspace(place.project) === null) throw new PanelError(w.attachmentProject, 400)
      const flow = getRecord(place.flow)
      if (!flow || flow.deletedAt !== null || flow.kind !== 'flow' || flow.workspaceId !== place.project) throw new PanelError(w.attachmentFlow, 400)
      if (!stepsOf(flow.data).some(step => step['n'] === place.step)) throw new PanelError(w.attachmentStep, 400)
    }
    const attachments = attach ? [...places, place] : places.filter(one => !samePlace(one, place))
    return { entry: patchRecord(id, { dataPatch: { attachments } }, actor).record }
  }))()
}
