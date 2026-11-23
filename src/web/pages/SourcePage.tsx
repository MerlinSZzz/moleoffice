// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * The whole derived layer, and the two questions it exists for.
 *
 * NO ROUTE REACHES THIS PAGE, and nobody can open it in Mole Office. Nothing has imported it since the
 * first import of 8 August 2026, no decision of the owner's gives it a place, and wave 13k, whose page
 * it is, agreed on 6 October 2026 to leave it unrouted (message v9By4_ZRy1NN): a route would be a new
 * page the owner should see first. Tests draw its parts directly. So its "Rebuild from disk" press
 * cannot be pressed, and no sentence elsewhere may send a person here.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS PAGE IS, AND WHAT IT IS NOT
 * ---------------------------------------------------------------------------------------
 * Everything else in Mole Office is curated: somebody decided it was worth writing down. This page is
 * the opposite — a machine's answer to "what is actually in this repository", rebuilt by a scan
 * and typed by nobody. It is here because a curated model of a codebase and a real codebase drift
 * apart the moment somebody renames a file, and the only honest way to find that out is to ask
 * the disk.
 *
 * So this is NOT where a subsystem is described. A module record is. Nothing on this page can be
 * edited; the single write it offers is a REBUILD, which replaces every row rather than merging,
 * and which is safe to offer for exactly that reason — there is nothing in here that a person
 * wrote and could lose.
 *
 * ---------------------------------------------------------------------------------------
 * THE TWO QUERIES, AND WHY THEY ARE DRAWN DIFFERENTLY
 * ---------------------------------------------------------------------------------------
 *   STALE CLAIMS  a module points at a path that is not there any more. Something that used to
 *                 resolve no longer does — almost always a rename. This is BROKEN: the same
 *                 shape, tone and words as a link whose target was deleted, because it is the
 *                 same accident one level down. It gets the alarm.
 *
 *   UNCLAIMED     code no module has taken responsibility for. Nothing is wrong with an
 *                 unclaimed file: it may be new, it may be a script nobody needs to describe.
 *                 It is a FINDING — the same family as "results nothing is using" on the Queries
 *                 page — so it gets a normal panel and a plain count. Tinting it red would spend
 *                 the alarm colour on the usual case, and then a real break would not read.
 *
 * That is the same distinction the app already draws between incomplete and broken, and it is
 * what lets both queries sit on one page without the page reading as a list of faults.
 *
 * The age of the index rides in the header of every panel here rather than once at the top: the
 * page is long, and an age you scrolled past is an age nobody read. See IndexAge in
 * ModuleSource.tsx for what the browser can and cannot honestly say about the disk.
 */

import { useState } from 'react'
import { errorMessage, faultOf, type Fault } from '../api.ts'
import type { CoverageInOneRepository, ReindexReport, SourceFile, SourceIndexStamp, SourceCoverage } from '@shared/types.ts'
import { content, t } from '@shared/i18n.ts'
import { recordPath, RouteLink } from '../components/router.tsx'
// WHICH PROJECT THIS PAGE IS READING. Every row below is a record in it.
import { currentWorkspace } from '../lib/workspace.ts'
import {
  DerivedNote,
  FileLine,
  IndexAge,
  ScanLimits,
  SourceStyles,
  dirOf,
  formatBytes,
  notCountedIn,
  plural,
  sourceApi,
} from '../components/ModuleSource.tsx'
import {
  Btn,
  Empty,
  ErrorNote,
  Field,
  Loading,
  Panel,
  Row,
  Tag,
  TextInput,
} from '../components/ui.tsx'
import { useProjectAsync } from '../lib/project-async.ts'

// ============================================================================ pure helpers

/** These rows carry no settable state, so the severity column is closed rather than left empty. */
const NO_SEVERITY_COLS = '0 minmax(0, 1fr) auto'

/** A file that matched a search, and — when the match is not visible on the row — why. */
export interface FileMatch {
  file: SourceFile
  /**
   * The reason this file matched, when that reason is not already on the row. A search that hits
   * an import specifier would otherwise look like a mistake: the query appears nowhere in the
   * path, the language or the size, and the row would sit there unexplained.
   */
  note: string | null
}

/**
 * Search the index by path, language, import and export.
 *
 * Imports and exports are searchable but are NOT listed on every row: four hundred files each
 * printing every specifier they import is a wall nobody reads, and the counts are what a reader
 * scans. Searching is how the detail is reached, and a match outside the path always explains
 * itself on the row it produced.
 *
 * An empty query returns everything, with no notes — not "no results". A blank box is not a
 * filter.
 */
