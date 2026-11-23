// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * PACKAGES PER LINE, BY STATE: the first of the four figures (src/shared/figures.ts). Each package is counted in the state
 * the delegation view gives it, through `thePackagesCounted`. A package with two lines counts in each, and the reply says
 * how many do. A package with no line, which is every package for the outside, counts in the row of no line, which is
 * always there and always last. Nothing is stored.
 */
import { PACKAGE_STATES, type PackageState } from '@shared/delegation.ts'
import type { FigureCouldNotRead, PackagesByLine } from '@shared/figures.ts'
import { sayInEnglish } from '@shared/i18n.ts'
import { thePackagesCounted } from './delegation.ts'

const noneInAnyState = (): Record<PackageState, number> => Object.fromEntries(PACKAGE_STATES.map((state) => [state, 0])) as Record<PackageState, number>

export function packagesByLine(projects: readonly string[]): PackagesByLine {
  const byLine = new Map<string | null, Record<PackageState, number>>()
  const couldNotRead: FigureCouldNotRead[] = []
  let packages = 0
  let inMoreThanOneLine = 0
  for (const workspaceId of projects) {
    const read = thePackagesCounted(workspaceId)
    for (const one of read.couldNotRead) couldNotRead.push({ workspaceId, ...one })
    for (const counted of read.packages) {
      packages += 1
      const lines = [...new Set(counted.lines)]
      if (lines.length > 1) inMoreThanOneLine += 1
      for (const line of lines.length === 0 ? [null] : lines) {
        const row = byLine.get(line) ?? noneInAnyState()
        row[counted.state] += 1
        byLine.set(line, row)
      }
    }
  }
  const named = [...byLine.keys()].filter((line): line is string => line !== null).sort()
  return {
    projects: [...projects],
    states: [...PACKAGE_STATES],
    lines: [...named, null].map((line) => {
      const byState = byLine.get(line) ?? noneInAnyState()
      return { line, byState, total: PACKAGE_STATES.reduce((sum, state) => sum + byState[state], 0) }
    }),
    packages,
    inMoreThanOneLine,
    couldNotRead,
    says: sayInEnglish('figures.byLine.says', { n: inMoreThanOneLine }),
  }
}
