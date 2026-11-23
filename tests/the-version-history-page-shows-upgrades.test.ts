// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * OLD: there is no Version history route, sidebar row, or page, so an announced upgrade cannot be
 * read in the browser.
 * NEW: the page inventory names one Version history page in the existing Developer group. It
 * reads announced events, distinguishes recorded outcomes from unfinished attempts, shows the
 * complete tags, commit range and original notice, labels links to current messages honestly, and
 * explains when a current message changed or disappeared. It can ask for the older cursor, and a
 * workspace change or existing message/reconnect signal opens a fresh durable first page.
 * WHY: a tag alone cannot prove an upgrade completed; original create events are the source of
 * what happened, while a message link opens its current record and must not impersonate a revision.
 *
 * OLD: GET refusals that this page draws can fall back to uncoded server English, and loading an
 * older page reduces an ApiError to its message before ErrorNote can translate its refusal code.
 * NEW: the upgrade-history GET names narrow refusal codes and the page keeps the full fault on
 * both first-page and older-page errors, so ErrorNote can use the English page words.
 * WHY: every refusal a page draws needs a code, a word and a test; a cursor or bounded-limit
 * refusal should be explained in the reader's language at either paging boundary.
 *
 * OLD: a message.new event wakes this page for the visible project or for a Mole Office event whose
 * workspace is MESSAGE_CENTRE.
 * NEW: it wakes only when the event's workspaceId is the visible project. A system message record is
 * stored in MESSAGE_CENTRE, but createRecord announces message.new with the input project workspace.
 * WHY: the browser follows the event's declared project boundary; row storage does not widen it.
 * The captured system notice frame named workspaceId=default and the actual page re-read that project.
 *
 * OLD: the browser proof waits for the full candidate tag as one substring of body.innerText.
 * NEW: it waits for a visible candidate code element whose textContent exactly equals the tag.
 * WHY: full tags intentionally wrap; innerText inserts line breaks between wrapped parts, even when
 * the complete candidate is rendered and the event-triggered history response contains it.
 *
 * OLD: the candidate title is an unclassed h2, so the light theme's section-case rule uppercases
 * the case-sensitive release tag along with its label.
 * NEW: the entry title is classed as content, and the code keeps the tag's recorded letter case in
 * both themes.
 * WHY: a theme's section-heading style must not change the release identifier a reader sees.
 *
 * OLD: Normal mode exposes the baseline tag, full commit hashes, event ids, revisions, hashes and
 * current-notice state beside the facts a reader came to find; a long history becomes a wall of
 * machine data and makes a phone page more than 12,000 pixels tall.
 * NEW: Normal mode shows only the candidate tag with its date, one plain outcome sentence, the whole
 * original notice, nine-character commit endpoints, the requested one-line changed-notice note and
 * one worded announcement link. Developer mode adds the stored audit fields only inside a closed
 * disclosure, so stored fields stay folded even when the reader asks to see more.
 * WHY: the release page serves two audiences. A person can tell what happened without decoding ids,
 * and a developer can inspect the original events without making every card carry that machinery.
 *
 * CASE PROOF MAP — each case has a control, a specific mutation, the assertion that must go red,
 * and the restoration point. These mutations are run against the named test after the page lands.
 * - page inventory: control the existing Developer group; remove its history row; this route/nav
 *   assertion goes red; restore the row and route together.
 * - rail word: control the new lowercase surface key and its page-word mapping; change its key to
 *   camel case or map it to the explanatory sentence; the surface registry or label assertion goes
 *   red; restore `rail.versionhistory` -> `nav.versionHistory`.
 * - loading, error, empty: control each other state; replace the selected state with empty; its
 *   named state assertion goes red; restore the state branch.
 * - outcomes: control a completed entry; derive the outcome label from `tag`; the unfinished-row
 *   assertion goes red; restore the label's source to `outcome`.
 * - source detail: control the short fixture; trim the long notice or a commit hash; the full-value
 *   assertion goes red; restore the complete server value.
 * - message links and notice state: control an unchanged current message; label its latest-message
 *   link as an original revision or drop the server's changed/deleted/missing notice state; the honest-link
 *   or state sentence assertion goes red; restore the `Message now` label and render each supplied
 *   state next to the immutable notice text.
 * - workspace and durable refresh: control a first page and older cursor from project A; reuse the
 *   same page key for project B or fail to advance it on a current-project `message.new`; the boundary
 *   key or event-routing assertion goes red; restore the key from workspace plus generation and
 *   advance the generation on current-project messages, lost events, and stream return. A project
 *   change and each refresh remount the reader, so an old cursor reply cannot append to the new page.
 * - system message project scope: control a Mole Office `message.new` for the visible project; add a
 *   MESSAGE_CENTRE sender exception; the centre-event assertion goes red; restore exact workspace
 *   matching because the system writer's event names the input project, not its message storage row.
 * - wrapped browser tag: control the full long tag in the rendered code element; search for it as a
 *   contiguous body.innerText substring; the browser wait times out although the page and fresh GET
 *   contain it; restore visible code-element textContent equality.
 * - candidate tag case: control the exact lower-case tag in a code element; remove the entry-title
 *   class so the global h2 section-case rule applies; the content-class assertion goes red; restore
 *   the class that gives the h2 content styling.
 * - browser tag casing: control the actual rendered lowercase candidate and require exact
 *   textContent plus computed text-transform none on its h2 and code; apply the named text-transform
 *   uppercase style mutation and require the casing assertion to go red, then clear the style and
 *   restore the original class. Record the measured source and date in the external proof log.
 * - two audiences and folded audit data: control a Normal-mode card with its six requested fields;
 *   expose stored ids in Normal mode or open stored fields by default in Developer mode; the
 *   absence/fold assertions go red; restore the Normal field boundary and a closed Developer
 *   disclosure containing the baseline, original-event ids/revisions/hashes and notice state.
 * - concise release range: control both full commit hashes; remove the nine-character formatting or
 *   truncate the candidate tag/notice instead; the shortened-range or full-content assertion goes
 *   red; restore full tag/notice and only abbreviate each commit endpoint in Normal mode.
 * - older cursor: control a null cursor; render the control without `older`; the cursor assertion
 *   goes red; restore the server-gated control.
 * - history read refusals: control a normalized successful GET and a real coded invalid-cursor
 *   response; drop the code at the route or drop the fault while handling an older-page request;
 *   the named GET/page test for the translated refusal goes red; restore the shared code and keep
 *   the fault through both first-page and older-page ErrorNote paths.
 * - emergency release: control an ordinary completed row, which says neither line; read the row's
 *   kind with `'kind' in row`, or draw the follow-up line from `outcome` instead of `followUp.state`,
 *   or put a receipt or report id in the Normal card; the label, line or id-absence assertion goes
 *   red; restore the kind test and the two lines read from the server's states.
 * - emergency links: control a row whose lines are missing, could not be checked or owe nothing,
 *   which has the announcement's link alone; draw a line's link whatever its state, build the
 *   report's address without its kind, or put the receipt's id in its link's words; the link-list,
 *   address or id-absence assertion goes red; restore a link on a filed line only, at the record's
 *   own address, in the words of its key.
 *
 * OLD: every completed row reads as an ordinary release, which had a receipt before it went in.
 * NEW: an emergency row says "Emergency release" and that no complete test receipt was read for this
 * release. Two lines follow, for the follow-up test receipt and the report: missing, filed (the
 * receipt also says passed or failed), or could not be checked. A release that did not go in says it
 * owes neither. The ids and the reason a read failed are in the Developer details only.
 * WHY: the owner must be able to see which stable versions went in untested, and whether each has
 * been tested since.
 *
 * OLD: a filed receipt and a filed report are only said, and the announcement is the row's one link.
 * NEW: a filed receipt's line has the link "Open follow-up receipt", to the receipt's record page,
 * and a filed report's line has the link "Open report", to the report's own page. A line that says
 * missing or could not be checked has no link, and nor does a row that owes nothing. The ids are in
 * the two links' addresses and in the Developer details, never in the words.
 * WHY: the owner reads that a receipt or a report was filed, and must be able to open it from the
 * row without copying an id.
 *
 * OLD: a sentence under the heading said what the page lists; a first handoff, a release that owes
 * nothing, a notice edited later and each Developer notice state drew a sentence that also explained
 * itself; an empty history drew "No upgrade announcements yet".
 * NEW: no sentence stands under the heading; those rows draw short state lines, each read from its
 * key; an empty history draws the state word "none".
 * WHY: as decided, explanatory text is taken off the pages, and an absence is a short state word.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { FLAT_ROUTES, parseRoute } from '../src/shared/addresses.ts'
