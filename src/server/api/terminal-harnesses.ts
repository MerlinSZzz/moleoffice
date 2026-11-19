// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE INSTALL PRESS: THE AGENT TOOLS THE OFFICE RUNS, AND ONE TERMINAL THAT INSTALLS THE TICKED ONES. Wave 13u, round 3.
 *
 *   GET  /api/harnesses          each agent tool: installed or not, its version, the newest version
 *        ?part=list              each agent tool as declared, with no program or registry asked
 *   POST /api/harnesses/install  raise or sign a checklist to install the ticked tools
 *
 * The owner's review, at its point 2, asks for one press that installs the ticked harnesses and for
 * a check for upgrades. Which tools there are, their official installers and where their
 * newest versions are read
 * is declared once, in src/server/lib/harnesses.ts.
 *
 * WHAT THE PRESS DOES. It opens one terminal through the terminal holder, as POST /api/terminals does, in the
 * person's home, running /bin/sh with a script made only from the declaration: for each ticked tool, a line saying
 * which installer runs and the page that states it, then that installer, unchanged. At the end the script tells the
 * person to sign in to each program themselves. The person watches it, and can type into it when an installer asks
 * something. Nothing from the request reaches the script but the names of tools, each checked against the
 * declaration before anything opens. No login command runs, and no key is read or passed: the terminal gets the
 * environment every terminal gets (theEnvironmentATerminalGets), which holds no key.
 *
 * WHO. The person, proved as for the terminal doors, or a secretary whose press the grant check allows. This office's
 * list of what the grant carries answers for each door, and the card keeps both for the person by default. An install
 * under the grant raises and signs as the secretary, never as the person. Both doors are kept to this machine.
 *
 * AND EVERY SECRETARY SIGNS FIRST. Wave 13u round 13: a uniform change to the tool every agent runs on reaches
 * everyone, so the press raises a readiness checklist (src/server/lib/readiness.ts). The person's press is the
 * person's signature. A secretary's press under the grant is its own signature, so the person must still sign at
 * the person's own door. The terminal opens when everyone has signed. Until then the door answers 409, naming who has
 * not signed. A waiting press under the grant is written down here because it writes no change row and answers no 2xx.
 */

import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { actorFrom } from '../lib/http.ts'
import { parse } from '../lib/parse.ts'
import { aHarnessRefusal, listTheHarnesses, readTheHarnesses, theHarnessesAsked } from '../lib/harnesses.ts'
import { throughTheReadinessGate } from '../lib/readiness.ts'
import { aRaiseCarriesIt, assertThePersonIsProved, writeDownAPressOutsideTheLog, type Actor } from '../lib/records.ts'
import { thePersonIsProved } from '@shared/the-person-proved.ts'
import { PanelError } from '../lib/panel-error.ts'
import { theActKeptHere } from '../lib/reach.ts'
import { route } from '../lib/route.ts'
import { theEnvironmentATerminalGets } from '../lib/terminals.ts'
import { workspaceOf } from '../lib/workspaces.ts'

/**
 * THE REFUSAL FOR A CALLER THAT IS NEITHER THE PERSON NOR ALLOWED UNDER THE GRANT. Both doors ask
 * `thePersonOrTheGrant`, and the person-only check inventory sorts both as carried.
 */
function onlyThePerson(actor: Actor, doing: string): void {
  try {
    assertThePersonIsProved(
      actor,
      doing,
      'Only the person or a secretary holding the person\'s grant may read or install the agent tools the office runs. ' +
        'The secretary presses only where this office\'s list of what the grant carries says so. Any other agent is ' +
        'refused, and nothing from a sandbox counts as the person.',
    )
  } catch (err) {
    if (err instanceof PanelError) throw aHarnessRefusal('harnessesOnlyThePerson', err.message, err.status, err.reason)
    throw err
  }
}

/**
 * THE PERSON, OR THEIR GRANT WHERE THIS OFFICE'S LIST SAYS IT CARRIES THE DOOR, as `onlyThePersonMay` in api/visitors.ts
 * asks it. The check refuses in its own words where the list keeps the door; an agent with no grant gets the old refusal.
 */
