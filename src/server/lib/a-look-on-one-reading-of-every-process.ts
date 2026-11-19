// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A LOOK THAT CANNOT WAIT, MADE ON ONE READING OF EVERY PROCESS where the probe has one: Windows.
 *
 * The looks at who is there and who answers as an agent are asked for by code that cannot wait: a write's stored
 * step, a stream that opens or closes, the presence clock. Each reads the process of the sessions it looks at, and the
 * process rows of the ledger. On Windows each question about one process is a PowerShell script of about a second, and
 * made the way a look makes it, it holds the server's thread. In a CPU profile of a walk through the office on a
 * Windows 11 machine, the reading of a session's recorded process held the thread for 5.9 s, and the reading of the
 * process rows for 3.1 s, of 66.5 s.
 *
 * So, on Windows, while a person's page is open, the look is read first (`readFirst` in lib/resources.ts): what each
 * starter the live rows may ask about left running in its Job Object, which one reading of every process cannot say,
 * and then one reading of every process. All of it is read by the way that waits, and the look runs after it and is
 * answered from it. A row's liveness asks its starter's Job Object again for each read of the row, so a look of many
 * rows asked the same one many times.
 *
 * The look then runs later than it was asked for, by the time those scripts take, and it reads the database as it is
 * then.
 *
 * While no person's page is open, the look runs at once: it announces only to a person's page, so it reads nothing,
 * and no script is run for it. On Linux and the Mac the look runs at once and reads as it always did.
 *
 * A LOOK THAT THROWS HAS NO CALLER TO THROW TO, on any system. It is asked for by a timer, a stream that opened or
 * closed, or a write's stored step, and a throw out of a timer ends the server. A reading of a process can throw: on
 * the Mac an lsof that times out does. So a throw is caught on both ways, the one that waits and the one that runs at
 * once, and the log says the look was not finished, with its name and what failed. Nothing the look would have
 * announced after that point was announced. So that pass takes no process for another program and no agent for gone,
 * and the next look reads them again.
 */
import { everyPageOpen } from './events.ts'
import { runNamed } from './named-timers.ts'
import { osProbe, readFirst, theStartersTheLiveRowsMayAskAbout } from './resources.ts'

/** Whether a person's page is open, in any project. */
function aPersonsPageIsOpen(): boolean {
  return everyPageOpen().some((page) => page.who !== null && page.who.kind === 'person')
}

/** The log's line for a look that threw, or whose rows could not be read first: its name, and what failed. */
function theLookWasNotFinished(name: string, failed: unknown): string {
  return `The look "${name}" was not finished: ${failed instanceof Error ? failed.message : String(failed)}`
}

/** Run `look`, named `name` in the log, on one reading of every process where the probe has one (see the header). */
export function lookOnOneReadingOfEveryProcess(name: string, log: (line: string) => void, look: () => void): void {
  if (osProbe().readEveryProcessFirst === undefined || !aPersonsPageIsOpen()) {
    try {
      look()
    } catch (failed: unknown) {
      log(theLookWasNotFinished(name, failed))
    }
    return
  }
  readFirst(theStartersTheLiveRowsMayAskAbout, () => runNamed(name, log, look), { andEveryOtherProcess: true }).catch((failed: unknown) => {
    log(theLookWasNotFinished(name, failed))
  })
}
