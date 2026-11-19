// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE TWO DOORS AN INCIDENT NEEDS BESIDE THE ORDINARY RECORD ONES. Criteria I1, I4 and I7.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THESE ARE, AND WHAT THEY ARE NOT
 * ---------------------------------------------------------------------------------------
 *
 * Filing an incident, reading one, retitling it, linking a problem to it, adding a corrective
 * action — all of that is the ORDINARY record surface: POST /api/records, PATCH /api/records/:id,
 * POST /api/links, exactly as every other kind uses them. `checkWhoMayFileAnIncident` in
 * lib/records/who-files-an-incident.ts narrows who may file one or change its `responsibility`, and that narrowing is
 * enforced on those ordinary doors, not here.
 *
 *   POST /api/records/:id/timeline          append one moment. Every agent may. Criterion I4.
 *   POST /api/records/:id/close-incident    close it, with one line saying so. Criterion I7.
 *
 * These two exist because each writes a field an ordinary PATCH may not touch directly
 * (`checkTheIncidentTimeline` and `checkTheIncidentClosing` in lib/records.ts refuse a raw write to
 * `timeline` or a raw move of `state` to `closed`), for the same reason the notebook's four doors
 * exist: who wrote a moment and when, and who closed the incident and when, are not a caller's to
 * supply by hand — a name sent in a body is a name anybody can send.
 *
 * ---------------------------------------------------------------------------------------
 * WHO MAY, AND WHY IT IS NOT THE SAME ANSWER FOR BOTH
 * ---------------------------------------------------------------------------------------
 *
 * Every registered agent and the person may append a timeline moment — that is the whole of
 * criterion I4's "every agent may add evidence to its timeline." Closing is narrower: the secretary
 * or the person, criterion I7, checked by the same `actorMayActAsSecretaryOrThePerson` that
 * `checkWhoMayFileAnIncident` uses, because it is the same question asked of a different act.
 */
import type { FastifyInstance } from 'fastify'
import { nothingWrittenSentence } from '../lib/records/patching.ts'
import { z } from 'zod'

import { actorFrom } from '../lib/http.ts'
import { parse } from '../lib/parse.ts'
import { theMessageReader, type AMessageReader } from '../lib/messages.ts'
import { route } from '../lib/route.ts'
import { gateMet } from '../lib/gate-counts.ts'
import { workspaceOf } from '../lib/workspaces.ts'
import {
  actorMayActAsSecretaryOrThePerson,
  patchRecord,
  recordInWorkspace,
} from '../lib/records.ts'
import { incompletenessOf } from '@shared/incompleteness-of.ts'
import { PanelError } from '../lib/panel-error.ts'
import { nowStamp } from '@shared/time.ts'
import { INCIDENT_KIND, THE_INCIDENT_CLOSING_DOOR, THE_INCIDENT_TIMELINE_DOOR, type IncidentMoment } from '@shared/incident.ts'
import { kindWord } from '@shared/words.ts'
import type { Incompleteness } from '@shared/kinds.ts'
import type { PanelRecord } from '@shared/types.ts'

const idParams = z.strictObject({ id: z.string().min(1) })

const momentBody = z.strictObject({
  at: z.string().min(1),
  who: z.string().min(1),
  what: z.string().min(1),
  evidence: z.string().min(1),
})

const closeBody = z.strictObject({ note: z.string().min(1) })

/** The incident this route names, or a refusal — 404 for a project mismatch, 400 for the wrong kind. */
function theIncident(id: string, workspaceId: string, reader: AMessageReader): PanelRecord {
  const record = recordInWorkspace(id, workspaceId, reader)
  if (record.kind !== INCIDENT_KIND) {
    throw new PanelError(
      `${id} is a "${kindWord(record.kind).text}", not an incident. This door is for an incident's own timeline or closing; ` +
        `an ordinary PATCH is how every other kind's fields are changed.`,
      400,
    )
  }
  return record
}

/** `data.timeline`, read off a record already known to be an incident, or an empty list if it holds none. */
function theTimeline(record: PanelRecord): IncidentMoment[] {
  const data = record.data as Record<string, unknown> | null
  const held = data === null ? undefined : data['timeline']
  return Array.isArray(held) ? (held as IncidentMoment[]) : []
}

