// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { momentOfAStoredStamp } from '@shared/time.ts'
import type { PanelRecord } from '@shared/types.ts'
import { getRecord, resolveLinks } from './records.ts'
import { theRunThatAskedForThisWorker } from './worker-runs.ts'

type Subject = 'round' | 'run' | 'supervisors-round'
type Unit = 'round' | 'run'
type Order = 'before' | 'after' | 'at'
type Direction = { id: string; kind: 'pipeline' | 'module'; title: string; updatedAt: string }

export function directionSentence(subject: Subject, kind: Direction['kind'], title: string, id: string): string {
  const whose = subject === 'supervisors-round' ? "Your supervisor's round" : `This ${subject}`
  return `${whose} serves the ${kind} “${title}” (${id}).`
}

export function cardChangedSentence(stamp: string, order: Order, unit: Unit): string {
  return order === 'at'
    ? `Its card was last changed at ${stamp}, at the time this ${unit} started.`
    : `Its card was last changed at ${stamp}, ${order} this ${unit} started.`
}

export function cannotCompareSentence(which: 'card' | 'run', stamp: string, unit: Unit): string {
  const whose = which === 'card' ? "the card's" : `this ${unit}'s`
  return `The office cannot tell whether that was before or after this ${unit} started, because ${whose} time ${stamp} cannot be read.`
}

export function updateCardSentence(): string { return 'If this round moved it, update that card.' }
export function whichDirectionSentence(unit: Unit): string { return `Which direction does this ${unit} serve?` }
export function linkDirectionSentence(run: string): string {
  return `Link this run to its pipeline or module with POST /api/links {"fromId":"${run}","toId":"<pipeline or module id>","type":"part_of"}.`
}
export function reportPieceSentence(): string { return 'Say in your report what your piece moved.' }

/**
 * THE PURPOSE OF ONE RUN, for its brief and its seal. Reads the run session and linked live pipeline and module
 * records from records, and their links from links. For a worker it also reads its parent session and its workerRuns
 * entry through theRunThatAskedForThisWorker, which reads the agents table for the asker's name. A direction is the
 * run's own stored part_of link to the card, the link linkDirectionSentence asks for. An about link says what a run is
 * about, a link the other way says the card points at the run, and an inferred link is a guess from a mention: none of
 * them is a direction someone chose. A continued run's parent alone does not establish that it is a worker. No file is
 * opened.
 */
export function thePurposeOfARound(run: PanelRecord): string {
  const worker = theRunThatAskedForThisWorker(run)
  const directionsOf = (one: PanelRecord): Direction[] => resolveLinks(one.id)
    .filter((link) => link.type === 'part_of' && !link.isBacklink && !link.inferred && !link.broken && (link.other.kind === 'pipeline' || link.other.kind === 'module'))
    .flatMap((link): Direction[] => {
      const record = getRecord(link.other.id)
      return record === null || record.deletedAt !== null || record.workspaceId !== run.workspaceId || (record.kind !== 'pipeline' && record.kind !== 'module')
        ? [] : [{ id: record.id, kind: record.kind, title: record.title, updatedAt: record.updatedAt }]
    })
    .filter((one, at, all) => all.findIndex((other) => other.id === one.id) === at)
    .sort((a, b) => a.id.localeCompare(b.id))
  const own = directionsOf(run)
  const parent = worker === null || own.length > 0 ? null : getRecord(worker.run)
  const cards = own.length > 0 ? own : parent === null ? [] : directionsOf(parent)
  const unit: Unit = worker === null ? 'round' : 'run'
  if (cards.length === 0) {
    return [whichDirectionSentence(unit), linkDirectionSentence(run.id), ...(worker === null ? [] : [reportPieceSentence()])].join(' ')
  }
  const namedStart = worker === null && typeof run.data['startedAt'] === 'string'
  const startedAt = namedStart ? run.data['startedAt'] as string : run.createdAt
  const started = momentOfAStoredStamp(startedAt, namedStart ? run.data['startedTime'] : null)
  const sentences: string[] = []
  for (const card of cards) {
    const subject: Subject = worker === null ? 'round' : own.length > 0 ? 'run' : 'supervisors-round'
    const changed = momentOfAStoredStamp(card.updatedAt, null)
    sentences.push(directionSentence(subject, card.kind, card.title, card.id))
    if (changed === null) sentences.push(cannotCompareSentence('card', card.updatedAt, unit))
    else if (started === null) sentences.push(cannotCompareSentence('run', startedAt, unit))
    else {
      const order: Order = changed < started ? 'before' : changed > started ? 'after' : 'at'
      sentences.push(cardChangedSentence(card.updatedAt, order, unit))
      if (worker === null && order === 'before') sentences.push(updateCardSentence())
    }
  }
  if (worker !== null) sentences.push(reportPieceSentence())
  return sentences.join(' ')
}
