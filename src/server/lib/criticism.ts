// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** Independent criticism of a record, resolved through the same registry as inspection. */
import { nowStamp } from '@shared/time.ts'
import type { ParticipantRef } from '@shared/participants.ts'
import { theKindOfAnActorsId, type ActorType, type PanelRecord } from '@shared/types.ts'
import { theAgentOfARun, theNameAPersonReads } from './inspection.ts'
import { participantForActor } from './participant-for-actor.ts'
import { theMessageReader } from './messages.ts'
import { createRecordWithReport, getRecord, recordInWorkspace, resolveLinks, whoFiled, type Actor } from './records.ts'
import { noRecordHasThisId } from './no-record-has-this-id.ts'
import { PanelError } from './panel-error.ts'

function workInProject(id: string, workspaceId: string, actor: Actor): PanelRecord {
  // A MESSAGE THE CALLER IS NOT A PARTY TO IS ANSWERED AS AN ID THAT NAMES NOTHING, so neither its title
  // nor the fact that it exists reaches somebody who could not read it. `recordInWorkspace` is the one
  // door that asks the message reader; `getRecord` alone would have handed over the title.
  const work = recordInWorkspace(id, workspaceId, theMessageReader(actor))
  // A DELETED RECORD IS NOT A PLACE TO FILE OR READ A CRITICISM, and it answers as an id that names nothing.
  if (work.deletedAt !== null) throw noRecordHasThisId(id)
  return work
}

function filerOf(record: PanelRecord, workspaceId: string): ParticipantRef | null {
  const filed = whoFiled(workspaceId, record.id)
  if (filed === null) return null
  const kind = theKindOfAnActorsId(filed.actorType as ActorType)
  return participantForActor({ type: kind === 'person' ? 'human' : 'agent', id: filed.actorId })
}

export function theAuthorOfTheWork(record: PanelRecord, workspaceId: string): ParticipantRef | null {
  if (record.kind === 'session') {
    const agent = theAgentOfARun(record)
    if (agent !== null) return { kind: 'agent', id: agent.id }
  }
  return filerOf(record, workspaceId)
}

function same(a: ParticipantRef, b: ParticipantRef): boolean {
  return a.kind === b.kind && a.id === b.id
}

function markerMatches(value: unknown, participant: ParticipantRef | null): boolean {
  if (participant === null || value === null || typeof value !== 'object' || Array.isArray(value)) return false
  const marked = value as Record<string, unknown>
  return marked['kind'] === participant.kind && marked['id'] === participant.id
}

export function fileACriticism(input: {
  aboutId: string; workspaceId: string; actor: Actor; title: string; summary?: string | undefined
  data: { tried: string; got_in_the_way: string; did_instead: string; wants_changed: string; evidence?: string[] | undefined }
}) {
  const work = workInProject(input.aboutId, input.workspaceId, input.actor)
  const critic = participantForActor(input.actor)
  if (critic === null) throw new PanelError('A name nothing holds cannot be an independent critic. Nothing was written.', 403)
  const author = theAuthorOfTheWork(work, input.workspaceId)
  if (author === null) throw new PanelError('The office cannot name who wrote this work, so it cannot say whether the critic is independent. Nothing was written.', 409)
  if (same(author, critic)) {
    // NAME ONLY WHO MAY REALLY CRITICISE IT. When the author is the person there is no other person here
    // to offer, so that sentence offers a registered agent other than the author and never the author back.
    if (author.kind === 'person') {
      throw new PanelError(`${theNameAPersonReads(author)} authored this work and may not criticise it independently. A registered agent other than the author may criticise it. Nothing was written.`, 403)
    }
    throw new PanelError(`${theNameAPersonReads(author)} authored this work and may not criticise it independently. Any other registered agent, or the person, may criticise it. Nothing was written.`, 403)
  }
  return createRecordWithReport({ kind: 'criticism', title: input.title, summary: input.summary, data: { ...input.data, independent: { critic, author, at: nowStamp() } }, workspaceId: input.workspaceId, actor: input.actor, links: [{ type: 'about', toId: work.id }], theIndependentCriticismStep: true })
}

export function criticismsOf(id: string, workspaceId: string, actor: Actor) {
  const work = workInProject(id, workspaceId, actor)
  const author = theAuthorOfTheWork(work, workspaceId)
  const criticisms = resolveLinks(id).filter(link => link.isBacklink && link.type === 'about' && link.other.kind === 'criticism' && !link.broken).flatMap(link => {
    const record = getRecord(link.other.id)
    if (record === null || record.deletedAt !== null || record.workspaceId !== workspaceId) return []
    const critic = filerOf(record, workspaceId)
    const marker = record.data['independent']
    const object = marker !== null && typeof marker === 'object' && !Array.isArray(marker) ? marker as Record<string, unknown> : null
    return [{ record, critic, author, independent: critic !== null && author !== null && !same(critic, author), filedThroughTheStep: object !== null && markerMatches(object['critic'], critic) && markerMatches(object['author'], author) && typeof object['at'] === 'string' && object['at'].length > 0, at: object?.['at'] ?? null }]
  })
  return { about: { id: work.id, kind: work.kind, title: work.title }, criticisms }
}
