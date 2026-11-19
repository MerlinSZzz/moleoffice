// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import type { StandardKind } from './standard-change.ts'

/** Frozen submission content. Older runs have no seal; absence is never a seal. */
export interface SealedFile { path: string; hash: string | null; mode: string | null; origin?: SealedOrigin }
/**
 * WHERE A FILE OF A FILES SEAL CAME FROM, as its run named it at finish, at A2 of a decision :
 * "the origin is sealed, not guessed". Absent on a file the run named
 * no original for.
 *
 * `path` is the original's real path and `sha256` its bytes at finish, so a later change to it is
 * seen. `transform` names the one repair office code recomputes from the bytes, when the file is not a
 * byte-for-byte copy. `couldWrite` says whether the run could have written where the original lies
 * (a review's rule): true inside the folder of the sandbox the office recorded for the run, false
 * outside it, and null when no sandbox folder is recorded, so the run could have written anywhere.
 * Only false lets the original count as one.
 */
export interface SealedOrigin {
  path: string
  sha256: string
  transform?: 'trailing-nul-trim'
  couldWrite: boolean | null
}
export interface GitSubmission {
  repository: string
  directory: string
  forkBase: string
  /** How the seal chose the fork base. A seal written before this field existed has none, and nor does a seal read again. */
  forkBaseSays?: string
  commit: string
  files: SealedFile[]
}
/**
 * ONE REVISION, NAMED AND NOT COPIED. Criterion C34, the decision of 11 September 2026.
 *
 * The record it is of, the revision's own id in the `revisions` table, its sequence number and its
 * hash. Whoever needs the content reads the revision; the seal says WHICH revision it means and what
 * that revision hashed to when the seal was made, so a later edit is visible as a different hash.
 *
 * IT CARRIED THE WHOLE ROW UNTIL 11 SEPTEMBER 2026, in a field called `snapshot`. That is what
 * problem `JRY5OEjnrAPu` cost: an inspector's check died on a prompt of 2,964,703 bytes against a
 * one-million-token limit and produced no verdict. The hash is unchanged — sha256 of the revision
 * row as JSON — so a hash written before that date still means what it meant.
 */
export interface RecordRevisionSeal { record: string; id: string; seq: number; hash: string }
/**
 * ONE LINK, NAMED AND NOT COPIED, as a revision is (round BM, item 2aq). Its id, the sha256 of its row read in the
 * columns of THE_COLUMNS_A_LINK_IS_HASHED_BY (src/server/lib/sealed-tip.ts), and whether it was inferred then.
 */
export interface LinkSeal { id: string; hash: string; inferred: boolean }
export interface RecordSubmission {
  workspace: string
  /**
   * WHERE THE REVISIONS LEDGER STOOD WHEN THIS RUN WAS FILED, so `before` can be found.
   *
   * It is a position in the `revisions` table (its rowid), written by the `submission_run_baseline`
   * trigger. Until 11 September 2026 it was a position in `submission_events`, which no longer
   * exists; migration 0154 converted every row it could and left the rest null.
   *
   * NULL MEANS THE POSITION COULD NOT BE ESTABLISHED, and then every `before` below is null too.
   * `says` gives the reason. A plausible number would be a fabricated one.
   */
  baseline: number | null
  /** Where the revisions ledger stood when the seal was made. */
  through: number
  records: { id: string; before: RecordRevisionSeal | null; after: RecordRevisionSeal }[]
  dependencies: RecordRevisionSeal[]
  /**
   * EVERY LINK WITH ONE OF THE RECORDS ABOVE AT EITHER END when the seal was made, sorted by id. Absent from a seal
   * made before seals pinned links, which is not the same as a seal that pinned none.
   */
  links?: LinkSeal[]
  /** Why a `before` is absent where it is, in one sentence. */
  says: string
}
/**
 * WORK THAT IS A FOLDER OF FILES, SEALED WITH NO GIT AT ALL. The decision of 23 September
 * 2026, option A, on proposal yTg28XxSOqdE: a recovery of bytes that were never in any repository has
 * no git story to tell, so it is sealed as what it is — each file's path, sha256 and mode, read from
 * the folder the run staged it in.
 *
 * `stagedAt` is that folder, absolute. `root` is the folder the files will land in, absolute, and
 * each `path` is relative to both: a staged file at `<stagedAt>/<path>` lands at `<root>/<path>`, so
 * the queue can bind an entry to its seal by path and hash together. `files` is sorted by path.
 */
