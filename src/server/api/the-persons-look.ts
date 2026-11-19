// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE LOOK DOOR: one person's look and their own themes, read and set by that person, or by a secretary holding the
 * person's grant for the person.
 *
 *   GET /api/participants/person/:id/look   the look kept for that person
 *   PUT /api/participants/person/:id/look   {"themes": <a look> | null}: keep it, or clear it
 *
 * THE SAME READER AND THE SAME CHECK AS THE CHANGE DOOR. Both write through `keepTheLook` in lib/the-look.ts, which
 * reads every value with `readTheLook` in src/shared/own-themes.ts, the theme reader and the one readability check. A
 * theme with a pair under its floor is refused here as it is there, whoever sends it.
 *
 * WHO MAY: that person, as at the change door. And for the person this office is for, a secretary holding their grant,
 * asked by `aRaiseCarriesIt` after the person, so the grant is named only where nothing else allowed the act. The grant
 * reaches no other person's look. Every other caller is refused with the sentence that says who may, and nothing is
 * written.
 *
 * A CHANGE UNDER THE GRANT IS WRITTEN DOWN AS ONE. One change row on `setting:the-persons-look` names the grant, and the
 * grant's period lists it. The row holds no theme, because only the person and their secretary are given those.
 *
 * THE READ IS A DOOR OF ITS OWN because the secretary has to read the look before it changes it. The roster gives the
 * look to that person alone, and a PUT replaces the whole look, so without this read a secretary would write over
 * themes it could not see.
 */
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'

import { THE_PERSON } from '@shared/person.ts'
import type { TheStoredLook } from '@shared/own-themes.ts'
import type { ParticipantRef } from '@shared/participants.ts'
import { whyTheChangeIsRefused } from '@shared/why-the-change-is-refused.ts'
import { sqlite } from '../db/client.ts'
import { actorFrom } from '../lib/http.ts'
import { parse } from '../lib/parse.ts'
import { PanelError } from '../lib/panel-error.ts'
import { participantForActor } from '../lib/participant-for-actor.ts'
import { aRaiseCarriesIt, writeDownAnActUnderTheRaise, type Actor } from '../lib/records.ts'
import { route } from '../lib/route.ts'
import { keepTheLook, theLookKeptFor } from '../lib/the-look.ts'
import { workspaceOf } from '../lib/workspaces.ts'

const READ_NOTE =
  "One person's look and their own themes, as the row keeps them. No body is read. The reply is {themes}: null when " +
  'nobody set a look, {unreadable: [...]} with the reader\'s sentences when this version cannot read what is kept, and ' +
  'the look otherwise. Given to that person, and for the person this office is for, to a secretary holding their ' +
  'grant. Any other caller is refused, and the refusal says who may.'

const SET_NOTE =
  'Set one person\'s look and their own themes. Body {"themes": <a look> | null}; null clears it. The look is read ' +
  'by the same reader and the same readability check as PATCH /api/participants/person/<id>, and a refusal names ' +
  'each fault and writes nothing. That person may set their own. For the person this office is for, a secretary ' +
  'holding their grant may set it too, with {"forThePerson": {"reason": "…"}} beside themes, and the change is ' +
  'written down as made under the grant. Any other caller is refused, and the refusal says who may. The reply is ' +
  '{themes, underTheGrant}: the look kept now, and the grant\'s id where the grant allowed it, or null.'

const whichPerson = z.strictObject({ id: z.string().min(1) })

const setBody = z.strictObject({ themes: z.unknown() })

/** Who may be given a person's look, said when a caller is refused it. */
function whoMayRead(who: ParticipantRef): string {
  return who.id === THE_PERSON
    ? "Only the person, or a secretary holding the person's grant, is given the person's look and own themes."
    : "A person's look and their own themes are given to that person and to nobody else."
}

/**
 * MAY THIS CALLER READ OR SET THIS PERSON'S LOOK? 'their own' or 'the grant', or a refusal with its sentence. The
 * person is asked first, and the grant only for the person this office is for, so the grant is named on the act
 * only where nothing else allowed it. A secretary that holds the grant and may not press this door, or gave no reason
 * for a change, is refused by `aRaiseCarriesIt` in the check's own words.
 */
function whyThisCallerMay(who: ParticipantRef, actor: Actor, refusal: (because: string) => string): 'their own' | 'the grant' {
  const because = whyTheChangeIsRefused('look', who, participantForActor(actor))
  if (because === null) return 'their own'
  if (who.id === THE_PERSON && aRaiseCarriesIt(actor)) return 'the grant'
  throw new PanelError(refusal(because), 403)
}

/** The person the path names, or the door's 404. */
function thePersonThePathNames(params: unknown): ParticipantRef {
  const { id } = parse(whichPerson, params, 'The person asked for')
  const row = sqlite.prepare('SELECT id FROM people WHERE id = ?').get(id)
  if (row === undefined) throw new PanelError(`No person in this installation answers to "${id}".`, 404)
  return { kind: 'person', id }
}

export async function thePersonsLookRoutes(app: FastifyInstance): Promise<void> {
  app.get('/participants/person/:id/look', route('participant.look', 'remote', READ_NOTE), async (req): Promise<{ themes: TheStoredLook }> => {
    const who = thePersonThePathNames(req.params)
    whyThisCallerMay(who, actorFrom(req), () => whoMayRead(who))
    return { themes: theLookKeptFor(who) }
  })

  app.put('/participants/person/:id/look', route('participant.set-look', 'remote', SET_NOTE), async (req): Promise<{ themes: TheStoredLook; underTheGrant: string | null }> => {
    const who = thePersonThePathNames(req.params)
    const actor = actorFrom(req)
    const body = parse(setBody, req.body ?? {}, 'The look')
    // JSON carries no undefined, so an undefined here is a body that left themes out.
    if (body.themes === undefined) throw new PanelError('The body names no themes. Send {"themes": <a look>}, or {"themes": null} to clear it. Nothing was written.', 400)
    const may = whyThisCallerMay(who, actor, (because) => `${because} Nothing was written.`)
    return sqlite.transaction(() => {
      const themes = keepTheLook(who, body.themes)
      if (may === 'the grant') {
        writeDownAnActUnderTheRaise(actor, { setting: 'the-persons-look', field: "the person's look and own themes", before: null, after: null, workspaceId: workspaceOf(req) })
      }
      return { themes, underTheGrant: may === 'the grant' ? (actor.elevation?.id ?? null) : null }
    })()
  })
}
