// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { familyWord } from '@shared/words.ts'
import { t } from '@shared/i18n.ts'
/**
 * `#/structure` — what this project is built out of, and the steps it runs.
 *
 * ---------------------------------------------------------------------------------------
 * IT IS AN OVERVIEW, NOT A RECORD LIST, AND THAT IS THE WHOLE DECISION
 * ---------------------------------------------------------------------------------------
 * The page this replaces listed every record in the Structure family newest-first. In `greenhouse`,
 * 61 of its 81 rows were `block` records — a pipeline STEP, drawn as a top-level row, with a title
 * like "Transplant v2 › Plan the approach" and a state chip. Every one of those steps is already
 * drawn inside its pipeline on `#/pipeline`, in order, with what it waits on. So the page was three
 * quarters a worse copy of another page, and the twenty rows that were not were modules and
 * pipelines drawn as though they were interchangeable with their own steps.
 *
 * A BLOCK IS NEVER A ROW HERE. Its pipeline's row carries `5 / 10 steps done` and says which step
 * the work is standing on, which is the one thing about a pipeline's steps that is worth knowing
 * before you open it. The count includes every id in `blockIds`, and an id no record answers to is
 * reported rather than dropped from the denominator — a pipeline whose order names a block that is
 * not there is a pipeline whose progress cannot be counted honestly.
 *
 * ---------------------------------------------------------------------------------------
 * EVERY NUMBER ON THIS PAGE IS COUNTED, AND THE PAGE SAYS SO ONCE
 * ---------------------------------------------------------------------------------------
 * A module's lifecycle word is the only stored thing on its row. `7 / 12 checked` is counted from
 * its own `parts` on every read; `3 open problems` is counted from the typed links joining problems
 * to it. Neither is stored and no agent wrote either, and a page that let a counted answer pass for
 * an authored one would be doing the thing this whole product exists to refuse. It is said once, at
 * the head, rather than as a tag on forty rows.
 *
 * `0 open problems` AND `nothing links a problem to this module` ARE DIFFERENT FACTS. In `greenhouse`
 * no problem is linked to any module at all, and printing "0 open problems" on twelve rows there
 * would read as twelve healthy subsystems. The row says which of the two it is.
 */

import { useMemo } from 'react'
import type { RecordListItem } from '../../api.ts'
import { KIND_FAMILIES, progressOf } from '@shared/work.ts'
import {
  Arithmetic,
  Band,
  Facts,
  FamilyHead,
  LinkBtn,
  MoreFacts,
  PageFoot,
  QuickFile,
  type Fact,
} from '../../components/family/parts.tsx'
import {
  linkedProblemCounts,
  postureNote,
  problemLinkNote,
  readModule,
  readPipeline,
  type ModuleReading,
  type PipelineReading,
} from '../../components/family/read.ts'
import { recordPath, RouteLink } from '../../components/router.tsx'
import { Absence, Row, StoredState, Tag } from '../../components/ui.tsx'
import { famCols, ModuleRow, RowRight } from './rows.tsx'

/**
 * No state chip column: on this page the leftmost answer is a count, and it lives on the row.
 *
 * The width comes from the one declaration every family page reads. It was `140px` written here,
 * beside `150px` on `#/findings` and `130px` on two more, for a column doing one job.
 */
const STRUCTURE_COLS = famCols()

export interface StructureLink {
  fromId: string
  toId: string
}

export function StructurePage({
  records,
  links,
  onFiled,
}: {
  records: readonly RecordListItem[]
  /** Every link in the project. What joins a problem to a module is a link and never a title. */
  links: readonly StructureLink[]
  onFiled: () => void
}) {
  const { modules, pipelines, blocks } = useMemo(() => {
    const byId = new Map(records.map((r) => [r.id, r]))
    const problems = linkedProblemCounts(records, links)
    return {
      modules: records
        .filter((r) => r.kind === 'module')
        .map((r) => readModule(r, problems))
        .sort(byName),
      pipelines: records
        .filter((r) => r.kind === 'pipeline')
        .map((r) => readPipeline(r, byId))
        .sort((a, b) => a.record.title.localeCompare(b.record.title)),
      blocks: records.filter((r) => r.kind === 'block').length,
    }
  }, [records, links])

  return (
    <>
      <FamilyHead
        // THE TITLE IS THE FAMILY'S OWN LABEL, READ FROM THE DECLARATION. It was typed here as
        // well, so the rail row and this heading were one fact in two places and nothing would
        // have failed when one of them changed. src/shared/work.ts holds it now, once.
        title={familyWord('structure').text}
        actions={
          <>
            <LinkBtn to="/pipeline" title={t('g7a.structure.drawingTitle')}>
              {t('g7a.structure.draw')}</LinkBtn>
            <QuickFile
              kind="module"
              label={t('g7a.modules.new')}
              fieldLabel={t('g7a.modules.field')}
              born={{ context: '', parts: [], paths: [] }}
              onFiled={onFiled}
            />
          </>
        }
      />

      <Arithmetic>
        {modules.length + pipelines.length === 0 ? <Absence /> : t('g7a.structure.count', { modules: t('g7a.modules.count', { n: modules.length }), pipelines: t('g7a.structure.pipelineCount', { n: pipelines.length }), steps: t('g7a.structure.steps', { n: blocks }) })}
      </Arithmetic>

      <Band declares={{ surface: 'structure.modules' }}
        heading={t('g7a.modules.title')}
        // WHAT THE ROWS CANNOT SAY FOR THEMSELVES, and nothing else. Both of these are facts about
        // the whole set — see `postureNote` and `problemLinkNote` — and each is null when the rows
        // differ on that field, because then the rows say it and this would be saying it twice.
        // The sentence that used to stand here when both were null explained how the checklist is
        // counted, which is a fact about the implementation and is in the page foot under Inspect.
        {...(() => {
          const said = [postureNote(modules), problemLinkNote(modules)].filter((n) => n !== null).join(' ')
          return said === '' ? {} : { what: said }
        })()}
        count={modules.length}
        empty={<Absence />}
      >
        {(shown) =>
          modules.slice(0, shown).map((m) => (
            <ModuleRow
              key={m.record.id}
              record={m.record}
              problems={{ open: m.openProblems, linked: m.linkedProblems }}
              lifecycle={m.lifecycle}
              sayLifecycle={postureNote(modules) === null}
              sayNoProblems={problemLinkNote(modules) === null}
            />
          ))
        }
      </Band>

      <Band declares={{ surface: 'structure.pipelines' }} heading={t('g7a.structure.pipelines')} count={pipelines.length} empty={<Absence />}>
        {(shown) => pipelines.slice(0, shown).map((p) => <PipelineRow key={p.record.id} reading={p} />)}
      </Band>

      <PageFoot
        what={t('sheet.record')}
        exclusions={t('g7a.structure.inspect')}
      />
    </>
  )
}

