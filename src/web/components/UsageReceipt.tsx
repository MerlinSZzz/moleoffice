// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import type { OutsideSpend, ReceiptTotal, ReceiptUsage, UsageNumber, UsageReceipt as Receipt } from '../../shared/usage-receipts.ts'
import { PAID_BY_THE_LOGIN_IN, RAN_IN_THE_SANDBOX, RAN_ON_THE_HOST, RECEIPT_NOT_REPORTED } from '../../shared/usage-receipts.ts'
import { thePriceUnitSentence } from '../../shared/price-table.ts'
import { wallTime } from '../../shared/spent.ts'
import type { ReactNode } from 'react'
import { Absence, Explain, Stamp } from './ui.tsx'
import { count as countWord, t } from '@shared/i18n.ts'
import { saidOnThePage } from '@shared/dev-sayings.ts'
import { gapBetween } from '@shared/spacing.ts'

/**
 * WHICH ACCOUNT PAID AND WHERE THE RUN RAN, in the reader's language. The tools write the fixed forms declared in
 * src/config/usage.mjs; anything else is drawn as it was written.
 */
function paidBy(value: string): ReactNode {
  if (value === RECEIPT_NOT_REPORTED) return t('devWords.receipt.notReported')
  if (!value.startsWith(PAID_BY_THE_LOGIN_IN)) return value
  // THE FOLDER IS PUT IN AFTER THE WORDS ARE READ, so a narrow page breaks it after a slash and never inside a name.
  const [before, after] = t('devWords.receipt.theLoginIn', { where: WHERE_MARK }).split(WHERE_MARK) as [string, string?]
  return <>{before}{breakableAtSlashes(value.slice(PAID_BY_THE_LOGIN_IN.length))}{after ?? ''}</>
}

/** The mark put in the word's {where} place, so the word can be split around the folder. */
const WHERE_MARK = '\u0000'

/** A path with a place to break after each slash, so a line ends between two names rather than inside one. */
function breakableAtSlashes(path: string): ReactNode {
  return path.split('/').map((name, at) => <span key={at}>{at === 0 ? '' : <>/<wbr /></>}{name}</span>)
}

function ranIn(value: string): string {
  if (value === RAN_ON_THE_HOST) return t('devWords.receipt.onTheHost')
  return value.startsWith(RAN_IN_THE_SANDBOX) ? t('devWords.receipt.inTheSandbox', { name: value.slice(RAN_IN_THE_SANDBOX.length) }) : value
}

/** Money spent outside the office: each amount with the service it was paid to, as the run that paid wrote it. */
function outsideSpend(entries: OutsideSpend[] | undefined): string {
  if (entries === undefined || entries.length === 0) return t('devWords.receipt.noneRecorded')
  return entries.map(entry => t('devWords.receipt.spentOn', { amount: String(entry.usd), service: entry.service }) + (entry.says ? ` (${entry.says})` : '')).join('; ')
}

