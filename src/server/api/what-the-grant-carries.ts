// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHAT THE PERSON'S GRANT CARRIES IN THIS OFFICE: THE READ DOOR AND THE WRITE DOOR. Wave 13s round 2a.
 *
 *   GET  /api/office/what-the-grant-carries   every door the list names, the card's answer and this office's  (anyone who may read)
 *   POST /api/office/what-the-grant-carries   the person changes the answer about some doors                  (the person or a secretary on their words)
 *
 * src/shared/what-the-grant-carries.ts says what the list is, and src/server/lib/what-the-grant-carries.ts is the one
 * reader and writer of its table. This file checks who asks and what they ask for, and writes each change down in the
 * office's change log, on the same `setting:` row every other setting uses.
 *
 * THE PERSON CHANGES THE LIST BY THEIR OWN PRESS. A secretary using its own key may also change it with the person's
 * written words naming every door and answer in this one change, in the order sent. The grant alone never changes
 * its own list. A signed package item never changes it. An agent may also ask the person with a request for one press,
 * "change-what-the-grant-carries" (lib/one-press.ts); agreeing remains the person's own press.
 */
import type { FastifyInstance, FastifyRequest } from 'fastify'

import { type WhatTheGrantCarriesAfterAChange, type WhatTheGrantCarriesReading } from '@shared/what-the-grant-carries.ts'
import {
  THE_CHANGES_TO_THE_LIST,
  aChangeFromNowInWords,
  aChangeInWords,
  changeWhatTheGrantCarries,
  theChangesAreRight,
  type AChangeAsked,
} from '../lib/changing-what-the-grant-carries.ts'
import { actorFrom, actorWithTheWordsItActsOn, theWordsInTheBody } from '../lib/http.ts'
import { parse } from '../lib/parse.ts'
import { theRefusalForSomebodyNotProvedThePerson, whatThisRequestShowed } from '../lib/not-proved-the-person.ts'
import { thePersonPressedItThemselves, type Actor } from '../lib/records.ts'
import { theWordsAllowThis } from '@shared/the-person-proved.ts'
import { PanelError } from '../lib/panel-error.ts'
import { route } from '../lib/route.ts'
import { theListAsItStands } from '../lib/what-the-grant-carries.ts'
import { workspaceOf } from '../lib/workspaces.ts'
import { warrantBody } from './records.ts'
import { aSecretaryWithItsOwnKey } from './runtime-settings.ts'

const READ_NOTE =
  "What the person's grant carries in this office: every door the list names, in the order the list gives them. Each " +
  'door has its words in English and Chinese, the card\'s answer (kept, ask-first or may-press), this office\'s answer ' +
  'with who set it and when (null where the card\'s stands), the answer in force, and asksTheCheck, which is false for a ' +
  'door that answers in its own code before any list is read, whatever its answer: most such doors refuse everybody ' +
  'but the person, and office.restart also lets in an agent with its own live restart grant. alsoNeedsThePersonsWords ' +
  "is true for a door that also needs the person's words, so the grant alone does not press every change it makes: " +
  'office.name-owner and office.set-restart-grant need them for every change; role.set-added and role.restore-added need them only for a ' +
  "change to a card's words, so where the list lets the grant press them it presses a change that leaves the words as " +
  'they are; and a door the card asks first about while the answer in force is ask-first too needs them for every ' +
  'change. counts says how many doors ' +
  'have each answer in force. stale lists rows left for doors the list no longer names: the check never reads them, and ' +
  'the person may remove each. refusal is null for the person, and otherwise the words the write door refuses without ' +
  "words. A secretary using its own key may change the list with the person's written words naming this change. Takes no body."