export function searchFiles(files: readonly SourceFile[], query: string): FileMatch[] {
  const needle = query.trim().toLowerCase()
  if (needle === '') return files.map((file) => ({ file, note: null }))

  const matches: FileMatch[] = []
  for (const file of files) {
    const inPath = file.path.toLowerCase().includes(needle)
    const inLanguage = file.language.toLowerCase().includes(needle)
    const imports = file.imports.filter((spec) => spec.toLowerCase().includes(needle))
    const exports = file.exports.filter((name) => name.toLowerCase().includes(needle))
    if (!inPath && !inLanguage && imports.length === 0 && exports.length === 0) continue

    const reasons: string[] = []
    if (imports.length > 0) reasons.push(`imports ${imports.join(', ')}`)
    if (exports.length > 0) reasons.push(`exports ${exports.join(', ')}`)
    matches.push({ file, note: reasons.length > 0 ? reasons.join(' · ') : null })
  }
  return matches
}

export interface DirGroup {
  dir: string
  files: SourceFile[]
  bytes: number
}

/**
 * Group files by the directory they are in, directories in path order.
 *
 * A flat list of four hundred paths is a wall; a directory is the unit people already think in,
 * and it is the unit a module usually claims.
 */
export function groupByDir(files: readonly SourceFile[]): DirGroup[] {
  const groups = new Map<string, SourceFile[]>()
  for (const file of files) {
    const dir = dirOf(file.path)
    const existing = groups.get(dir)
    if (existing) existing.push(file)
    else groups.set(dir, [file])
  }
  return [...groups.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([dir, groupFiles]) => ({
      dir,
      files: [...groupFiles].sort((a, b) => a.path.localeCompare(b.path)),
      bytes: groupFiles.reduce((sum, f) => sum + f.sizeBytes, 0),
    }))
}

/**
 * Which modules claim each file, by path.
 *
 * Read off `coverage.modules`, which is the server's own resolution, and off nothing else. Working
 * it out a second way here would put two answers to one question on the same page.
 */
export function claimedBy(coverage: SourceCoverage): Map<string, { id: string; title: string }[]> {
  const map = new Map<string, { id: string; title: string }[]>()
  for (const module of coverage.modules) {
    for (const path of module.files) {
      const entry = { id: module.moduleId, title: module.moduleTitle }
      const existing = map.get(path)
      if (existing) existing.push(entry)
      else map.set(path, [entry])
    }
  }
  return map
}

/** What a rebuild changed, in one line. The answer to "was what I was looking at still true?". */
export function reindexLine(report: ReindexReport): string {
  if (report.firstScan) {
    return t('sourcePage.reindex.firstScan', { files: content(plural(report.added.length, 'file')) })
  }
  const moved = report.added.length + report.removed.length + report.changed.length
  if (moved === 0) {
    return t('sourcePage.reindex.unchanged', {
      since: content(report.previousBuiltAt ?? 'the previous scan'),
      n: report.unchanged,
    })
  }
  return (
    `The index you were looking at was behind the disk. Since ${report.previousBuiltAt ?? 'the previous scan'}: ` +
    `${report.added.length} added, ${report.removed.length} removed, ${report.changed.length} changed, ` +
    `${report.unchanged} unchanged.`
  )
}

// ============================================================================ stale claims

export function StaleClaimsPanel({
  coverage,
  stamp,
  files,
}: {
  coverage: SourceCoverage
  stamp: SourceIndexStamp
  files: readonly SourceFile[]
}) {
  const stale = coverage.staleClaims

  return (
    <Panel declares={{ surface: 'source.stale' }}
      title={t('pageWords.SourcePage.001')}
      kind="stale claims"
      // An alarm only when it has rows, exactly like the unmet-dependency panel on the Queries
      // page. A stale claim is a promise a module is making that the disk does not keep.
      rank={stale.length > 0 ? 0 : 1}
      tone="broken"
      actions={
        <span className="sp-actions">
          <Tag tone="quiet">{plural(stale.length, 'stale claim')}</Tag>
          <IndexAge stamp={stamp} files={files} />
        </span>
      }
    >
      {stale.length === 0 ? (
        <Empty message={t('absence.none')} />
      ) : (
        stale.map((claim) => (
          <Row
            key={`${claim.moduleId}:${claim.repository?.id ?? ''}:${claim.pattern}`}
            state="broken"
            leading={<Tag kind="module" />}
            title={<code className="sp-claim-path">{claim.pattern}</code>}
            href={`#${recordPath(claim.moduleId)}`}
            target={{ kind: 'record', recordId: claim.moduleId, workspaceId: currentWorkspace() }}
            meta={
              (claim.repository === undefined ? '' : `${t('sourceRepo.in', { name: claim.repository.name })} · `) +
              (claim.problem === null
                ? `claimed by “${claim.moduleTitle}”, and nothing on disk matches it.`
                : `claimed by “${claim.moduleTitle}”. ${claim.problemCode
                    ? t(`moduleSource.claim.${claim.problemCode}`)
                    : `This claim ${claim.problem}${/[.!?]$/.test(claim.problem) ? '' : '.'}`}`)
            }
          />
        ))
      )}
    </Panel>
  )
}