export function UsageReceipt({ receipt }: { receipt?: Receipt }) {
  // A number the runtime did not report is said so, never drawn as 0 (milestone M8, report 4IoRUKizcZXb).
  const notGiven = t('devWords.receipt.notReported')
  const count = (value?: number) => value === undefined ? notGiven : countWord(value)
  const fields: [string, ReactNode][] = receipt === undefined ? [[t('devWords.receipt.usageReceipt'), t('devWords.receipt.notRecorded')]] : [
    [t('devWords.receipt.tokensIn'), count(receipt.inputTokens)], [t('devWords.receipt.cached'), count(receipt.cachedInputTokens)], [t('devWords.receipt.tokensOut'), count(receipt.outputTokens)],
    [t('devWords.receipt.cacheWritten'), count(receipt.cacheCreationInputTokens)], [t('devWords.receipt.reasoning'), count(receipt.reasoningTokens)],
    [t('devWords.receipt.cacheInInput'), receipt.inputIncludesCached === true ? t('devWords.receipt.included') : receipt.inputIncludesCached === false ? t('devWords.receipt.excluded') : notGiven],
    [t('devWords.receipt.model'), receipt.model ?? notGiven], [t('devWords.receipt.runtime'), receipt.runtime ?? notGiven], [t('devWords.receipt.source'), receipt.source ?? notGiven],
    [t('devWords.receipt.time'), receipt.durationMs === undefined ? notGiven : t('devWords.receipt.ms', { n: count(receipt.durationMs) })],
    [t('devWords.receipt.costReported'), receipt.costUsd === undefined ? notGiven : t('devWords.receipt.usd', { amount: String(receipt.costUsd) })],
    [t('devWords.receipt.paidBy'), receipt.paidBy === undefined ? notGiven : paidBy(receipt.paidBy)],
    [t('devWords.receipt.ranIn'), receipt.ranIn === undefined ? notGiven : ranIn(receipt.ranIn)],
    [t('devWords.receipt.outsideSpend'), outsideSpend(receipt.outsideSpend)],
    // WHEN THE USAGE WAS READ. A receipt read once at the end carries no time, and says it was not recorded.
    [t('devWords.receipt.readAt'), receipt.readAt === undefined ? t('devWords.receipt.notRecorded') : <Stamp at={receipt.readAt} />],
  ]
  return <div data-testid="usage-receipt" style={{ overflowWrap: 'anywhere' }}>
    <dl style={{ display: 'grid', gridTemplateColumns: 'max-content minmax(0, 1fr)', gap: '.25rem 1rem' }}>
      {fields.map(([name, value]) => <div key={name} style={{ display: 'contents' }}><dt>{name}</dt><dd style={{ margin: 0 }}>{value}</dd></div>)}
    </dl>
    {receipt?.says ? <p className="rd-sub">{receipt.says}</p> : null}
  </div>
}

/** A whole amount of money as a person reads it. The currency is always named beside it. */
function money(value: number): string {
  return value.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 6 })
}

/** One summed count, with how many runs supplied it, the way the table has always drawn it. */
function counted(row: ReceiptTotal, key: UsageNumber): string {
  const value = row.values[key]
  return value === undefined ? t('devWords.receipt.notGiven') : t('devWords.receipt.counted', { value: countWord(value), supplied: row.supplied[key], runs: row.runs.length })
}

/** Wall time as words, never a raw millisecond count. */
function timeCell(row: ReceiptTotal): string {
  const value = row.values.durationMs
  return value === undefined ? t('devWords.receipt.notGiven') : (wallTime(value) as string)
}

/** The number the runtime itself reported. It is USD, and the label says so. */
function measuredCost(row: ReceiptTotal): string {
  const value = row.values.costUsd
  return value === undefined ? t('devWords.receipt.notReported') : t('devWords.receipt.usd', { amount: money(value) })
}

/** The number worked out from the person's table, or the short answer that there is none. */
function estimatedCost(row: ReceiptTotal): string {
  const estimate = row.estimate
  return estimate.total === null || estimate.currency === null ? t('devWords.receipt.noEstimate') : t('devWords.receipt.amount', { amount: money(estimate.total), currency: estimate.currency })
}

/**
 * ONE ROW OF TOTALS, FOLDED SO IT NEVER PUSHES THE PAGE SIDEWAYS.
 *
 * At 1440 the metrics sit in several columns; at 390 the same grid falls to one column. Nothing
 * here has a fixed minimum width, so the fold is the grid wrapping rather than a sideways scroll:
 * chapter 6 says a reader must see everything, and a table that scrolls sideways at 390 hides it.
 * The estimate is drawn AFTER the runtime's own cost and in its own cell, so the two are never
 * added and never share a column.
 */
function GroupRow({ row, overallSays, emptyName = t('devWords.receipt.notGiven') }: { row: ReceiptTotal; overallSays: string | null; emptyName?: string }) {
  const metrics: [string, string][] = [
    [t('devWords.receipt.tokensIn'), counted(row, 'inputTokens')],
    [t('devWords.receipt.cached'), counted(row, 'cachedInputTokens')],
    [t('devWords.receipt.cacheWritten'), counted(row, 'cacheCreationInputTokens')],
    [t('devWords.receipt.tokensOut'), counted(row, 'outputTokens')],
    [t('devWords.receipt.reasoning'), counted(row, 'reasoningTokens')],
    [t('devWords.receipt.time'), timeCell(row)],
    [t('devWords.receipt.costReported'), measuredCost(row)],
    [t('devWords.receipt.costEstimated'), estimatedCost(row)],
  ]
  return <div style={{ borderTop: '1px solid var(--border)', padding: '.5rem 0' }}>
    <div style={{ fontWeight: 600, overflowWrap: 'anywhere' }}>{row.name ?? emptyName}</div>
    {/* The row's own answer for why there is no number, unless the page already gave it once above. */}
    {row.estimate.says !== null && row.estimate.says !== overallSays
      ? <p className="rd-sub" style={{ margin: '.15rem 0 .35rem' }}>{saidOnThePage(row.estimate.said, row.estimate.says)}</p>
      : null}
    <dl style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(9rem, 1fr))', gap: '.35rem .9rem', margin: 0 }}>
      {metrics.map(([name, value]) => <div key={name}>
        <dt style={{ color: 'var(--text-3)', fontSize: '.78rem' }}>{name}</dt>
        <dd style={{ margin: 0, overflowWrap: 'anywhere', fontVariantNumeric: 'tabular-nums' }}>{value}</dd>
      </div>)}
    </dl>
  </div>
}

