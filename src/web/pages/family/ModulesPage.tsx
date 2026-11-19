// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { t } from '@shared/i18n.ts'
import { kindWord } from '@shared/words.ts'
import { Absence } from '../../components/ui.tsx'
/**
 * `#/modules` — every subsystem this project is building or characterising.
 *
 * ---------------------------------------------------------------------------------------
 * THE PAGE MADE FOUR CLAIMS ABOUT ITSELF ON ONE SCREEN AND THEY DISAGREED
 * ---------------------------------------------------------------------------------------
 * The `<h1>` said "Modules". The panel three centimetres below it said "Structure". The tally under
 * that said `module 15 · pipeline none recorded · block none recorded` — on a page that is about
 * modules, reporting that two kinds it is not about have nothing in them, which was FALSE anyway
 * because two pipelines exist and were simply not fetched. And a "Filter" panel above all of it
 * offered a search box and a locked kind field.
 *
 * A page about one thing does not need a filter to say what it is about, a family heading to file
 * itself under, or a tally of the kinds it is not showing.
 *
 * ---------------------------------------------------------------------------------------
 * A GROUPING THAT NEVER SEPARATES ANYTHING IS NOT A GROUPING
 * ---------------------------------------------------------------------------------------
 * The owner, opening this page: *"why is there a 'Nobody has said ...' session — firstly there are
 * a lot of line breaks, second it is kind of nonsense what this is for users."*
 *
 * They were reading the whole page. A module may be marked `active`, `paused`, `stable` or
 * `retired`. It is optional, and MEASURED: all fifteen modules in `panelx` and all twelve in
 * `greenhouse` are marked with none of them. So the page drew one group, headed *Nobody has said*,
 * holding every row, under a two-line paragraph explaining what choosing a word would buy. One
 * group containing everything is not a grouping, and a heading that apologises for the data is not
 * a heading.
 *
 * SO THE GROUPS ARE ONLY DRAWN WHEN THEY SEPARATE SOMETHING. Fewer than two groups with rows in
 * them and the page is one list under *Every module*, with the fact said once, quietly, in the
 * count line above it — which is where a fact about the whole set belongs. Two or more and the
 * groups come back, because then they are doing the job groups are for.
 *
 * WHEN ONE GROUP HOLDS EVERY MODULE its own heading says so ("Being worked on"), and when that
 * group is the modules nobody has marked, the heading is "Every module". The count sentence the page
 * drew above the list is gone (report n9Mjk3c_sJRu, block b-17): a heading and its count say it.
 *
 * ---------------------------------------------------------------------------------------
 * A ROW, IN THE FAMILY LISTS' DESIGN
 * ---------------------------------------------------------------------------------------
 * The title; one second line with what stopped (open problems, blocked and failed items) and then
 * the summary; and at the right how many items are checked, with a small bar. The checklist figure
 * is COUNTED from the module's own `parts` on every read, by `moduleCondition`, the module page's
 * own function, so this row and that page cannot disagree about one checklist. An empty checklist
 * is the short mark and not "0 of 0".
 */

import { useMemo } from 'react'
import { MODULE_STATES } from '@shared/kinds.ts'
import { chapterNumberOf } from '@shared/office-rules.ts'
import type { RecordListItem } from '../../api.ts'
import { FamilyHead, PageFoot, QuickFile, sharedOrigin } from '../../components/family/parts.tsx'
import { FamilyLists, ListGroup, ListRow, OrderFold, SmallBar } from '../../components/family/list.tsx'
import { linkedProblemCounts, readModule, type ModuleReading } from '../../components/family/read.ts'
import { moduleCondition, parseModule } from '../../components/ModuleView.tsx'
import { recordPath } from '../../components/router.tsx'
import type { StructureLink } from './StructurePage.tsx'

/**
 * The six groups: the four words a module may be marked with, one for a module marked with none,
 * and one for a module marked with a word that is not among the four.
 *
 * `unsaid` IS LAST OF THE FIVE ORDINARY ONES BECAUSE IT IS THE BIGGEST, not because it matters
 * least. Reading order is the order the four words go in — what is being worked on, what has been
 * put down, what is finished, what is out of use — and then everything nobody has placed at all.
 */
const GROUPS = [...MODULE_STATES, 'unsaid', 'unreadable'] as const
type ModuleGroup = (typeof GROUPS)[number]

/**
 * What each group is called as a heading. `unsaid` is only drawn under its own heading when another
 * group holds rows too, so "which" has something to refer to on the same screen.
 *
 * `unreadable` IS NOT THE SAME FACT AS "nobody has said", AND THAT IS WHY IT IS A GROUP OF ITS OWN. A
 * module marked with a word that is not one of the four has something stored that nothing can honour,
 * which is a repair job; its rows print the stored word, because the heading cannot.
 */
const GROUP_HEADINGS: Readonly<Record<ModuleGroup, () => string>> = {
  active: () => t('g7a.modules.active'),
  paused: () => t('g7a.modules.paused'),
  stable: () => t('g7a.modules.stable'),
  retired: () => t('g7a.modules.retired'),
  unsaid: () => t('g7a.modules.unsaid'),
  unreadable: () => t('g7a.modules.unreadable'),
}

