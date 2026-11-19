// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHO IS REMINDED ABOUT EACH PROJECT'S MODULES: SET ON THE SETTINGS PAGE, OR BY THE .ENV LINE. Wave 13p round 29, on
 * decision aZGg6gerakM1.
 *
 *   GET  /api/office/module-reminder-secretaries            every project, who is reminded, and where that came from
 *   POST /api/office/module-reminder-secretaries/:project   set one project's secretary here, or set nothing here
 *
 * Both halves are remote: the setting belongs to the office, so it may be read and changed from any machine the
 * office is opened on. What keeps the write in the right hands is the actor clause below, not the machine.
 *
 * THE DOOR CHECKS EVERYTHING BEFORE IT WRITES ANYTHING. Who is asking is checked first, then the body and the reason,
 * then whether the agent qualifies, and only then are the two columns written.
 */
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'

import { gatePosition } from '../../config/settings.mjs'
import { gateMet } from '../lib/gate-counts.ts'
import { actorFrom } from '../lib/http.ts'
import { parse } from '../lib/parse.ts'
import {
  setTheModuleReminderSecretary,
  theModuleReminderSecretaries,
  type TheModuleReminderSecretaries,
} from '../lib/module-reminder-secretaries.ts'
import { theAgentAnArrivingReferenceNames } from '../lib/the-agent-an-arriving-reference-names.ts'
import { theKeyProvesASecretary } from '../lib/the-key-proves-a-secretary.ts'
import { writeDownASettingChange, type Actor } from '../lib/records.ts'
import { thePersonIsProved } from '@shared/the-person-proved.ts'
import { PanelError } from '../lib/panel-error.ts'
import { route } from '../lib/route.ts'
import { anAgentItsOwnKeyProves, refusedWhileTheGateIsOff } from '../lib/who-may-act.ts'
import { whoMayDoThePersonsActsHere } from '../lib/worldauthority.ts'

const READ_NOTE =
  "Who is reminded about each project's modules left unchanged for 14 days, and where that came from. Read only, and " +
  'no body is read. The reply is {projects, envLine, envNamesUnknownProjects, mayBeChosen}. Each project carries ' +
  'inForce.from: "set here" (chosen on the Settings page), "set here, cannot remind" (the agent chosen here is not ' +
  'registered, retired, or not a secretary; nobody is reminded and the .env line is not used instead), "from the .env ' +
  'line" (nothing is set here, and MOLE_OFFICE_MODULE_REMINDER_SECRETARIES names a handle), ".env line unreadable" or ' +
  '"nobody named". envLine is {readable: true, named} or {readable: false, why}; a line that cannot be read is said ' +
  'here, not thrown. The reminder check reads this same reading.'

const SET_NOTE =
  'Set the secretary reminded about one project\'s modules. Body {secretary: "<handle or id>" | null, because: ' +
  '"<why>"}; null sets nothing here, and the .env line counts again for the project. The owner may, with or without a ' +
  'reason. A secretary proved by its own key may, and must give a reason. Any other agent is refused, except that while the ' +
  'gate who-names-the-module-reminder-secretary is off any agent proved by its own key may, with a reason, and is ' +
  'counted. The agent ' +
  'chosen must be registered, not retired, and hold the secretary card. Every change is kept with who, when and why ' +
  '(the newest is in GET /api/office/setting-changes, as module-reminder-secretaries). The reply is the reading as it now stands.'

/** What a caller may send: one secretary or nothing, and a reason. */
const setBody = z.strictObject({
  secretary: z.string().trim().min(1).nullable(),
  because: z.string().optional(),
})

/**
 * THE OWNER, OR A SECRETARY WITH A REASON, MAY CHOOSE WHO IS REMINDED. Decision aZGg6gerakM1: the coordinator fills
 * it, and the coordinator is a secretary. Any other agent may read the setting and may file a proposal about it.
 *
 * The answer is whether a reason is required: the owner's press needs none, a secretary's change does.
 *
 * While the gate who-names-the-module-reminder-secretary is off, any agent its own key proves may choose too, with a
 * reason, and the gate counts it.
 */
