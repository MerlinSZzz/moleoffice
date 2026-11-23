// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE WORKER THREAD THAT READS A RUN'S SEAL AGAIN FOR THE CHECK DOORS (item 2o of the requirement list).
 *
 * `the-seal-read-apart.ts` starts this file as a worker thread and is the only thing that talks to it.
 * Read that file first: it says why the seal is read here and what stays as it was.
 *
 * NOTHING RUNS ON IMPORT unless the thread was started with `THE_SEAL_READ_THREAD` in its `workerData`.
 * The server imports this file for that one name and its types, so the file is in the server's import
 * graph, and a change to it restarts the server, as a change to any other file it runs does.
 *
 * ONLY TYPE IMPORTS AT THE TOP. The database client opens its file the moment it is imported, so it is
 * imported below, after this thread has been told which file the server has open.
 */

import { parentPort, workerData } from 'node:worker_threads'
import type { CodedRefusal } from '@shared/refusal-codes.ts'
import type { GitSubmission } from '@shared/sealed-tip.ts'
import type { AStampNotMade, AWorktreeStamp } from './a-worktree-stamp.ts'
import type { TheFactsBeforeTheSeal, TheOtherWorktrees, TheRunsCommitsCarried } from './before-the-seal-rules.ts'
import type { AVerifiedSeal, verifyRunSeal } from './sealed-tip.ts'
import type { AHeadAsk, AnOwnCommitsAsk, TheHeadRead, TheRunsOwnCommits } from './a-runs-own-commits.ts'
import { THE_SEAL_READ_THREAD } from '@shared/the-seal-read-thread-key.ts'
import { theSealARunNames } from '@shared/the-seal-a-run-names.ts'
export { theSealARunNames }

export { THE_SEAL_READ_THREAD }

/** The ways `verifyRunSeal` is asked to read a seal. */
export type HowASealIsVerified = NonNullable<Parameters<typeof verifyRunSeal>[1]>

/** One ask: read this run's seal again, this way. */
export type ASealReadAsk = { id: number; runId: string; how: HowASealIsVerified }

/**
 * ONE ASK OF A FINISHING WRITE: read the git of every question the write asked so far, under one stamp of each worktree
 * (./a-finish-reads-git-apart.ts says why). `heads` asks the HEAD of a directory: a run's filing or end commit
 * (./a-runs-own-commits.ts). `own` asks a run's own commits, for its seal.
 */
export type AFinishReadAsk = { id: number; finish: { facts: AGitFactsAsk[]; seals: ASealGitAsk[]; commits?: ACommitsPastTheCutAsk[]; heads?: AHeadAsk[]; own?: AnOwnCommitsAsk[] } }

/** The git a seal reads: `theGitOfASeal`'s arguments. */
export type ASealGitAsk = { directory: string; prior: GitSubmission | null; named: string | null; area: string[] }

/** The commits a records seal asks of a run's working directory: `theCommitsPastTheCut`'s arguments. */
export type ACommitsPastTheCutAsk = { directory: string; cut: string }

/** What `theCommitsPastTheCut` read: each commit past the cut by its short hash and first line, or why git could not say. */
export type TheCommitsPastTheCut = { commits: { hash: string; subject: string }[] } | { couldNotRead: string }

/**
 * The git the facts before the seal read (`theGitFactsReadHere` in ./before-the-seal.ts): the run's commits in its
 * working directory since the base it names and its start, with `look` the other worktrees as well, and with `copied`
 * the copied test words at the tip. `own`, for a run whose filing commit the office read, is what its own commits are
 * read from (./a-runs-own-commits.ts): then the facts hold those commits that are not carried, and the start is not
 * read. Absent for any other run.
 */
export type AGitFactsAsk = { directory: string; cutFrom: string | null; startedMs: number | null; look: { tip: string | null } | null; kind: string | null; copied: boolean; own?: AnOwnCommitsAsk }

/** What `theGitFactsReadHere` read: the commits, the HEAD they were read at, and what it looked at besides. */
export type ACarriedGitFacts = {
  git: TheRunsCommitsCarried | { couldNotRead: string }
  head: string | null
  elsewhere?: TheOtherWorktrees
  copiedTestLiterals?: NonNullable<TheFactsBeforeTheSeal['copiedTestLiterals']>
}

/** What `theGitOfASeal` did: read the seal's git, refused with a PanelError, or failed with any other error. */
export type ASealOutcome = { captured: GitSubmission } | { refused: ARefusalCarried } | { failed: string }

/**
 * WHAT A FINISH'S ASK READ: each worktree's stamp made before the read, whether every stamp still held after it, the time
 * that last check ended (`performance.timeOrigin + performance.now()`, one clock on both threads), and each answer.
 */