function withIncomplete(record: PanelRecord): { record: PanelRecord; incomplete: Incompleteness[] } {
  return { record, incomplete: incompletenessOf(record) }
}

export async function incidentRoutes(app: FastifyInstance): Promise<void> {
  app.post(
    '/records/:id/timeline',
    route(
      'record.write',
      'remote',
      'APPEND ONE MOMENT to an incident\'s timeline: {"at":"…","who":"…","what":"…","evidence":"<record id>"}. ' +
        'Every registered agent and the person may. `at` and `who` are kept exactly as written, never parsed — ' +
        '`at` is when it happened, in your own words, and the moments stay in the order they were appended. ' +
        '`evidence` names the record that is this moment\'s evidence, and is refused if nothing answers to it ' +
        'in this project. The moment\'s own id is written by this door, never read from the body.',
    ),
    async (req, reply) => {
      const { id } = parse(idParams, req.params, 'The URL is not usable:')
      const said = parse(momentBody, req.body, 'That is not a timeline moment:')
      const workspaceId = workspaceOf(req)
      const actor = actorFrom(req)
      const incident = theIncident(id, workspaceId, theMessageReader(actorFrom(req)))

      // THE EVIDENCE HAS TO BE A RECORD THAT REALLY EXISTS, IN THIS PROJECT. `recordInWorkspace`
      // throws its own 404 naming what is wrong — nothing here needs to say it twice.
      const evidenceRecord = recordInWorkspace(said.evidence, workspaceId, theMessageReader(actorFrom(req)))

      const at = nowStamp()
      const moment: IncidentMoment = {
        id: `moment-${at.replace(/[^0-9]/g, '')}-${Math.random().toString(36).slice(2, 8)}`,
        at: said.at,
        who: said.who,
        what: said.what,
        evidence: evidenceRecord.id,
      }
      const result = patchRecord(
        id,
        { dataPatch: { timeline: [...theTimeline(incident), moment] }, [THE_INCIDENT_TIMELINE_DOOR]: true },
        actor,
      )
      reply.code(201)
      return { ...withIncomplete(result.record), moment }
    },
  )

  app.post(
    '/records/:id/close-incident',
    route(
      'record.write',
      'remote',
      'CLOSE AN INCIDENT: {"note":"…"}, one line saying its corrective decisions are done. The secretary or ' +
        'the person only — criterion I7. Sets `state` to "closed" and writes `closedWith` (the note, who, and ' +
        'when); who and when come from this door and not from the body. Nothing in Mole Office is gated on an ' +
        'incident\'s state, so closing changes nothing about what may be done elsewhere — it only records that ' +
        'the person or the secretary said the corrective decisions are done.',
    ),
    async (req) => {
      const { id } = parse(idParams, req.params, 'The URL is not usable:')
      const said = parse(closeBody, req.body, 'That is not a closing note:')
      const workspaceId = workspaceOf(req)
      const actor = actorFrom(req)
      theIncident(id, workspaceId, theMessageReader(actorFrom(req)))

      if (!actorMayActAsSecretaryOrThePerson(actor) && gateMet('who-files-or-closes-an-incident') === 'block') {
        throw new PanelError(
          `Closing an incident is the secretary's or the person's, criterion I7. This request came from ` +
            `${actor.type} "${actor.id}", so nothing was written and the incident is exactly as it was. If its ` +
            `corrective decisions are done, say so to a secretary or the person and let one of them close it.`,
          403,
        )
      }

      const at = nowStamp()
      const result = patchRecord(
        id,
        {
          dataPatch: { state: 'closed', closedWith: { note: said.note, by: actor.id, at } },
          [THE_INCIDENT_CLOSING_DOOR]: true,
        },
        actor,
      )
      return { ...withIncomplete(result.record), ...(result.nothingWritten === undefined ? {} : { nothingWritten: nothingWrittenSentence({ kind: 'already-stored' }) }) }
    },
  )
}