export function ReceiptTotals({ reading }: { reading: ReceiptUsage }) {
  const overall = reading.overall
  return <div data-testid="receipt-totals">
    <p><Labelled label={t('devWords.receipt.runs')} value={String(reading.runs)} /> · <Labelled label={t('devWords.receipt.withoutAReceipt')} value={String(reading.missingReceipts)} /></p>
    <Explain declares={{ surface: 'usage.receipts.counting' }} meaning={t('devWords.receipt.whatTheseTotalsInclude')} opens={t('devWords.receipt.countingRules')}>
      <p>{t('devWords.receipt.rulesCount')}</p>
      <p>{t('devWords.receipt.rulesRecords')}</p>
    </Explain>
    {/*
      THE PRICE TABLE, SAID ONCE FOR THE WHOLE READING. When nobody has set one the absence
      sentence is the honest answer and it is the one declared in src/shared/price-table.ts. The
      row cells below then say only what is true of that row.
    */}
    {overall.estimate.says !== null ? <p className="rd-sub" data-testid="receipt-estimate-says">{saidOnThePage(overall.estimate.said, overall.estimate.says)}</p> : null}
    {overall.estimate.currency !== null ? <p className="rd-sub">{thePriceUnitSentence()}</p> : null}
    {/* THE TWO COSTS, SIDE BY SIDE. One is measured by the runtime; the other is worked out from
        the person's table. The labels say which is which and they are never added. */}
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.25rem 1.5rem', margin: '.4rem 0' }}>
      <span><Labelled label={t('devWords.receipt.costReportedLead')} value={measuredCost(overall)} /></span>
      <span><Labelled label={t('devWords.receipt.costEstimatedLead')} value={estimatedCost(overall)} /></span>
    </div>
    {/* AN EMPTY GROUP STAYS SHUT AND SAYS "none" WHEN OPENED (wave 13k round 37), with why on its hover (wave 13y
        round 142): the model group stood open with nothing under it. Every run is in every group, so a group is empty only
        when no run was counted. */}
    {([['byModel', reading.byModel], ['byRuntime', reading.byRuntime], ['byAgent', reading.byAgent], ['byRecord', reading.byRecord]] as const).map(([title, rows]) => <details key={title} open={title === 'byModel' && rows.length > 0}>
      <summary>{t(`devWords.receipt.${title}`)}</summary>
      <div>
        {/* THE RUNTIME GROUP'S EMPTY ROW is the runs that declared no tool Mole Office adapts (problem uh6-H72Zik9H). */}
        {rows.length === 0 ? <Absence word={t('absence.none')} title={t('devWords.receipt.noRunCounted')} /> : rows.map(row => <GroupRow key={row.name ?? 'unknown'} row={row} overallSays={overall.estimate.says} {...(title === 'byRuntime' ? { emptyName: t('dev.usage.notDeclared') } : {})} />)}
      </div>
    </details>)}
  </div>
}

/**
 * A BOLD LABEL AND ITS VALUE, spaced by the office's one rule (src/shared/spacing.ts): "Runs: 0" in English and
 * "运行次数：0" in Chinese, where a typed space put "运行次数： 0" (wave 13k round 35, the review of wave 13u's
 * round 2).
 */
function Labelled({ label, value }: { label: string; value: string }) {
  return (
    <>
      <strong>{label}</strong>
      {gapBetween(label, value)}
      {value}
    </>
  )
}