export type AFinishReadOnTheThread = {
  stamps: (AWorktreeStamp | AStampNotMade)[]
  held: boolean
  checkedAt: number
  facts: { ask: AGitFactsAsk; read: ACarriedGitFacts | { failed: string } }[]
  seals: { ask: ASealGitAsk; outcome: ASealOutcome }[]
  commits: { ask: ACommitsPastTheCutAsk; read: TheCommitsPastTheCut | { failed: string } }[]
  heads: { ask: AHeadAsk; read: TheHeadRead | { failed: string } }[]
  own: { ask: AnOwnCommitsAsk; read: TheRunsOwnCommits | { failed: string } }[]
}

/** The sender adds the time waiting for the thread and the number of outstanding asks. */
export type AFinishReading = AFinishReadOnTheThread & { asksAhead: number; gitReadMs: number; threadWaitMs: number }

/**
 * A REFUSAL OF `verifyRunSeal`, carried as its fields. A thread hands an error back as a plain Error, without
 * the status, the code and the other fields of a PanelError, so they are carried one by one and the request
 * thread makes the same PanelError again.
 */
export type ARefusalCarried = {
  message: string
  status: number
  detail?: string
  elsewhere?: { title: string; workspaceId: string; recordId: string }
  reason?: string
  refusal?: CodedRefusal
  recorded?: string
}

/** What `verifyRunSeal` did on this thread: answered, refused with a PanelError, or failed with any other error. */
export type TheReadsOutcome = { verified: AVerifiedSeal | null } | { finished: AFinishReadOnTheThread } | { refused: ARefusalCarried } | { failed: string }

/**
 * What this thread says: that it is ready to be asked, once, and then for each ask the outcome, with the seal the
 * run named when it was read (`theSealARunNames`), or the error that stopped the ask before it was read.
 */
export type ASealReadAnswer = { ready: true } | { id: number; names: string; outcome: TheReadsOutcome; gitReadMs: number } | { id: number; error: string }