import { RAIL_WORD_KEYS, SURFACES } from '../src/shared/surfaces.ts'
import { THE_TEST_OFFICE_ID } from './a-page-of-a-test-office.ts'
import { moleOffice, readMoleOfficeIdWith } from '../src/shared/participants.ts'
import { MESSAGE_CENTRE } from '../src/shared/workspaces.ts'
import { messagePath, pathFor, recordPath } from '../src/web/components/router.tsx'
import { DESTINATIONS, pageTitle, SHIPPED_RAIL_GROUPS } from '../src/web/components/Sidebar.tsx'
import { ApiError, type Fault } from '../src/web/api.ts'
import { t } from '../src/shared/i18n.ts'
import { buildTheFirstOfficeInAHook } from './helpers.ts'

buildTheFirstOfficeInAHook()

beforeAll(() => {
  const store = new Map<string, string>()
  const storage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
  }
  ;(globalThis as unknown as { window: unknown }).window = {
    localStorage: storage,
    sessionStorage: storage,
    location: { hash: '#/version-history', search: '' },
    addEventListener: () => {},
    removeEventListener: () => {},
  }
})

type NoticeState = 'unchanged' | 'changed' | 'deleted' | 'missing'
type Original = { id: string; seq: 1; contentHash: string }
type HistoryRow = {
  tag: string
  baselineTag: string
  date: string
  outcomeDate: string | null
  notice: string
  fromCommit: string
  toCommit: string
  tree: string
  outcome: 'unfinished' | 'completed' | 'refused' | 'failed-restored' | 'not-restored'
  reason: string | null
  before: Original
  after: Original | null
  notices: { before: NoticeState; after: NoticeState | null }
}
type HistoryPage = {
  entries: HistoryRow[]
  older: string | null
  subtraction: { candidates: number; carried: number; leftOut: number; shortened: number }
  leftOutGroups: { cause: 'budget'; bucket: 'older'; count: number; ids: string[] }[]
}
function historyPage(entries: HistoryRow[], older: string | null): HistoryPage {
  const candidates = entries.length + (older === null ? 0 : 1)
  return {
    entries,
    older,
    subtraction: { candidates, carried: entries.length, leftOut: candidates - entries.length, shortened: 0 },
    leftOutGroups: older === null ? [] : [{ cause: 'budget', bucket: 'older', count: 1, ids: ['fixture-older-probe'] }],
  }
}
type HistoryState =
  | { status: 'loading' }
  | { status: 'error'; message: string; fault?: Fault | null }
  | { status: 'ready'; value: HistoryPage }