function thePersonOrTheGrant(actor: Actor, doing: string): void {
  if (thePersonIsProved(actor) || aRaiseCarriesIt(actor)) return
  onlyThePerson(actor, doing)
}

const installPress = z.object({ harnesses: z.array(z.string()) }).strict()
const theListQuery = z.object({ part: z.literal('list').optional() }).strict()

export async function terminalHarnessRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    '/harnesses',
    route(
      'harnesses.list',
      'local',
      { because: 'acts-on-this-machine', act: 'Reading the office\'s agent tools' },
      "The person reads each agent tool the office runs: its vendor's install command and the page that states it, or why there is none; where its program is on the PATH the office's terminals get and the version it says it is; the newest version its vendor publishes, or why that could not be read; and whether a newer one exists, said only when both versions were read. A program's version is asked again when its file changes. An installed version kept more than ten minutes, or a newest version kept more than an hour (a minute for one that could not be read), is answered at once with when it was read in beingReadAgain. It is read again behind the answer. The office asks no program and no registry until somebody asks for the list. With part=list, it answers at once with each tool as the office declares it, its name, program and install command or why there is none, and asks no program and no registry.",
    ),
    async (req) => {
      thePersonOrTheGrant(actorFrom(req), theActKeptHere(req))
      const { part } = parse(theListQuery, req.query ?? {}, 'The agent tools query')
      if (part === 'list') return { harnesses: listTheHarnesses() }
      return { harnesses: await readTheHarnesses(theEnvironmentATerminalGets()) }
    },
  )

  app.post(
    '/harnesses/install',
    route(
      'harnesses.install',
      'local',
      { because: 'acts-on-this-machine', act: 'Installing agent tools' },
      "The person installs the ticked agent tools: one terminal opens in the person's home and runs each vendor's own installer in turn, saying before each which it is, then tells the person to sign in to each program themselves. No login is run, and no key is read or passed. A name that is not an agent tool the office runs, or one with no install command, is refused before anything opens. " +
        "Installing reaches every agent, so it waits for the readiness signatures of every secretary on the registry (GET /api/readiness). " +
        "The person's press is their own signature. A secretary may press under the person's grant where this office's list allows it; " +
        "that raises and signs as the secretary, and the person still signs through the person's own door. With no secretary the person's press opens it at once and answers 201. " +
        "Otherwise it answers 409 with code readinessWaits and values {checklist}: the caller's signature is recorded, nothing is installed yet, " +
        "and the terminal opens by itself when everyone has signed. Nothing is installed if they have not signed by the checklist's deadline. " +
        "While the hold held-for-readiness-signatures is off, the person's press opens it at once with no readiness checklist and no signature, and the reply says so in withoutTheSignatures. " +
        "A press that is not the person's is then refused 409, and nothing is installed. A checklist already waiting stays waiting.",
    ),
    async (req, reply) => {
      const actor = actorFrom(req)
      thePersonOrTheGrant(actor, theActKeptHere(req))
      const body = parse(installPress, req.body ?? {}, 'Nothing was installed:')
      const chosen = theHarnessesAsked(body.harnesses)
      // IT WAITS FOR EVERY SECRETARY TO SIGN, because it changes the tool every agent runs on (src/server/lib/readiness.ts).
      // Each caller signs as itself. With no secretary on the registry the person's press opens it at once.
      let did: Record<string, unknown>
      try {
        did = await throughTheReadinessGate({
          operation: 'harnesses.install',
          inputs: { harnesses: chosen.map((one) => one.id) },
          because: null,
          actor,
          workspaceId: workspaceOf(req),
        })
      } catch (err) {
        // A WAIT RAISED OR SIGNED THE CHECKLIST, but writes no change row and gives the route layer no 2xx.
        if (err instanceof PanelError && err.code === 'readinessWaits') writeDownAPressOutsideTheLog(actor, workspaceOf(req))
        throw err
      }
      reply.code(201)
      return did
    },
  )
}
