// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHETHER A SERVER'S OWN FACTS CONTRADICT WHAT THIS CHECKOUT DECLARES.
 *
 * ---------------------------------------------------------------------------------------
 * WHY IT IS ITS OWN FILE
 * ---------------------------------------------------------------------------------------
 *
 * It is a pure function of two readings and the declaration, and it opens nothing. `world.ts`,
 * where it first lived, reaches `db/client.ts` through `runtime.ts`, so importing it from a test
 * opened the operator's real database — the refusal in `db/client.ts` says so in as many words.
 * The rule is worth testing directly, so it lives where a test can reach it.
 *
 * `GET /api/health` in src/server/index.ts is the one caller.
 */

import { ENV_FILE, REPO_ROOT, canonicalDatabasePath, settings } from '../../config/settings.mjs'
import { howLongStale, type FreshnessOnTheWire } from '../../config/freshness-header.mjs'
import type { SupervisorFailedStarts, World } from '@shared/runtime.ts'

/**
 * WHAT IS WRONG WITH THIS SERVER, IN PLAIN SENTENCES. AN EMPTY LIST MEANS NOTHING IS.
 *
 * ---------------------------------------------------------------------------------------
 * THE TWO QUESTIONS IT ASKS
 * ---------------------------------------------------------------------------------------
 *
 * 1. **Is it LISTENING on the address this checkout declares, out of a world this checkout does not
 *    declare?** That is the state to prevent: a real API and a scratch API side by side, and
 *    health checks that appear green. Two facts make it true, and either is enough: the
 *    database this server has open is not the file this declaration names, or the checkout its code
 *    came from is not this checkout. The reasons are `standing.because`, written by `standing()` in
 *    ./runtime.ts, so this reports the same sentences `GET /api/runtime` does rather than a second
 *    set.
 *
 *    **BEING SCRATCH IS NOT ITSELF A CONTRADICTION, and reading it as one broke the negative
 *    control.** This used to ask whether the standing was `scratch` while the bound port was the
 *    declared one. A worktree declares its own port in its own `.env`, and a worktree is always
 *    scratch, so the only server that can ever answer on a worktree's own port was called
 *    unhealthy — and every builder and every verifier works in a worktree, because CLAUDE.md says
 *    to. `node tools/negative-control.mjs` therefore exited 1 on its own control case wherever it
 *    was meant to be run. Problem `tBDA20NnDWBx`.
 *
 *    The three reasons a runtime is scratch are not the same fact. A database that is not the one
 *    this declaration names, and a checkout that is not this one, are contradictions of the
 *    declaration. Running from a worktree is not, because the worktree's own declaration is what
 *    named that address in the first place.
 *
 * 2. **Has it been serving code older than the checkout for longer than the grace?** A server whose
 *    code is behind is answering about a version of this product that is not the one on disk. The
 *    grace is `MOLE_OFFICE_STALE_CODE_GRACE`, and it is here for the same reason the banner has it:
 *    a `tsx watch` restart takes about two seconds, and a check that went red on every save would
 *    be read as noise inside a week.
 *
 * ---------------------------------------------------------------------------------------
 * A DELIBERATE SCRATCH STACK ON ITS OWN PORT IS HEALTHY
 * ---------------------------------------------------------------------------------------
 *
 * It answers `ok: true` and says `scratch` in the body, which is the whole point of the distinction.
 * This repository's own test suite starts fifty-odd of them in a run, and a check that called every
 * one of them unhealthy would be measuring itself. The fault is a throwaway answering where the real
 * one should be, not a throwaway existing.
 */
export function whatIsWrongWithThisServer(
  world: World,
  code: FreshnessOnTheWire,
  /**
   * The port this process really bound, or null when it bound none.
   *
   * NOT THE PORT IT WAS CONFIGURED WITH, which is what `world.port` is, and the difference is the
   * whole of question 1. A server built for a test and driven with `inject` holds no socket at all,
   * so nobody can have reached the real address and got it, whatever its settings say. Reading the
   * configured port instead made every one of this repository's own `inject` tests answer unhealthy,
   * measured on 4 September 2026 in `tests/server-wiring.test.ts`.
   *
   * The one line that binds a port is what records it, in src/server/index.ts, so this is a reading
   * of what happened rather than a second opinion about what should have.
   */
  boundPort: number | null,
  /**
   * WHAT THE SUPERVISOR OF THIS CHECKOUT AND THIS PORT SAYS ABOUT ITS OWN FAILED STARTS, or null
   * because it has not written any down.
   *
   * THIS IS NOT A FACT ABOUT THE PROCESS ANSWERING, and that is the point of it. The API on the
   * live office's port can answer every request correctly while the supervisor of that same port
   * fails to start its replacement again and again; every check in this file then passes and `ok`
   * is true, because every check in this file asks the answering server about itself.
   * The reader wants to know that the server they are talking to is the only one there will be.
   * Problem `5ZHmJ4_C26Y8`.
   */
  supervisorFailedStarts: SupervisorFailedStarts | null,
): string[] {
  const wrong: string[] = []
  const declaredPort = settings({}, ENV_FILE).apiPort
  if (boundPort === declaredPort) {
    /**
     * WHAT THIS DECLARATION NAMES, read the same way `GET /api/runtime` reads it: `.env` alone,
     * ignoring the shell, because the question is what THIS CHECKOUT says the real one is.
     */
    const declaredDatabase = canonicalDatabasePath(ENV_FILE)
    const thisCheckout = REPO_ROOT.replace(/\/$/, '')
    const contradictions: string[] = []
    if (world.database !== declaredDatabase) {
      contradictions.push(
        `its database is ${world.database}, and this checkout declares ${declaredDatabase}`,
      )
    }
    if (world.repository !== thisCheckout) {
      contradictions.push(`its code came from ${world.repository}, and this checkout is ${thisCheckout}`)
    }
    if (contradictions.length > 0) {
      wrong.push(
        `This is the address this checkout calls the real Mole Office, port ${String(declaredPort)}, and what is ` +
          'answering on it is not the world this checkout declares.',
        ...contradictions,
        // The runtime's own sentences as well, because they say every reason it is a throwaway and
        // a reader deciding what to stop wants all of them.
        ...world.standing.because,
      )
    }
  }
  if (supervisorFailedStarts !== null) {
    wrong.push(
      supervisorFailedStarts.says,
      `Stop the supervisor by its process group and start it again: kill -TERM -${String(supervisorFailedStarts.supervisor.pgid)}`,
    )
  }
  if (code.verdict === 'stale' && code.staleFor !== null && code.staleFor > code.grace) {
    wrong.push(
      `This server has been running code older than the checkout for ${howLongStale(code.staleFor)}, ` +
        `which is longer than the ${String(code.grace)} seconds it is given to pick a change up. Restart it.`,
    )
  }
  return wrong
}
