// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE SECRETARY WHO TAKES THE DEAD LETTERS: ONE AGENT, NAMED BY THE PERSON. Problem 0WUuvB0IhRfb, with
 * the secretary's answers I24sT059xQlk and UEmOvQ6-ptyJ.
 *
 *   GET  /api/office/dead-letter-secretary   who takes the dead letters, or why nobody does
 *   POST /api/office/dead-letter-secretary   the person names one agent, or names nobody
 *
 * Built like the inject switch (src/server/api/inject-setting.ts). Both halves are remote: the setting
 * belongs to the office, so the person may read and change it from any machine they open Mole Office
 * on. What keeps the write theirs is the actor clause below, not the machine.
 *
 * THE DOOR CHECKS EVERYTHING BEFORE IT WRITES ANYTHING. Who is asking is checked first, then the body,
 * then whether the agent qualifies, and only then is the one column written.
 */
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'

import { gatePosition } from '../../config/settings.mjs'
import { gateMet } from '../lib/gate-counts.ts'
import { actorFrom } from '../lib/http.ts'
import { parse } from '../lib/parse.ts'
import { lettersFromThePersonWaitingForASecretary } from '../lib/deadletters.ts'
import { setTheDeadLetterSecretary, theDeadLetterSecretary, type TheDeadLetterSecretary } from '../lib/dead-letter-secretary.ts'
import { theAgentAnArrivingReferenceNames } from '../lib/the-agent-an-arriving-reference-names.ts'
import { aRaiseCarriesIt, writeDownASettingChange, type Actor } from '../lib/records.ts'
import { thePersonIsProved } from '@shared/the-person-proved.ts'
import { PanelError } from '../lib/panel-error.ts'
import { workspaceOf } from '../lib/workspaces.ts'
import { route } from '../lib/route.ts'
import { anAgentItsOwnKeyProves, refusedWhileTheGateIsOff } from '../lib/who-may-act.ts'
import { whoMayDoThePersonsActsHere } from '../lib/worldauthority.ts'

const READ_NOTE =
  'Who takes the dead letters: the one agent the dead-letter sweep delivers its line to, and gives a letter from the ' +
  'person to a retired agent. Kept on the office\'s installation row. Read only, and no body is read. The reply is ' +
  '{named, nobodyBecause, stored, storedName, act, says, mayBeNamed, lettersFromThePersonWaiting}. named is null when ' +
  'nobody qualifies, and nobodyBecause says why: "nobody chose", "not registered", "retired" or "no act". It never ' +
  'falls back to every secretary. lettersFromThePersonWaiting counts the letters from the person that wait because ' +
  'nobody is named.'

const SET_NOTE =
  'Name the agent who takes the dead letters. Body {"agent": "<handle or id>" | null}; null names nobody. The agent ' +
  'must be registered, not retired, and hold the dead-letter act on its card. This is the owner\'s own act: an agent ' +
  'is refused and the refusal names who may. While the gate who-names-the-dead-letter-secretary is off, any agent ' +
  'proved by its own key may also name it, and is counted. The reply is the reading as it now stands.'

/** The one value a person may set. */
const setBody = z.strictObject({ agent: z.string().trim().min(1).nullable() })

/** The reading, and how many of the person's letters wait because nobody is named. */
export interface TheDeadLetterSecretaryReply extends TheDeadLetterSecretary {
  lettersFromThePersonWaiting: number
}

function theReply(reading: TheDeadLetterSecretary): TheDeadLetterSecretaryReply {
  return { ...reading, lettersFromThePersonWaiting: lettersFromThePersonWaitingForASecretary().length }
}

/**
 * ONLY THE PERSON, OR WHOEVER HOLDS THE PERSON'S AUTHORITY IN A TEST WORLD, MAY NAME THE SECRETARY.
 *
 * The same clause the inject switch asks, with its own sentence so the refusal says what this act is.
 * An agent may read the setting and may file a proposal about it; it may not choose who takes the dead
 * letters, because that would widen what a secretary may do.
 */
function onlyThePersonMayNameTheSecretary(actor: Actor): void {
  if (thePersonIsProved(actor)) return
  if (actor.theOwnersAuthority?.holds === true) return
  // AND A SECRETARY THE PERSON HAS RAISED. A raised secretary holds the person's acts but a few, and this is
  // not one of them. Asked last, so the grant is named on the act only when nothing
  // else allowed it.
  // THE GATE IS READ BEFORE THE RAISE IS ASKED. At off the gate who-names-the-dead-letter-secretary lets any agent its
  // own key proves name the secretary, so the raise is not asked and the gate counts that agent. At block the raise is
  // asked as before, and a change it carries is not counted.
  const position = gatePosition('who-names-the-dead-letter-secretary')
  if (position === 'block' && aRaiseCarriesIt(actor)) return
  const keyed = anAgentItsOwnKeyProves(actor) !== null
  if (keyed && gateMet('who-names-the-dead-letter-secretary', position!) !== 'block') return
  if (!keyed && position !== 'block') throw refusedWhileTheGateIsOff(actor.id, 'who-names-the-dead-letter-secretary', 'name who takes the dead letters')
  const inAWorld = whoMayDoThePersonsActsHere()
  throw new PanelError(
    `Who takes the dead letters is the owner's own setting, and this request was made by "${actor.id}", which is ` +
      'not the owner. Nothing was changed. ' +
      (inAWorld === null ? '' : `${inAWorld} `) +
      'The owner names the secretary on the Settings page. An agent may read it and may file a proposal about it; ' +
      'it may not choose who takes the dead letters.',
    403,
    undefined,
    undefined,
    undefined,
    { code: 'deadLetterSecretaryOwnerNotProved', values: {} },
  )
}

export async function deadLetterSecretaryRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    '/office/dead-letter-secretary',
    route('office.dead-letter-secretary', 'remote', READ_NOTE),
    async (): Promise<TheDeadLetterSecretaryReply> => theReply(theDeadLetterSecretary()),
  )

  app.post(
    '/office/dead-letter-secretary',
    route('office.set-dead-letter-secretary', 'remote', SET_NOTE),
    async (req): Promise<TheDeadLetterSecretaryReply> => {
      const actor = actorFrom(req)
      onlyThePersonMayNameTheSecretary(actor)
      const body = parse(setBody, req.body ?? {}, 'The secretary who takes the dead letters')
      // THE AGENT MAY BE NAMED BY ITS ID OR ITS HANDLE, criterion I2. The one resolver says which agent it
      // is, and the setting stores its registry id. A name nobody bears is refused here, before anything.
      let id: string | null = null
      if (body.agent !== null) {
        const found = theAgentAnArrivingReferenceNames(body.agent, 'writing')
        if (found === null) {
          throw new PanelError(
            `No agent here answers to "${body.agent}", so it cannot take the dead letters. ` +
              'GET /api/office/dead-letter-secretary lists the agents that may. Nothing was changed.',
            400,
            undefined,
            undefined,
            undefined,
            { code: 'deadLetterSecretaryNoSuchAgent', values: {} },
          )
        }
        id = found.agent.id
      }
      const before = theDeadLetterSecretary()
      const after = setTheDeadLetterSecretary(id)
      // WHAT WAS CHOSEN: the stored id, or null for nobody (problem 4f6oWJdzJbnk keeps every change).
      writeDownASettingChange(actor, {
        setting: 'dead-letter-secretary',
        field: 'the secretary who takes the dead letters',
        before: before.stored,
        after: after.stored,
        workspaceId: workspaceOf(req),
      })
      return theReply(after)
    },
  )
}
