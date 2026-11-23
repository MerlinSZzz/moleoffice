// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE PRESS THAT PUTS THE ENTRY IN PLACE, FOR EVERY DIRECTORY AND NOT ONLY THIS ONE.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS IS AND WHY IT EXISTS
 * ---------------------------------------------------------------------------------------
 *
 * A new agent opened in another project's folder on 14 September 2026 could not find Mole Office, because
 * the entry was wired to one directory: the skill link and the two hook lines lived one directory
 * above the checkout and served sessions started there and nowhere else. This is the press that
 * moves both to user level, where they follow the person.
 *
 * It writes exactly two things, and `src/config/install-the-entry.mjs` is the one implementation
 * that writes them:
 *
 *   · `~/.claude/skills/mole-office` — a symlink into this checkout's skill, never a copy;
 *   · `~/.claude/settings.json` — one entry appended to each of `hooks.SessionStart`, `hooks.Stop` and
 *     `hooks.SessionEnd`, merging rather than replacing, backed up first, written through a rename,
 *     and idempotent so a second press writes nothing.
 *
 * ---------------------------------------------------------------------------------------
 * THE HOME DIRECTORY COMES FROM THIS SERVER AND NEVER FROM THE REQUEST
 * ---------------------------------------------------------------------------------------
 *
 * `theOwnersHome()` in the shared module reads the home directory from this process's own
 * environment. This route takes no body and no query at all, so there is no path a caller could
 * offer; a door that took one would be a door that writes anywhere on the person's disk.
 *
 * ---------------------------------------------------------------------------------------
 * THE PERSON'S OWN ACT, AND IT STAYS ON THIS MACHINE
 * ---------------------------------------------------------------------------------------
 *
 * It is `reach: 'local'` with `reserved-to-the-owner`, the shape the other person-only doors
 * already use: a caller from another machine is refused before any handler runs, and an agent gets
 * a 403 naming who may. `tests/local-only-routes.test.ts` and `tests/reach-declared.test.ts` bind
 * the declaration to the drives that prove both refusals.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THE REPLIES SAY
 * ---------------------------------------------------------------------------------------
 *
 * A reply that wrote something names every line it added, the settings file it wrote them into, the
 * link it made, and where the previous file was backed up. A second press changes nothing and says
 * so. A refusal names the file it is about and why, and nothing was written.
 */
import type { FastifyInstance, FastifyRequest } from 'fastify'
import { z } from 'zod'

import { gateMet } from '../lib/gate-counts.ts'
import { actorFrom, takesNoInput } from '../lib/http.ts'
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
import { theActKeptHere } from '../lib/reach.ts'
import { theWorldsOwnAuthority } from '../lib/worldauthority.ts'
// THE REFUSAL FOR A REQUEST NOT PROVED TO BE THE PERSON, written in one place for every door that keeps
// an act for the person. In a test world it also names who may act there (criterion P84).
import { theRefusalForSomebodyNotProvedThePerson, whatThisRequestShowed } from '../lib/not-proved-the-person.ts'
import { anAgentItsOwnKeyProves, refusedWhileTheGateIsOff } from '../lib/who-may-act.ts'
import { giveTheEntrysAgentItsKey, theStateOfTheEntrysKey } from '../lib/an-agents-key-file.ts'
import { REPO_ROOT, gatePosition } from '../../config/settings.mjs'
import {
  installTheEntry,
  OTHER_RUNTIMES,
  planOtherRuntimeEntry,
  pressTheOtherRuntimesEntry,
  theOtherRuntimeTargets,
  theOwnersHome,
} from '../../config/install-the-entry.mjs'

const INSTALL_NOTE =
  'Put the Mole Office entry in place for every directory: link ~/.claude/skills/mole-office to this ' +
  "checkout's skill, and append one line to each of hooks.SessionStart, hooks.Stop and hooks.SessionEnd in " +
  '~/.claude/settings.json, each running this checkout\'s session hook. It merges: every other line and ' +
  'key in the settings file is left as it was. It backs the file up first, refuses to write if the file ' +
  'does not parse or the backup cannot be made, and a second press writes nothing and says so. The home ' +
  'directory is this server\'s own and is never taken from the request. It takes no body. This is the ' +
  "owner's own act. A secretary holding the owner's grant may press it where this office's list of what the " +
  'grant carries says so; any other agent is refused and the refusal names who may. While the gate ' +
  'who-changes-the-owners-settings is off, any agent proved by its own key may also press it, is counted, and the ' +
  'change log names it.'

