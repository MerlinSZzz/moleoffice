// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * The DERIVED layer, on a module's page: the files this module claims, as a scan found them.
 *
 * ---------------------------------------------------------------------------------------
 * TWO LAYERS, AND THE RULE THAT KEEPS THEM APART
 * ---------------------------------------------------------------------------------------
 * A `module` record is the CANONICAL layer. A person or an agent curates it: what the subsystem
 * is for, what it is made of, what was decided, what is still owed. It survives a refactor that
 * moves every file it covers.
 *
 * This block is the other layer. Files, their language, size, line count, what they import and
 * export, and when each last changed — built by scanning the repository. It is REBUILT, never
 * edited. Nothing a person types may live here, because the next scan would delete it, and a
 * field that silently disappears on Tuesday is worse than a field that never existed.
 *
 * So when the two disagree about a file, the scan is right about what EXISTS and the module is
 * right about what it MEANS. This component is on the module page to make that division visible
 * rather than to blur it — which is why the first thing inside the panel is the sentence saying
 * so, taken from the server's own stamp rather than reworded here, and why there is not one
 * control in the block that writes anything. The only write the derived layer has is a rebuild,
 * and it lives on the source page, where the whole index can be looked at afterwards.
 *
 * THE LINK BETWEEN THE LAYERS IS THE CLAIM. A module's code is stated as rows of the
 * implementation map — repository-relative paths or globs — and the scan resolves each one to real
 * files. This block is therefore grouped
 * by CLAIM rather than by directory: the claim is the line somebody wrote, and the files under it
 * are what that line is worth today. A claim with nothing under it is the interesting case, and
 * it is drawn as such.
 *
 * ---------------------------------------------------------------------------------------
 * WHERE THE SHAPES COME FROM
 * ---------------------------------------------------------------------------------------
 * `SourceFile`, `SourceIndexStamp`, `ResolvedClaim` and the rest are in src/shared/types.ts, the
 * same file the server builds them from. The response envelopes are imported as TYPES from
 * src/server/api/source.ts: `import type` is erased at compile time, so nothing of the server
 * reaches the bundle, and it means this component cannot disagree with the route it calls. A
 * value import from there would drag better-sqlite3 into the browser and break the build.
 *
 * THE FETCHES ARE STILL DECLARED HERE — the typed surface of the source routes is this file's —
 * but the TRANSPORT under them is `moleOfficeRequest` from src/web/api.ts, which is the app's only
 * one. It used to be a copy of it, kept here while that file belonged to another agent, and the
 * copy is what the workspace header would have been missing from.
 */

import type {
  ClaimsInOneRepository,
  ResolvedClaim,
  SourceFile,
  SourceIndexStamp,
} from '@shared/types.ts'
import type {
  ModuleSourceResponse,
  ReindexResponse,
  SourceCoverageResponse,
  SourceIndexResponse,
} from '../../server/api/source.ts'
import { t } from '@shared/i18n.ts'
import { claimProblemCode } from '@shared/paths.ts'
import { gapBetween } from '@shared/spacing.ts'
import { moleOfficeRequest } from '../api.ts'
import {
  Absence,
  ErrorNote,
  Loading,
  Panel,
  ServerNote,
  StampAfter,
  Tag,
  parseStamp,
} from './ui.tsx'
import { useProjectAsync } from '../lib/project-async.ts'
import { CodeRows } from '../lib/code-rows.tsx'

// ============================================================================ the requests

/**
 * One request to the source endpoints, over the app's ONE transport.
 *
 * IT USED TO BE A COPY of `request` in src/web/api.ts, kept here while that file belonged to
 * another agent, with a note saying the two must not drift. They drifted as soon as a request had
 * to name its PROJECT: the source index is per-workspace, `x-mole-office-workspace` is what says which,
 * and a copy that did not send it would have shown one project's files against another project's
 * modules — and rebuilt an index scoped to a workspace nobody asked about.
 *
 * The rules that transport enforces are unchanged and are now enforced in one place: a failed
 * request never turns into an empty successful result, and every request says who is asking and
 * what about. The 404 the index answers when it has never been built still arrives with its own
 * instructions intact — nothing is corrected on the way past.
 */
const sourceRequest = moleOfficeRequest