// ============================================================================ unclaimed

export function UnclaimedPanel({
  coverage,
  stamp,
  files,
}: {
  coverage: SourceCoverage
  stamp: SourceIndexStamp
  files: readonly SourceFile[]
}) {
  const byPath = new Map(files.map((file) => [file.path, file]))
  const unclaimed = coverage.unclaimed.flatMap((path) => {
    const file = byPath.get(path)
    return file ? [file] : []
  })
  const groups = groupByDir(unclaimed)

  return (
    <Panel declares={{ surface: 'source.unclaimed' }}
      title={t('pageWords.SourcePage.005')}
      kind="unclaimed files"
      // Deliberately NOT an alarm, however many rows it has. An unclaimed file is something to
      // look at, not something that is wrong — see the header of this file.
      rank={1}
      actions={
        <span className="sp-actions">
          <Tag tone="quiet">{plural(coverage.unclaimedFiles, 'file')}</Tag>
          <IndexAge stamp={stamp} files={files} />
        </span>
      }
    >
      {coverage.unclaimed.length === 0 ? (
        <Empty message={t('absence.none')} />
      ) : (coverage.repositories ?? null) !== null ? (
        // An answer from a server older than wave 13s round 23 carries no `repositories`: it did not count by repository.
        <UnclaimedInEachRepository entries={coverage.repositories ?? []} />
      ) : (
        <>
          <p className="sp-lede">
            <span className="num">{coverage.unclaimedFiles}</span>{t('pageWords.SourcePage.011')}{' '}
            <span className="num">{coverage.totalFiles}</span>{t('pageWords.SourcePage.012')}{' '}
            <span className="num">{groups.length}</span>{t('pageWords.SourcePage.directoryWord', { n: groups.length })}.
          </p>
          {unclaimed.length === coverage.unclaimed.length ? null : (
            <p className="sp-note sp-note-bad">{t('sourcePage.unlisted', { n: coverage.unclaimed.length - unclaimed.length })}</p>
          )}
          <DirList groups={groups} />
        </>
      )}
    </Panel>
  )
}

/**
 * THE UNCLAIMED FILES OF EACH REPOSITORY, under its name (problem ZXD3MbidIya1). Each repository is
 * counted against its own stored scan, so its paths are listed by name only: the file list this page
 * holds is the workspace scan's, which does not say which repository it is of. A repository with no
 * stored scan is named as not counted, with how to scan it.
 */