export interface FilesSubmission {
  stagedAt: string
  root: string
  files: SealedFile[]
}
export interface SealedTip {
  version: 1
  run: string
  execution: string
  attempt: string
  area: string[]
  sealedAt: string
  kind: 'git' | 'records' | 'mixed' | 'files'
  git: GitSubmission | null
  records: RecordSubmission | null
  /**
   * Present on a `files` seal and absent on every other kind, so a seal made before files seals
   * existed hashes exactly as it did.
   */
  files?: FilesSubmission | null
  /**
   * THE KIND OF STANDARD CHANGE THE LINE DECLARED AT THE SEAL, on a git seal only (src/shared/standard-change.ts). Absent
   * when it declared none, so every other seal hashes exactly as it did. A declaration is a claim: the release door
   * checks it against the files changed, and a mismatch goes the ordinary way.
   */
  standard?: StandardKind
  /**
   * THE COPIES THIS SEAL CARRIED WERE DROPPED BY MIGRATION 0154. Absent on every seal made after it.
   *
   * A seal written before 11 September 2026 held whole rows: the revision before and after for every
   * submitted record, the whole row for every dependency, every link row of the workspace before and
   * after, and every ledger event with its payload. Criterion C34 took the copies out and left the
   * pointers and hashes. This block says that happened to THIS seal, names what went, and keeps the
   * hash the seal had before it — `was` — so a hash written down elsewhere still resolves here.
   *
   * `hash` beside it is of the reduced content, so the seal still verifies against itself. The two
   * are different numbers of different things and neither stands in for the other.
   */
  reduced?: {
    /** Which migration did it. */
    by: string
    /** When, in local wall clock. */
    at: string
    /** Which fields were dropped, by name. */
    dropped: string[]
    /** The hash this seal carried before the copies were dropped. */
    was: string
    /** What this seal still proves and what it no longer proves, in one sentence. */
    says: string
  }
  hash: string
}

/**
 * WHETHER A RELEASE'S `read` NAMES THIS SEAL, and how. Problem of 26 September 2026 (runs yFOPdYIV0LTD and
 * _WEgUy59mP1W): migration 0154 dropped the copies in seals made before 11 September and hashed them again, keeping the
 * former hash under `reduced.was` so that a hash written down elsewhere still resolves. A release written before then
 * names the former hash.
 *
 *   'as it is'       the id matches and the hash is the seal's `hash`;
 *   'before 0154'    the id matches and the hash is the seal's `reduced.was` (`reduced` is part of the hashed content,
 *                    so it cannot be changed without the seal failing its own check);
 *   null             it does not name this seal.
 *
 * A reader that compares a release written EARLIER with a seal asks this. A verdict or an assembly written NOW names
 * the seal as it is, and compares with `hash` alone.
 */
export function howAReleaseNamesThisSeal(
  read: { sealId?: string; sealHash?: string } | null | undefined,
  sealId: string,
  seal: Pick<SealedTip, 'hash' | 'reduced'>,
): 'as it is' | 'before 0154' | null {
  if (read === null || read === undefined || read.sealId !== sealId || typeof read.sealHash !== 'string') return null
  if (read.sealHash === seal.hash) return 'as it is'
  if (seal.reduced !== undefined && read.sealHash === seal.reduced.was) return 'before 0154'
  return null
}

/** The sentence a reply adds when a release named its seal as it was before migration 0154. */
export function aReleaseNamedTheSealBefore0154(sealId: string): string {
  return `The release named seal ${sealId} as it was before migration 0154, which dropped the copies the seal carried; the seal keeps that hash under reduced.was, so it is the same seal.`
}
