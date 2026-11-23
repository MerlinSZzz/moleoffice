// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { t } from '@shared/i18n.ts'
import { kindWord, linkWord } from '@shared/words.ts'
/**
 * THE SAME GRAPH, COMPOSED AS A READING LAYER INSTEAD OF A CANVAS.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS EXISTS, AND WHY IT IS NOT A CONSOLATION PRIZE
 * ---------------------------------------------------------------------------------------
 *
 * A pan-and-zoom canvas at 390px is the hardest thing in this product and the honest answer at that
 * width is not a smaller canvas. A phone screen holds about two module cards at a readable type
 * size; getting to the third means dragging, and dragging is how you lose the one you were looking
 * at. The brief said in as many words: if the honest answer at 390 is a different composition of the
 * same information, do that and say so. This is that.
 *
 * IT IS THE COMPLETE GRAPH, AND THAT IS NOW A LOAD-BEARING FACT ABOUT THE PRODUCT. It reads
 * `StructureGraph` and prints every node, every edge, every gate and every attachment. Nothing is
 * summarised away and nothing is computed twice; if a fact is not in the model it is not here, and
 * if it is in the model it is here.
 *
 * THE CANVAS IS A PROJECTION OF THAT OBJECT AND THIS IS NOT. `projectForCanvas` in model.ts may hand
 * the canvas a smaller graph — the cards a line touches — and `StructureView.tsx` states the
 * boundary and the invariant it retired to allow it. This component is the reason that is allowed:
 * it is handed the COMPLETE graph, always, so a card the canvas is not drawing is still printed here
 * in full with its links and everything attached to it. A `graph` prop carrying a projection would
 * turn the drawing's fold into a deletion, and it would do it silently.
 *
 * WHAT IT GAINS OVER THE CANVAS, at any width: find-in-page reaches it, a screen reader reads it in
 * order, it prints, and the reading order is a stated fact — everything a step waits on comes before
 * it — rather than a picture the eye has to trust. That is why it is offered at 1440 as well.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IT USES, AND WHAT IT REFUSES TO INVENT
 * ---------------------------------------------------------------------------------------
 *
 * `ScanRow`, `Explain`, `GateMark`, `LinkMark`, `StateChip`, `NoStateMark` and the alarm scale are
 * the shared primitives from ui.tsx. Nothing here draws its own chip, its own fold or its own arrow.
 *
 * A module has NO state word, and this prints that rather than working one out of its checklist. A
 * `blocks` link with no gate is printed as unqualified and never as hard. A partial gate prints how
 * far it lets you go, and where nothing recorded can place a step on either side of the wall, it
 * says that too.
 */

import { LINK_TYPES } from '@shared/types.ts'
import { recordPath } from '../router.tsx'
import {
  Absence,
  Empty,
  GateMark,
  LinkMark,
  NoStateMark,
  ScanRow,
  StateChip,
  Tag,
} from '../ui.tsx'
import { readingOrder, type Attachment, type GraphEdge, type GraphNode, type PipelineWall, type StructureGraph } from './model.ts'
import { PackageStateChip } from './CardFace.tsx'

// ============================================================================ one wall

/**
 * A record holding the whole pipeline up, drawn as a wall with the ground in front of it.
 *
 * A PARTIAL GATE IS NOT A WEAKER ALARM. It is a different fact — most of the work is doable and
 * there is a wall at the end of it — so the two lists are drawn as two lists with the wall between
 * them, and the third list, the steps nothing places on either side, is drawn as its own question.
 */
