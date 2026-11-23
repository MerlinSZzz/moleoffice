// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { useState, type ReactNode } from 'react'
import { t } from '@shared/i18n.ts'
import { settingsPath } from '@shared/addresses.ts'
import { useInspect } from '../lib/mode.ts'
import { useLanguage } from '../lib/language.ts'
import { behaviorForJump, washJumpTarget } from '../lib/motion.ts'
import { faultOf, api, errorMessage, getActor } from '../api.ts'
import { Absence, Btn, ErrorNote, Field, Tag, TextArea } from '../components/ui.tsx'
import { useProjectAsync } from '../lib/project-async.ts'
import { BackLink } from '../components/BackLink.tsx'
import { RouteLink, toolsetPath } from '../components/router.tsx'
import { declaredAttributes } from '../components/declares.ts'
import { BUILT, TOOLSET_READERS, type ToolsetReader } from '@shared/toolset.ts'
import type { ManualItem, ManualPage, ToolsetCategory, ToolsetList, ToolsetRow } from '../../server/lib/toolset.ts'

/** The words this page draws, in both languages, live at r15.toolset.*. */
export const TOOLSET_WORDS = {
  get all() { return t('r15.toolset.all') },
  get usingOffice() { return t('r15.toolset.usingOffice') },
  get developingOffice() { return t('r15.toolset.developingOffice') },
  get filterLabel() { return t('r15.toolset.filterLabel') },
  get jumpLabel() { return t('r15.toolset.jumpLabel') },
  get needsYou() { return t('r15.toolset.needsYou') },
  get withoutCategory() { return t('r15.toolset.withoutCategory') },
  get howOfficeWorks() { return t('r15.toolset.howOfficeWorks') },
  audiences: {
    get users() { return t('r15.toolset.audience.users') },
    get developers() { return t('r15.toolset.audience.developers') },
    get both() { return t('r15.toolset.audience.both') },
  },
  get ready() { return t('r15.toolset.state.ready') },
  get notBuilt() { return t('r15.toolset.state.notBuilt') },
  get fileMissing() { return t('r15.toolset.state.fileMissing') },
  get runsByItself() { return t('r15.toolset.serviceRuns') },
  get confirm() { return t('r15.toolset.confirm') },
  manual: {
    get whenToUse() { return t('r15.toolset.manual.whenToUse') },
    get whenNotToUse() { return t('r15.toolset.manual.whenNotToUse') },
    get whoMayUse() { return t('r15.toolset.manual.whoMayUse') },
    get costs() { return t('r15.toolset.manual.costs') },
    get protects() { return t('r15.toolset.manual.protects') },
  },
  developer: {
    get title() { return t('r15.toolset.developer') },
    get path() { return t('r15.toolset.developer.path') },
    get kept() { return t('r15.toolset.developer.kept') },
    get howToCall() { return t('r15.toolset.developer.howToCall') },
    get example() { return t('r15.toolset.developer.example') },
    get eachUseRecords() { return t('r15.toolset.developer.eachUseRecords') },
    get keptBy() { return t('r15.toolset.developer.keptBy') },
  get version() { return t('r15.toolset.developer.version') },
  get copyOf() { return t('r15.toolset.developer.copyOf') },
  },
} as const

export function ToolsetPage({ slug }: { slug?: string }) {
  useLanguage()
  return slug === undefined ? <TheListPage /> : <TheManualPage slug={slug} />
}

// ============================================================================ the list

