// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE DEAD LETTERS OVER HTTP.
 *
 *   GET  /api/dead-letters           every dead letter now, grouped by addressee, with the claims
 *   POST /api/dead-letters/sweep     handle a retired addressee's letters, check the threshold, write one line
 *   POST /api/dead-letters/claims    a secretary claims one addressee's letters, once
 *
 * Criterion M111 of design/messages/ACCEPTANCE.md, the person's words of 11 September 2026, about
 * 13:30: a wild message (one that reaches nobody) is kept as a dead letter, and after a time or a count
 * the secretaries are told and each claims the ones that are its to handle. Since problem 0WUuvB0IhRfb
 * the office also handles a retired addressee's letters itself, and a sweep writes one line, delivered
 * only to the secretary the person named. THE RULES ARE IN src/server/lib/deadletters.ts, beside the
 * refusals that name them; nothing here repeats one.
 */

import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import type { ParticipantRef } from '@shared/participants.ts'
import { actorFrom, takesNoInput } from '../lib/http.ts'
import { parse } from '../lib/parse.ts'
import { route } from '../lib/route.ts'
import { theMessageReader, theMessagesThisReaderMayRead } from '../lib/messages.ts'
import { type Actor } from '../lib/records.ts'
import { PanelError } from '../lib/panel-error.ts'
import { participantForActor } from '../lib/participant-for-actor.ts'
import { theAgentAnArrivingReferenceNames } from '../lib/the-agent-an-arriving-reference-names.ts'
import {
  claimDeadLetters,
  deadLetterAddressees,
  deadLetterClaimsIn,
  deadLettersNow,
  sweepDeadLetters,
} from '../lib/deadletters.ts'

// ============================================================================ the sentences

// The threshold defaults these sentences name, one day and more than twenty letters, are
// owner-decided, in a decision that replaced criterion M111's example. The same
// decision has a person's letter to a retired agent go on at once.
const LIST_NOTE =
  'EVERY DEAD LETTER RIGHT NOW, across every project, grouped by addressee, with the broadcast ' +
  'claims. A dead letter is a message still marked queued for an agent that the office\'s own presence ' +
  'reading says cannot receive it, unless a session record says running or has output within the ' +
  'session idle window. Nothing here is a second store: the letter is its delivery row, and `at` ' +
  'on it is when it was queued. After a time or a count — settings, with defaults — ' +
  'the sweep names each addressee once in its line in the Secretariat group, and any secretary may claim ' +
  'per addressee, once. Until claimed, a dead letter costs the worker nothing on a pass. Writes nothing.'

const SWEEP_NOTE =
  'HANDLE A RETIRED ADDRESSEE\'S LETTERS, CHECK THE DEAD-LETTER THRESHOLD, AND WRITE ONE LINE. Takes no ' +
  'body: the rules are this office\'s own. The one write of the dead-letter machinery, and it writes nothing ' +
  'when there is nothing new to say. First, each queued letter to a retired agent: a notice from Mole Office ' +
  'is marked archived; an agent\'s letter is routed to the first starter up the chain who can be reached, or to ' +
  'the secretary named to take the dead letters where that chain ends at the person, and each receiver is sent ONE ' +
  'message per sweep that lists its letters, never one message per letter; a letter from the person ' +
  'is given to that secretary; with nobody named, such a letter waits. Then the threshold, over every other ' +
  'dead letter: after a time or a count — MOLE_OFFICE_DEAD_LETTER_AFTER_DAYS, default one day, or ' +
  'MOLE_OFFICE_DEAD_LETTER_AFTER_COUNT, default more than twenty — measured against letters whose addressee has ' +
  'never been named; each addressee past it is named once in dead_letter_claims. Then ONE line in the ' +
  'Secretariat group with every count in its full sentence, delivered only to the secretary named at ' +
  'GET /api/office/dead-letter-secretary, or to nobody, which the line says. The worker presses this once a ' +
  'pass, and a person may press it by hand; every press sweeps. The server also sweeps on its own, whatever ' +
  'the worker\'s mode, once five minutes have passed since the last sweep. The reply says what it did and why.'