export const sourceApi = {
  /** The whole index: every file the scan found, with the stamp saying when it ran. */
  index: () => sourceRequest<SourceIndexResponse>('/api/source'),

  /** One module's claims, resolved, with the files behind them. */
  module: (moduleId: string) =>
    sourceRequest<ModuleSourceResponse>(`/api/source?module=${encodeURIComponent(moduleId)}`),

  /** The two queries: unclaimed files, stale claims, and what each module claims. */
  coverage: () => sourceRequest<SourceCoverageResponse>('/api/source/coverage'),

  /**
   * Rebuild the index from disk. The ONLY write the derived layer has, and it replaces every row
   * rather than merging — which is exactly why it is safe to offer: there is nothing in here that
   * a person wrote and could lose.
   */
  reindex: () => sourceRequest<ReindexResponse>('/api/source/reindex', { method: 'POST' }),
}

// ============================================================================ how old is it

/**
 * How much of the index can be believed.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THE BROWSER CAN AND CANNOT KNOW ABOUT THE DISK
 * ---------------------------------------------------------------------------------------
 * The one thing that would settle this — the newest modification time on disk right now — is not
 * something a page can see. Nothing here watches the filesystem. So there are three answers, and
 * they are deliberately three rather than "current / stale":
 *
 *   'behind'   PROVEN. A file in the index carries a change time LATER than the scan that
 *              indexed it, which can only happen if the repository moved while or after the scan
 *              ran. The index is describing a version of that file that no longer exists.
 *   'aging'    SUSPECTED, and no more than that. The scan is older than INDEX_STALE_AFTER, so
 *              anything could have happened since. The page says it might have moved on; it does
 *              not claim it has.
 *   'fresh'    The scan is recent and nothing in it contradicts itself. NOT a promise that the
 *              disk is unchanged — that promise cannot be made from here, and the wording on
 *              screen never makes it.
 *
 * The definitive answer is a rebuild, which reports exactly what changed since the previous scan.
 * That is on the source page, and it is what the aging tooltip points at.
 */
export type IndexFreshness =
  | { kind: 'behind'; changedAfterScan: number }
  | { kind: 'aging' }
  | { kind: 'fresh' }

/**
 * How old a scan may be before the page says so out loud.
 *
 * A judgement call, and the only invented number in this file. Fifteen minutes is roughly the
 * length of one piece of work in this repository: shorter and the warning would be on screen
 * permanently and stop being read, longer and a whole session's worth of renames could pass
 * without a word.
 */
export const INDEX_STALE_AFTER_SECONDS = 15 * 60

/** Files whose own change time is later than the scan that indexed them. Proof of a stale index. */
export function filesChangedAfterScan(stamp: SourceIndexStamp, files: readonly SourceFile[]): SourceFile[] {
  const builtAt = parseStamp(stamp.builtAt)
  if (builtAt === null) return []
  return files.filter((file) => {
    const modified = parseStamp(file.modifiedAt)
    return modified !== null && modified.getTime() > builtAt.getTime()
  })
}

export function freshnessOf(stamp: SourceIndexStamp, files: readonly SourceFile[] = []): IndexFreshness {
  const changed = filesChangedAfterScan(stamp, files)
  if (changed.length > 0) return { kind: 'behind', changedAfterScan: changed.length }
  if (stamp.ageSeconds > INDEX_STALE_AFTER_SECONDS) return { kind: 'aging' }
  return { kind: 'fresh' }
}

// ============================================================================ formatting

/**
 * A file size a person can read, with the exact byte count kept for the tooltip.
 *
 * kB is 1000 bytes, which is what a file manager and `ls --si` report, so the number matches the
 * one you would see beside it in a terminal.
 */
export function formatBytes(bytes: number): string {
  if (bytes < 1000) return `${bytes} B`
  if (bytes < 1000 * 1000) return `${(bytes / 1000).toFixed(1)} kB`
  return `${(bytes / 1000 / 1000).toFixed(1)} MB`
}

/** The directory part of a repository-relative path, or "." for a file at the root. */
export function dirOf(path: string): string {
  const cut = path.lastIndexOf('/')
  return cut === -1 ? '.' : path.slice(0, cut)
}

export const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