function TheListPage() {
  const [who, setWho] = useState<ToolsetReader | null>(null)
  const [state, reload] = useProjectAsync(() => api.readToolset(who), [who])
  return (
    <div className="page tls">
      <style href="mole-office-toolset" precedence="default">
        {TOOLSET_CSS}
      </style>
      <header className="tls-head">
        {/* THE NAME, TYPED: the same words as the rail row that opens this page. */}
        <h1 className="tls-title" data-title-is="its-label">{t('g6b.toolset.title')}</h1>
      </header>
      {state.status === 'loading' ? <p role="status">{t('g6b.loading')}</p> : null}
      {state.status === 'error' ? <ErrorNote message={state.message} fault={state.fault} /> : null}
      {state.status === 'ready' ? (
        <TheToolset said={state.value} who={who} onWhoChange={setWho} onConfirmed={reload} />
      ) : null}
    </div>
  )
}

function TheToolset({
  said,
  who,
  onWhoChange,
  onConfirmed,
}: {
  said: ToolsetList
  who: ToolsetReader | null
  onWhoChange: (next: ToolsetReader | null) => void
  onConfirmed: () => void
}) {
  const proposed = said.categories.filter((category) => !category.confirmed)
  const confirmed = said.categories.filter((category) => category.confirmed && category.tools.length > 0)
  const cardCount =
    said.categories.reduce((sum, category) => sum + category.tools.length, 0) + said.withoutACategory.length
  const hasAnythingToShow =
    said.categories.length > 0 || said.withoutACategory.length > 0 || said.partsOfTheOffice.length > 0
  const trulyEmpty = !hasAnythingToShow && who === null
  const hasNoToolsForThisReader = cardCount === 0 && said.partsOfTheOffice.length === 0 && who !== null

  if (trulyEmpty) {
    return <p className="tls-none">{t('absence.none')}</p>
  }

  const jumps: { label: string; target: string }[] = []
  if (proposed.length > 0) jumps.push({ label: TOOLSET_WORDS.needsYou, target: 'tls-needs-you' })
  for (const category of confirmed) jumps.push({ label: category.name, target: sectionId(category.id) })
  if (said.withoutACategory.length > 0) jumps.push({ label: TOOLSET_WORDS.withoutCategory, target: 'tls-without-category' })
  if (said.partsOfTheOffice.length > 0) jumps.push({ label: TOOLSET_WORDS.howOfficeWorks, target: 'tls-how-office-works' })

  return (
    <>
      <div className="tls-toolbar">
        {jumps.length > 0 ? <JumpRow jumps={jumps} /> : null}
        <WhoFilter who={who} onChange={onWhoChange} />
      </div>
      {hasNoToolsForThisReader ? <p className="tls-none">{t('g6b.toolset.noToolForThem')}</p> : null}
      <div className="tls-groups">
        {proposed.length > 0 ? (
          <section className="tls-needs-you" id="tls-needs-you">
            <h2 className="tls-group-title">{TOOLSET_WORDS.needsYou}</h2>
            {proposed.map((category) => (
              <NeedsCategory
                key={category.id}
                category={category}
                workspaceId={said.workspaceId}
                onConfirmed={onConfirmed}
              />
            ))}
          </section>
        ) : null}
        {confirmed.map((category) => (
          <ToolGroup key={category.id} category={category} workspaceId={said.workspaceId} />
        ))}
        {said.withoutACategory.length > 0 ? (
          <section className="tls-group" id="tls-without-category" {...declaredAttributes({ surface: 'toolset.nocategory' })}>
            <h2 className="tls-group-title">{TOOLSET_WORDS.withoutCategory}</h2>
            <div className="tls-cards">
              {said.withoutACategory.map((row) => (
                <ToolCard key={row.id} row={row} workspaceId={said.workspaceId} groupId="without-category" />
              ))}
            </div>
          </section>
        ) : null}
        {said.partsOfTheOffice.length > 0 ? (
          <section className="tls-how-office" id="tls-how-office-works" {...declaredAttributes({ surface: 'toolset.parts' })}>
            <h2 className="tls-group-title">{TOOLSET_WORDS.howOfficeWorks}</h2>
            <ul className="tls-how-list">
              {said.partsOfTheOffice.map((row) => (
                <li key={row.id}>
                  {row.slug === null ? row.name : (
                    <RouteLink to={toolsetPath(row.slug)} className="tls-how-link">
                      {row.name}
                    </RouteLink>
                  )}
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </>
  )
}

function JumpRow({ jumps }: { jumps: readonly { label: string; target: string }[] }) {
  return (
    <nav className="tls-jumps" aria-label={TOOLSET_WORDS.jumpLabel}>
      <span className="tls-jumps-label">{TOOLSET_WORDS.jumpLabel}</span>
      {jumps.map((jump) => (
        <button
          key={jump.target}
          type="button"
          className="tls-jump"
          onClick={() => { const target = document.getElementById(jump.target); if (target !== null) { target.scrollIntoView({ behavior: behaviorForJump(), block: 'start' }); washJumpTarget(target) } }}
        >
          {jump.label}
        </button>
      ))}
    </nav>
  )
}

function WhoFilter({ who, onChange }: { who: ToolsetReader | null; onChange: (next: ToolsetReader | null) => void }) {
  const choices: { value: ToolsetReader | null; word: string }[] = [
    { value: null, word: TOOLSET_WORDS.all },
    { value: 'users', word: TOOLSET_WORDS.usingOffice },
    { value: 'developers', word: TOOLSET_WORDS.developingOffice },
  ]
  return (
    <div className="tls-audience-switch" role="group" aria-label={TOOLSET_WORDS.filterLabel} {...declaredAttributes({ surface: 'toolset.filter' })}>
      {choices.map((choice) => (
        <button
          key={choice.word}
          type="button"
          className="tls-who"
          data-who={choice.value ?? 'everyone'}
          aria-pressed={who === choice.value}
          onClick={() => onChange(choice.value)}
        >
          {choice.word}
        </button>
      ))}
    </div>
  )
}

function ToolGroup({ category, workspaceId }: { category: ToolsetCategory; workspaceId: string }) {
  return (
    <section
      className="tls-group tls-category"
      id={sectionId(category.id)}
      data-category={category.id}
      data-confirmed="1"
      {...declaredAttributes({ about: { kind: 'record', recordId: category.id, workspaceId } })}
    >
      <header className="tls-category-head">
        <h2 className="tls-group-title tls-category-name">{category.name}</h2>
        <span className="tls-count num">{counted(category.tools.length)}</span>
      </header>
      <div className="tls-cards">
        {category.tools.map((row) => (
          <ToolCard key={row.id} row={row} workspaceId={workspaceId} groupId={category.id} />
        ))}
      </div>
    </section>
  )
}

function NeedsCategory({
  category,
  workspaceId,
  onConfirmed,
}: {
  category: ToolsetCategory
  workspaceId: string
  onConfirmed: () => void
}) {
  const [asking, setAsking] = useState(false)
  const [why, setWhy] = useState('')
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState<{ message: string; fault: ReturnType<typeof faultOf> } | null>(null)
  const mayConfirm = getActor().type === 'human'

  async function confirm(): Promise<void> {
    setBusy(true)
    setFailed(null)
    try {
      await api.confirmToolCategory(category.id, why.trim())
      setAsking(false)
      setWhy('')
      onConfirmed()
    } catch (err) {
      setFailed({ message: errorMessage(err), fault: faultOf(err) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <section
      className="tls-category tls-needs-category"
      data-category={category.id}
      data-confirmed="0"
      {...declaredAttributes({ about: { kind: 'record', recordId: category.id, workspaceId } })}
    >
      <header className="tls-category-head">
        <h3 className="tls-category-name">{category.name}</h3>
        <span className="tls-count num">{counted(category.tools.length)}</span>
        {category.says === null ? null : <p className="tls-category-says">{category.says}</p>}
        {mayConfirm ? (
          <div className="tls-confirm">
            {asking ? (
              <div className="tls-confirm-form">
                <Field label={t('g6b.toolset.confirmWhy')}>
                  <TextArea rows={2} value={why} onChange={setWhy} placeholder={t('g6b.toolset.inYourWords')} />
                </Field>
                <div className="tls-confirm-acts">
                  <Btn
                    variant="primary"
                    size="sm"
                    pending={busy}
                    disabled={why.trim() === ''}
                    reason={t('toolsetPage.noReasonWritten')}
                    onClick={() => void confirm()}
                  >
                    {TOOLSET_WORDS.confirm}
                  </Btn>
                  <Btn variant="ghost" size="sm" onClick={() => setAsking(false)}>
                    {t('g6b.toolset.notNow')}
                  </Btn>
                </div>
                {failed === null ? null : <ErrorNote message={failed.message} fault={failed.fault} label={t('g6b.toolset.notConfirmed')} />}
              </div>
            ) : (
              <Btn variant="secondary" size="sm" onClick={() => setAsking(true)}>
                {TOOLSET_WORDS.confirm}
              </Btn>
            )}
          </div>
        ) : null}
      </header>
      <div className="tls-cards">
        {category.tools.map((row) => (
          <ToolCard key={row.id} row={row} workspaceId={workspaceId} groupId={category.id} />
        ))}
      </div>
    </section>
  )
}

/** The short card. Its link covers every fact, and its one small icon is shared by the category. */
function ToolCard({ row, workspaceId, groupId }: { row: ToolsetRow; workspaceId: string; groupId: string }) {
  const content = (
    <>
      <GroupIcon groupId={groupId} className="tls-card-icon" />
      <span className="tls-card-main">
        <span className="tls-name">{row.name}</span>
        <span className="tls-does">{row.does ?? <Absence title={t('g6b.toolset.notFilledIn')} />}</span>
        <span className="tls-card-facts">
          <WhoTag forWhom={row.forWhom} />
          {row.entry === 'service' ? <Tag tone="neutral">{TOOLSET_WORDS.runsByItself}</Tag> : null}
          <StateTag row={row} />
        </span>
      </span>
    </>
  )

  if (row.slug === null) {
    return <div className="tls-card tls-card-unavailable" data-tool={row.id}>{content}</div>
  }
  return (
    <a
      href={`#${toolsetPath(row.slug)}`}
      className="tls-row tls-card"
      data-tool={row.slug}
      data-state={row.state ?? 'unknown'}
      {...declaredAttributes({ about: { kind: 'record', recordId: row.id, workspaceId } })}
    >
      {content}
    </a>
  )
}

function GroupIcon({ groupId, className }: { groupId: string; className: string }) {
  const glyph = iconGlyph(groupId)
  return (
    <span className={`tls-group-icon ${className}`} data-group={groupId} aria-hidden="true">
      <svg viewBox="0 0 16 16" focusable="false">{glyph}</svg>
    </span>
  )
}

function iconGlyph(groupId: string): ReactNode {
  const symbols: ReactNode[] = [
    <><rect x="2.2" y="2.2" width="11.6" height="11.6" rx="2" /><path d="M5 5.2h6M5 8h6M5 10.8h3" /></>,
    <><circle cx="8" cy="8" r="5.4" /><path d="M8 2.6v10.8M2.6 8h10.8" /></>,
    <><path d="M3 4.2h10M3 8h10M3 11.8h10" /><circle cx="5" cy="4.2" r="1.1" /><circle cx="10" cy="8" r="1.1" /><circle cx="6" cy="11.8" r="1.1" /></>,
    <><path d="M3 3h10v10H3z" /><path d="M5.2 6h5.6M5.2 8.5h5.6M5.2 11h3.1" /></>,
  ]
  let hash = 2166136261
  for (let index = 0; index < groupId.length; index += 1) hash = Math.imul(hash ^ groupId.charCodeAt(index), 16777619)
  return symbols[(hash >>> 0) % symbols.length]
}

function WhoTag({ forWhom }: { forWhom: string | null }) {
  if (forWhom === null) return <span className="tls-audience"><Absence tier="told-apart" looked={false} word={t('g6b.toolset.notFilledIn')} /></span>
  const word = TOOLSET_WORDS.audiences[forWhom as keyof typeof TOOLSET_WORDS.audiences]
  return word === undefined
    ? <span className="tls-audience"><Absence title={t('g6b.toolset.unknownAudience')} /></span>
    : <Tag tone="neutral">{word}</Tag>
}

function StateTag({ row }: { row: ToolsetRow }) {
  if (row.state === BUILT && row.locationFound === false) return <Tag tone="alarm">{TOOLSET_WORDS.fileMissing}</Tag>
  if (row.state === BUILT) return <Tag tone="neutral">{TOOLSET_WORDS.ready}</Tag>
  if (row.state === 'not built yet') return <Tag tone="warn">{TOOLSET_WORDS.notBuilt}</Tag>
  return (
    <span className="tls-state">
      <Absence title={t('g6a.common.notRecorded')} />
    </span>
  )
}

function counted(n: number): string {
  return t('g6b.toolset.count', { n, count: n })
}

function sectionId(id: string): string {
  return `tls-group-${id.replace(/[^a-zA-Z0-9_-]/g, '-')}`
}

// ============================================================================ one manual page

function TheManualPage({ slug }: { slug: string }) {
  const [state] = useProjectAsync(() => api.readManualPage(slug), [slug])
  return (
    <div className="page tls">
      <style href="mole-office-toolset" precedence="default">
        {TOOLSET_CSS}
      </style>
      <BackLink page="toolset" />
      {state.status === 'loading' ? <p role="status">{t('g6b.loading')}</p> : null}
      {state.status === 'error' ? <ErrorNote message={state.message} fault={state.fault} /> : null}
      {state.status === 'ready' ? <TheManual page={state.value} /> : null}
    </div>
  )
}

export function TheManual({ page }: { page: ManualPage }) {
  useLanguage()
  const inspect = useInspect()
  const tool = page.tool
  const holds = manualHolds(page.items)
  const categoryName =
    page.category === null
      ? t('g6b.toolset.inNoCategory')
      : !page.category.found || page.category.name === null
        ? t('g6b.toolset.categoryGone')
        : page.category.name

  return (
    <article className="tls-manual" {...declaredAttributes({ surface: 'toolset.manual' })}>
      <header className="tls-manual-head">
        <GroupIcon groupId={page.category?.id ?? 'without-category'} className="tls-manual-icon" />
        <div className="tls-manual-intro">
          <h1 className="tls-title">{tool.name}</h1>
          <p className="tls-does">{tool.does ?? <Absence title={t('g6b.toolset.notFilledIn')} />}</p>
        </div>
      </header>
      <div className="tls-facts">
        <span className="tls-fact">
          <span className="tls-fact-label">{t('r15.toolset.fact.state')}</span>
          <StateTag row={tool} />
        </span>
        <span className="tls-fact">
          <span className="tls-fact-label">{t('r15.toolset.fact.for')}</span>
          <WhoTag forWhom={tool.forWhom} />
        </span>
        <span className="tls-fact">
          <span className="tls-fact-label">{t('r15.toolset.fact.category')}</span>
          <span className="tls-fact-value">{categoryName}</span>
        </span>
      </div>
      {tool.entry === 'service' ? (
        <p className="tls-service-link">
          <RouteLink to={settingsPath('settings.mailtool')}>{t('r15.toolset.settingsTools')}</RouteLink>
        </p>
      ) : null}
      {inspect ? <DeveloperDetails tool={tool} holds={holds} /> : null}
      <div className="tls-sections">
        <ManualSection heading={TOOLSET_WORDS.manual.whenToUse} value={holds['whenToUse']} />
        <ManualSection heading={TOOLSET_WORDS.manual.whenNotToUse} value={holds['whenNotToUse']} />
        <ManualSection heading={TOOLSET_WORDS.manual.whoMayUse} value={holds['whoMayUse']} />
        <ManualSection heading={TOOLSET_WORDS.manual.costs} value={holds['costs']} />
        <ManualSection heading={TOOLSET_WORDS.manual.protects} value={holds['protects']} />
      </div>
    </article>
  )
}

function manualHolds(items: readonly ManualItem[]): Record<string, unknown> {
  const holds: Record<string, unknown> = {}
  for (const item of items) {
    for (const [key, value] of Object.entries(item.holds)) holds[key] = value
  }
  return holds
}

function ManualSection({ heading, value }: { heading: string; value: unknown }) {
  return (
    <section className="tls-section">
      <h2 className="tls-manual-heading">{heading}</h2>
      <p className="tls-part tls-part-text">{textOf(value)}</p>
    </section>
  )
}

function DeveloperDetails({ tool, holds }: { tool: ToolsetRow; holds: Record<string, unknown> }) {
  const fields: { label: string; value: unknown; code?: boolean }[] = [
    { label: TOOLSET_WORDS.developer.path, value: tool.location, code: true },
    { label: TOOLSET_WORDS.developer.kept, value: tool.kept },
    { label: TOOLSET_WORDS.developer.howToCall, value: holds['howToCall'], code: true },
    { label: TOOLSET_WORDS.developer.example, value: holds['example'], code: true },
    { label: TOOLSET_WORDS.developer.eachUseRecords, value: holds['eachUseRecords'] },
    { label: TOOLSET_WORDS.developer.keptBy, value: holds['keptBy'] },
    { label: TOOLSET_WORDS.developer.version, value: holds['version'] },
    ...(holds['copyOf'] === null || holds['copyOf'] === undefined
      ? []
      : [{ label: TOOLSET_WORDS.developer.copyOf, value: holds['copyOf'] }]),
  ]
  return (
    <section className="tls-developer">
      <h2 className="tls-manual-heading">{TOOLSET_WORDS.developer.title}</h2>
      <dl className="tls-developer-fields">
        {fields.map((field) => (
          <div className="tls-developer-field" key={field.label}>
            <dt>{field.label}</dt>
            <dd className="tls-part-text">
              {field.code && typeof field.value === 'string' && field.value.trim() !== ''
                ? <code>{field.value}</code>
                : textOf(field.value)}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  )
}

function textOf(value: unknown): ReactNode {
  if (value === null || value === undefined || (typeof value === 'string' && value.trim() === '')) {
    return <Absence title={t('g6b.toolset.notFilledIn')} />
  }
  return typeof value === 'string' || typeof value === 'number' ? value : <Absence />
}

/** The page's own rules. Every value is a token. */
export const TOOLSET_CSS = `
.tls { min-width: 0; }
.tls-head { display: flex; flex-wrap: wrap; align-items: baseline; gap: var(--pad) var(--gut); min-width: 0; }
.tls-title { margin: 0; color: var(--text); font: 600 var(--fs-4)/var(--lh-tight) var(--font-ui); overflow-wrap: anywhere; }
.tls-none { margin: var(--pad) 0; color: var(--text-2); font: var(--fs-2)/var(--lh-read) var(--font-ui); }
.tls-toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: var(--pad) var(--gut); margin: var(--pad) 0 var(--gut); min-width: 0; }
.tls-jumps { display: flex; flex: 1 1 32rem; flex-wrap: wrap; align-items: center; gap: 4px 8px; min-width: 0; }
.tls-jumps-label { color: var(--text-3); font: var(--fs-1)/var(--lh-tight) var(--font-ui); margin-right: 2px; }
.tls-jump, .tls-who {
  min-height: 44px; padding: 7px 11px; border: var(--border-w) solid var(--border-strong); border-radius: var(--radius-pill);
  background: var(--panel); color: var(--text-2); font: var(--fs-1)/var(--lh-tight) var(--font-ui); cursor: pointer;
}
.tls-jump:hover, .tls-who:hover { background: var(--hover); color: var(--text); }
.tls-jump:focus-visible, .tls-who:focus-visible, .tls-card:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.tls-audience-switch { display: flex; flex: 0 1 auto; flex-wrap: wrap; justify-content: flex-end; gap: 4px; margin-left: auto; }
.tls-who[aria-pressed="true"] { border-color: var(--accent); background: var(--accent); color: var(--accent-text); }
.tls-groups { display: grid; gap: var(--gut); min-width: 0; }
.tls-group, .tls-needs-you, .tls-how-office { min-width: 0; scroll-margin-top: var(--gut); }
.tls-needs-you { padding: var(--pad); border: var(--border-w) solid var(--ask-line); border-radius: var(--radius); background: var(--ask-row); }
.tls-group-title { margin: 0; color: var(--text); font: 600 var(--fs-3)/var(--lh-tight) var(--font-ui); overflow-wrap: anywhere; }
.tls-category-name { overflow-wrap: anywhere; }
.tls-category-head { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px var(--pad); margin: 0 0 var(--pad); min-width: 0; }
.tls-category-head .tls-group-title, .tls-category-name { flex: 0 1 auto; }
.tls-category-name { margin: 0; color: var(--text); font: 600 var(--fs-2)/var(--lh-read) var(--font-ui); overflow-wrap: anywhere; }
.tls-count { color: var(--text-3); font: var(--fs-1)/var(--lh-tight) var(--font-ui); }
.tls-category-says { flex: 1 1 100%; margin: 0; color: var(--text-3); font: var(--fs-1)/var(--lh-read) var(--font-ui); overflow-wrap: anywhere; }
.tls-needs-category { padding: var(--pad) 0; border-top: 1px solid var(--ask-line); }
.tls-needs-category:first-of-type { border-top: 0; }
.tls-confirm { flex: 1 1 100%; margin-top: 4px; }
.tls-confirm-form { display: grid; gap: var(--pad); max-width: 40rem; }
.tls-confirm-acts { display: flex; flex-wrap: wrap; gap: var(--pad); }
.tls-cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 18rem), 1fr)); gap: var(--pad); min-width: 0; margin-top: var(--pad); }
.tls-card {
  display: grid; grid-template-columns: 2.5rem minmax(0, 1fr); align-content: start; gap: 8px var(--pad);
  min-width: 0; min-height: 7.5rem; padding: var(--gut); border: var(--border-w) solid var(--border);
  border-radius: var(--radius); background: var(--panel); color: var(--text); text-decoration: none;
}
.tls-card:hover { border-color: var(--border-strong); background: var(--hover); text-decoration: none; }
.tls-card-unavailable { color: var(--text-2); }
.tls-group-icon { display: inline-grid; flex: 0 0 auto; place-items: center; color: var(--accent); }
.tls-group-icon svg { display: block; width: 1.4rem; height: 1.4rem; fill: none; stroke: currentColor; stroke-width: 1.2; stroke-linecap: round; stroke-linejoin: round; }
.tls-card-icon { grid-row: 1 / span 2; width: 2.25rem; height: 2.25rem; border-radius: var(--radius-sm); background: var(--accent-soft); }
.tls-card-icon svg { width: 1.25rem; height: 1.25rem; }
.tls-card-main { display: grid; gap: 4px; min-width: 0; }
.tls-name { color: inherit; font: 600 var(--fs-2)/var(--lh-read) var(--font-ui); overflow-wrap: anywhere; min-width: 0; }
.tls-does { display: block; min-width: 0; color: var(--text-2); font: var(--fs-1)/var(--lh-read) var(--font-ui); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.tls-card-facts { display: flex; flex-wrap: wrap; align-items: center; gap: 4px; min-width: 0; margin-top: 4px; }
.tls-audience, .tls-state { display: inline-flex; align-items: center; }
.tls-how-office { padding-top: var(--pad); border-top: 1px solid var(--border); }
.tls-how-list { margin: var(--pad) 0 0; padding-left: 1.25rem; color: var(--text-2); font: var(--fs-2)/var(--lh-read) var(--font-ui); }
.tls-how-list li + li { margin-top: 4px; }
.tls-how-link { color: var(--accent); text-decoration: underline; text-underline-offset: 2px; }

/* A manual is a short document, with the developer's facts immediately below its head. */
.tls-manual { display: grid; gap: var(--gut); width: min(100%, 62rem); min-width: 0; }
.tls-manual-head { display: grid; grid-template-columns: 2.5rem minmax(0, 1fr); align-items: start; gap: var(--pad); min-width: 0; }
.tls-manual-icon { width: 2.5rem; height: 2.5rem; border-radius: var(--radius-sm); background: var(--accent-soft); }
.tls-manual-intro { min-width: 0; }
.tls-manual-intro .tls-title { font-size: var(--fs-4); }
.tls-manual-intro .tls-does { margin: 6px 0 0; white-space: normal; }
.tls-facts { display: flex; flex-wrap: wrap; align-items: center; gap: 4px var(--gut); min-width: 0; padding: var(--pad) 0; border-top: 1px solid var(--border); border-bottom: 1px solid var(--border); }
.tls-fact { display: inline-flex; flex-wrap: wrap; align-items: center; gap: 6px; min-width: 0; color: var(--text-2); font: var(--fs-1)/var(--lh-read) var(--font-ui); }
.tls-fact + .tls-fact::before { content: '·'; margin-right: var(--pad); color: var(--text-3); }
.tls-fact-label { color: var(--text-3); }
.tls-fact-value { overflow-wrap: anywhere; }
.tls-service-link { margin: calc(-1 * var(--pad)) 0 0; font: var(--fs-1)/var(--lh-read) var(--font-ui); }
.tls-service-link a { color: var(--accent); text-decoration: underline; text-underline-offset: 2px; }
.tls-developer { padding: var(--pad) 0; border-bottom: 1px solid var(--border); }
.tls-developer h2 { margin: 0 0 var(--pad); color: var(--text-2); font: 600 var(--fs-1)/var(--lh-tight) var(--font-ui); }
.tls-developer-fields { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--pad) var(--gut); margin: 0; }
.tls-developer-field { display: grid; gap: 3px; min-width: 0; }
.tls-developer-field dt { color: var(--text-3); font: var(--fs-1)/var(--lh-read) var(--font-ui); }
.tls-developer-field dd { min-width: 0; margin: 0; color: var(--text); font: var(--fs-1)/var(--lh-read) var(--font-ui); overflow-wrap: anywhere; }
.tls-developer-field code { font: inherit; font-family: var(--font-mono); overflow-wrap: anywhere; }
.tls-sections { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--gut); }
.tls-section { min-width: 0; padding: var(--pad) 0; border-bottom: 1px solid var(--border); }
.tls-manual-heading { margin: 0 0 6px; color: var(--text-3); font: 600 var(--fs-1)/var(--lh-tight) var(--font-ui); }
.tls-part { min-width: 0; margin: 0; color: var(--text); font: var(--fs-2)/var(--lh-read) var(--font-ui); overflow-wrap: anywhere; }
.tls-part-text { min-width: 0; overflow-wrap: anywhere; }

@media (max-width: 40rem) {
  .tls-toolbar { align-items: flex-start; }
  .tls-jumps { flex-basis: 100%; }
  .tls-audience-switch { flex-basis: 100%; justify-content: flex-start; margin-left: 0; }
  .tls-sections, .tls-developer-fields { grid-template-columns: minmax(0, 1fr); }
}
`