export function ModulesPage({
  records,
  links,
  onFiled,
}: {
  /** Every record in the project. The modules are filtered here; the problems are joined here. */
  records: readonly RecordListItem[]
  links: readonly StructureLink[]
  onFiled: () => void
}) {
  const { groups, only } = useMemo(() => {
    const problems = linkedProblemCounts(records, links)
    // A REGULATION CHAPTER IS A MODULE RECORD AND IS NOT ONE OF THE PERSON'S MODULES. The server copies the
    // office's chapters into every new office as module records, and the Regulations page draws them. Until
    // round 135 this page drew them too, so a new office showed Mole Office's own rules as its modules.
    const readings = records
      .filter((r) => r.kind === 'module' && chapterNumberOf(r.kind, r.data) === null)
      .map((r) => readModule(r, problems))
      .sort((a, b) => a.record.title.localeCompare(b.record.title))
    const out = new Map<ModuleGroup, ModuleReading[]>()
    for (const group of GROUPS) out.set(group, [])
    for (const reading of readings) {
      const word = reading.lifecycle
      const group: ModuleGroup =
        word === null ? 'unsaid' : (MODULE_STATES as readonly string[]).includes(word) ? (word as ModuleGroup) : 'unreadable'
      out.get(group)?.push(reading)
    }
    // WHICH GROUP HOLDS EVERYTHING, or null when more than one has rows in it (or none has).
    const filled = GROUPS.filter((g) => (out.get(g)?.length ?? 0) > 0)
    return { groups: out, only: filled.length === 1 ? (filled[0] as ModuleGroup) : null }
  }, [records, links])

  const drawn = GROUPS.filter((group) => (groups.get(group)?.length ?? 0) > 0)

  return (
    <>
      <FamilyHead
        title={t('g7a.modules.title')}
        actions={
          <QuickFile
            kind="module"
            label={t('g7a.modules.new')}
            fieldLabel={t('g7a.modules.field')}
            variant="primary"
            born={{ context: '', parts: [], paths: [] }}
            onFiled={onFiled}
          />
        }
      />

      <FamilyLists>
        {drawn.length === 0 ? (
          <ListGroup declares={{ surface: 'modules.all' }} group="all" heading={t('g7a.modules.all')} count={0} records={[]} empty={<Absence title={t('g7a.modules.none')} />}>
            {[]}
          </ListGroup>
        ) : null}
        {drawn.map((group) => {
          const list = groups.get(group) ?? []
          const origin = sharedOrigin(list.map((m) => m.record))
          return (
            <ListGroup
              key={group}
              {...(only === 'unsaid' ? { declares: { surface: 'modules.all' } } : {})}
              group={group}
              // ONE GROUP OF MODULES NOBODY HAS MARKED IS EVERY MODULE, and the heading says so rather
              // than apologising for the data.
              heading={only === 'unsaid' ? t('g7a.modules.all') : GROUP_HEADINGS[group]()}
              count={list.length}
              records={list.map((m) => m.record)}
            >
              {list.map((m) => (
                <ModuleListRow key={m.record.id} reading={m} sayWord={group === 'unreadable'} sayOrigin={origin === null} />
              ))}
            </ListGroup>
          )
        })}
        <OrderFold>
          <p>{t('lists.order.modules')}</p>
        </OrderFold>
      </FamilyLists>

      <PageFoot what={kindWord('module').text} exclusions={t('g7a.modules.inspect')} />
    </>
  )
}

/**
 * ONE MODULE. The second line says what stopped, first, and then the summary. At the right: how many
 * checklist items are checked, and a small bar.
 *
 * `sayWord` prints the stored lifecycle word, only in the group whose heading cannot say it: a word
 * that is not one of the four.
 */
function ModuleListRow({ reading, sayWord, sayOrigin }: { reading: ModuleReading; sayWord: boolean; sayOrigin: boolean }) {
  const condition = moduleCondition(parseModule(reading.record.data).parts)
  const done = condition.byState.done
  const blocked = condition.byState.blocked
  const failed = condition.byState.failed
  const stopped: React.ReactNode[] = []
  if (sayWord && reading.lifecycle !== null) stopped.push(<span key="word">{t('lists.modules.marked', { word: reading.lifecycle })}</span>)
  if (reading.openProblems > 0) {
    stopped.push(<span key="problems" className="flst-warn">{t('lists.modules.openProblems', { open: reading.openProblems, n: reading.linkedProblems })}</span>)
  }
  if (blocked > 0) stopped.push(<span key="blocked" className="flst-strong">{t('g7a.family.blockedCount', { n: blocked })}</span>)
  if (failed > 0) stopped.push(<span key="failed" className="flst-strong">{t('g7a.family.failedCount', { n: failed })}</span>)
  if (reading.record.summary !== null) stopped.push(<span key="summary">{reading.record.summary}</span>)
  const checkedWords = t('lists.modules.checked', { done, n: condition.items })
  return (
    <ListRow
      record={reading.record}
      href={`#${recordPath(reading.record.id, reading.record.kind)}`}
      target={{ kind: 'record', recordId: reading.record.id, workspaceId: reading.record.workspaceId }}
      line={stopped.length === 0 ? null : stopped.flatMap((one, i) => (i === 0 ? [one] : [' · ', one]))}
      standing={condition.items === 0 ? <Absence title={t('lists.modules.noChecklist')} /> : checkedWords}
      when={condition.items === 0 ? undefined : <SmallBar done={done} total={condition.items} label={checkedWords} count={false} />}
      sayOrigin={sayOrigin}
    />
  )
}