/**
 * ONLY THE PERSON, WHOEVER HOLDS THE PERSON'S AUTHORITY IN A TEST WORLD, OR A SECRETARY HOLDING THE
 * PERSON'S GRANT, MAY INSTALL THE ENTRY.
 *
 * The same clause the office's key presses and the key window's close ask. It writes into the person's
 * own configuration directory, which is the one place on this machine that belongs to no project at
 * all, so no other agent's request may reach it. A secretary holding the person's grant may press it
 * where this office's list of what the grant carries says so. Any other agent that wants this done may
 * file a proposal or say so; it may not press.
 *
 * The answer is whether the gate who-changes-the-owners-settings let the caller through at off, so the press is
 * written down with that agent's name.
 */
function onlyThePersonMayInstallTheEntry(actor: Actor, req: FastifyRequest): boolean {
  if (thePersonIsProved(actor)) return false
  if (actor.theOwnersAuthority?.holds === true) return false
  // AND A SECRETARY THE PERSON HAS RAISED. A raised secretary holds the person's acts but a few, and this
  // is not one of them. Asked last, so the grant is named on the act only when
  // nothing else allowed it.
  // THE GATE IS READ BEFORE THE RAISE IS ASKED. At off the gate who-changes-the-owners-settings lets any agent its own
  // key proves press it too, and counts it, and the raise is not asked. At block the raise is asked as before, and a
  // press it carries is not counted.
  const position = gatePosition('who-changes-the-owners-settings')
  if (position === 'block' && aRaiseCarriesIt(actor)) return false
  const keyed = anAgentItsOwnKeyProves(actor) !== null
  if (keyed && gateMet('who-changes-the-owners-settings', position!) !== 'block') return true
  if (!keyed && position !== 'block') {
    throw refusedWhileTheGateIsOff(actor.id, 'who-changes-the-owners-settings', "put the entry in place in this computer's home directory")
  }
  // THE WORDS ARE WRITTEN IN ONE PLACE, lib/not-proved-the-person.ts, from the facts of this request:
  // why it is not the person and the way on for its kind of caller, and in a test world who may act there.
  throw new PanelError(
    theRefusalForSomebodyNotProvedThePerson(whatThisRequestShowed(actor, req), {
      refused: `${theActKeptHere(req)} is the owner's own act`,
      nothingWasDone: 'Nothing was written.',
      whoMay:
        'The owner presses it on the Settings page, which writes one skill link and three hook lines into the owner\'s home ' +
        'directory. A secretary holding the owner\'s grant may press it where this office\'s list of what the grant ' +
        'carries says so. Any other agent may read whether it is in place and may file a proposal about it; it may ' +
        'not write into the directory every Claude Code session on this machine reads.',
    }),
    403,
  )
}

/**
 * A TEST WORLD MAY NOT WRITE THE REAL HOME DIRECTORY, EVEN ON THE PERSON'S OWN PRESS.
 *
 * Found at review of this piece, not by its tests. Every other guard on this door asks WHO is
 * pressing. This one asks WHICH OFFICE is answering, and the two are different questions.
 *
 * THE PATH. A world is a copy of the office serving from a worktree, and the person presses things in one:
 * a feature they must see is shown to them in a world, and since bCc0QD-xaeB_
 * a world's address is reachable from where they read the office. So the likely sequence is not an
 * agent sneaking a write — it is the person, pressing this button on a handback world's Settings page,
 * because it is the button the handback asked them to look at.
 *
 * WHAT WOULD HAPPEN. `REPO_ROOT` is read from the running module's own location, so in a world it
 * is that world's worktree; `theOwnersHome()` is this process's home, and a world started by
 * tools/isolated-mole-office.mjs runs with the person's real one. The press would therefore repoint
 * ~/.claude/skills/mole-office at a worktree that is deleted when the world is torn down, and every
 * Claude Code session on this machine would afterwards start with no skill and no way to tell that
 * it has none. That is the failure chapter 9 rule 6 exists against, arrived at from the other side.
 *
 * WHY A REFUSAL RATHER THAN A CLEVERER PATH. A world could be made to write the office's checkout
 * instead of its own, but then a press in a world would change the real machine while claiming to
 * be a copy, and nothing written in a world is supposed to reach outside it (chapter 8 rule 5). The
 * honest answer is that this one act is not what a world is for, and the refusal says where it is.
 */