async function serveOnThisThread(database: string): Promise<void> {
  const port = parentPort
  if (port === null) throw new Error('The seal-read thread was started with no port to its server, so it has nobody to answer.')
  // THE SAME FILE THE SERVER HAS OPEN, named here before the client is imported, so this thread never
  // opens a file that .env or a default names instead.
  process.env['MOLE_OFFICE_DB'] = database
  const { sqlite } = await import('../db/client.ts')
  const records = await import('./records.ts')
  const sealedTip = await import('./sealed-tip.ts')
  const beforeTheSeal = await import('./before-the-seal.ts')
  const stamps = await import('./a-worktree-stamp.ts')
  const ownCommits = await import('./a-runs-own-commits.ts')
  // THIS THREAD ONLY READS, as the attention thread does (attention-thread-worker.ts says why it is set after
  // the imports). That the imports changed no row is checked, not assumed.
  const changedOnLoad = (sqlite.prepare('SELECT total_changes() AS rows').get() as { rows: number }).rows
  if (changedOnLoad !== 0) {
    throw new Error(`Loading the seal-read thread changed ${String(changedOnLoad)} rows of the database, and this thread must only read.`)
  }
  sqlite.pragma('query_only = ON')
  /** A PanelError as its fields, and any other error as its message. */
  const carried = (err: unknown): { refused: ARefusalCarried } | { failed: string } => {
    if (!(err instanceof records.PanelError)) return { failed: err instanceof Error ? err.message : String(err) }
    const { message, status, detail, elsewhere, reason, code, values, recorded } = err
    return {
      refused: {
        message,
        status,
        ...(detail === undefined ? {} : { detail }),
        ...(elsewhere === undefined ? {} : { elsewhere }),
        ...(reason === undefined ? {} : { reason }),
        ...(code === undefined ? {} : { refusal: { code, values } as CodedRefusal }),
        ...(recorded === undefined ? {} : { recorded }),
      },
    }
  }
  // THE SEAL NAMED AND THE SEAL READ ARE OF ONE MOMENT: both in one read transaction.
  const readOne = sqlite.transaction((ask: ASealReadAsk): { names: string; outcome: TheReadsOutcome } => {
    const names = theSealARunNames(ask.runId, { sealedTip, records })
    try {
      return { names, outcome: { verified: sealedTip.verifyRunSeal(ask.runId, ask.how) } }
    } catch (err) {
      return { names, outcome: carried(err) }
    }
  })
  /**
   * A FINISH'S GIT, READ UNDER ONE STAMP. Each worktree is stamped first, every question is read, and every stamp is
   * checked again after. One `captureGit` serves every question that asks it the same thing: the facts' commits and a
   * first seal read the same working directory off the same base, so the tree is walked once for both. `captureGit` reads
   * nothing of its area, so the area is not part of what is the same.
   */
  const readAFinish = async (ask: AFinishReadAsk['finish']): Promise<AFinishReadOnTheThread> => {
    const asked = ask.commits ?? []
    const heads = ask.heads ?? []
    const own = ask.own ?? []
    const made = [...new Set([...ask.facts.map((one) => one.directory), ...ask.seals.map((one) => one.directory), ...asked.map((one) => one.directory), ...heads.map((one) => one.directory), ...own.map((one) => one.directory)])].map((directory) => stamps.aWorktreeStampOf(directory))
    const read = new Map<string, { gave: GitSubmission } | { threw: unknown }>()
    const capture: typeof sealedTip.captureGit = (directory, base, area, fixedBase = false) => {
      const key = JSON.stringify([directory, base, fixedBase])
      let one = read.get(key)
      if (one === undefined) {
        try {
          one = { gave: sealedTip.captureGit(directory, base, area, fixedBase) }
        } catch (err) {
          one = { threw: err }
        }
        read.set(key, one)
      }
      if ('threw' in one) throw one.threw
      return one.gave
    }
    const seals = ask.seals.map((seal) => {
      try {
        return { ask: seal, outcome: { captured: sealedTip.theGitOfASeal(seal.directory, seal.prior, seal.named, seal.area, capture) } as ASealOutcome }
      } catch (err) {
        return { ask: seal, outcome: carried(err) }
      }
    })
    const facts: AFinishReading['facts'] = []
    for (const one of ask.facts) {
      try {
        facts.push({ ask: one, read: await beforeTheSeal.theGitFactsReadHere(one, capture) })
      } catch (err) {
        facts.push({ ask: one, read: { failed: err instanceof Error ? err.message : String(err) } })
      }
    }
    // THE COMMITS PAST A RECORDS RUN'S CUT, read under the same stamps as the rest.
    const commits: AFinishReading['commits'] = asked.map((one) => {
      try {
        return { ask: one, read: sealedTip.theCommitsPastTheCut(one.directory, one.cut) }
      } catch (err) {
        return { ask: one, read: { failed: err instanceof Error ? err.message : String(err) } }
      }
    })
    // A RUN'S FILING OR END COMMIT, and a run's own commits, read under the same stamps as the rest.
    const failed = (err: unknown): { failed: string } => ({ failed: err instanceof Error ? err.message : String(err) })
    const headsRead: AFinishReading['heads'] = heads.map((one) => {
      try { return { ask: one, read: ownCommits.theHeadReadIn(one.directory) } } catch (err) { return { ask: one, read: failed(err) } }
    })
    const ownRead: AFinishReading['own'] = own.map((one) => {
      try { return { ask: one, read: ownCommits.theRunsOwnCommitsRead(one) } } catch (err) { return { ask: one, read: failed(err) } }
    })
    const held = made.every((stamp) => 'notMade' in stamp || stamps.theStampHolds(stamp))
    return { stamps: made, held, checkedAt: performance.timeOrigin + performance.now(), facts, seals, commits, heads: headsRead, own: ownRead }
  }
  port.on('message', (ask: ASealReadAsk | AFinishReadAsk) => {
    const began = performance.now()
    if ('finish' in ask) {
      // A FINISH WAITS ON GIT HERE for the copied test words, so it is answered when its read ends, and a seal read
      // asked meanwhile is answered first.
      readAFinish(ask.finish).then(
        (reading) => port.postMessage({ id: ask.id, names: '', outcome: { finished: reading }, gitReadMs: performance.now() - began } satisfies ASealReadAnswer),
        (err: unknown) => port.postMessage({ id: ask.id, error: err instanceof Error ? err.message : String(err) } satisfies ASealReadAnswer),
      )
      return
    }
    let answer: ASealReadAnswer
    try {
      answer = { id: ask.id, ...readOne(ask), gitReadMs: performance.now() - began }
    } catch (err) {
      answer = { id: ask.id, error: err instanceof Error ? err.message : String(err) }
    }
    port.postMessage(answer)
  })
  // READY ONLY NOW, with the listener in place, so no ask is sent to a thread that is still loading.
  port.postMessage({ ready: true } satisfies ASealReadAnswer)
}

// NO TOP-LEVEL AWAIT HERE. The files this thread imports reach this file again (sealed-tip.ts imports inspection.ts,
// which imports the-seal-read-apart.ts, which imports this file), and a file still waiting at its top level is not
// finished, so they would wait for it while it waits for them: the thread ended with exit code 13 before it read a
// seal. So this file finishes at once, and a failure of the start is thrown on its own, where it ends the thread with
// an error the server reads (the-seal-read-apart.ts).
const database = (workerData as Record<string, unknown> | null)?.[THE_SEAL_READ_THREAD]
if (typeof database === 'string') {
  serveOnThisThread(database).catch((err: unknown) => {
    queueMicrotask(() => {
      throw err
    })
  })
}
