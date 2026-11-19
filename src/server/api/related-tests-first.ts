// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHETHER THE MERGE TOOL RUNS AN ENTRY'S RELATED TESTS FIRST. This is part B of a decision.
 * It is kept off until it no longer slows anything (message xTBpZSUFC-Qi). Round 17c of wave 13v.
 *
 *   GET  /api/office/related-tests-first   whether it is on, who chose, and the bound on a related file's time
 *   POST /api/office/related-tests-first   switch it on or off
 *
 * Built like the inject switch (src/server/api/inject-setting.ts). Both halves are remote: the setting belongs to the
 * office. The merge tool reads the GET half before it tests an entry.
 *
 * THE DOOR CHECKS EVERYTHING BEFORE IT WRITES ANYTHING. Who is asking is checked first, then the body and the reason,
 * and only then is the one column written.
 */
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'

import { gatePosition } from '../../config/settings.mjs'
import { gateMet } from '../lib/gate-counts.ts'
import { actorFrom } from '../lib/http.ts'
import { parse } from '../lib/parse.ts'
import { theKeyProvesASecretary } from '../lib/the-key-proves-a-secretary.ts'
import { aRaiseCarriesIt, writeDownASettingChange, type Actor } from '../lib/records.ts'
import { thePersonIsProved } from '@shared/the-person-proved.ts'
import { PanelError } from '../lib/panel-error.ts'
import {
  RELATED_TESTS_SLOWER_THAN_SECONDS,
  setWhetherTheRelatedTestsRunFirst,
  whetherTheRelatedTestsRunFirst,
  type RelatedTestsFirst,
} from '../lib/related-tests-first.ts'
import { workspaceOf } from '../lib/workspaces.ts'
import { route } from '../lib/route.ts'
import { anAgentItsOwnKeyProves, refusedWhileTheGateIsOff } from '../lib/who-may-act.ts'
import { whoMayDoThePersonsActsHere } from '../lib/worldauthority.ts'

const READ_NOTE =
  "Whether the merge tool runs an entry's related tests before its whole suite. Kept " +
  "on the office's installation row. Read only, and no body is read. The reply is {on, nobodyChose, " +
  'leaveOutSlowerThanSeconds, says}. nobodyChose is true when nobody has switched it, and then it is off. When on, a ' +
  `related file whose longest recorded time is over leaveOutSlowerThanSeconds (${String(RELATED_TESTS_SLOWER_THAN_SECONDS)}) ` +
  'is left out of the related run and runs in the whole suite. The merge tool asks this same reader.'

const SET_NOTE =
  'Switch the related tests first on or off. Body {"on": true | false | null, "because": "<why>"}; null takes the ' +
  'choice away again, which reads as off. The owner may, with or without a reason. A secretary proved by its own key ' +
  'may, and must give a reason. Any other agent is refused. While the gate who-changes-the-merge-and-check-switches ' +
  'is off, any agent proved by its own key may too, with a reason, and is counted. Every change is kept with who, ' +
  'when and why (the newest ' +
  'is in GET /api/office/setting-changes, as related-tests-first). The reply is the reading as it now stands.'

/** What a caller may send: on, off or nobody's choice, and a reason. */
const setBody = z.strictObject({
  on: z.boolean({ error: 'on is true, false or null.' }).nullable(),
  because: z.string().optional(),
})

/**
 * THE OWNER, OR A SECRETARY WITH A REASON, MAY SWITCH IT. It is not one of the owner's decided numbers, so the secretary
 * card may switch it (round 17c). Any other agent may read it and may file a proposal about it.
 *
 * The answer is whether a reason is required: the owner's press needs none, a secretary's change does.
 */
function whoMaySwitchTheRelatedTestsFirst(actor: Actor): { reasonRequired: boolean } {
  if (thePersonIsProved(actor)) return { reasonRequired: false }
  if (actor.theOwnersAuthority?.holds === true) return { reasonRequired: false }
  if (theKeyProvesASecretary(actor)) return { reasonRequired: true }
  // A SECRETARY THE PERSON HAS RAISED holds the person's acts but a few. Asked last, so the
  // grant is named on the act only when nothing else allowed it.
  // THE GATE IS READ BEFORE THE RAISE IS ASKED. At off the gate who-changes-the-merge-and-check-switches lets any agent
  // its own key proves change it too, with a reason, and counts it, and the raise is not asked. At block the raise is
  // asked as before, and a change it carries is not counted.
  const position = gatePosition('who-changes-the-merge-and-check-switches')
  if (position === 'block' && aRaiseCarriesIt(actor)) return { reasonRequired: false }
  const keyed = anAgentItsOwnKeyProves(actor) !== null
  if (keyed && gateMet('who-changes-the-merge-and-check-switches', position!) !== 'block') return { reasonRequired: true }
  if (!keyed && position !== 'block') throw refusedWhileTheGateIsOff(actor.id, 'who-changes-the-merge-and-check-switches', 'switch whether the related tests run first')
  const inAWorld = whoMayDoThePersonsActsHere()
  throw new PanelError(
    `Whether the related tests run first is switched by the owner or by a secretary with a reason, and this request ` +
      `was made by "${actor.id}", which is neither. Nothing was changed. ` +
      (inAWorld === null ? '' : `${inAWorld} `) +
      'A secretary is proved by its own key. Any agent may read the setting and may file a proposal about it.',
    403,
  )
}

export async function relatedTestsFirstRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    '/office/related-tests-first',
    route('office.related-tests-first', 'remote', READ_NOTE),
    async (): Promise<RelatedTestsFirst> => whetherTheRelatedTestsRunFirst(),
  )

  app.post(
    '/office/related-tests-first',
    route('office.set-related-tests-first', 'remote', SET_NOTE),
    async (req): Promise<RelatedTestsFirst> => {
      const actor = actorFrom(req)
      const { reasonRequired } = whoMaySwitchTheRelatedTestsFirst(actor)
      const body = parse(setBody, req.body ?? {}, 'Whether the related tests run first')
      const because = body.because?.trim() ? body.because.trim() : null
      if (reasonRequired && because === null) {
        throw new PanelError(
          'A secretary who switches whether the related tests run first gives a reason, in "because". Nothing was changed.',
          400,
        )
      }
      const before = whetherTheRelatedTestsRunFirst()
      const after = setWhetherTheRelatedTestsRunFirst(body.on)
      // WHAT WAS CHOSEN, AND WHY: null is nobody having chosen, which reads as off, so a press from nobody's choice to
      // "off" is a change and is written down. The reason goes with the new value.
      const chosen = (reading: RelatedTestsFirst): boolean | null => (reading.nobodyChose ? null : reading.on)
      writeDownASettingChange(actor, {
        setting: 'related-tests-first',
        field: 'whether the related tests run first',
        before: chosen(before),
        after: because === null ? chosen(after) : { on: chosen(after), because },
        workspaceId: workspaceOf(req),
      })
      return after
    },
  )
}