function aTestWorldMayNotWriteTheRealHome(): void {
  if (!theWorldsOwnAuthority().inATestWorld) return
  throw new PanelError(
    'This Mole Office is a test world, and putting the entry in place writes into the real home directory on ' +
      'this computer. A world serves from a copy of the checkout that is deleted when the world is torn down, so ' +
      'the skill link it made would point at a directory that no longer exists, and every session on this ' +
      'machine would start with no skill. Nothing was written. Press it on the office itself, where the checkout ' +
      'is the one that stays.',
    409,
  )
}

export async function entryRoutes(app: FastifyInstance): Promise<void> {
  app.post(
    '/office/install-the-entry',
    route(
      'office.install-entry',
      'local',
      { because: 'reserved-to-the-owner', act: "Writing the Mole Office skill link and hook lines into the owner's home directory" },
      INSTALL_NOTE,
    ),
    async (req) => {
      const actor = actorFrom(req)
      const byTheGate = onlyThePersonMayInstallTheEntry(actor, req)
      aTestWorldMayNotWriteTheRealHome()
      takesNoInput(
        req,
        'POST /api/office/install-the-entry',
        'It takes nothing: the two paths it writes are this server\'s own home directory and this checkout.',
      )
      const written = await installTheEntry({ home: theOwnersHome(), checkout: REPO_ROOT })
      if (!written.ok) throw new PanelError(written.says, 409)
      // THE KEY STEP, after the lines were written: on the person's own press the entry agent is found or made and keeps
      // or is given a key of its own, in the file the session hook reads (lib/an-agents-key-file.ts). Any other press
      // makes no key, and the answer says why.
      const key = giveTheEntrysAgentItsKey(actor, workspaceOf(req))
      const result = { ...written, thisComputersKey: key.thisComputersKey, says: `${written.says} ${key.says}` }
      // BEFORE IS NOT READ HERE, and the row says so rather than holding nothing, which would read as nothing having been
      // there (the inspector's note on run 9PpzkI9AiBPR, invariant 5).
      // An agent the gate let through at off is written down by name, as the change log names any change.
      ;(byTheGate ? writeDownASettingChange : writeDownAnActUnderTheRaise)(actor, {
        setting: 'the-entry',
        field: "the Mole Office entry in the owner's home directory",
        before: 'not read before the press',
        after: result.says,
        workspaceId: workspaceOf(req),
      })
      return result
    },
  )

  /**
   * THE STATE OF THIS COMPUTER'S ENTRY KEY: none yet, held, or refused. The Settings entry reads it when it is drawn. It
   * reads two files beside the office's key file and the key table, says nothing of what the files hold, and writes
   * nothing.
   */
  app.get(
    '/office/install-the-entry/this-computers-key',
    route(
      'office.install-entry.this-computers-key',
      'local',
      { because: 'acts-on-this-machine', act: "Reading the state of this computer's entry key" },
      "The state of this computer's entry key: none-yet when no key file is there, and the entry press gives one; held " +
        'when the file holds a live key of the live agent its neighbour file names; refused otherwise. It answers ' +
        '{thisComputersKey}, never what a file holds, and writes nothing.',
    ),
    async (req) => {
      takesNoInput(req, 'GET /api/office/install-the-entry/this-computers-key', 'It takes nothing: the files it reads are this office\'s own.')
      return { thisComputersKey: theStateOfTheEntrysKey() }
    },
  )

  /**
   * WHAT WRITING CODEX'S AND OPENCODE'S GLOBAL ENTRY WOULD DO, WITHOUT DOING IT.
   *
   * Open to anyone, the same as reading whether the Claude Code entry is in place: this is a read
   * of the disk, and it writes nothing. See `src/config/install-the-entry.mjs` for what each
   * runtime's global file is and why, and for why a directory that does not exist is refused rather
   * than created.
   */
  app.get(
    '/office/install-the-entry/other-runtimes',
    route(
      'office.install-entry.other-runtimes.plan',
      'local',
      { because: 'acts-on-this-machine', act: "Reading Codex's or OpenCode's global instructions file for the Mole Office block" },
      "What writing Codex's and OpenCode's global entry would do, without doing it: one plan per " +
        'runtime, each naming the file and whether pressing would create it, replace an older block ' +
        'in it, leave it unchanged, or be refused — a directory that does not exist because the tool ' +
        'has never run here, or an override file that would make the write sit unread. Writes ' +
        'nothing; anyone may read it. POST the same path, naming which runtimes, to press it.',
    ),
    async () => {
      const targets = theOtherRuntimeTargets(theOwnersHome())
      return {
        codex: await planOtherRuntimeEntry(targets.codex),
        opencode: await planOtherRuntimeEntry(targets.opencode),
      }
    },
  )

  const otherRuntimesBody = z.strictObject({ runtimes: z.array(z.enum(OTHER_RUNTIMES)).min(1) })

  /**
   * WRITE CODEX'S AND OPENCODE'S GLOBAL ENTRY, ONLY FOR THE RUNTIMES NAMED.
   *
   * The same two guards as the entry above, for the same reason: `~/.codex` and
   * `~/.config/opencode` are the person's directories, and no agent decides for the person what goes into them,
   * except a secretary holding the person's grant where this office's list of what the grant carries says
   * so.
   * Naming a runtime is required — there is no "install everything" here, because the person may use one of
   * the two and not the other, and a press that touched a tool they do not run would be a surprise
   * in a directory this door has no business guessing about.
   */
  app.post(
    '/office/install-the-entry/other-runtimes',
    route(
      'office.install-entry.other-runtimes.write',
      'local',
      { because: 'reserved-to-the-owner', act: "Writing Codex's or OpenCode's global instructions file" },
      'Write the Mole Office pointer block into the named runtimes\' global instructions files: ' +
        '{"runtimes":["codex"]}, {"runtimes":["opencode"]}, or both. Refused when a runtime\'s own ' +
        'directory is not on this machine, or when a file it reads instead of the one this writes ' +
        '(Codex\'s AGENTS.override.md) already exists — GET the same path first and read the plan. ' +
        "This is the owner's own act. A secretary holding the owner's grant may press it where this " +
        "office's list of what the grant carries says so; any other agent is refused and the refusal names who may. " +
        'While the gate who-changes-the-owners-settings is off, any agent proved by its own key may also press it, is ' +
        'counted, and the change log names it, as the-other-runtimes-entry.',
    ),
    async (req) => {
      const actor = actorFrom(req)
      const byTheGate = onlyThePersonMayInstallTheEntry(actor, req)
      aTestWorldMayNotWriteTheRealHome()
      const body = parse(otherRuntimesBody, req.body, 'That does not say which runtimes to write:')
      const targets = theOtherRuntimeTargets(theOwnersHome())

      // ALL OR NOTHING, as one press: every named runtime is planned before any is written, and no other press of
      // this process runs between the plans and the writes (pressTheOtherRuntimesEntry says why).
      const pressed = await pressTheOtherRuntimesEntry(targets, body.runtimes)
      if ('refused' in pressed) {
        const plan = pressed.refused
        throw new PanelError(plan.says, 409)
      }
      const results = pressed.written
      // An agent the gate let through at off is written down by name. Before is not read here, as at the entry above.
      if (byTheGate) {
        writeDownASettingChange(actor, {
          setting: 'the-other-runtimes-entry',
          field: "the Mole Office block in Codex's or OpenCode's global instructions file",
          before: 'not read before the press',
          after: results,
          workspaceId: workspaceOf(req),
        })
      }
      return results
    },
  )
}