/** Modules read best alphabetically: they are a map of the system, not a feed. */
function byName(a: ModuleReading, b: ModuleReading): number {
  return a.record.title.localeCompare(b.record.title)
}

/**
 * One pipeline: how far the order has got, and the step the work has reached.
 *
 * "NOW AT" IS THE FIRST STEP THAT IS NOT DONE, in the order stored in `blockIds`. Order is content
 * — nothing sorts it — so the first not-done step really is the one the work is at, and its own
 * stored state word says whether it is being worked on or has fallen over.
 *
 * THE LABEL USED TO BE "standing on", which is a metaphor. A label that needs one is a label a
 * reader has to translate before they can use it.
 */
function PipelineRow({ reading }: { reading: PipelineReading }) {
  const standing = reading.standing
  // AT REST: WHICH STEP THE WORK HAS REACHED, and anything wrong with the count. Those are what a
  // pipeline row is scanned for. The summary is what it is called, and goes into the fold.
  const rest: Fact[] = [
    {
      get label(): string { return t('g7a.structure.nowAt') },
      value:
        standing === null
          ? reading.steps === 0
            ? <Absence />
            : t('g7a.structure.done')
          : t('g7a.structure.step', { n: String(standing.at).padStart(2, '0'), name: standing.name }),
      lead: true,
    },
    {
      // THE STEP'S OWN STATE, IN THE PRODUCT'S CHIP. It used to be the bare word with one flag
      // beside it -- urgent or not -- which is a two-way reduction of a word that has eight
      // drawings. "blocked" and "crashed" both came out as urgent text and read as one thing.
      get label(): string { return t('g7a.structure.thatStep') },
      value:
        standing === null ? null : <StoredState state={standing.state} progress={progressOf(standing.state)} />,
    },
    {
      // EVERY STOPPED STEP, not only the one the order has reached. See `PipelineReading.stopped`:
      // the sidebar counts blocks under Structure, and a row naming one of three blocked steps
      // would leave the other two unreachable from the page that count sends a reader to.
      get label(): string { return t('g7a.structure.needsPerson') },
      value: reading.stopped <= 1 ? null : reading.stopped,
      urgent: true,
    },
    {
      // NEVER DROPPED FROM THE DENOMINATOR. An id in the order that no record answers to means the
      // count above is of fewer steps than the pipeline claims to have, and a reader has to know.
      get label(): string { return t('g7a.structure.missing') },
      value: reading.missing === 0 ? null : reading.missing,
      urgent: true,
    },
  ]
  return (
    <Row
      cols={STRUCTURE_COLS}
      sev={
        <span className="fam-count">
          <b className="num">
            {reading.done} / {reading.steps}
          </b>
          <span>{t('g7a.structure.stepsDone')}</span>
        </span>
      }
      title={reading.record.title}
      // INTO THE PIPELINE PAGE, not into the record. A pipeline's record page shows its stored
      // fields; its drawing shows the order, the gates and the modules that carry each step, which
      // is what somebody who pressed a pipeline came for.
      href={`#/pipeline/${encodeURIComponent(reading.record.id)}`}
      target={{ kind: 'record', recordId: reading.record.id, workspaceId: reading.record.workspaceId }}
      meta={
        <>
          <Facts facts={rest} />
          {/* A MARKER, NOT A SENTENCE. "What this pipeline is for" stood on all eight rows. */}
          <MoreFacts summary={t('g7a.structure.purpose')} facts={[{ get label(): string { return t('g7a.family.whatItIs') }, value: reading.record.summary }]} />
        </>
      }
      right={
        <RowRight record={reading.record}>
          <RouteLink to={recordPath(reading.record.id, reading.record.kind)}>{t('g7a.structure.record')}</RouteLink>
        </RowRight>
      }
    />
  )
}

export const STRUCTURE_CSS = `
/* Nothing of this page's own is left here. The counted answer in the fixed column — 7 / 12 checked
   on a module, 5 / 10 steps done on a pipeline — is the .fam-count rule in
   components/family/parts.tsx, because both rows draw it and two copies of one treatment is how
   they come apart. Kept as an empty export so the one hoisted stylesheet in FamilyPage.tsx does not
   have to change shape when this page next needs a rule of its own. */
`