const LONG_NOTICE = `Made-up secretary notice for the review office. ${'This is fabricated English text for line wrapping. '.repeat(30)}`
const LONG_TAG = `stable-2026-10-14-release-history-page-${'candidate-part-'.repeat(4)}r4`
const LONG_BASELINE = `stable-2026-09-30-${'baseline-part-'.repeat(4)}r3`

function historyReadRefusal(): Fault {
  return {
    kind: 'refused',
    code: 'upgradeHistoryReadRefused' as NonNullable<Fault['code']>,
    message: 'The history cursor is invalid.',
    said: 'The history cursor is invalid.',
    path: '/api/office/upgrades?limit=25&before=bad-cursor',
    status: 400,
    reason: 'The history cursor is invalid.',
    detail: null,
    stored: null,
    elsewhere: null,
  }
}

const COMPLETED: HistoryRow = {
  tag: LONG_TAG,
  baselineTag: LONG_BASELINE,
  date: '2026-10-14 13:30:15',
  outcomeDate: '2026-10-14 13:45:20',
  notice: LONG_NOTICE,
  fromCommit: '1'.repeat(40),
  toCommit: '2'.repeat(40),
  tree: '3'.repeat(40),
  outcome: 'completed',
  reason: null,
  before: { id: 'before-completed', seq: 1, contentHash: 'a'.repeat(16) },
  after: { id: 'after-completed', seq: 1, contentHash: 'b'.repeat(16) },
  notices: { before: 'unchanged', after: 'unchanged' },
}

const REFUSED: HistoryRow = {
  ...COMPLETED,
  tag: 'stable-2026-10-14-release-refused',
  outcomeDate: '2026-10-14 14:00:00',
  outcome: 'refused',
  reason: 'Upgrade was refused before publication.',
  before: { id: 'before-refused', seq: 1, contentHash: 'c'.repeat(16) },
  after: { id: 'after-refused', seq: 1, contentHash: 'd'.repeat(16) },
}

const FAILED_RESTORED: HistoryRow = {
  ...COMPLETED,
  tag: 'stable-2026-10-14-release-failed-restored',
  outcomeDate: '2026-10-14 14:10:00',
  outcome: 'failed-restored',
  reason: 'Upgrade failed and the baseline was restored.',
  before: { id: 'before-failed-restored', seq: 1, contentHash: 'e'.repeat(16) },
  after: { id: 'after-failed-restored', seq: 1, contentHash: 'f'.repeat(16) },
}

const NOT_RESTORED: HistoryRow = {
  ...COMPLETED,
  tag: 'stable-2026-10-14-release-not-restored',
  outcomeDate: '2026-10-14 14:20:00',
  outcome: 'not-restored',
  reason: 'Upgrade failed and restoration was not verified.',
  before: { id: 'before-not-restored', seq: 1, contentHash: '0'.repeat(16) },
  after: { id: 'after-not-restored', seq: 1, contentHash: '9'.repeat(16) },
}

// There is no server field distinguishing an unknown controller result from a pending AFTER post.
// Both announced cases use the one truthful `unfinished` state and have no invented reason.
const UNFINISHED_UNKNOWN: HistoryRow = {
  ...COMPLETED,
  tag: 'stable-2026-10-14-release-complete-looking-but-unfinished',
  outcomeDate: null,
  outcome: 'unfinished',
  reason: null,
  before: { id: 'before-unfinished-unknown', seq: 1, contentHash: '1a'.repeat(8) },
  after: null,
  notices: { before: 'unchanged', after: null },
}

const UNFINISHED_PENDING: HistoryRow = {
  ...UNFINISHED_UNKNOWN,
  tag: 'stable-2026-10-14-release-awaiting-outcome',
  before: { id: 'before-unfinished-pending', seq: 1, contentHash: '2b'.repeat(8) },
}

async function drawContent(state: HistoryState): Promise<string> {
  const { setMode } = await import('../src/web/lib/mode.ts')
  setMode('normal')
  const { VersionHistoryContent } = await import('../src/web/pages/VersionHistoryPage.tsx')
  return renderToStaticMarkup(createElement(VersionHistoryContent, { state }))
}

async function drawContentInDeveloperMode(state: HistoryState): Promise<string> {
  const { setMode } = await import('../src/web/lib/mode.ts')
  setMode('inspect')
  try {
    const { VersionHistoryContent } = await import('../src/web/pages/VersionHistoryPage.tsx')
    return renderToStaticMarkup(createElement(VersionHistoryContent, { state }))
  } finally {
    setMode('normal')
  }
}