const SET_NOTE =
  'The person changes the answer about one or more doors. Body {"changes": [{"door": a door the list names, ' +
  '"answer": "kept", "ask-first", "may-press" or "default"}], "warrant"?: warrant}. "default" removes this office\'s answer, so the card\'s ' +
  'stands; it is also how a stale row is removed. Every change is checked before anything is written, and each door is ' +
  "asked about once. The person may press themselves. A secretary using its own key may also change it with the person's " +
  'written words bound to office.set-what-the-grant-carries: plus JSON of the parsed changes in the order sent. The grant ' +
  'alone never changes its own list. The changes are written in one step and kept in the change log. The reply is the list as it now ' +
  'stands, and changed gives each door\'s answer before and after (null for the card\'s).'

// A CHANGE ASKED, ITS WORDS, ITS CHECK AND ITS WRITE are in src/server/lib/changing-what-the-grant-carries.ts, so the request
// for one press need not import this door. Each is exported from here under the same name.
export { THE_CHANGES_TO_THE_LIST, aChangeFromNowInWords, aChangeInWords, changeWhatTheGrantCarries, theChangesAreRight }
export type { AChangeAsked }

/** The write door alone takes a warrant; a request for one press keeps only its own inputs. */
const changeBody = THE_CHANGES_TO_THE_LIST.extend({ warrant: warrantBody.optional() })

/** The list as it stands, with the refusal this caller would get from the write door. */
function whatTheGrantCarriesNow(refusal: string | null): WhatTheGrantCarriesReading {
  return { ...theListAsItStands(), refusal }
}

/** The sentence every refusal of a change to the list ends with: who may make one, and what an agent may do instead. */
export const ONLY_THE_PERSON_CHANGES_THE_LIST =
  "The person changes what their grant carries on the secretary's page, pressing it themselves. A secretary using " +
  "its own key may also change it with the person's written words naming this change. The grant alone never changes " +
  'its own list. An agent may read the list, and may ask the person to change a door with a request for one press, ' +
  '"change-what-the-grant-carries" (POST /api/one-press).'

/**
 * WHY THIS CALLER MAY NOT CHANGE THE LIST, or null when it may. The read answers these words and the write throws them,
 * so the page and the refusal cannot say different things. `pressed` is false for the read, where nothing was asked.
 */
function whyThisCallerMayNotChangeTheList(actor: Actor, req: FastifyRequest, pressed: boolean): string | null {
  if (thePersonPressedItThemselves(actor)) return null
  return theRefusalForSomebodyNotProvedThePerson(whatThisRequestShowed(actor, req), {
    refused: "Changing what the person's grant carries is the person's own act",
    nothingWasDone: pressed ? 'Nothing was changed.' : null,
    whoMay: ONLY_THE_PERSON_CHANGES_THE_LIST,
  })
}

export async function whatTheGrantCarriesRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    '/office/what-the-grant-carries',
    route('office.what-the-grant-carries', 'remote', READ_NOTE),
    async (req): Promise<WhatTheGrantCarriesReading> => whatTheGrantCarriesNow(whyThisCallerMayNotChangeTheList(actorFrom(req), req, false)),
  )

  app.post(
    '/office/what-the-grant-carries',
    route('office.set-what-the-grant-carries', 'remote', SET_NOTE),
    async (req): Promise<WhatTheGrantCarriesAfterAChange> => {
      let actor = actorFrom(req)
      const warrant = theWordsInTheBody(req)
      const refusal = whyThisCallerMayNotChangeTheList(actor, req, true)
      if (refusal !== null && (warrant === undefined || !aSecretaryWithItsOwnKey(actor))) throw new PanelError(refusal, 403)
      const body = parse(changeBody, req.body ?? {}, 'The changes to what the grant carries:')
      const changes = body.changes
      if (warrant !== undefined) {
        actor = actorWithTheWordsItActsOn(req, warrant, `office.set-what-the-grant-carries:${JSON.stringify(changes)}`)
      }
      if (refusal !== null && !(actor.signedItem === undefined && theWordsAllowThis(actor))) throw new PanelError(refusal, 403)
      theChangesAreRight(changes, (words) => new PanelError(`${words} Nothing was changed.`, 400))
      const changed = changeWhatTheGrantCarries(changes, actor, workspaceOf(req))
      return { ...whatTheGrantCarriesNow(null), changed }
    },
  )
}