function whoMayChooseTheModuleReminderSecretary(actor: Actor): { reasonRequired: boolean } {
  if (thePersonIsProved(actor)) return { reasonRequired: false }
  if (actor.theOwnersAuthority?.holds === true) return { reasonRequired: false }
  if (theKeyProvesASecretary(actor)) return { reasonRequired: true }
  const keyed = anAgentItsOwnKeyProves(actor) !== null
  if (!keyed && gatePosition('who-names-the-module-reminder-secretary') !== 'block') throw refusedWhileTheGateIsOff(actor.id, 'who-names-the-module-reminder-secretary', 'choose who is reminded about a project\'s modules')
  if (keyed && gateMet('who-names-the-module-reminder-secretary') !== 'block') return { reasonRequired: true }
  const inAWorld = whoMayDoThePersonsActsHere()
  throw new PanelError(
    `Who is reminded about a project's modules is set by the owner or by a secretary with a reason, and this request ` +
      `was made by "${actor.id}", which is neither. Nothing was changed. ` +
      (inAWorld === null ? '' : `${inAWorld} `) +
      'A secretary is proved by its own key. Any agent may read the setting and may file a proposal about it.',
    403,
    undefined,
    undefined,
    undefined,
    { code: 'moduleReminderSecretaryNotAllowed', values: {} },
  )
}

/** One project's stored choice, as the change log keeps it. */
function theStoredChoice(reading: TheModuleReminderSecretaries, project: string): { secretary: string | null; because: string | null } {
  const row = reading.projects.find((one) => one.project === project)
  return { secretary: row?.storedHere ?? null, because: row?.because ?? null }
}

export async function moduleReminderSecretaryRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    '/office/module-reminder-secretaries',
    route('office.module-reminder-secretaries', 'remote', READ_NOTE),
    async (): Promise<TheModuleReminderSecretaries> => theModuleReminderSecretaries(),
  )

  app.post(
    '/office/module-reminder-secretaries/:project',
    route('office.set-module-reminder-secretary', 'remote', SET_NOTE),
    async (req): Promise<TheModuleReminderSecretaries> => {
      const actor = actorFrom(req)
      const { reasonRequired } = whoMayChooseTheModuleReminderSecretary(actor)
      const { project } = parse(z.object({ project: z.string().min(1) }), req.params, 'The project')
      const body = parse(setBody, req.body ?? {}, 'The secretary reminded about modules')
      const because = body.because?.trim() ? body.because.trim() : null
      if (reasonRequired && because === null) {
        throw new PanelError(
          "A secretary who changes who is reminded about a project's modules gives a reason, in \"because\". Nothing " +
            'was changed.',
          400,
          undefined,
          undefined,
          undefined,
          { code: 'moduleReminderSecretaryNeedsAReason', values: {} },
        )
      }
      // THE AGENT MAY BE NAMED BY ITS ID OR ITS HANDLE. The one resolver says which agent it is, and the setting
      // stores its registry id. A name nobody bears is refused here, before anything.
      let id: string | null = null
      if (body.secretary !== null) {
        const found = theAgentAnArrivingReferenceNames(body.secretary, 'writing')
        if (found === null) {
          throw new PanelError(
            `No agent here answers to "${body.secretary}", so it cannot be reminded about modules. ` +
              'GET /api/office/module-reminder-secretaries lists the secretaries that may. Nothing was changed.',
            400,
            undefined,
            undefined,
            undefined,
            { code: 'moduleReminderSecretaryNoSuchAgent', values: {} },
          )
        }
        id = found.agent.id
      }
      const before = theModuleReminderSecretaries()
      const after = setTheModuleReminderSecretary(project, id, because)
      // WHAT WAS CHOSEN AND WHY: the stored id, or null for nothing set here, and the reason given.
      writeDownASettingChange(actor, {
        setting: 'module-reminder-secretaries',
        field: `the secretary reminded about the modules of ${project}`,
        before: theStoredChoice(before, project),
        after: theStoredChoice(after, project),
        workspaceId: project,
      })
      return after
    },
  )
}