async function drawPageFirstPaint(): Promise<string> {
  const { VersionHistoryPage } = await import('../src/web/pages/VersionHistoryPage.tsx')
  return renderToStaticMarkup(createElement(VersionHistoryPage))
}

describe('Version history is in the page inventory and Normal Office group', () => {
  it('maps #/version-history to one titled sidebar row', () => {
    expect(FLAT_ROUTES['version-history']).toBe('versionHistory')
    expect(parseRoute('/version-history')).toEqual({ name: 'versionHistory' })
    expect(pathFor('versionHistory')).toBe('/version-history')

    const row = DESTINATIONS.find((destination) => destination.key === 'versionHistory')
    expect(row).toMatchObject({ page: 'versionHistory', to: '/version-history' })
    expect(SHIPPED_RAIL_GROUPS.find((group) => group.key === 'office')?.keys).toContain('versionHistory')
    expect(row?.label).toBe('Version history')
    expect(pageTitle('versionHistory')).toBe('Version history')
    expect(SURFACES['rail.versionhistory']).toBe('Version history')
    expect(RAIL_WORD_KEYS['rail.versionhistory']).toBe('nav.versionHistory')
  })
})

describe('the page says what happened while its read is in each state', () => {
  it('draws a named loading state on first paint', async () => {
    const html = await drawPageFirstPaint()
    expect(html).toContain('Version history')
    expect(html).toContain('Loading version history')
    expect(html).toContain('role="status"')
  })

  it('draws an error sentence when the history read fails', async () => {
    const html = await drawContent({ status: 'error', message: 'The history could not be read.' })
    expect(html).toContain('Could not load version history')
    expect(html).toContain('The history could not be read.')
  })

  it('draws the coded English sentence for a first-page GET refusal', async () => {
    const refusal = historyReadRefusal()

    // CONTROL: the initial read's ErrorNote receives the code read from the GET refusal.
    const first = await drawContent({ status: 'error', message: refusal.message, fault: refusal })
    // Specific mutation: render the initial ErrorNote without `state.fault`.
    // RED: the coded sentence is replaced by the server's raw cursor sentence.
    expect(first).toContain('Upgrade history could not be read.')
    expect(first).not.toContain('The history cursor is invalid.')
    // RESTORE: pass the first read's complete fault into ErrorNote.
  })

  it('keeps the coded fault when an older-cursor GET refuses', async () => {
    const refusal = historyReadRefusal()

    // CONTROL: the older read throws an ApiError carrying the coded GET refusal.
    const { VersionHistoryContent, versionHistoryOlderReadError } = await import('../src/web/pages/VersionHistoryPage.tsx')
    const olderFailure = versionHistoryOlderReadError(new ApiError(400, refusal.message, refusal))

    // Specific mutation: reduce the older ApiError to `.message` in its catch handler.
    // RED: this assertion fails before ErrorNote can show the page's English word.
    expect(olderFailure.fault).toBe(refusal)
    const older = renderToStaticMarkup(createElement(VersionHistoryContent, {
      state: { status: 'ready', value: historyPage([COMPLETED], 'cursor-next') },
      olderError: olderFailure,
    }))
    expect(older).toContain('Upgrade history could not be read.')
    expect(older).not.toContain('The history cursor is invalid.')
    // RESTORE: preserve ApiError.fault in the older-page error conversion.
  })

  it('draws the state word "none" when no upgrade announcement has been filed', async () => {
    const html = await drawContent({ status: 'ready', value: historyPage([], null) })
    expect(html).toContain(`<p class="vh-empty">${t('absence.none')}</p>`)
  })
})

describe('the candidate heading preserves the tag as recorded', () => {
  it('keeps the case-sensitive tag out of the theme section-heading style', async () => {
    const html = await drawContent({ status: 'ready', value: historyPage([COMPLETED], null) })

    // CONTROL: the exact server tag remains the text of the code element.
    expect(html).toContain(`<code>${LONG_TAG}</code>`)
    // Specific mutation: remove the title class so global h2:not([class]) applies section case.
    // RED: the content heading no longer has the class that protects a case-sensitive identifier.
    expect(html).toContain('<h2 class="vh-entry-title">')
    expect(html).not.toContain(`<code>${LONG_TAG.toUpperCase()}</code>`)
    // RESTORE: class the entry title as content so the light theme cannot transform its tag.
  })
})