/** "3 files" / "3 个文件", in the page's language. */
export const fileCount = (n: number) => t('moduleSource.fileCount', { n })

/**
 * HOW LONG AGO THE SCAN RAN, in the page's language: "42s ago", "2h5m ago", "42 秒前".
 *
 * Worked out from `ageSeconds`, the number, and not from `age`, the server's English text for
 * agents. It splits the seconds the same way as `ageText` in src/server/lib/sourceindex.ts, so the
 * two say the same age.
 */
export function indexAgeSaid(seconds: number): string {
  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  if (days > 0) return t('moduleSource.age.daysHours', { d: days, h: hours })
  if (hours > 0) return t('moduleSource.age.hoursMinutes', { h: hours, m: minutes })
  if (minutes > 0) return t('moduleSource.age.minutes', { n: minutes })
  return t('moduleSource.age.seconds', { n: seconds })
}

// ============================================================================ shared pieces

/**
 * The stylesheet for both views of the derived layer — this block and the source page.
 *
 * One sheet for one feature, deliberately: the module block and the source page are two views of
 * the same scan, and a file row that looked like a file row in one place and something else in
 * the other would suggest they were showing different things. React 19 hoists `<style href>` into
 * <head> and de-duplicates by href, so rendering it from both components produces one element.
 *
 * Every value below is a token from tokens.css, so a preset swap on <html> re-skins all of it.
 */
export function SourceStyles() {
  return (
    <style href="mole-office-source" precedence="default">
      {SOURCE_CSS}
    </style>
  )
}

/**
 * How old the index is, and whether it can be believed. Never optional, never abbreviated away.
 *
 * This sits in the header of every panel that draws scanned data rather than once at the top of
 * the page, because these pages are long: an age you scrolled past ten seconds ago is an age
 * nobody read. None of the three states is drawn as a failure — nothing is broken, the answer is
 * simply older than the thing it describes, and the fix is a rebuild rather than a repair.
 */
export function IndexAge({ stamp, files = [] }: { stamp: SourceIndexStamp; files?: readonly SourceFile[] }) {
  const freshness = freshnessOf(stamp, files)
  const built = t('moduleSource.built')
  const age = indexAgeSaid(stamp.ageSeconds)

  return (
    <span className="sx-age">
      <span className="sx-age-word">{built}</span>
      {gapBetween(built, age)}
      <span className="sx-age-value num">
        {age}
      </span>
      {freshness.kind === 'behind' ? (
        <Tag tone="warn" title={t('moduleSource.behindTitle', { n: freshness.changedAfterScan, at: stamp.builtAt })}>
          {t('moduleSource.behindTag')}
        </Tag>
      ) : null}
      {freshness.kind === 'aging' ? (
        <Tag tone="quiet" title={t('moduleSource.agingTitle', { age })}>
          {t('moduleSource.agingTag')}
        </Tag>
      ) : null}
    </span>
  )
}

/**
 * The sentence that stops this being mistaken for the canonical layer.
 *
 * The first half is the server's own `derived` sentence, printed rather than reworded: two
 * descriptions of one rule drift apart, and the one that ships with the data should win. The
 * second half is the part only the browser can say — that there is nothing to press here.
 */
export function DerivedNote({ stamp, children }: { stamp: SourceIndexStamp; children?: React.ReactNode }) {
  return (
    <p className="sx-note sx-derived">
      <strong>{stamp.derived}</strong> {children}
    </p>
  )
}

/**
 * One file, drawn identically on the module page and the source page.
 *
 * DELIBERATELY NOT A Row AND DELIBERATELY NOT A LINK. There is nowhere to go: a file is not a
 * record, it has no page in Mole Office, and a `file://` jump from a page served over http is refused
 * by every browser, silently. By this app's affordance grammar that leaves bare text, which is
 * what a read-only fact should be — and the path is `user-select: all`, so one click selects the
 * whole of it to paste into a terminal, which is what you actually came here to do.
 *
 * `note` is how the source page adds who claims the file, and why it matched a search, without a
 * second row shape.
 */
