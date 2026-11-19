// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHERE THIS RECORD'S CODE IS: the implementation map, on the Module, Block and Pipeline pages.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS IS FOR
 * ---------------------------------------------------------------------------------------
 *
 * One earlier piece of work built four tables, twelve routes, two resolvers, a provenance vocabulary
 * of nine sources and a governance guard that lets only a person accept a guess. Nothing under
 * `src/web` called any of it. An independent verifier found that all of it sat behind an HTTP API that
 * no screen in the product read, so five of that work's six dogfood items could not be performed at
 * all, and the one act the guard exists to protect was reachable only with `curl`.
 *
 * This is the surface. It answers four questions, in the wave's own words:
 *
 *   RELATED REPOSITORIES     which trees this record's code lives in, and whether there is a
 *                            checkout of each on this machine.
 *   IMPORTANT PATHS          the patterns somebody stated, each folded to one line.
 *   RELEVANT DEPENDENCIES    what a resolver worked out: files nobody has claimed that this
 *                            record's code imports.
 *   SHARED RESOURCES         a file more than one record was pointed at, with how many.
 *
 * ---------------------------------------------------------------------------------------
 * NO FILE TREE IN NORMAL MODE, AND WHERE THE FOLDING HAPPENS
 * ---------------------------------------------------------------------------------------
 *
 * The plan's own sentence. A stated pattern arrives already folded — `GET /api/implementation/
 * record/:id` gives each row its deepest common directory and a count, so a pattern matching 577
 * files is one line and not 577 — and this file never unfolds it.
 *
 * The candidates do NOT arrive folded, because a candidate is one file and the developer read is
 * about which file. So Normal mode folds them here, by directory, and Developer mode lists them.
 * That is the same split the whole product uses and not a special case: THAT a machine worked
 * something out is normal-mode content, WHICH file and WHICH evidence is machinery.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT A NORMAL READER IS TOLD WITHOUT ASKING
 * ---------------------------------------------------------------------------------------
 *
 * A.4: *"An LLM guess must not silently become canonical ownership."* Every row here carries the
 * word and the glyph the server sent for it — `stated`, `worked out by Mole Office`, `guessed by a
 * machine` — in Normal mode, at rest, with no fold to open. The row carries its `authority`, and the
 * word and its meaning are read from the word lists by that authority, in the page's language; the
 * English is the same as `AUTHORITY_SAYS` in @shared/implementation.ts. The glyph is the one the
 * server sent on the row as `says`. A word and a glyph, never a hue: colour alone would carry
 * the whole distinction for a reader who cannot see it.
 *
 * `notLookedFor` is the fifth invariant on the wire and it is drawn: six of the nine sources have
 * no producer in this build, so a page showing no build-graph relationship says *nobody has looked*
 * rather than letting a reader take it for *there is none*.
 *
 * ---------------------------------------------------------------------------------------
 * THE ACCEPT PRESS, AND THE RULE IT DOES NOT COPY
 * ---------------------------------------------------------------------------------------
 *
 * A proposal is a row an agent wrote and nobody has answered. Accepting it is what turns a guess
 * into ownership, and `assertMayAcceptAGuess` — registered in `GOVERNANCE_GUARDS` — refuses
 * a non-human and refuses an agent accepting its own. THERE IS NO SECOND COPY OF THAT RULE HERE.
 * The press is drawn for every reader and the server decides; a refusal is drawn as the server's
 * own sentence, so a reader acting as an agent is told why by the thing that actually refused.
 * Hiding the press for an agent would be the same permission written in two places, which is this
 * repository's own recurring defect, and it would teach nobody anything.
 */
import type { RecordKind } from '@shared/types.ts'
import { useState } from 'react'

import type { LeftOutCause } from '@shared/disclosure.ts'
import { t, type WordKey } from '@shared/i18n.ts'
import type {
  FindingOut,
  RecordImplementationReply,
  RepositoryImplementation,
  RepositoryOut,
  StatedOut,
} from '../../server/api/implementation.ts'
import { faultOf, api, errorMessage, getActor } from '../api.ts'
import { useInspect, useMode } from '../lib/mode.ts'
import { evidenceSentence, RELATIONS, type Authority, type Provenance, type Relation } from '@shared/implementation.ts'
import { KINDS_WITH_CODE, WHERE_IT_LIVES_KEY } from '@shared/sections.ts'
import { titleHere } from './sections.ts'
import { kindWord, provenanceWord, relationWord } from '@shared/words.ts'
import { pathFor, RouteLink } from './router.tsx'
import type { Declares } from './declares.ts'
import {
  Absence,
  Btn,
  ErrorNote,
  Field,
  Loading,
  Panel,
  Select,
  ServerNote,
  Tag,
  TextArea,
  TextInput,
} from './ui.tsx'
import { useProjectAsync } from '../lib/project-async.ts'

/**
 * The kinds that can hold code. Anything else never mounts this and never asks.
 *
 * DECLARED IN src/shared/sections.ts AND PASSED THROUGH HERE. The same list decides whether the
 * page draws this panel and whether the record has a `section.whereItLives` for a press on it to
 * land on, and the two may not drift apart. It is re-exported rather than restated so the callers
 * and the tests that already read it from this file keep one name for one fact.
 */
export { KINDS_WITH_CODE } from '@shared/sections.ts'

/** Whether a record of this kind has an implementation to draw. */
export function holdsCode(kind: string): boolean {
  return KINDS_WITH_CODE.includes(kind)
}

/**
 * A set of file paths, folded to one line per directory with a count.
 *
 * THE OTHER HALF OF THE ROLL-UP. The server folds a stated PATTERN's matches, because it knows what
 * the pattern matched; a candidate is one file, so the fold for a list of them is here. Both stop
 * the same thing reaching a screen — a page of file names where a reader wanted to know which part
 * of the tree is involved.
 *
 * A file at the root of the repository folds under `.`, the same word the server's own fold uses
 * for that case, rather than under an empty string that would draw as a gap.
 */
export function foldByDirectory(paths: readonly string[]): { path: string; files: number }[] {
  const counts = new Map<string, number>()
  for (const path of paths) {
    const cut = path.lastIndexOf('/')
    const directory = cut === -1 ? '.' : path.slice(0, cut)
    counts.set(directory, (counts.get(directory) ?? 0) + 1)
  }
  return [...counts.entries()]
    .map(([path, files]) => ({ path, files }))
    .sort((a, b) => b.files - a.files || a.path.localeCompare(b.path))
}

/** The word and the meaning for each authority. The English is `AUTHORITY_SAYS` in @shared/implementation.ts. */
const AUTHORITY_WORDS = {
  stated: { word: 'g2b.impl.says.stated.word', meaning: 'g2b.impl.says.stated.meaning' },
  computed: { word: 'g2b.impl.says.computed.word', meaning: 'g2b.impl.says.computed.meaning' },
  guessed: { word: 'g2b.impl.says.guessed.word', meaning: 'g2b.impl.says.guessed.meaning' },
} as const satisfies Record<Authority, { word: WordKey; meaning: WordKey }>

/** What each cause of a left-out group means. These keys are the only place the sentences are written. */
const LEFT_OUT_WORDS = {
  selection: 'g2b.impl.leftOutMeans.selection',
  budget: 'g2b.impl.leftOutMeans.budget',
  permission: 'g2b.impl.leftOutMeans.permission',
} as const satisfies Record<LeftOutCause, WordKey>

/**
 * Why a source has no producer, for the sources where that was refused rather than not yet built.
 * The English is the `refused` paragraph in `PROVENANCE`, @shared/implementation.ts.
 */
const REFUSED_WORDS: Partial<Record<Provenance, WordKey>> = {
  structure: 'g2b.impl.refused.structure',
  observed_write: 'g2b.impl.refused.observed_write',
}

/** What this row's authority means, as a word and a glyph. The meaning is on the tooltip. */
function Says({ authority, glyph }: { authority: Authority; glyph: string }) {
  const words = AUTHORITY_WORDS[authority]
  return (
    <span className="im-says" title={t(words.meaning)}>
      {glyph === '' ? null : (
        <span className="im-glyph" aria-hidden="true">
          {glyph}
        </span>
      )}
      <span className="im-says-word">{t(words.word)}</span>
    </span>
  )
}

/** One stated or proposed pattern: what it says, what it covers, and whether it still covers it. */
function PatternRow({
  row,
  act,
}: {
  row: StatedOut
  /** The accept press, on a proposal. Absent on a row somebody already stated. */
  act?: React.ReactNode
}) {
  const mode = useMode()
  return (
    <li className="im-row">
      <div className="im-row-head">
        <code className="im-pattern wrap-anywhere">{row.pattern}</code>
        <Tag tone="quiet">{relationWord(row.relation, mode).text}</Tag>
        <Says authority={row.authority} glyph={row.says.glyph} />
        {act}
      </div>
      <div className="im-row-under">
        {row.stale ? (
          <Absence
            tier="must-act-on"
            sentence={
              <>
                <code className="wrap-anywhere">{row.pattern}</code> {t('g2b.impl.staleMatchesNothing')}
                {row.nearestThatExists === null ? null : (
                  <>
                    {' '}
                    <code className="wrap-anywhere">{row.nearestThatExists}</code> {t('g2b.impl.staleStillThere')}
                  </>
                )}
              </>
            }
          />
        ) : (
          row.directories.map((held) => (
            <span className="im-dir" key={held.path}>
              <code className="wrap-anywhere">{held.path}</code>
              <span className="im-count num">{held.files}</span>
            </span>
          ))
        )}
        <Machineries row={row} />
      </div>
    </li>
  )
}

/** The parts of one stated row that are for a developer: which source, and when it was written. */
function Machineries({ row }: { row: StatedOut }) {
  const inspect = useInspect()
  const mode = useMode()
  if (!inspect) return null
  return (
    <span className="im-machinery">
      <Tag tone="quiet">{provenanceWord(row.provenance, mode).text}</Tag>
      <span className="im-by">{row.statedBy}</span>
      {row.acceptedBy === null ? null : <span className="im-by">{row.acceptedBy}</span>}
      {row.revisionId === null ? null : <code className="im-rev">{row.revisionId}</code>}
    </span>
  )
}

/**
 * WHAT A RESOLVER WORKED OUT, FOLDED FOR A READER AND LISTED FOR A DEVELOPER.
 *
 * The authority word is on the group and not on every row, because every candidate in one group
 * carries the same one — repeating it twenty times is the same fact drawn twenty times, and it
 * would push the paths it is about off the side of a phone.
 */
function Candidates({ findings }: { findings: readonly FindingOut[] }) {
  const inspect = useInspect()
  const mode = useMode()
  const first = findings[0]
  if (first === undefined) return null
  return (
    <div className="im-group">
      <div className="im-group-head">
        <span className="im-heading">{t('g2b.impl.relevantDependencies')}</span>
        <span className="im-count num">{findings.length}</span>
        <Says authority={first.authority} glyph={first.says.glyph} />
      </div>
      {inspect ? (
        <ul className="im-list im-list-parted">
          {findings.map((finding) => (
            <li className="im-row" key={finding.rowId}>
              <div className="im-row-head">
                <code className="im-pattern wrap-anywhere">{finding.path}</code>
                <Tag tone="quiet">{relationWord(finding.relation, mode).text}</Tag>
                <Tag tone="quiet">{provenanceWord(finding.provenance, mode).text}</Tag>
              </div>
              {/* THE TWO STORED FACTS, JOINED BY THE SHARED COMPOSER AND NOT BY THIS FILE.
                  `evidenceSentence` is in @shared/implementation.ts beside the rule that says why
                  the sentence is not a column, and drawing the two facts as two separate boxes was
                  measured at 390px: the pairs interleaved down the column and a reader could not
                  tell which specifier belonged to which file. */}
              <div className="im-row-under">
                <code className="im-evidence wrap-anywhere">
                  {evidenceSentence(finding.evidencePath, finding.provenance, finding.evidenceDetail)}
                </code>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <ul className="im-list">
          {foldByDirectory(findings.map((finding) => finding.path)).map((held) => (
            <li className="im-row im-row-thin" key={held.path}>
              <code className="wrap-anywhere">{held.path}</code>
              <span className="im-count num">{held.files}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/**
 * A file more than one record was pointed at, and how many others.
 *
 * THESE ARE NAMED AND NOT FOLDED, and that is not a hole in the no-file-tree rule. A shared
 * resource is interesting BY NAME — the question it answers is *which file do two pieces of work
 * both reach into* — and folding `src/shared/types.ts` to `src/shared` destroys the whole of what
 * the list is for. The candidates above are folded because the question there is which part of the
 * tree is involved. Different question, different drawing.
 */
function SharedResources({ findings }: { findings: readonly FindingOut[] }) {
  const shared = findings.filter((finding) => finding.alsoSuggestedFor > 0)
  return (
    <div className="im-group">
      <div className="im-group-head">
        <span className="im-heading">{t('g2b.impl.sharedResources')}</span>
        {shared.length === 0 ? null : <span className="im-count num">{shared.length}</span>}
      </div>
      {shared.length === 0 ? (
        <Absence
          tier="told-apart"
          looked
          word={t('g2b.impl.noneShared')}
          title={t('g2b.impl.noneSharedTitle')}
        />
      ) : (
        <ul className="im-list">
          {shared.map((finding) => (
            <li className="im-row im-row-thin" key={finding.rowId}>
              <code className="wrap-anywhere">{finding.path}</code>
              <span
                className="im-count num"
                title={t('g2b.impl.alsoSuggestedTitle')}
              >
                {finding.alsoSuggestedFor}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/**
 * DELETE A RELATIONSHIP THE PERSON STATED, WITH A CONFIRM IN THE PRODUCT'S OWN WAY. Criterion M118.
 *
 * The door is `DELETE /api/implementation/:id`, which existed from that first piece of work and had no caller in
 * `src/web`. The gate is `assertMayRetireSomebodyElsesRow` in src/server/lib/records/implementation-map-gates.ts: an agent
 * may delete its own rows and rows a person did not write, and may not delete what a person stated.
 * So the press is drawn only on a row whose author starts with `human:` and only to a viewer who is
 * a person, and a refusal is drawn as the server's own sentence.
 *
 * THE DELETE KEY ONLY APPEARS AFTER A FIRST PRESS, and the confirm names the exact pattern it takes
 * away. Deleting is not an alarm until it is one, which is the rule `RecordHead` writes for the
 * record page's own delete; the confirm is what carries the danger colour.
 */
function DeleteARelationship({
  rowId,
  pattern,
  onDeleted,
}: {
  rowId: string
  pattern: string
  onDeleted: () => void
}) {
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState<{ message: string; fault: ReturnType<typeof faultOf> } | null>(null)

  async function remove(): Promise<void> {
    setBusy(true)
    setFailed(null)
    try {
      await api.deleteImplementation(rowId)
      onDeleted()
    } catch (err) {
      setFailed({ message: errorMessage(err), fault: faultOf(err) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <span className="im-delete">
        {confirming ? (
          <>
            <Btn size="sm" variant="danger" pending={busy} onClick={() => void remove()}>
              {t('g2b.impl.confirmDelete', { pattern })}
            </Btn>
            <Btn size="sm" variant="ghost" onClick={() => setConfirming(false)}>
              {t('g2b.impl.keepIt')}
            </Btn>
          </>
        ) : (
          <Btn
            size="sm"
            variant="ghost"
            onClick={() => setConfirming(true)}
            title={t('g2b.impl.deleteTitle')}
          >
            {t('g2b.impl.delete')}
          </Btn>
        )}
      </span>
      {failed === null ? null : <ErrorNote message={failed.message} fault={failed.fault} label={t('g2b.impl.notDeleted')} />}
    </>
  )
}

/** Everything one repository holds for this record. */
function OneRepository({
  held,
  accepting,
  onAccept,
  onDeleted,
}: {
  held: RepositoryImplementation
  accepting: string | null
  onAccept: (rowId: string) => void
  onDeleted: () => void
}) {
  const isPerson = getActor().type === 'human'
  return (
    <div className="im-repo">
      <div className="im-repo-head">
        <span className="im-repo-name">{held.repository.name}</span>
        {held.repository.hasRoot ? null : (
          <Tag tone="warn" title={t('g2b.impl.noCheckoutTitle')}>
            {t('g2b.impl.noCheckout')}
          </Tag>
        )}
        {held.indexed ? null : (
          <Tag tone="warn" title={t('g2b.impl.neverScannedTitle')}>
            {t('g2b.impl.neverScanned')}
          </Tag>
        )}
        <span className="im-files">
          <span className="im-count num">{held.fileCount}</span>
          <span className="im-unit">{t('g2b.impl.filesStated', { n: held.fileCount })}</span>
        </span>
      </div>

      <div className="im-group">
        <div className="im-group-head">
          <span className="im-heading">{t('g2b.impl.importantPaths')}</span>
          {held.stated.length === 0 ? null : <span className="im-count num">{held.stated.length}</span>}
        </div>
        {held.stated.length === 0 ? (
          <Absence
            tier="told-apart"
            looked
            word={t('g2b.impl.nothingStated')}
            title={t('g2b.impl.nothingStatedTitle')}
          />
        ) : (
          <ul className="im-list">
            {held.stated.map((row) => (
              <PatternRow
                row={row}
                key={row.rowId}
                // THE PERSON MAY TAKE BACK WHAT THE PERSON STATED, and nobody else's press is
                // offered: an agent that disagrees writes its own row beside this one instead.
                act={
                  isPerson && row.statedBy.startsWith('human:') ? (
                    <DeleteARelationship rowId={row.rowId} pattern={row.pattern} onDeleted={onDeleted} />
                  ) : undefined
                }
              />
            ))}
          </ul>
        )}
      </div>

      {held.proposed.length === 0 ? null : (
        <div className="im-group im-group-ask">
          <div className="im-group-head">
            <span className="im-heading">{t('g2b.impl.decisions')}</span>
            <span className="im-count num">{held.proposed.length}</span>
          </div>
          <ul className="im-list">
            {held.proposed.map((row) => (
              <PatternRow
                row={row}
                key={row.rowId}
                act={
                  <Btn
                    size="sm"
                    variant="ask"
                    pending={accepting === row.rowId}
                    onClick={() => onAccept(row.rowId)}
                    title={t('g2b.impl.acceptTitle')}
                  >
                    {t('g2b.impl.accept')}
                  </Btn>
                }
              />
            ))}
          </ul>
        </div>
      )}

      {/* THE REPLY CALLS THIS LIST `disagreements` AND ON THIS READ IT HOLDS AGREEMENTS, so the
          heading says what the rows are rather than what the field is called.

          `GET /api/implementation/record/:id` builds it as *candidates for this record whose path a
          stated row of this record already covers*, and its own comment says it expects zero
          "because every candidate is computed over uncovered files only and so cannot yet
          contradict a claim". That holds until somebody presses Accept: the file becomes claimed,
          the finding written by the last rebuild is still there, and the row appears. MEASURED — it
          is what this panel drew the second after the accept press below worked.

          A row saying *disagreement* about a file this record has just taken ownership of would be
          the interface telling a person their own decision contradicts them. Drawn as what it is
          instead, and the mismatch is reported rather than repaired here: making the field mean its
          name needs a read that can see OTHER records' stated rows, which `findingsFor(recordId)`
          cannot, and that is a change to the route rather than to the surface drawing it. */}
      {held.disagreements.length === 0 ? null : (
        <div className="im-group">
          <div className="im-group-head">
            <span
              className="im-heading"
              title={t('g2b.impl.alreadyStatedTitle')}
            >
              {t('g2b.impl.alreadyStated')}
            </span>
            <span className="im-count num">{held.disagreements.length}</span>
          </div>
          <ul className="im-list">
            {held.disagreements.map((finding) => (
              <li className="im-row im-row-thin" key={finding.rowId}>
                <code className="wrap-anywhere">{finding.path}</code>
                <Says authority={finding.authority} glyph={finding.says.glyph} />
              </li>
            ))}
          </ul>
        </div>
      )}

      <Candidates findings={held.suggested} />
      <SharedResources findings={held.suggested} />
    </div>
  )
}

/**
 * WHAT THIS READ LEFT OUT, AND THE WAY TO THE REST OF IT.
 *
 * The candidate list is budgeted at twenty per repository and the reply says so in the product's
 * disclosure shape: how many were counted, how many are carried, how many are in which bucket.
 * MEASURED on this checkout: 71 candidates, 20 carried, 51 left out under `budget`/`page`. A panel
 * that drew the twenty and nothing else would be showing a fifth of an answer as if it were all of
 * it, which is the one thing `checkSubtraction` throws on the server to prevent.
 *
 * The press is here because a number a person cannot open is a dead end. Paging REPLACES the list
 * rather than growing it, deliberately: the reader is walking a budgeted answer, and a list that
 * grew would lose the count of what is still beyond it.
 */
function WhatWasLeftOut({
  reply,
  page,
  onPage,
}: {
  reply: RecordImplementationReply
  page: number
  onPage: (next: number) => void
}) {
  const inspect = useInspect()
  if (reply.counts.leftOut === 0 && page === 0) return null
  return (
    <div className="im-cut">
      <span className="im-heading">{t('g2b.impl.leftOut')}</span>
      <span
        className="im-count num"
        title={t('g2b.impl.leftOutTitle')}
      >
        {reply.counts.leftOut}
      </span>
      {/* THE BUCKET WORD IS MACHINERY. `budget`/`page` is the disclosure shape's own vocabulary and
          it says nothing to a reader that the count and the press beside it do not already say. The
          count, the meaning on its tooltip and the way to the rest are what a person needs; which
          rule of which cause dropped them is what a developer needs. */}
      {inspect
        ? reply.leftOut.map((group) => (
            <Tag tone="quiet" key={group.bucket} title={t(LEFT_OUT_WORDS[group.cause])}>
              {group.cause} · {group.bucket}
            </Tag>
          ))
        : null}
      {page === 0 ? null : (
        <Btn size="sm" variant="ghost" onClick={() => onPage(page - 1)}>
          {t('g2b.impl.backAPage')}
        </Btn>
      )}
      {reply.counts.leftOut === 0 ? null : (
        <Btn size="sm" variant="ghost" onClick={() => onPage(page + 1)}>
          {t('g2b.impl.nextPage')}
        </Btn>
      )}
    </div>
  )
}

/**
 * THE SOURCES NOTHING IN THIS BUILD HAS LOOKED WITH, DRAWN AT REST AND NOT BEHIND A PRESS.
 *
 * THE FIFTH INVARIANT. Six of the nine sources have no producer here, so an empty candidate list is
 * either *there are none* or *nothing has ever looked*, and those are different facts. A reader who
 * has to open a fold to learn which one they are looking at has been told nothing.
 *
 * IT WAS BEHIND AN `Explain` FOR AN HOUR AND THAT WAS WRONG TWICE OVER. `tests/drawn.ts` strips
 * `<details>` before it reads what a surface says, because a fold is not the resting state — so the
 * mark did not exist as far as every instrument in this repository was concerned, and the test that
 * was meant to hold this invariant passed on markup nobody could see. The six readings are six
 * short phrases; they cost less on the page than the fold's own summary did.
 *
 * The two REFUSED ones keep their paragraph on a tooltip. Refusing to build a structure resolver is
 * an argument, and an argument belongs where somebody who wants it can get it.
 */
function NobodyHasLooked({ reply }: { reply: RecordImplementationReply }) {
  const mode = useMode()
  if (reply.notLookedFor.length === 0) return null
  return (
    <div className="im-unlooked">
      <Absence
        tier="told-apart"
        looked={false}
        word={t('g2b.impl.sourcesNotLooked', { n: reply.notLookedFor.length })}
        title={t('g2b.impl.sourcesNotLookedTitle')}
      />
      <ul className="im-list im-list-inline">
        {reply.notLookedFor.map((source) => {
          // THE SERVER DECIDES WHETHER A SOURCE WAS REFUSED; THE PARAGRAPH IS READ IN THE PAGE'S
          // LANGUAGE. A refusal this file has no words for keeps the server's own English.
          const refusedKey = REFUSED_WORDS[source.provenance]
          const why = source.refused === null ? null : refusedKey === undefined ? source.refused : t(refusedKey)
          return (
            <li className="im-unlooked-one" key={source.provenance}>
              <span className="im-unlooked-word" {...(why === null ? {} : { title: why })}>
                {provenanceWord(source.provenance, mode).text}
              </span>
              {why === null ? null : (
                <span className="im-unit" title={why}>
                  {t('g2b.impl.refusedWord')}
                </span>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

/**
 * SAY WHICH CODE THIS RECORD IS — §7.2's **Add code**, on the Module, Block and Pipeline pages.
 *
 * ---------------------------------------------------------------------------------------
 * WHY IT IS HERE AND NOT IN SETTINGS
 * ---------------------------------------------------------------------------------------
 *
 * `implementation-map.md` §7.2 opens: *"A person presses Add code on a Module, Block or Pipeline
 * page, or an agent sends POST /api/implementation"*. Registering a repository is configuration and
 * lives in Settings; saying which code THIS record is, is work on this record and lives on it.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THE PANEL WAS UNREACHABLE WITHOUT IT, EVEN WITH A REPOSITORY REGISTERED
 * ---------------------------------------------------------------------------------------
 *
 * `GET /api/implementation/record/:id` answers about the repositories THIS RECORD has rows in —
 * `repositoryIds` is built from the record's own stated rows and findings. A record with no rows
 * therefore draws no repository at all, however many the project holds. So registering one is half
 * the way in and this is the other half: without both, the owner's Module pages go on drawing
 * *nothing said*.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS NOT CHECKED HERE, AND WHERE IT IS
 * ---------------------------------------------------------------------------------------
 *
 * The pattern is sent as typed. `claimProblem` refuses an absolute path, a backslash and a `..`
 * with the sentence it already writes; the unique index refuses an exact repeat and names the row
 * it clashes with, including telling a person restating an agent's guess to accept it instead. Each
 * refusal is drawn here as the server's own sentence. A second copy of any of those rules in the
 * browser is the same rule written twice, which is this repository's own recurring defect.
 *
 * `proposing` IS NEVER SENT FROM HERE. A person pressing this is stating a fact, so the row is
 * `declared`. The flag exists for an agent that has read the code and is guessing.
 */
export function AddCode({ recordId, onWritten }: { recordId: string; onWritten: () => void }) {
  const [reading] = useProjectAsync(() => api.repositories(), [])
  if (reading.status === 'loading') return <Loading label={t('g2b.impl.loadingRepositories')} rows={1} />
  if (reading.status === 'error') return <ErrorNote message={reading.message} fault={reading.fault} />
  return <AddCodeForm recordId={recordId} repositories={reading.value.repositories} onWritten={onWritten} />
}

/**
 * THE FORM ITSELF, WITH NOTHING FETCHING INSIDE IT.
 *
 * SPLIT OUT FOR THE SAME REASON `ImplementationRead` IS: `useAsync` runs in an effect and
 * `renderToStaticMarkup` does not run effects, so a test of the shell above could only ever
 * photograph its loading state. `tests/where-this-record-lives.test.ts` renders this with the list
 * the route really returns, and with the empty list the owner's corpus really returns.
 */
export function AddCodeForm({
  recordId,
  repositories,
  onWritten,
}: {
  recordId: string
  repositories: readonly RepositoryOut[]
  onWritten: () => void
}) {
  const mode = useMode()
  const [repositoryId, setRepositoryId] = useState('')
  const [pattern, setPattern] = useState('')
  const [relation, setRelation] = useState<Relation>('implements')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [refused, setRefused] = useState<{ message: string; fault: ReturnType<typeof faultOf> } | null>(null)
  const [wrote, setWrote] = useState<string | null>(null)

  const held = repositories
  // THE PROJECT HOLDS NONE, WHICH IS A GAP SOMEBODY CAN GO AND CLOSE. A pattern is relative to a
  // tree, so there is nothing to write until one exists — and the way there is a press, not a
  // paragraph. `must-act-on` is the tier for exactly this: an absence with a way out.
  //
  // THE STATE IS THE WORDS AND THE WAY OUT IS THE LINK, and the argument for why a pattern needs a
  // tree at all is on the tooltip. Writing that argument on the screen would be the contract's own
  // failed fix — "a fix that amounts to 'add a sentence explaining it' is a failed fix" — and it
  // would be read every time by people who already know it.
  if (held.length === 0) {
    return (
      <Absence
        tier="must-act-on"
        sentence={
          <span title={t('g2b.impl.noRepositoryTitle')}>
            {t('g2b.impl.noRepository')}
          </span>
        }
        action={
          <RouteLink to={pathFor('settings')} className="im-to-settings">
            {t('g2b.impl.registerOne')}
          </RouteLink>
        }
      />
    )
  }

  const chosen = repositoryId === '' ? (held[0]?.id ?? '') : repositoryId

  async function write(): Promise<void> {
    setBusy(true)
    setRefused(null)
    setWrote(null)
    try {
      const done = await api.declareImplementation({
        recordId,
        repositoryId: chosen,
        pattern,
        relation,
        note: note.trim() === '' ? null : note,
      })
      // WHAT IT MATCHES NOW, which is §7.2 step 6: the writer sees at once whether the pattern hit
      // anything, and a repository nothing has scanned is told apart from a pattern that hit none.
      setWrote(done.note)
      setPattern('')
      setNote('')
      onWritten()
    } catch (err) {
      setRefused({ message: errorMessage(err), fault: faultOf(err) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="im-add">
      {refused === null ? null : <ErrorNote message={refused.message} fault={refused.fault} label={t('g2b.impl.notWritten')} />}
      {wrote === null ? null : <ServerNote text={wrote} />}
      <Field label={t('g2b.impl.repository')}>
        <Select
          value={chosen}
          onChange={setRepositoryId}
          options={held.map((repository) => ({ value: repository.id, label: repository.name }))}
        />
      </Field>
      <Field label={t('g2b.impl.pathOrPattern')}>
        <TextInput value={pattern} onChange={setPattern} mono placeholder={t('pageWords.Implementation.001')} />
      </Field>
      <Field label={t('g2b.impl.whatItDoes')}>
        <Select
          value={relation}
          onChange={setRelation}
          options={RELATIONS.map((one) => ({ value: one, label: relationWord(one, mode).text }))}
        />
      </Field>
      <Field label={t('g2b.impl.why')} optional>
        <TextArea value={note} onChange={setNote} rows={2} placeholder={t('g2b.impl.inYourWords')} />
      </Field>
      <div className="im-add-acts">
        <Btn
          variant="primary"
          pending={busy}
          disabled={pattern.trim() === ''}
          reason={t('g2b.impl.addReason')}
          onClick={() => void write()}
        >
          {t('g2b.impl.add')}
        </Btn>
      </div>
    </div>
  )
}

/**
 * THE PANEL THE THREE RECORD PAGES MOUNT.
 *
 * IT DECLARES THE SECTION IT DRAWS, AND THE ANSWER IS WORKED OUT BY THE PAGE. It used to be
 * see-through, on the argument that the panel's rows come from OTHER records so the record around
 * it is the better answer to *what is this*. That argument is right about a ROW and wrong about the
 * PANEL. Measured on 30 August 2026 on module `cegP4HnIk9nd`: right-clicking this panel's heading
 * put *PanelX — work-state rules* in the composer, so a reader saying "this panel is empty on every
 * record" was filed as a remark about the module's own subject matter. *Implementation* is one of
 * the six meaningful sections the owner's own acceptance names on a module page.
 *
 * The rows inside it still name what they name; only the panel changed.
 */
export function WhereThisLives({
  recordId,
  kind,
  declares,
}: {
  recordId: string
  kind: string
  /** `sectionsOf(record)(WHERE_IT_LIVES_KEY)` — worked out by the page, spelled by nobody here. */
  declares: Declares
}) {
  const mode = useMode()
  const [page, setPage] = useState(0)
  const [reading, reload] = useProjectAsync(() => api.implementationForRecord(recordId, page), [recordId, page])
  const [accepting, setAccepting] = useState<string | null>(null)
  const [refused, setRefused] = useState<{ message: string; fault: ReturnType<typeof faultOf> } | null>(null)
  const [adding, setAdding] = useState(false)

  async function accept(rowId: string): Promise<void> {
    setAccepting(rowId)
    setRefused(null)
    try {
      await api.acceptImplementationGuess(rowId)
      reload()
    } catch (err) {
      // THE SERVER'S OWN SENTENCE, not a rewording of it. `assertMayAcceptAGuess` explains why it
      // refused — a non-human, or an agent accepting its own proposal — and a second wording here
      // would be a second copy of a rule that lives in one place.
      setRefused({ message: errorMessage(err), fault: faultOf(err) })
    } finally {
      setAccepting(null)
    }
  }

  const count = reading.status === 'ready' ? reading.value.repositories.length : 0

  return (
    <Panel
      declares={declares}
      title={titleHere(kind as RecordKind, WHERE_IT_LIVES_KEY)}
      // THROUGH THE TABLE, and the machine-word gate is what caught it: `block` is stored and
      // "step" is what a person says, so the heading read "the code this block is" on every step
      // page in the product until the scanner named the line.
      kind={t('g2b.impl.panelKind', { kind: kindWord(kind, mode).text })}
      // ADD CODE IS ALWAYS OFFERED, INCLUDING WHEN THE PANEL IS EMPTY, and especially then: an
      // empty panel is the state every record on the owner's corpus is in, and a panel that says
      // "nothing said" with no way to say anything is the fault this control closes.
      actions={
        <>
          {count === 0 ? null : <span className="im-count num">{count}</span>}
          <Btn size="sm" variant="ghost" onClick={() => setAdding(!adding)}>
            {adding ? t('g2b.impl.cancel') : t('g2b.impl.addCode')}
          </Btn>
        </>
      }
    >
      <style href="mole-office-implementation" precedence="default">
        {IMPLEMENTATION_CSS}
      </style>

      {refused === null ? null : <ErrorNote message={refused.message} fault={refused.fault} label={t('g2b.impl.notAccepted')} />}

      {adding ? (
        <AddCode
          recordId={recordId}
          onWritten={() => {
            setAdding(false)
            reload()
          }}
        />
      ) : null}

      {reading.status === 'loading' ? (
        <Loading label={t('g2b.impl.loadingWhereItLives')} rows={2} />
      ) : reading.status === 'error' ? (
        <ErrorNote message={reading.message} fault={reading.fault} retry={reload} />
      ) : (
        <ImplementationRead
          reply={reading.value}
          page={page}
          onPage={setPage}
          accepting={accepting}
          onAccept={(rowId) => void accept(rowId)}
          // THE PAGE READS AGAIN AFTER A DELETE, so the row is gone from the list above rather than
          // sitting there looking like a press that did nothing.
          onDeleted={reload}
        />
      )}
    </Panel>
  )
}

/**
 * EVERYTHING THE PANEL DRAWS ONCE THE READ HAS LANDED, WITH NOTHING FETCHING INSIDE IT.
 *
 * SPLIT OUT SO IT CAN BE RENDERED FROM A REPLY. `useAsync` runs in an effect and
 * `renderToStaticMarkup` does not run effects, so a test of the whole panel can only ever
 * photograph its loading state — which is how a surface comes to be "tested" by a test that has
 * never seen a row. The shell above owns the request, the mode-dependent drawing lives here, and
 * `tests/where-this-record-lives.test.ts` hands it a reply the route really produced.
 */
export function ImplementationRead({
  reply,
  page,
  onPage,
  accepting,
  onAccept,
  onDeleted = () => {},
}: {
  reply: RecordImplementationReply
  page: number
  onPage: (next: number) => void
  accepting: string | null
  onAccept: (rowId: string) => void
  /** Re-read after a relationship was deleted. Optional so a test can render a reply with no page. */
  onDeleted?: () => void
}) {
  return (
    <>
      {reply.repositories.length === 0 ? (
        <Absence
          tier="told-apart"
          looked
          word={t('g2b.impl.nothingSaid')}
          title={t('g2b.impl.nothingSaidTitle')}
        />
      ) : (
        reply.repositories.map((held) => (
          <OneRepository
            held={held}
            key={held.repository.id}
            accepting={accepting}
            onAccept={onAccept}
            onDeleted={onDeleted}
          />
        ))
      )}
      <WhatWasLeftOut reply={reply} page={page} onPage={onPage} />
      <NobodyHasLooked reply={reply} />
      <ServerNote text={reply.note} />
    </>
  )
}

const IMPLEMENTATION_CSS = `
.im-repo { border-top: 1px solid var(--edge); padding-top: 10px; margin-top: 10px; }
.im-repo:first-of-type { border-top: 0; padding-top: 0; margin-top: 0; }
.im-repo-head { display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap; margin-bottom: 6px; }
.im-repo-name { font-weight: 600; }
.im-group { margin: 8px 0; }
.im-group-head { display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap; }
.im-heading { font-size: 0.82rem; letter-spacing: 0.04em; text-transform: uppercase; color: var(--ink-3); }
.im-count { color: var(--ink-3); font-variant-numeric: tabular-nums; }
.im-files { display: inline-flex; align-items: baseline; gap: 4px; }
.im-unit { color: var(--ink-3); font-size: 0.82rem; }
.im-list { list-style: none; margin: 4px 0 0; padding: 0; display: flex; flex-direction: column; gap: 4px; }
/* A row that carries a second line needs an edge, or two rows read as one at 390px. Measured. */
.im-list-parted { gap: 8px; }
.im-list-parted .im-row + .im-row, .im-list-parted .im-row { padding-left: 8px; border-left: 2px solid var(--edge); }
.im-row { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.im-row-thin { flex-direction: row; align-items: baseline; gap: 8px; flex-wrap: wrap; }
.im-row-head { display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap; min-width: 0; }
.im-row-under { display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; min-width: 0; }
.im-pattern { font-size: 0.9em; }
.im-dir { display: inline-flex; align-items: baseline; gap: 6px; min-width: 0; }
.im-says { display: inline-flex; align-items: baseline; gap: 4px; color: var(--ink-3); font-size: 0.86rem; }
.im-glyph { font-family: var(--font-mono); }
.im-machinery { display: inline-flex; align-items: baseline; gap: 6px; flex-wrap: wrap; }
.im-delete { display: inline-flex; align-items: baseline; gap: 8px; flex-wrap: wrap; }
.im-by, .im-rev, .im-evidence { color: var(--ink-3); font-size: 0.82rem; }
.im-cut { display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap; margin-top: 8px; }
.im-unlooked { display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap; margin-top: 8px; }
.im-list-inline { flex-direction: row; flex-wrap: wrap; gap: 4px 12px; }
.im-unlooked-one { display: inline-flex; align-items: baseline; gap: 4px; }
.im-unlooked-word { color: var(--ink-3); font-size: 0.86rem; min-width: 0; }
.im-group-ask { border-left: 2px solid var(--ask); padding-left: 8px; }
.im-add { display: flex; flex-direction: column; gap: 8px; margin-bottom: 10px; }
.im-add-acts { display: flex; gap: 8px; flex-wrap: wrap; }
.im-to-settings { color: inherit; }
`