describe('announced attempts keep the outcome written by the server', () => {
  // OLD: every history row is an upgrade. NEW: a first handoff has no previous stable release.
  // WHY: equal code in another checkout must not be labelled a completed upgrade.
  it('labels the first handoff without inventing a previous stable release', async () => {
    const row = { ...COMPLETED, kind: 'first-handoff', baselineTag: null, fromCommit: 'a'.repeat(40), toCommit: 'a'.repeat(40),
      fromRepository: '/fixture/development', toRepository: '/fixture/stable', outcome: 'handed-off' } as unknown as HistoryRow
    const html = await drawContent({ status: 'ready', value: historyPage([row], null) })
    expect(html).toContain(t('versionHistoryPage.handedOff'))
    expect(html).not.toContain('The upgrade completed.')
    const inspect = await drawContentInDeveloperMode({ status: 'ready', value: historyPage([row], null) })
    expect(inspect).toContain('No previous stable release')
    expect(inspect).toContain('/fixture/development')
    expect(inspect).toContain('/fixture/stable')
  })

  it('shows completed, refused, restored failure, unrestored failure, and both unfinished attempts', async () => {
    const html = await drawContent({
      status: 'ready',
      value: historyPage([COMPLETED, REFUSED, FAILED_RESTORED, NOT_RESTORED, UNFINISHED_UNKNOWN, UNFINISHED_PENDING], null),
    })

    // CONTROL: an actual completed outcome still reads as completed.
    expect(html).toContain('The upgrade completed.')
    // Specific mutation: derive this label from a tag containing "complete" instead of `outcome`.
    // RED: the complete-looking unfinished tag below must still have no completed label.
    expect(html).toContain('Upgrade was refused before publication.')
    expect(html).toContain('Upgrade failed and the baseline was restored')
    expect(html).toContain('Upgrade failed and restoration was not verified')
    expect(html.match(/No outcome has been recorded/g)).toHaveLength(2)
    expect(html).not.toContain('Unknown outcome')
    expect(html).not.toContain('Pending outcome')
    // RESTORE: the unfinished label is driven by the original event outcome, not by its candidate tag.
    const unfinishedOnly = await drawContent({
      status: 'ready', value: historyPage([UNFINISHED_UNKNOWN], null),
    })
    expect(unfinishedOnly).toContain('No outcome has been recorded.')
    expect(unfinishedOnly).not.toContain('Completed')
  })
})