export function FileLine({ file, note }: { file: SourceFile; note?: React.ReactNode }) {
  return (
    <li className="sx-file">
      <div className="sx-file-head">
        <code className="sx-file-path wrap-anywhere">{file.path}</code>
        <Tag tone="quiet" title={t('moduleSource.languageTitle', { language: file.language })}>
          {file.language}
        </Tag>
      </div>
      <div className="sx-file-facts">
        <span className="sx-fact num" title={t('moduleSource.bytesTitle', { n: file.sizeBytes })}>
          {formatBytes(file.sizeBytes)}
        </span>
        <span className="sx-fact num">{t('moduleSource.lines', { n: file.lines })}</span>
        <span className="sx-fact">
          <StampAfter label={t('moduleSource.changed')} at={file.modifiedAt} />
        </span>
        <span className="sx-fact num" title={file.imports.length === 0 ? t('moduleSource.fileImportsNothing') : file.imports.join('\n')}>
          {t('moduleSource.imports', { n: file.imports.length })}
        </span>
        <span className="sx-fact num" title={file.exports.length === 0 ? t('moduleSource.fileExportsNothing') : file.exports.join('\n')}>
          {t('moduleSource.exports', { n: file.exports.length })}
        </span>
      </div>
      {note ? <div className="sx-file-note">{note}</div> : null}
    </li>
  )
}

/**
 * What the scan looked at and could not see, in the scan's own words.
 *
 * The folder it scanned, when, by whom, how many files and how long it took are each a row of their
 * own, so that no sentence holds the folder.
 *
 * Every coverage number on these pages is computed over the files the scan looked at, and a
 * percentage over an unstated set is a number nobody can argue with. So the skipped directories
 * and the way imports were read are on the page, not in a comment.
 */
