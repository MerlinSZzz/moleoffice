// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE GOAL SPANS: THE THREE NUMBERS, AND WHY DISTANT IS NOT AMONG THEM. Criterion P1.
 *
 *   GET  /api/office/goal-spans   what is in force for short, medium and long
 *   POST /api/office/goal-spans   the person sets one or more of the three numbers
 *
 * ---------------------------------------------------------------------------------------
 * WHY BOTH ARE REMOTE
 * ---------------------------------------------------------------------------------------
 *
 * The numbers belong to the office and follow it, so the person may read and set them from whatever
 * machine they open Mole Office from. What keeps the write theirs is the actor clause below: an agent is
 * refused and the refusal says who may, unless it is a secretary holding the person's grant and this
 * office's list of what the grant carries lets the grant press it. This names no folder and touches
 * no process, so it is not one of the acts that must happen on this computer.
 *
 * ---------------------------------------------------------------------------------------
 * THE READ DOES NOT THROW ON A BAD VALUE, AND THE WRITE DOES NOT GUESS
 * ---------------------------------------------------------------------------------------
 *
 * `theGoalSpans` carries a present-but-unreadable number as a refusal in the reading, so the section
 * can say which setting it was while the other numbers stay readable. A reader that cannot continue
 * without the value — one deciding whether a goal is inside its horizon — calls `theGoalSpanInForce`,
 * which throws. Nothing here substitutes a default for a value somebody wrote and cannot be read.
 */
import type { FastifyInstance, FastifyRequest } from 'fastify'
import { z } from 'zod'

import {
  GOAL_SPAN_HIGHEST,
  GOAL_SPAN_LOWEST,
  type TheGoalSpans,
} from '@shared/goal-spans.ts'
import { gatePosition } from '../../config/settings.mjs'
import { gateMet } from '../lib/gate-counts.ts'
import { actorFrom } from '../lib/http.ts'
import { parse } from '../lib/parse.ts'
import {
  aRaiseCarriesIt,
  writeDownASettingChange,
  writeDownAnActUnderTheRaise,
  type Actor,
} from '../lib/records.ts'
import { thePersonIsProved } from '@shared/the-person-proved.ts'
import { PanelError } from '../lib/panel-error.ts'
import { workspaceOf } from '../lib/workspaces.ts'
import { route } from '../lib/route.ts'
import { setTheGoalSpans, theGoalSpans } from '../lib/goal-spans.ts'
// THE REFUSAL FOR A REQUEST NOT PROVED TO BE THE PERSON, written in one place for every door that keeps
// an act for them. In a test world it also names who may act there (criterion P84).
import { theRefusalForSomebodyNotProvedThePerson, whatThisRequestShowed } from '../lib/not-proved-the-person.ts'
import { anAgentItsOwnKeyProves, refusedWhileTheGateIsOff } from '../lib/who-may-act.ts'

const READ_NOTE =
  'How far out a short, a medium and a long goal reach, as three numbers of days. Read only, and no body is ' +
  'read. A number nobody has chosen is drawn with the default and the sentence saying nobody chose; a number ' +
  'that is stored and cannot be read is drawn as a refusal naming it, never as a default. A distant goal has ' +
  'no time limit, so there is no fourth number here and the reply says why.'

const SET_NOTE =
  'Set one or more of the three goal spans. Body {"shortGoalDays"?: number, "mediumGoalDays"?: number, ' +
  '"longGoalDays"?: number}, each a whole number of days from 1 to 100000, or null to take the choice away and ' +
  'return it to nobody-having-chosen. Only the keys the body names are written. This is the owner\'s own act. ' +
  'A secretary holding the owner\'s grant may press it where this office\'s list of what the grant carries ' +
  'says so; any other agent is refused and the refusal names who may. While the gate who-changes-the-owners-settings ' +
  'is off, any agent proved by its own key may also press it, and is counted, and a change it makes is written down ' +
  'with its name. The reply is the whole reading as it now stands.'

