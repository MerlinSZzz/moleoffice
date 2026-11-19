// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** Queue observations only. Nothing here is a whole_suite_receipt or release evidence. */
import { z } from 'zod'

const word = z.string().min(1)
const original = { source: z.literal('original'), tip: word, tree: word, log: word }
export const wholeSuiteRedEvidence = z.object({
  outcome: z.literal('admitted-for-fix-round'),
  build: z.object({ ...original, exit: z.literal(0) }).strict(),
  affected: z.object({
    ...original, selection: z.literal('complete'), exit: z.literal(0),
    files: z.array(word).min(1), ran: z.number().int().positive(), passed: z.number().int().positive(), report: word,
  }).strict().refine(one => one.ran === one.passed && new Set(one.files).size === one.files.length, 'Every selected affected test must pass.'),
  suite: z.object({
    ...original, complete: z.literal(true), exit: z.literal(1),
    ran: z.number().int().positive(), passed: z.number().int().nonnegative(), redTests: z.array(word).min(1), report: word,
  }).strict().refine(one => one.passed <= one.ran, 'Passed tests cannot exceed the tests run.'),
}).strict()
export type WholeSuiteRed = z.infer<typeof wholeSuiteRedEvidence>

/** Indices are the bisector's zero-based positions in order, never guessed entry IDs. */
export const busCauseEvidence = z.object({
  mainAt: word,
  suite: z.object({ commit: word, tree: word }).strict(),
  order: z.array(z.object({ entry: word, commit: word, tree: word, commits: z.array(word) }).strict()).min(1),
  pairDecided: z.object({
    still: z.array(word), brokeBy: z.record(z.string(), z.number().int().nonnegative()).optional(),
    runsAlone: z.number().int().nonnegative().optional(), without: z.unknown().optional(),
  }).strict(),
}).strict().refine(one => Object.values(one.pairDecided.brokeBy ?? {}).every(index => index < one.order.length), 'A cause index must name an observed bus position.')
export type BusCause = z.infer<typeof busCauseEvidence>

/** Validate evidence independently of whether the dormant setting authorizes using it. */
export function wholeSuiteRedAuthorizesLanding(tested: unknown, expectedTip?: string, expectedTree?: string): boolean {
  if (typeof tested !== 'object' || tested === null) return false
  const facts = tested as Record<string, any>
  if (facts['green'] !== false || facts['borrowedFrom'] !== undefined || facts['plugin'] !== undefined) return false
  const read = wholeSuiteRedEvidence.safeParse(facts['wholeSuiteRed'])
  if (!read.success) return false
  const { build, affected, suite } = read.data
  return facts['tip'] === build.tip && build.tip === affected.tip && build.tree === affected.tree
    && (expectedTip === undefined || build.tip === expectedTip)
    && (expectedTree === undefined || build.tree === expectedTree)
    && suite.tree === (facts['testedWith']?.tree ?? build.tree)
    && (facts['testedWith'] !== undefined || suite.tip === build.tip)
    && Array.isArray(facts['redTests']) && suite.redTests.every(file => facts['redTests'].includes(file))
}