export function Wall({ wall, graph }: { wall: PipelineWall; graph: StructureGraph }) {
  const nameOf = (stepId: string): string => {
    const node = graph.nodes.find((n) => n.stepId === stepId)
    return node === undefined ? t('g7b.missingRecord') : `${node.ordinal ?? ''} ${node.title}`.trim()
  }
  return (
    <div className="gx-wall" data-gate={wall.gate.kind}>
      <p className="gx-wall-head">
        <GateMark gate={wall.gate} />
        <a className="gx-wall-who px-nav" href={`#${recordPath(wall.recordId)}`}>
          {wall.title}
        </a>
        <span className="gx-wall-words">{wall.words}</span>
      </p>
      <p className="gx-wall-sentence">{wall.sentence}</p>
      {wall.reach === null ? null : (
        <div className="gx-reach">
          <p className="gx-reach-side" data-side="open">
            <span className="gx-reach-label">{t('g7b.Outline.you_may_go_this_far')}</span>
            {wall.reach.allowed.length === 0 ? (
              <span className="gx-reach-none"><Absence /></span>
            ) : (
              wall.reach.allowed.map((id) => (
                <span className="gx-reach-step" key={id}>
                  {nameOf(id)}
                </span>
              ))
            )}
          </p>
          <p className="gx-reach-bar" aria-hidden="true" />
          <p className="gx-reach-side" data-side="walled">
            <span className="gx-reach-label">{t('g7b.Outline.and_no_further')}</span>
            {wall.reach.walled.length === 0 ? (
              <span className="gx-reach-none"><Absence /></span>
            ) : (
              wall.reach.walled.map((id) => (
                <span className="gx-reach-step" key={id}>
                  {nameOf(id)}
                </span>
              ))
            )}
          </p>
          {wall.reach.unplaced.length === 0 ? null : (
            <p className="gx-reach-side" data-side="unplaced">
              <span className="gx-reach-label">{t('g7b.Outline.nothing_says_which_side_these_are_on')}</span>
              {wall.reach.unplaced.map((id) => (
                <span className="gx-reach-step" key={id}>
                  {nameOf(id)}
                </span>
              ))}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

// ============================================================================ one line

/** One edge as a sentence, from the point of view of the node whose row it is drawn in. */
function EdgeLine({ edge, out, other }: { edge: GraphEdge; out: boolean; other: string }) {
  const arrow = out ? '→' : '←'
  const word =
    edge.relation === 'link' && edge.linkType !== null
      ? out
        ? linkWord(edge.linkType, 'forward').text
        : linkWord(edge.linkType, 'reverse').text
      : edge.relation === 'needs'
        ? out
          ? t('g7b.Outline.is_waited_on_by')
          : t('g7b.Outline.waits_on')
        : out
          ? t('g7b.Outline.carries')
          : t('g7b.Outline.is_carried_by')
  return (
    <li className="gx-edge" data-relation={edge.relation}>
      <span className="gx-edge-arrow" aria-hidden="true">
        {arrow}
      </span>
      {edge.relation === 'link' && edge.linkType !== null ? (
        <LinkMark type={edge.linkType} direction={out ? 'forward' : 'reverse'} inferred={edge.inferred} broken={edge.broken} />
      ) : (
        <span className="gx-edge-word">{word}</span>
      )}
      <span className="gx-edge-other">{other}</span>
      {edge.gate === null ? null : <GateMark gate={edge.gate} />}
      {edge.reading?.at === 'unstated' ? (
        <span className="gx-edge-note">{t('g7b.Canvas.nobody_said_how_much')}</span>
      ) : null}
      {edge.reading?.at === 'unreadable' ? <span className="gx-edge-note">{edge.reading.problem}</span> : null}
      {edge.reading?.at === 'not-served' ? (
        <span className="gx-edge-note">{t('g7b.Outline.this_reply_did_not_carry_the_gate')}</span>
      ) : null}
      {edge.broken && edge.relation === 'needs' ? (
        <span className="gx-edge-note">{t('g7b.Canvas.broken')}</span>
      ) : null}
    </li>
  )
}

// ============================================================================ one attachment

function AttachedRow({ item }: { item: Attachment }) {
  return (
    <li className="gx-attached" data-alarm={item.alarm}>
      <span className="gx-attached-head">
        {/* The mark carries its own sentence in its tooltip. Passing `note` prints that sentence
            beside every mark, which at 390px was three lines of the same words on every row and
            pushed the title of the record off the first screen. Said once, above the list. */}
        {item.state === null ? (
          <NoStateMark expected={false} />
        ) : (
          <StateChip state={item.state} {...(item.alarm === undefined ? {} : { alarm: item.alarm })} readOnly />
        )}
        <a className="gx-attached-title px-nav" href={`#${recordPath(item.recordId, item.kind)}`}>
          {item.title}
        </a>
        <Tag tone="quiet">{kindWord(item.kind).text}</Tag>
        {item.gate === null ? null : <GateMark gate={item.gate} />}
      </span>
      <span className="gx-attached-through">{item.through}</span>
    </li>
  )
}

// ============================================================================ one node

export function OutlineRow({ node, graph }: { node: GraphNode; graph: StructureGraph }) {
  const titleOf = (id: string): string => {
    const found = graph.nodes.find((n) => n.id === id)
    if (found === undefined) return t('g7b.missingRecord')
    return found.ordinal === null ? found.title : `${found.ordinal} ${found.title}`
  }
  const out = graph.edges.filter((edge) => edge.from === node.id)
  const inbound = graph.edges.filter((edge) => edge.to === node.id)
  const behind = out.length + inbound.length + node.attached.length

  // NO `age` CELL ON THIS ROW. What would go in it is a count, the fold already carries the exact
  // count, and at 390px `ScanRow`'s age cell and its fold label sat on one line and printed over
  // each other — "nothing attachedwhat is on this card". A photograph found it.
  return (
    <ScanRow
      title={node.ordinal === null ? node.title : `${node.ordinal} · ${node.title}`}
      {...(node.state === null
        ? { sev: <NoStateMark expected={false} /> }
        : node.packageState === undefined
          ? { state: node.state }
          : // A BLOCK ONE PACKAGE NAMES draws that package's state word, whole, on the block's own state colour.
            { sev: <PackageStateChip state={node.state} packageState={node.packageState} alarm={node.alarm} /> })}
      {...(node.alarm === undefined ? {} : { alarm: node.alarm })}
      leading={<Tag tone="quiet">{node.kind === 'step' ? t('g7b.step') : kindWord(node.kind).text}</Tag>}
      opens={t('g7b.Outline.what_is_on_this_card_its_links')}
      holds={{
        count: behind,
        // "1 links" is the plural defect this project has already had to fix once in a server reply.
        // The noun agrees with the count, and the clause after it agrees with its own.
        what:
          (behind === 1 ? t('g7b.Outline.link') : t('g7b.Outline.links')) +
          (node.attached.length === 0
            ? t('g7b.Outline.nothing_that_needs_a_person_is_attached')
            : t('g7b.Outline.of_which', { v1: node.attached.length, v2: node.attached.length === 1 ? t('g7b.Outline.is_an_attached_record') : t('g7b.Outline.are_attached_records') })),
      }}
      href={`#${recordPath(node.recordId)}`}
      linkText={node.kind === 'step' ? t('g7b.Outline.open_the_pipeline_record_this_step_is') : t('g7b.Outline.open_the_whole_record')}
    >
      <dl className="gx-facts">
        {node.facts.map((fact) => (
          <div className="gx-fact" key={fact.label}>
            <dt>{fact.label}</dt>
            <dd>{fact.value}</dd>
          </div>
        ))}
      </dl>
      {node.wall === null ? null : (
        <p className="gx-node-wall" data-at={node.wall.at}>
          {node.wall.by.map((by) => (
            <GateMark key={by.recordId} gate={by.gate} />
          ))}
          <span className="gx-node-wall-words">{node.wall.sentence}</span>
        </p>
      )}
      {node.note === null ? null : <p className="gx-node-note">{node.note}</p>}

      {out.length + inbound.length === 0 ? (
        <p className="gx-node-note"><Absence /></p>
      ) : (
        <ul className="gx-edges">
          {out.map((edge) => (
            <EdgeLine key={edge.id} edge={edge} out other={titleOf(edge.to)} />
          ))}
          {inbound.map((edge) => (
            <EdgeLine key={edge.id} edge={edge} out={false} other={titleOf(edge.from)} />
          ))}
        </ul>
      )}

      {node.attached.length === 0 ? null : (
        <ul className="gx-attacheds">
          {node.attached.map((item) => (
            <AttachedRow key={`${item.recordId}:${item.through}`} item={item} />
          ))}
        </ul>
      )}
    </ScanRow>
  )
}

// ============================================================================ the outline

export function Outline({ graph }: { graph: StructureGraph }) {
  if (graph.problem !== null) {
    return <Empty message={<b>{graph.problem}</b>} />
  }
  if (graph.nodes.length === 0) return <Absence />
  const { order, cyclic } = readingOrder(graph)

  return (
    <div className="gx-outline">
      {graph.walls.length === 0 ? null : (
        <section className="gx-walls">
          <h3 data-title-is="label" className="gx-h">{t('g7b.Outline.what_is_holding_this_up_and_how')}</h3>
          {graph.walls.map((wall) => (
            <Wall key={wall.linkId} wall={wall} graph={graph} />
          ))}
        </section>
      )}

      {cyclic.length === 0 ? null : (
        <p className="gx-prose">
          <b>{t('g7b.Outline.nodes_could_not_be_ordered', { n: cyclic.length })}</b>
        </p>
      )}

      <div className="gx-rows">
        {order.map((node) => (
          <OutlineRow key={node.id} node={node} graph={graph} />
        ))}
      </div>
    </div>
  )
}