describe('Normal mode gives the reader the six release facts', () => {
  it('shows the complete notice and tag, one announcement link, and shortened commit endpoints', async () => {
    const changed: HistoryRow = { ...COMPLETED, notices: { before: 'changed', after: 'unchanged' } }
    const html = await drawContent({ status: 'ready', value: historyPage([changed], null) })

    // CONTROL: the complete, case-sensitive tag, date, outcome sentence and original notice are visible.
    expect(html).toContain(`<h2 class="vh-entry-title"><code>${LONG_TAG}</code>`)
    expect(html).toContain(`<time class="vh-date" dateTime="${COMPLETED.date.slice(0, 10)}">${COMPLETED.date.slice(0, 10)}</time>`)
    expect(html).toContain('The upgrade completed.')
    expect(html).toContain(LONG_NOTICE)
    // Specific mutation: put the full commit hashes in the Normal card or cut the original notice.
    // RED: each commit is only nine characters, but the notice and full candidate tag remain whole.
    expect(html).toContain(COMPLETED.fromCommit.slice(0, 9))
    expect(html).toContain(COMPLETED.toCommit.slice(0, 9))
    expect(html).not.toContain(COMPLETED.fromCommit)
    expect(html).not.toContain(COMPLETED.toCommit)
    expect(html).toContain(t('versionHistoryPage.editedLater').replace(/'/g, '&#x27;'))
    // RESTORE: show a short plain notice-state line while keeping the first recorded notice intact.

    // CONTROL: there is one message link, to the announcement, with a useful label.
    expect(html).toContain(`href="#${messagePath(COMPLETED.before.id)}"`)
    expect(html).toContain('>Open announcement message</a>')
    expect(html.match(/<a\b/g)).toHaveLength(1)
    expect(html).not.toContain('Message now')

    // Specific mutation: leave baseline and audit fields in the Normal card.
    // RED: this audience boundary fails if any stored identity or current-state detail leaks.
    const visibleHtml = html.replace(/href="[^"]*"/g, '')
    expect(visibleHtml).not.toContain(LONG_BASELINE)
    expect(visibleHtml).not.toContain(COMPLETED.before.id)
    expect(visibleHtml).not.toContain((COMPLETED.after as Original).id)
    expect(visibleHtml).not.toContain(COMPLETED.before.contentHash)
    expect(visibleHtml).not.toContain((COMPLETED.after as Original).contentHash)
    expect(visibleHtml).not.toContain('Current notice still matches the recorded notice.')
    expect(html).not.toContain('Recorded event details')
    // RESTORE: render stored provenance only in the closed Developer disclosure.
  })

  it('keeps all stored release details inside a closed Developer-mode disclosure', async () => {
    const html = await drawContentInDeveloperMode({ status: 'ready', value: historyPage([COMPLETED], null) })
    const disclosure = html.match(/<details class="vh-recorded-details">[\s\S]*?<\/details>/)?.[0]

    // CONTROL: Developer mode gives a reader a closed disclosure instead of showing stored fields inline.
    expect(disclosure).toBeDefined()
    expect(disclosure).not.toContain('<details class="vh-recorded-details" open')
    expect(disclosure).toContain('Recorded event details')
    // Specific mutation: render the details section open, or move one stored field outside it.
    // RED: the fold assertion and its complete-field assertions fail when audit data leaks into first glance.
    expect(disclosure).toContain(LONG_BASELINE)
    expect(disclosure).toContain(COMPLETED.before.id)
    expect(disclosure).toContain((COMPLETED.after as Original).id)
    expect(disclosure).toContain('event revision 1')
    expect(disclosure).toContain(COMPLETED.before.contentHash)
    expect(disclosure).toContain((COMPLETED.after as Original).contentHash)
    expect(disclosure).toContain(COMPLETED.fromCommit)
    expect(disclosure).toContain(COMPLETED.toCommit)
    expect(disclosure).toContain(COMPLETED.tree)
    expect(disclosure).toContain('Current notice still matches the recorded notice.')
    // RESTORE: keep the Developer-only audit fields under a disclosure with no `open` attribute.
  })
})

describe('the original notice stays visible when the current notice changes or disappears', () => {
  it('uses the one short Normal-mode line when the notice changed after it was recorded', async () => {
    const row: HistoryRow = {
      ...COMPLETED, notices: { before: 'changed', after: 'unchanged' },
    }
    const html = await drawContent({ status: 'ready', value: historyPage([row], null) })
    expect(html).toContain(t('versionHistoryPage.editedLater').replace(/'/g, '&#x27;'))
    expect(html).toContain(LONG_NOTICE)
  })

  it.each(['deleted', 'missing'] as const)('does not call a %s notice edited in Normal mode', async (state) => {
    const row: HistoryRow = { ...COMPLETED, notices: { before: state, after: 'unchanged' } }
    const html = await drawContent({ status: 'ready', value: historyPage([row], null) })

    // CONTROL: the original notice remains visible to the reader.
    expect(html).toContain(LONG_NOTICE)
    // Specific mutation: label a deleted or unavailable notice as edited later.
    // RED: this precise false statement is forbidden for both states.
    expect(html).not.toContain(t('versionHistoryPage.editedLater').replace(/'/g, '&#x27;'))
    // RESTORE: keep the accurate changed notice behind Developer's folded event details.
  })

  it.each([
    ['unchanged', 'w13q.upgrades.noticeUnchanged'],
    ['changed', 'versionHistoryPage.noticeChanged'],
    ['deleted', 'versionHistoryPage.noticeDeleted'],
    ['missing', 'versionHistoryPage.noticeMissing'],
  ] as const)('keeps the server-reported %s state inside Developer mode', async (state, key) => {
    const row: HistoryRow = { ...COMPLETED, notices: { before: state, after: 'unchanged' } }
    const html = await drawContentInDeveloperMode({ status: 'ready', value: historyPage([row], null) })
    const disclosure = html.match(/<details class="vh-recorded-details">[\s\S]*?<\/details>/)?.[0] ?? ''
    expect(disclosure).toContain(t(key))
  })
})

describe('older history is available only when the server gives a cursor', () => {
  it('offers a read for older entries with the returned cursor', async () => {
    const html = await drawContent({ status: 'ready', value: historyPage([COMPLETED], 'older-cursor-25') })
    expect(html).toContain('Older entries')
  })

  it('does not offer older entries when the server has no cursor', async () => {
    const html = await drawContent({ status: 'ready', value: historyPage([COMPLETED], null) })
    expect(html).not.toContain('Older entries')
  })

  it('asks the read-only endpoint for at most 25 rows and carries the exact cursor', async () => {
    let address = ''
    let method = ''
    const globals = globalThis as unknown as { fetch: (input: unknown, init?: RequestInit) => Promise<Response> }
    const savedFetch = globals.fetch
    globals.fetch = async (input, init = {}) => {
      address = String(input)
      method = init.method ?? 'GET'
      return new Response(JSON.stringify(historyPage([], null)), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    }
    try {
      const { api } = await import('../src/web/api.ts')
      await api.upgradeHistory('older cursor/25')
    } finally {
      globals.fetch = savedFetch
    }
    const url = new URL(address, 'http://example.test')
    expect(method).toBe('GET')
    expect(url.pathname).toBe('/api/office/upgrades')
    expect(url.searchParams.get('limit')).toBe('25')
    expect(url.searchParams.get('before')).toBe('older cursor/25')
  })
})

describe('history refreshes from current-project message and reconnect signals', () => {
  it('uses a separate read boundary for each workspace and each durable refresh', async () => {
    const { versionHistoryBoundaryKey } = await import('../src/web/pages/VersionHistoryPage.tsx')
    expect(versionHistoryBoundaryKey('project-a', 0)).not.toBe(versionHistoryBoundaryKey('project-b', 0))
    expect(versionHistoryBoundaryKey('project-a', 1)).not.toBe(versionHistoryBoundaryKey('project-a', 0))
  })

  it('refreshes for a message in the visible project and ignores a message from another project', async () => {
    const { historyMessageEventIsForWorkspace } = await import('../src/web/pages/VersionHistoryPage.tsx')
    const event = {
      name: 'message.new' as const,
      workspaceId: 'project-a',
      messageId: 'new-after-event',
      sentBy: null,
      to: [],
      hasTarget: false,
    }
    expect(historyMessageEventIsForWorkspace(event, 'project-a')).toBe(true)
    expect(historyMessageEventIsForWorkspace(event, 'project-b')).toBe(false)
  })

  it('keeps a centre-stored system message inside its event project scope', async () => {
    // A previous server case closed its database. This isolated page case registers its fixture,
    // then restores that earlier reader so its synthetic id cannot escape into another case.
    const key = Symbol.for('mole-office.the-current-office-id-reader')
    const readers = globalThis as Record<symbol, unknown>
    const previous = readers[key]
    readMoleOfficeIdWith(() => THE_TEST_OFFICE_ID)
    try {
      const { historyMessageEventIsForWorkspace } = await import('../src/web/pages/VersionHistoryPage.tsx')
      const actualOfficeNotice = {
        name: 'message.new' as const,
        workspaceId: 'project-a',
        messageId: 'upgrade-notice-event',
        sentBy: moleOffice(),
        to: [{ kind: 'person' as const, id: 'jory' }],
        hasTarget: false,
      }
      const hypotheticalCentreWorkspaceEvent = { ...actualOfficeNotice, workspaceId: MESSAGE_CENTRE }

      // CONTROL: the real create event carries project-a even though its message record is stored in MESSAGE_CENTRE.
      // Specific mutation: add the old Mole Office/MESSAGE_CENTRE exception to the exact-workspace match.
      // RED: this assertion flips to true, so a storage workspace would wake another project's reader.
      expect(historyMessageEventIsForWorkspace(actualOfficeNotice, 'project-a')).toBe(true)
      expect(historyMessageEventIsForWorkspace(hypotheticalCentreWorkspaceEvent, 'project-a')).toBe(false)
      expect(historyMessageEventIsForWorkspace({ ...actualOfficeNotice, workspaceId: 'project-b' }, 'project-a')).toBe(false)
      // RESTORE: match the event's project exactly; the ensuing GET stays on project-a.
    } finally {
      if (previous === undefined) delete readers[key]
      else readers[key] = previous
    }
  })

  it('shows a newly fetched outcome rather than keeping the first response as history', async () => {
    const first = await drawContent({ status: 'ready', value: historyPage([COMPLETED], null) })
    const newlyRecorded: HistoryRow = {
      ...COMPLETED,
      tag: 'stable-2026-10-14-newly-recorded-outcome',
      outcome: 'not-restored',
      reason: 'Upgrade failed and restoration was not verified.',
      before: { id: 'before-newly-recorded', seq: 1, contentHash: '4a'.repeat(8) },
      after: { id: 'after-newly-recorded', seq: 1, contentHash: '5b'.repeat(8) },
    }
    const after = await drawContent({ status: 'ready', value: historyPage([newlyRecorded, COMPLETED], null) })
    expect(first).not.toContain(newlyRecorded.tag)
    expect(after).toContain(newlyRecorded.tag)
    expect(after).toContain('Upgrade failed and restoration was not verified.')
  })
})

describe('an emergency release says so, with its follow-up receipt and its report', () => {
  const pin = (id: string, digit: string) => ({ id, seq: 1 as const, contentHash: digit.repeat(16) })
  const emergencyRow = (tag: string, outcome: HistoryRow['outcome'], followUp: object, report: object) => ({
    ...COMPLETED, tag, outcome, kind: 'emergency',
    reason: outcome === 'failed-restored' ? 'Upgrade failed and the baseline was restored.' : null,
    emergency: { throw: { change: 'fixture-throw-change', appendOrder: 120 }, message: pin('fixture-emergency-message', '7'), followUp, report },
  }) as unknown as HistoryRow
  const GREEN = pin('fixture-follow-up-green', '4'), RED = pin('fixture-follow-up-red', '5')
  const LATER = '6'.repeat(40)
  const rows = {
    missing: emergencyRow('stable-2026-10-24-emergency-missing', 'completed', { state: 'missing' }, { state: 'missing' }),
    filed: emergencyRow('stable-2026-10-24-emergency-filed', 'completed', { state: 'filed', receipt: GREEN, commit: LATER, green: true }, { state: 'filed', id: 'fixture-follow-up-report' }),
    failed: emergencyRow('stable-2026-10-24-emergency-failed', 'completed', { state: 'filed', receipt: RED, commit: LATER, green: false }, { state: 'missing' }),
    unknown: emergencyRow('stable-2026-10-24-emergency-unknown', 'completed', { state: 'unknown', because: 'Synthetic: git exited 128.' }, { state: 'unknown', because: 'Synthetic: the links could not be read.' }),
    notOwed: emergencyRow('stable-2026-10-24-emergency-not-owed', 'failed-restored', { state: 'not-owed' }, { state: 'not-owed' }),
  }
  const draw = (row: HistoryRow) => drawContent({ status: 'ready', value: historyPage([row], null) })
  const ids = ['fixture-throw-change', 'fixture-emergency-message', GREEN.id, RED.id, 'fixture-follow-up-report', LATER, 'Synthetic: git exited 128.', 'Synthetic: the links could not be read.']
  // Each link on a page, with its address and its words, in the order drawn; and the emergency line that says a sentence.
  const linksOf = (html: string) => [...html.matchAll(/<a\b[^>]*\bhref="#([^"]*)"[^>]*>([\s\S]*?)<\/a>/g)].map(([, to, words]) => ({ to, words }))
  const lineSaying = (html: string, sentence: string) => html.match(/<p class="vh-emergency-line">[\s\S]*?<\/p>/g)?.find(line => line.includes(sentence)) ?? ''
  const announcement = { to: messagePath(COMPLETED.before.id), words: t('w13q.upgrades.openAnnouncement') }
  const receiptLink = (receipt: { id: string }) => ({ to: recordPath(receipt.id, 'whole_suite_receipt'), words: t('w13q.upgrades.openFollowUpReceipt') })
  const reportLink = { to: recordPath('fixture-follow-up-report', 'report'), words: t('w13q.upgrades.openReport') }

  it('says an ordinary completed row is not an emergency release', async () => {
    // CONTROL: the ordinary row carries no emergency words.
    const html = await draw(COMPLETED)
    expect(html).toContain('The upgrade completed.')
    expect(html).not.toContain('Emergency release')
    expect(html).not.toContain('Follow-up test receipt')
    expect(html).not.toContain('Report:')
  })

  it('says "Emergency release", and says the follow-up receipt and the report are missing', async () => {
    const html = await draw(rows.missing)
    expect(html).toContain('Emergency release')
    expect(html).toContain(t('w13q.upgrades.emergencyNoReceipt'))
    expect(html).toContain('The upgrade completed.')
    expect(html).toContain('Follow-up test receipt: missing.')
    expect(html).toContain('Report: missing.')
    expect(html).not.toContain('First handoff')
    expect(html.match(/<a\b/g)).toHaveLength(1)
    const visible = html.replace(/href="[^"]*"/g, '')
    for (const id of ids) expect(visible).not.toContain(id)
  })

  it('says filed when the follow-up receipt and the report exist, and whether the tests passed', async () => {
    const green = await draw(rows.filed)
    expect(green).toContain('Follow-up test receipt: filed. The tests passed.')
    expect(green).toContain('Report: filed.')
    expect(green).not.toContain('missing.')
    const red = await draw(rows.failed)
    expect(red).toContain('Follow-up test receipt: filed. The tests failed.')
    expect(red).toContain('Report: missing.')
    for (const html of [green, red]) {
      const visible = html.replace(/href="[^"]*"/g, '')
      for (const id of ids) expect(visible).not.toContain(id)
    }
  })

  it('links a filed receipt and a filed report from their own lines, and links nothing else but the announcement', async () => {
    // CONTROL: a row whose lines are missing, could not be checked or owe nothing has the announcement's link alone.
    for (const row of [rows.missing, rows.unknown, rows.notOwed]) expect(linksOf(await draw(row))).toEqual([announcement])
    // Specific mutation: draw a line's link whatever its state, or build the report's address without its kind.
    // RED: the list of links, an address, or which line holds which link.
    const green = await draw(rows.filed)
    expect(linksOf(green)).toHaveLength(3)
    expect(linksOf(green)).toEqual(expect.arrayContaining([announcement, receiptLink(GREEN), reportLink]))
    expect(linksOf(lineSaying(green, t('w13q.upgrades.followUpPassed')))).toEqual([receiptLink(GREEN)])
    expect(linksOf(lineSaying(green, t('w13q.upgrades.reportFiled')))).toEqual([reportLink])
    const red = await draw(rows.failed)
    expect(linksOf(red)).toHaveLength(2)
    expect(linksOf(lineSaying(red, t('w13q.upgrades.followUpFailed')))).toEqual([receiptLink(RED)])
    expect(linksOf(lineSaying(red, t('w13q.upgrades.reportMissing')))).toEqual([])
    // RESTORE: a link on a filed line only, at the record's own address, in the words of its key.
  })

  it('says "could not be checked" when the office could not read them', async () => {
    const html = await draw(rows.unknown)
    expect(html).toContain('Follow-up test receipt: could not be checked.')
    expect(html).toContain('Report: could not be checked.')
    expect(html).not.toContain('missing.')
    expect(html).not.toContain('Synthetic: git exited 128.')
  })

  it('says a release that did not go in owes neither', async () => {
    const html = await draw(rows.notOwed)
    expect(html).toContain('Emergency release')
    expect(html).toContain('Upgrade failed and the baseline was restored')
    expect(html).toContain(t('versionHistoryPage.owesNothing'))
    expect(html).not.toContain('Follow-up test receipt:')
    expect(html).not.toContain('Report:')
  })

  it('keeps the ids and the reasons a read failed in the closed Developer details', async () => {
    for (const row of [rows.filed, rows.failed, rows.unknown]) {
      const html = await drawContentInDeveloperMode({ status: 'ready', value: historyPage([row], null) })
      const disclosure = html.match(/<details class="vh-recorded-details">[\s\S]*?<\/details>/)?.[0] ?? ''
      expect(disclosure).toContain('fixture-throw-change')
      expect(disclosure).toContain('fixture-emergency-message')
      const { followUp, report } = (row as unknown as { emergency: { followUp: any; report: any } }).emergency
      if (followUp.state === 'filed') { expect(disclosure).toContain(followUp.receipt.id); expect(disclosure).toContain(LATER) }
      if (followUp.state === 'unknown') expect(disclosure).toContain(followUp.because)
      if (report.state === 'filed') expect(disclosure).toContain(report.id)
      if (report.state === 'unknown') expect(disclosure).toContain(report.because)
    }
  })
})