const CLAIM_NOTE =
  'A SECRETARY CLAIMS ONE ADDRESSEE\'S DEAD LETTERS, per addressee and once. Takes {agentId, because}. ' +
  'ONLY A REGISTERED, UN-RETIRED SECRETARY MAY CLAIM — the person\'s words have secretaries ' +
  'claim, and nothing here widens that. A second claim is refused with who claimed it and when. The ' +
  'letters themselves are message_delivery rows and are not moved by a claim; the claim says who has ' +
  'taken the addressee on.'

// ============================================================================ what a caller sends

const claimBody = z.object({
  agentId: z.string().min(1),
  because: z.string().max(500).default(''),
})

/**
 * Who is asking, as a participant, or a refusal saying how to become one. A claim is an act by a
 * participant in a registry, not by a caller the registries do not hold.
 */
function participantOrARefusal(req: Parameters<typeof actorFrom>[0]): ParticipantRef {
  const actor = actorFrom(req)
  const me = participantForActor(actor)
  if (me === null) {
    throw new PanelError(
      `Nothing in either registry answers to the ${actor.type} "${actor.id}", so there is nobody here to ` +
        'claim as. GET /api/participants lists every person and every durable agent, with the id of each.',
      403,
    )
  }
  return me
}

// ============================================================================ the routes

export async function deadLetterRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    '/dead-letters',
    route('dead-letters.list', 'remote', LIST_NOTE),
    async (req) => {
      // ONLY THE LETTERS THE CALLER MAY READ are listed or counted. A secretary, who
      // claims them, reads every one; an agent that is no secretary sees only letters it is a party to.
      const every = deadLettersNow()
      const mayRead = theMessagesThisReaderMayRead(theMessageReader(actorFrom(req)), every.map((one) => one.messageId))
      const letters = every.filter((one) => mayRead.has(one.messageId))
      const addressees = deadLetterAddressees(letters)
      return {
        letters,
        addressees,
        claims: deadLetterClaimsIn(),
        note:
          letters.length === 0
            ? 'No queued message meets the dead-letter rules.'
            : `${String(letters.length)} dead ${letters.length === 1 ? 'letter' : 'letters'} for ` +
              `${String(addressees.length)} addressee(s), across every project.`,
      }
    },
  )

  app.post(
    '/dead-letters/sweep',
    route('dead-letters.sweep', 'local', { because: 'acts-on-this-machine', act: 'Handling the dead letters and writing the sweep\'s one line' }, SWEEP_NOTE),
    async (req) => {
      takesNoInput(req, 'POST /api/dead-letters/sweep', 'It takes nothing: the threshold and the broadcast are the office\'s own.')
      // THE SWEEP IS PRESSED BY THE CALLER AND WRITTEN AS THE OFFICE. The change log names who made
      // the write happen; the sweep's one line names Mole Office as the speaker, which is what M105 is
      // for. The worker presses it with its own actor on every pass.
      return sweepDeadLetters(actorFrom(req))
    },
  )

  app.post(
    '/dead-letters/claims',
    route('dead-letters.claim', 'remote', CLAIM_NOTE),
    async (req) => {
      const body = parse(claimBody, req.body, 'This is not usable:')
      const me = participantOrARefusal(req)
      // THE ADDRESSEE MAY BE NAMED BY ITS ID OR ITS HANDLE, criterion I2. The one resolver says which
      // agent it is, and a claim is stored under its registry id. A name nobody bears is passed on as
      // it is, and the library answers that no claim is waiting for it.
      const found = theAgentAnArrivingReferenceNames(body.agentId, 'writing')
      return { claim: claimDeadLetters(found === null ? body.agentId : found.agent.id, me, body.because) }
    },
  )
}