/** The three numbers a person may set. Only the keys the body names are written. */
const setBody = z
  .strictObject({
    shortGoalDays: z.number().int().min(GOAL_SPAN_LOWEST).max(GOAL_SPAN_HIGHEST).nullable().optional(),
    mediumGoalDays: z.number().int().min(GOAL_SPAN_LOWEST).max(GOAL_SPAN_HIGHEST).nullable().optional(),
    longGoalDays: z.number().int().min(GOAL_SPAN_LOWEST).max(GOAL_SPAN_HIGHEST).nullable().optional(),
  })
  .refine((body) => Object.keys(body).length > 0, {
    message: 'name at least one of the three goal spans to set; an empty body would change nothing.',
  })

/**
 * ONLY THE PERSON, OR WHOEVER HOLDS THEIR AUTHORITY IN A TEST WORLD, MAY CHANGE THE GOAL SPANS.
 *
 * The same clause the key window's close and the settings presses ask. Its own sentence here, because
 * this act is not about a credential and a refusal that talked about one would send the reader to the
 * wrong place. An agent may read the spans and may file a proposal about them; it may not decide how
 * far out a goal has to be.
 *
 * The answer is whether the gate who-changes-the-owners-settings let the caller through at off, so the change is
 * written down with that agent's name.
 */
function onlyThePersonMayChangeTheGoalSpans(actor: Actor, req: FastifyRequest): boolean {
  if (thePersonIsProved(actor)) return false
  if (actor.theOwnersAuthority?.holds === true) return false
  // AND A SECRETARY THE PERSON HAS RAISED. A raised secretary holds the person's acts but a few, and this
  // is not one of them. Asked last, so the grant is named on the act only when
  // nothing else allowed it.
  // THE GATE IS READ BEFORE THE RAISE IS ASKED. At off the gate who-changes-the-owners-settings lets any agent its own
  // key proves change the spans too, and counts it, and the raise is not asked. At block the raise is asked as before,
  // and a change it carries is not counted.
  const position = gatePosition('who-changes-the-owners-settings')
  if (position === 'block' && aRaiseCarriesIt(actor)) return false
  const keyed = anAgentItsOwnKeyProves(actor) !== null
  if (keyed && gateMet('who-changes-the-owners-settings', position!) !== 'block') return true
  if (!keyed && position !== 'block') throw refusedWhileTheGateIsOff(actor.id, 'who-changes-the-owners-settings', 'change the goal spans')
  // THE WORDS ARE WRITTEN IN ONE PLACE, lib/not-proved-the-person.ts, from the facts of this request:
  // why it is not the person and the way on for its kind of caller, and in a test world who may act there.
  throw new PanelError(
    theRefusalForSomebodyNotProvedThePerson(whatThisRequestShowed(actor, req), {
      refused: "The goal spans are the owner's own setting",
      nothingWasDone: 'Nothing was changed.',
      whoMay:
        'The owner sets these numbers on the Settings page. An agent may read them and may file a proposal about ' +
        'them; it may not decide how many days short, medium and long reach.',
    }),
    403,
  )
}

export async function goalSpanRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    '/office/goal-spans',
    route('office.goal-spans', 'remote', READ_NOTE),
    async (): Promise<TheGoalSpans> => theGoalSpans(),
  )

  app.post(
    '/office/goal-spans',
    route('office.set-goal-spans', 'remote', SET_NOTE),
    async (req): Promise<TheGoalSpans> => {
      const actor = actorFrom(req)
      const byTheGate = onlyThePersonMayChangeTheGoalSpans(actor, req)
      const body = parse(setBody, req.body ?? {}, 'What the goal spans should be')
      const before = theGoalSpans()
      const after = setTheGoalSpans(body)
      // An agent the gate let through at off is written down by name, as the change log names any change.
      ;(byTheGate ? writeDownASettingChange : writeDownAnActUnderTheRaise)(actor, {
        setting: 'goal-spans',
        field: 'the goal spans',
        before,
        after,
        workspaceId: workspaceOf(req),
      })
      return after
    },
  )
}