export function UnclaimedInEachRepository({ entries }: { entries: readonly CoverageInOneRepository[] }) {
  return (
    <>
      {entries.map((entry) =>
        entry.scan === null ? (
          <p key={entry.repository.id} className="sp-note sp-note-bad">
            {notCountedIn(entry.repository.name)}
          </p>
        ) : (
          <section key={entry.repository.id} className="sp-repo">
            <p className="sp-lede">{t('sourceRepo.unclaimedIn', { n: entry.unclaimedFiles, name: entry.repository.name })}</p>
            {entry.unclaimed.length === 0 ? null : (
              <ul className="sx-files">
                {entry.unclaimed.map((path) => (
                  <li className="sx-file" key={path}>
                    <code className="sx-file-path wrap-anywhere">{path}</code>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ),
      )}
    </>
  )
}

/** Each repository's claimed count, or that it was not counted: the facts block's lines under its sums. */
export function CoverageInEachRepository({ entries }: { entries: readonly CoverageInOneRepository[] }) {
  return (
    <div className="sp-repos">
      <p className="sp-note">
        <strong>{t('sourceRepo.heading')}</strong>
      </p>
      <ul className="sp-repo-list">
        {entries.map((entry) =>
          entry.scan === null ? (
            <li key={entry.repository.id} className="sp-note-bad">
              {notCountedIn(entry.repository.name)}
            </li>
          ) : (
            <li key={entry.repository.id}>
              {t('sourceRepo.claimedIn', { n: entry.totalFiles, claimed: entry.claimedFiles, name: entry.repository.name })}
              {entry.percentClaimed === null ? null : <span className="num"> · {entry.percentClaimed}%</span>}
            </li>
          ),
        )}
      </ul>
    </div>
  )
}

// ============================================================================ what each module claims

/**
 * The join between the two layers, module by module.
 *
 * Every live module is listed, including the ones that claim nothing — that is the whole point.
 * "Eight modules, and two of them have never claimed a file" is the finding; a list of only the
 * modules that did claim something would hide it behind a page that looked complete.
 */
export function ModuleClaimsPanel({
  coverage,
  stamp,
  files,
}: {
  coverage: SourceCoverage
  stamp: SourceIndexStamp
  files: readonly SourceFile[]
}) {
  const claimless = coverage.modules.filter((m) => m.files.length === 0).length

  return (
    <Panel titleIs="label" declares={{ surface: 'source.claims' }}
      title={t('pageWords.SourcePage.015')}
      kind="canonical ↔ derived"
      rank={1}
      actions={
        <span className="sp-actions">
          <Tag tone="quiet">{plural(coverage.modules.length, 'module')}</Tag>
          <IndexAge stamp={stamp} files={files} />
        </span>
      }
    >
      {claimless > 0 ? (
        <p className="sp-lede">
          <b>{t('pageWords.SourcePage.claimlessCount', { n: claimless })}</b>
        </p>
      ) : null}

      {coverage.modules.length === 0 ? (
        <Empty message={t('absence.none')} />
      ) : (
        coverage.modules.map((module) => (
          <Row
            key={module.moduleId}
            cols={NO_SEVERITY_COLS}
            leading={<Tag kind="module" />}
            title={module.moduleTitle}
            href={`#${recordPath(module.moduleId)}`}
            target={{ kind: 'record', recordId: module.moduleId, workspaceId: currentWorkspace() }}
            meta={
              (module.problem !== null
                ? module.problem
                : module.claims.length === 0
                  ? 'claims nothing'
                  : `${plural(module.claims.length, 'claim')} · ${module.claims
                      .map((c) => (c.repository === undefined ? c.pattern : `${c.pattern} (${t('sourceRepo.in', { name: c.repository.name })})`))
                      .join(', ')}`) +
              // A repository whose rows were not counted is named, so the count beside it is not read as the whole.
              // When none was counted, `problem` already joins these sentences in the server's words.
              (module.problem !== null
                ? ''
                : (module.repositories ?? [])
                    .filter((entry) => entry.notCounted !== null)
                    .map((entry) => ` ${notCountedIn(entry.repository.name)}`)
                    .join(''))
            }
            right={
              <span className="sp-modright">
                {module.claims.some((c) => c.matched.length === 0) ? (
                  <Tag tone="warn">
                    {plural(module.claims.filter((c) => c.matched.length === 0).length, 'stale')}
                  </Tag>
                ) : null}
                {module.repositories === undefined ? (
                  <span className="num">{plural(module.files.length, 'file')}</span>
                ) : (
                  module.repositories
                    .filter((entry) => entry.notCounted === null)
                    .map((entry) => (
                      <span key={entry.repository.id} className="num">
                        {t('sourceRepo.filesIn', { n: entry.files.length, name: entry.repository.name })}
                      </span>
                    ))
                )}
              </span>
            }
          />
        ))
      )}
    </Panel>
  )
}

// ============================================================================ the whole index

export function IndexPanel({
  coverage,
  stamp,
  files,
}: {
  coverage: SourceCoverage
  stamp: SourceIndexStamp
  files: readonly SourceFile[]
}) {
  const [query, setQuery] = useState('')
  const matches = searchFiles(files, query)
  const claims = claimedBy(coverage)
  const groups = groupByDir(matches.map((m) => m.file))
  const noteFor = new Map(matches.map((m) => [m.file.path, m.note]))

  return (
    <Panel titleIs="label" declares={{ surface: 'source.files' }}
      title={t('pageWords.SourcePage.021')}
      kind="the index itself"
      actions={
        <span className="sp-actions">
          <Tag tone="quiet">{plural(files.length, 'file')}</Tag>
          <IndexAge stamp={stamp} files={files} />
        </span>
      }
    >
      <div className="sp-search">
        <Field label={t('pageWords.SourcePage.022')}>
          <TextInput
            value={query}
            onChange={setQuery}
            mono
            placeholder={t('pageWords.SourcePage.023')}
          />
        </Field>
        <div className="sp-search-act">
          <span className="sp-count num">
            {query.trim() === '' ? plural(files.length, 'file') : t('pageWords.SourcePage.expression01', { length: String(matches.length), length2: String(files.length) })}
          </span>
          <Btn
            size="sm"
            variant="ghost"
            onClick={() => setQuery('')}
            disabled={query === ''}
            reason={t('sourcePage.search.alreadyEmpty')}
          >{t('pageWords.SourcePage.024')}</Btn>
        </div>
      </div>

      {files.length === 0 ? (
        <Empty message={t('absence.none')} />
      ) : matches.length === 0 ? (
        <Empty
          message={t('absence.none')}
          action={
            <Btn size="sm" onClick={() => setQuery('')}>{t('g7a.records.clearSearch')}</Btn>
          }
        />
      ) : (
        <DirList
          groups={groups}
          noteFor={(file) => {
            const searchNote = noteFor.get(file.path) ?? null
            const owners = claims.get(file.path)
            return (
              <>
                {owners === undefined ? (
                  <span className="sp-unclaimed">{t('pageWords.SourcePage.028')}</span>
                ) : (
                  <span className="sp-claimed">{t('pageWords.SourcePage.029')}{' '}
                    {owners.map((owner, i) => (
                      <span key={owner.id}>
                        {i > 0 ? ', ' : ''}
                        <RouteLink to={recordPath(owner.id)} className="sp-link">
                          {owner.title}
                        </RouteLink>
                      </span>
                    ))}
                  </span>
                )}
                {searchNote ? <span className="sp-why"> · {searchNote}</span> : null}
              </>
            )
          }}
        />
      )}
    </Panel>
  )
}

// ============================================================================ shared list

/** Files under their directories. One shape for both lists, so they cannot read as two things. */
function DirList({
  groups,
  noteFor,
}: {
  groups: DirGroup[]
  noteFor?: (file: SourceFile) => React.ReactNode
}) {
  return (
    <div className="sp-dirs">
      {groups.map((group) => (
        <section className="sp-dir" key={group.dir}>
          <header className="sp-dir-head">
            <code className="sp-dir-path wrap-anywhere">{group.dir}</code>
            <span className="sp-count num">
              {plural(group.files.length, 'file')} · {formatBytes(group.bytes)}
            </span>
          </header>
          <ul className="sx-files">
            {group.files.map((file) => (
              <FileLine key={file.path} file={file} note={noteFor ? noteFor(file) : undefined} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}

// ============================================================================ the page

export function SourcePage() {
  const [state, reload] = useProjectAsync(async () => {
    // One await, so the index and the coverage are always the same reading. Two sequential
    // fetches could report 95 files in one panel and a percentage computed over 96 in another.
    const [index, coverage] = await Promise.all([sourceApi.index(), sourceApi.coverage()])
    return { index, coverage }
  }, [])

  /**
   * What the last rebuild changed, held HERE rather than beside the button.
   *
   * A rebuild is followed by a reload, and a reload puts this page back into its loading state,
   * which unmounts everything below it. Keeping the report in the panel that shows it meant the
   * report was destroyed by the very refresh that produced it — the one answer on this page that
   * cannot be recovered by looking again, because the previous index is gone.
   */
  const [report, setReport] = useState<ReindexReport | null>(null)
  const [rebuilding, setRebuilding] = useState(false)
  const [rebuildError, setRebuildError] = useState<{ message: string; fault: Fault | null } | null>(null)

  async function rebuild() {
    setRebuilding(true)
    setRebuildError(null)
    try {
      const answer = await sourceApi.reindex()
      setReport(answer.changes)
      reload()
    } catch (err) {
      setRebuildError({ message: errorMessage(err), fault: faultOf(err) })
    } finally {
      setRebuilding(false)
    }
  }

  return (
    <div className="sp">
      <SourceStyles />
      <style href="mole-office-source-page" precedence="default">
        {PAGE_CSS}
      </style>

      <header className="sp-head">
        <h1 className="sp-title">{t('pageWords.SourcePage.032')}</h1>
      </header>

      {state.status === 'loading' ? <Loading label={t('moduleSource.panel.loading')} rows={5} /> : null}

      {state.status === 'error' ? (
        <ErrorNote message={state.message} fault={state.fault} retry={reload} />
      ) : null}

      {/* The report outlives the panel that shows it, so it is still on screen after the reload
          that a rebuild triggers — and it is the one thing here that cannot be fetched again. */}
      {state.status !== 'ready' && report !== null ? (
        <div className="sp-facts">
          <RebuildReport report={report} />
        </div>
      ) : null}

      {state.status === 'ready' ? (
        <SourceBody
          stamp={state.value.index.index}
          files={state.value.index.files}
          coverage={state.value.coverage.coverage}
          coverageStamp={state.value.coverage.index}
          rebuild={{ run: () => void rebuild(), busy: rebuilding, error: rebuildError?.message ?? null, fault: rebuildError?.fault ?? null, report }}
          onReload={reload}
        />
      ) : null}
    </div>
  )
}

/** Everything the page needs to offer a rebuild and report what it did. */
export interface RebuildControl {
  run: () => void
  busy: boolean
  /** The failure in the server's words, or null. Never swallowed: a rebuild is a write. */
  error: string | null
  fault?: Fault | null
  /** What the last rebuild in this session changed, or null if there has not been one. */
  report: ReindexReport | null
}

/** The page once both answers are in hand. Separate so it can be rendered without a server. */
export function SourceBody({
  stamp,
  files,
  coverage,
  coverageStamp,
  rebuild,
  onReload,
}: {
  stamp: SourceIndexStamp
  files: SourceFile[]
  coverage: SourceCoverage
  coverageStamp: SourceIndexStamp
  rebuild: RebuildControl
  onReload: () => void
}) {
  return (
    <>
      {/* Two requests, two stamps. They are normally the same scan; if a rebuild landed between
          them the page is showing a file list from one index and a coverage figure from another,
          and that has to be said rather than averaged over. */}
      {coverageStamp.builtAt !== stamp.builtAt ? (
        <ErrorNote
          message={
            `The file list on this page came from the scan of ${stamp.builtAt} and the coverage figures from the ` +
            `scan of ${coverageStamp.builtAt}. A rebuild landed between the two requests, so the numbers below do ` +
            'not all describe the same reading of the repository.'
          }
          retry={onReload}
        />
      ) : null}

      <IndexFacts stamp={stamp} files={files} coverage={coverage} rebuild={rebuild} />

      {/* Broken first, then the finding, then the join, then the index itself — the Queries page's
          order, for its reason: a prompt to think should not sit above an alarm. */}
      <StaleClaimsPanel coverage={coverage} stamp={stamp} files={files} />
      <UnclaimedPanel coverage={coverage} stamp={stamp} files={files} />
      <ModuleClaimsPanel coverage={coverage} stamp={stamp} files={files} />
      <IndexPanel coverage={coverage} stamp={stamp} files={files} />

      <Panel declares={{ surface: 'source.limits' }} title={t('pageWords.SourcePage.040')} kind="the limits of the answer" rank={2}>
        <ScanLimits stamp={stamp} />
      </Panel>
    </>
  )
}

/**
 * What the scan covered, in numbers — and the one control the derived layer has.
 *
 * The rebuild is here rather than beside each panel because it is not a refresh of a view, it is
 * a replacement of the data every panel is reading. What it reports afterwards is the only
 * trustworthy answer to "was the index I was just looking at behind the disk?", which is a
 * question nothing in the browser can answer on its own.
 */
function IndexFacts({
  stamp,
  files,
  coverage,
  rebuild,
}: {
  stamp: SourceIndexStamp
  files: readonly SourceFile[]
  coverage: SourceCoverage
  rebuild: RebuildControl
}) {
  return (
    <div className="sp-facts">
      {/* The root gets its own line above the numbers. It is the one value here that is a long
          string rather than a count, and sharing a grid column with "files 95" made it break
          mid-word on a phone while leaving the numbers half a screen apart. */}
      <div className="sp-facts-top">
        <div className="sp-fact sp-fact-root">
          <span className="sp-fact-key">{t('pageWords.SourcePage.041')}</span>
          <code className="sp-root wrap-anywhere">{stamp.root}</code>
        </div>
        <div className="sp-facts-act">
          <IndexAge stamp={stamp} files={files} />
          <Btn
            variant="secondary"
            size="sm"
            pending={rebuild.busy}
            onClick={rebuild.run}
          >{t('pageWords.SourcePage.042')}</Btn>
        </div>
      </div>

      <div className="sp-facts-grid">
        <Fact label={t('pageWords.SourcePage.043')} value={<span className="num">{coverage.totalFiles}</span>} />
        <Fact label={t('pageWords.SourcePage.044')} value={<span className="num">{coverage.claimedFiles}</span>} />
        <Fact label={t('g6a.sessions.unclaimed')} value={<span className="num">{coverage.unclaimedFiles}</span>} />
        <Fact
          label={t('pageWords.SourcePage.045')}
          value={
            <span className="num">
              {/* Null is not zero: an empty index has nothing to claim, which is not the same as
                  nobody having claimed it. */}
              {coverage.percentClaimed === null ? t('pageWords.SourcePage.expression04') : `${coverage.percentClaimed}%`}
            </span>
          }
        />
        <Fact label={t('pageWords.SourcePage.046')} value={<span className="num">{coverage.staleClaims.length}</span>} />
        <Fact
          label={t('pageWords.SourcePage.047')}
          value={
            <span className="num" title={t('pageWords.SourcePage.expression05', { builtBy: String(stamp.builtBy) })}>
              {stamp.scanMs}{t('pageWords.SourcePage.048')}</span>
          }
        />
      </div>

      {(coverage.repositories ?? null) === null ? null : <CoverageInEachRepository entries={coverage.repositories ?? []} />}

      <DerivedNote stamp={stamp}>{t('pageWords.SourcePage.049')}{stamp.builtAt}{t('pageWords.SourcePage.050')}<code>{stamp.builtBy}</code>.
      </DerivedNote>

      {rebuild.error ? <ErrorNote message={rebuild.error} fault={rebuild.fault} /> : null}
      {rebuild.report ? <RebuildReport report={rebuild.report} /> : null}
    </div>
  )
}

/**
 * What the last rebuild changed.
 *
 * This is the only trustworthy answer to "was the index I was looking at behind the disk?" —
 * nothing in a browser can see the filesystem, so the comparison has to be made by the scan
 * against its own previous reading. It stays on screen after the reload for that reason: the
 * previous index no longer exists, so this answer cannot be fetched again.
 */
export function RebuildReport({ report }: { report: ReindexReport }) {
  return (
    <div className="sp-report">
      <p className="sp-report-line">{reindexLine(report)}</p>
      <ReportList label={t('pageWords.SourcePage.051')} paths={report.added} />
      <ReportList label={t('pageWords.SourcePage.052')} paths={report.removed} />
      <ReportList label={t('pageWords.SourcePage.053')} paths={report.changed.map((c) => `${c.path} — ${c.what}`)} />
    </div>
  )
}

/** One part of a rebuild report, capped so a first scan does not print the whole repository. */
function ReportList({ label, paths }: { label: string; paths: string[] }) {
  const SHOWN = 8
  if (paths.length === 0) return null
  return (
    <div className="sp-report-part">
      <span className="sp-fact-key">
        {label} · {paths.length}
      </span>
      <ul className="sp-report-items">
        {paths.slice(0, SHOWN).map((line) => (
          <li key={line} className="wrap-anywhere">
            {line}
          </li>
        ))}
      </ul>
      {paths.length > SHOWN ? (
        <span className="sp-note">{t('sourcePage.report.more', { n: paths.length - SHOWN })}</span>
      ) : null}
    </div>
  )
}

function Fact({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="sp-fact">
      <span className="sp-fact-key">{label}</span>
      <span className="sp-fact-val">{value}</span>
    </div>
  )
}

// ============================================================================ styles

/**
 * This page's own rules. The file rows, the claim headers and the age share a stylesheet with the
 * module block (SourceStyles in ModuleSource.tsx), so the two views of one scan cannot drift
 * apart visually. Every value here is a token from tokens.css — no colour and no type size is
 * written out, so a preset swap on <html> reaches all of it.
 */
const PAGE_CSS = `
.sp { display: flex; flex-direction: column; gap: var(--gut); min-width: 0; }

.sp-head { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
.sp-title { margin: 0; font-size: var(--fs-6); font-weight: 600; line-height: var(--lh-tight); color: var(--text); }
.sp-lede {
  margin: 0;
  font-size: var(--fs-2);
  line-height: var(--lh-read);
  color: var(--text-2);
  max-width: var(--measure);
}
.sp-lede code { font-family: var(--font-mono); font-size: .94em; }
.sp-note {
  margin: 0;
  font-size: var(--fs-1);
  line-height: var(--lh-body);
  color: var(--text-3);
  max-width: var(--measure);
}
.sp-note-bad { color: var(--st-failed); font-weight: var(--st-failed-weight); }

/* ---------------------------------------------------------------- the facts strip */
.sp-facts {
  display: flex; flex-direction: column;
  gap: var(--pad);
  padding: var(--pad);
  background: var(--panel-2);
  border: var(--border-w) solid var(--border);
  border-radius: var(--radius);
  min-width: 0;
}
.sp-facts-top {
  display: flex; align-items: flex-end; justify-content: space-between;
  gap: var(--gut); flex-wrap: wrap;
  padding-bottom: var(--pad);
  border-bottom: var(--border-w) solid var(--border);
  min-width: 0;
}
.sp-fact-root { flex: 1 1 18rem; }
.sp-facts-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(9rem, 100%), 1fr));
  gap: var(--pad) var(--pad-lg);
  min-width: 0;
}
.sp-fact { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
.sp-fact-key {
  font-size: var(--fs-1);
  font-weight: 600;
  letter-spacing: .06em;
  text-transform: uppercase;
  color: var(--text-3);
  line-height: var(--lh-tight);
}
.sp-fact-val { font-size: var(--fs-4); color: var(--text); min-width: 0; line-height: var(--lh-tight); }
.sp-root { font-family: var(--font-mono); font-size: var(--fs-2); color: var(--text-2); user-select: all; }
.sp-facts-act { display: flex; align-items: center; gap: var(--gut); flex-wrap: wrap; flex: none; }

.sp-actions { display: flex; align-items: center; gap: var(--gut); flex-wrap: wrap; }
.sp-count { font-size: var(--fs-1); font-weight: 600; color: var(--text-3); white-space: nowrap; }
.sp-modright { display: inline-flex; flex-wrap: wrap; justify-content: flex-end; align-items: center; gap: var(--pad); }
.sp-repos { margin-top: var(--gut); }
.sp-repo-list { margin: 4px 0 0; padding-left: 1.2em; font-size: var(--fs-1); line-height: var(--lh-body); color: var(--text-2); }
.sp-repo + .sp-repo, .sp-repo + .sp-note, .sp-note + .sp-repo { margin-top: var(--gut); }

/* ---------------------------------------------------------------- the rebuild report */
.sp-report {
  display: flex; flex-direction: column; gap: var(--pad);
  padding: var(--pad);
  background: var(--panel);
  border: var(--border-w) solid var(--border);
  border-radius: var(--radius);
  min-width: 0;
}
.sp-report-line {
  margin: 0;
  font-size: var(--fs-2);
  line-height: var(--lh-body);
  color: var(--text);
  max-width: var(--measure);
}
.sp-report-part { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.sp-report-items {
  margin: 0; padding-left: var(--pad-lg);
  font-family: var(--font-mono);
  font-size: var(--fs-1);
  line-height: var(--lh-body);
  color: var(--text-2);
}

/* ---------------------------------------------------------------- search */
.sp-search {
  display: flex; align-items: flex-end; gap: var(--gut); flex-wrap: wrap;
  margin-bottom: var(--gut);
  min-width: 0;
}
.sp-search .px-field { flex: 1 1 22rem; min-width: 0; }
.sp-search-act { display: flex; align-items: center; gap: var(--pad); flex: none; }

/* ---------------------------------------------------------------- directories */
.sp-dirs { display: flex; flex-direction: column; gap: var(--pad-lg); }
.sp-dir { min-width: 0; }
.sp-dir-head {
  display: flex; align-items: baseline; justify-content: space-between;
  flex-wrap: wrap; gap: var(--pad) var(--gut);
  padding: 0 var(--pad) var(--pad);
  border-bottom: var(--border-w) solid var(--border);
}
.sp-dir-path {
  font-family: var(--font-mono);
  font-size: var(--fs-2);
  font-weight: 600;
  color: var(--text);
  min-width: 0;
  user-select: all;
}

/* The path in a stale-claim row. Mono, because it is the exact string that has to be fixed on the
   module — the one thing on that row anybody would retype. */
.sp-claim-path { font-family: var(--font-mono); font-size: var(--fs-2); overflow-wrap: anywhere; }

/* ---------------------------------------------------------------- file notes */
.sp-unclaimed { color: var(--text-3); font-style: italic; }
.sp-claimed { color: var(--text-3); }
.sp-why { color: var(--text-2); }
.sp-link {
  color: var(--accent);
  font-weight: 600;
  text-decoration: underline;
  text-underline-offset: .16em;
}
`