export function ScanLimits({ stamp }: { stamp: SourceIndexStamp }) {
  return (
    <div className="sx-limits">
      <CodeRows
        rows={[
          {
            label: 'moduleSource.row.scannedFolder',
            value: stamp.root,
            ...(stamp.skipped.length === 0 ? { state: 'moduleSource.row.skippedNothing' as const } : {}),
          },
          { label: 'moduleSource.row.scannedAt', value: stamp.builtAt },
          { label: 'moduleSource.row.scannedBy', value: stamp.builtBy },
          { label: 'moduleSource.row.files', value: String(stamp.fileCount) },
          { label: 'moduleSource.row.scanTook', value: `${String(stamp.scanMs)} ms` },
        ]}
      />
      <p className="sx-note">
        <strong>{t('moduleSource.howImportsRead')}</strong> {stamp.howRead}
      </p>
      {stamp.skipped.length > 0 ? (
        <>
          <p className="sx-note">
            <strong>{t('moduleSource.whatScanDidNotLookAt')}</strong>
          </p>
          <ul className="sx-limit-list">
            {stamp.skipped.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </>
      ) : null}
    </div>
  )
}

// ============================================================================ the module block

/**
 * The files one module claims, grouped by the claim that reached them.
 *
 * `moduleId` and nothing else. The claims and their resolution belong to the scan, so asking the
 * scan for them is the only way this block can agree with the source page: resolving a list of
 * paths read off the record here would be a second implementation of globbing, in a second
 * place, and the two would disagree the first time a directory claim was involved.
 */
export function ModuleSource({ moduleId }: { moduleId: string }) {
  const [state, reload] = useProjectAsync(() => sourceApi.module(moduleId), [moduleId])

  return (
    <>
      <SourceStyles />
      <Panel id="module-source-panel" declares={{ surface: null }}
        title={t('moduleSource.panel.title')}
        actions={
          state.status === 'ready' ? (
            <span className="sx-actions">
              <span className="sx-count num">{fileCount(state.value.files.length)}</span>
              <IndexAge stamp={state.value.index} files={state.value.files} />
            </span>
          ) : undefined
        }
      >
        {state.status === 'loading' ? <Loading label={t('moduleSource.panel.loading')} rows={3} /> : null}

        {state.status === 'error' ? (
          <ErrorNote message={state.message} fault={state.fault} retry={reload} />
        ) : null}

        {state.status === 'ready' ? <ModuleSourceBody answer={state.value} /> : null}
      </Panel>
    </>
  )
}

/** The block once the answer is in hand. Separate so it can be rendered without a server. */
export function ModuleSourceBody({ answer }: { answer: ModuleSourceResponse }) {
  // Keyed by repository and path, because one path can be claimed in two repositories and is two files.
  const byPath = new Map(answer.files.map((file) => [fileKey(file.repository?.id, file.path), file]))
  const stale = answer.staleClaims.length
  const lede = t('moduleSource.lede', {
    files: fileCount(answer.files.length),
    claims: t('moduleSource.claimCount', { n: answer.claims.length }),
  })

  return (
    <>
      {/* First thing in the block, before any data: what this is, and why nothing here can be
          typed. Placed after the list it would be an excuse; placed here it frames everything
          below it. */}
      <ServerNote text={answer.index.derived} />

      {/* The stated rows could not be counted: the project holds more than one repository and the
          index names none. Not the same as a stale claim, and not drawn like one: the lists below
          are not merely empty, they are unanswerable. */}
      {answer.problem !== null ? (
        <>
          <p className="sx-note sx-note-bad">{t('moduleSource.claimsNotCounted')}</p>
          <ServerNote text={answer.problem} />
        </>
      ) : null}

      {answer.repositories === undefined ? null : <CountedInEachRepository entries={answer.repositories} />}

      {/* Order matters here. Claims that could not be counted also arrive as an empty claim list,
          and drawing the "claims no paths" empty state for them would state as fact ("this module
          claims nothing") what is actually unknown ("what it claims could not be counted"). */}
      {answer.problem !== null ? null : answer.claims.length === 0 ? (
        <p className="sx-lede">
          <Absence word={t('moduleSource.noClaims')} />
        </p>
      ) : (
        <>
          <p className="sx-lede num">
            {stale > 0 ? lede + t('saveAnswer.sentenceGap') + t('moduleSource.ledeStale', { n: stale }) : lede}
          </p>

          <div className="sx-claims">
            {answer.claims.map((claim) => (
              <ClaimSection key={fileKey(claim.repository?.id, claim.pattern)} claim={claim} byPath={byPath} />
            ))}
          </div>
        </>
      )}

      <ServerNote text={answer.index.howRead} />
    </>
  )
}

/** One file or claim of one repository, as a map key. A project with no registered repository has no id. */
function fileKey(repositoryId: string | undefined, path: string): string {
  return `${repositoryId ?? ''}:${path}`
}

/**
 * WHICH REPOSITORY EACH COUNT IS FROM (problem ZXD3MbidIya1). Each stated row is counted against the
 * stored scan of the repository it names, so the panel says, repository by repository, how many files
 * were counted there, and names a repository with no stored scan as not counted, with how to scan it.
 */
/**
 * A REPOSITORY WITH NO STORED SCAN, SAID WITH WHERE TO SCAN IT. The button is Settings' "Scan now" on
 * the repository's row, in the Repositories panel, which Settings draws only in Developer mode and
 * under its "Developer: computers and access" category (DEVELOPER_ONLY_PANELS and CATEGORY_OF in
 * src/web/pages/SettingsPage.tsx). Every name is read from the words that draw it, not copied, and
 * tests/the-source-pages-name-each-repository.test.ts fails if Settings moves the panel.
 */
export function notCountedIn(name: string): string {
  return t('sourceRepo.notCounted', {
    name,
    scanNow: t('settingsPanel.repos.scanNow'),
    settings: t('nav.settings'),
    category: t('settingsCats.cat.devMachines'),
    repositories: t('settingsPanel.title.repositories'),
    developer: t('settingsPanel.mode.developer'),
    modeTitle: t('settingsPanel.title.mode'),
  })
}

export function CountedInEachRepository({ entries }: { entries: readonly ClaimsInOneRepository[] }) {
  if (entries.length === 0) return null
  return (
    <div className="sx-repos">
      <p className="sx-note">
        <strong>{t('sourceRepo.heading')}</strong>
      </p>
      <ul className="sx-repo-list">
        {entries.map((entry) => (
          <li key={entry.repository.id} className={entry.notCounted === null ? 'sx-repo' : 'sx-repo sx-note-bad'}>
            {entry.notCounted === null
              ? t('sourceRepo.filesIn', { n: entry.files.length, name: entry.repository.name })
              : notCountedIn(entry.repository.name)}
          </li>
        ))}
      </ul>
    </div>
  )
}

/**
 * A claim with nothing under it, in two flavours that must not be confused.
 *
 * `problem === null` is the ORDINARY STALE case: a well-formed path whose files have gone, which
 * is almost always a rename and which a rebuild could in principle fix. Anything else is a claim
 * that can never match — an absolute path, a backslash, a `..` — and no amount of rescanning will
 * change that. Same alarm, different sentence, because they have different fixes.
 *
 * The alarm is one short line; the advice after it is quiet. Four lines in the failed colour make
 * the sentence that matters no louder than the rest of the paragraph.
 */
/**
 * The source index sends a refusal code beside its English reason, so the shared ErrorNote can
 * draw the reason in the reader's language. The pattern check remains for older-shaped fixtures
 * that have a reason but no code.
 */
export function ClaimUnmatched({ pattern, problem, problemCode }: { pattern?: string; problem: string | null; problemCode?: ResolvedClaim['problemCode'] }) {
  if (problem === null) return null
  const code = problemCode ?? (pattern === undefined ? null : claimProblemCode(pattern))
  if (code === null) {
    const message = `This claim ${problem}${/[.!?]$/.test(problem) ? '' : '.'}`
    return <ErrorNote message={message} />
  }
  // A REASON THE CLAIM CAN NEVER MATCH, in the reader's language. It is not a refused request, so it
  // is drawn as the note it is, not dressed as a refusal.
  return <ErrorNote message={t(`moduleSource.claim.${code}`)} />
}

/** One claim of one module: the line somebody wrote, and what it is worth today. */
function ClaimSection({ claim, byPath }: { claim: ResolvedClaim; byPath: Map<string, SourceFile> }) {
  return (
    <section className="sx-claim">
      <header className="sx-claim-head">
        <span className="sx-claim-name">
          <code className="sx-claim-path wrap-anywhere">{claim.pattern}</code>
          {claim.repository === undefined ? null : (
            <span className="sx-claim-repo">{t('sourceRepo.in', { name: claim.repository.name })}</span>
          )}
        </span>
        {claim.matched.length === 0 ? (
          <Tag
            tone="warn"
            title={
              claim.problem === null
                ? t('moduleSource.staleClaimTitle')
                : t('moduleSource.cannotMatchTitle')
            }
          >
            {claim.problem === null ? t('moduleSource.staleClaimTag') : t('moduleSource.cannotMatchTag')}
          </Tag>
        ) : (
          <span className="sx-count num">{fileCount(claim.matched.length)}</span>
        )}
      </header>

      {claim.matched.length === 0 ? <ClaimUnmatched pattern={claim.pattern} problem={claim.problem} problemCode={claim.problemCode} /> : (
        <ul className="sx-files">
          {claim.matched.map((path) => {
            const file = byPath.get(fileKey(claim.repository?.id, path))
            if (!file) {
              // The answer resolved a claim to a path it did not then describe. That is the
              // response disagreeing with itself, and it is named rather than skipped.
              return (
                <li className="sx-file sx-file-missing" key={path}>
                  <code className="sx-file-path wrap-anywhere">{path}</code>
                  <Absence word={t('state.unknown')} title={t('moduleSource.matchedButNoFile')} />
                </li>
              )
            }
            return <FileLine key={path} file={file} />
          })}
        </ul>
      )}
    </section>
  )
}

// ============================================================================ styles

const SOURCE_CSS = `
.sx-repos { margin: var(--gut) 0 0; }
.sx-repo-list { margin: 4px 0 0; padding-left: 1.2em; font-size: var(--fs-1); line-height: var(--lh-body); color: var(--text-2); }
.sx-claim-name { display: inline-flex; flex-wrap: wrap; align-items: baseline; gap: 0 var(--gut); min-width: 0; }
.sx-claim-repo { font-size: var(--fs-1); color: var(--text-3); }
.sx-note {
  margin: var(--gut) 0 0;
  font-size: var(--fs-1);
  line-height: var(--lh-body);
  color: var(--text-3);
}
.sx-note:first-child { margin-top: 0; }
.sx-note code, .sx-lede code { font-family: var(--font-mono); font-size: 0.94em; }
.sx-note strong { color: var(--text-2); }
.sx-note-bad { color: var(--st-failed); font-weight: var(--st-failed-weight); }
.sx-note-bad strong { color: var(--st-failed); }

/* The sentence that says this whole block is machine-made. It gets the quiet left rail the
   curated summary uses for its abstract, mirrored in meaning: there it marks the part a human
   wrote on purpose, here it marks the part no human may write at all.

   Wider than the reading measure the other notes take, because this is a banner across the block
   rather than a line of prose inside it: at 34em it read as a small box left in a corner, which
   is the opposite of "this applies to everything below". */
.sx-derived {
  max-width: 56rem;
  padding: var(--pad) var(--pad) var(--pad) var(--pad-lg);
  border-left: var(--rail) solid var(--border-strong);
  background: var(--panel-2);
  border-radius: var(--radius);
  color: var(--text-2);
  font-size: var(--fs-2);
}
.sx-derived strong { color: var(--text); }

.sx-lede {
  margin: var(--gut) 0 0;
  font-size: var(--fs-2);
  line-height: var(--lh-body);
  color: var(--text-2);
  max-width: var(--measure-in-box);
}

.sx-actions { display: flex; align-items: center; gap: var(--gut); flex-wrap: wrap; }
.sx-count {
  font-size: var(--fs-1);
  font-weight: 600;
  color: var(--text-3);
  white-space: nowrap;
}

/* ---------------------------------------------------------------- the age of the index */
.sx-age { display: inline-flex; align-items: baseline; gap: 6px; flex-wrap: wrap; min-width: 0; }
.sx-age-word {
  font-size: var(--fs-1);
  font-weight: 600;
  letter-spacing: .06em;
  text-transform: uppercase;
  color: var(--text-3);
}
.sx-age-value { font-size: var(--fs-1); font-weight: 600; color: var(--text-2); white-space: nowrap; }

/* ---------------------------------------------------------------- what the scan cannot see */
.sx-limits { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.sx-limit-list {
  margin: var(--pad) 0 0;
  padding-left: var(--pad-lg);
  font-size: var(--fs-1);
  line-height: var(--lh-body);
  color: var(--text-3);
}
.sx-limit-list li { margin-top: 4px; }

/* ---------------------------------------------------------------- claims and files */
.sx-claims { display: flex; flex-direction: column; gap: var(--pad-lg); margin-top: var(--gut); }
.sx-claim { min-width: 0; }
.sx-claim-head {
  display: flex; align-items: center; justify-content: space-between;
  flex-wrap: wrap; gap: var(--pad) var(--gut);
  padding: 0 var(--pad) var(--pad);
  border-bottom: var(--border-w) solid var(--border);
}
.sx-claim-path {
  font-family: var(--font-mono);
  font-size: var(--fs-2);
  font-weight: 600;
  color: var(--text);
  min-width: 0;
  user-select: all;
}

.sx-files { list-style: none; margin: var(--pad) 0 0; padding: 0; display: flex; flex-direction: column; gap: 2px; }
.sx-file {
  min-width: 0;
  padding: var(--pad);
  border-radius: var(--radius);
  background: var(--panel-2);
}
/* One hairline between files rather than a border on each: forty files in forty boxes read as
   forty results rather than as one list. */
.sx-file + .sx-file { box-shadow: inset 0 1px 0 var(--border); }
.sx-file-missing { background: var(--st-failed-row); }

.sx-file-head { display: flex; align-items: baseline; gap: var(--gut); flex-wrap: wrap; min-width: 0; }
.sx-file-path {
  font-family: var(--font-mono);
  font-size: var(--fs-2);
  line-height: var(--lh-body);
  color: var(--text);
  min-width: 0;
  /* One click selects the whole path. There is no copy button because there is nothing in this
     block that writes — see FileLine. */
  user-select: all;
}
.sx-file-facts {
  display: flex; align-items: baseline; gap: var(--gut); flex-wrap: wrap;
  margin-top: 2px;
  font-size: var(--fs-1);
  color: var(--text-3);
  line-height: var(--lh-tight);
}
.sx-fact { display: inline-flex; align-items: baseline; gap: 4px; white-space: nowrap; }
.sx-file-note {
  margin-top: 4px;
  font-size: var(--fs-1);
  line-height: var(--lh-body);
  color: var(--text-2);
  min-width: 0;
}
`
