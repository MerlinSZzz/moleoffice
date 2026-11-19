// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { readFileSync, rmSync } from 'node:fs'

const detailsRead = new Map<string, string>()

/** Read the original endpoint explanations, when the hook named their file. */
export function readTheHookDetails(output: string): string {
  const path = output.match(/Details: (.+)/)?.[1]
  if (path === undefined) return output
  const known = detailsRead.get(path)
  if (known !== undefined) return known
  try {
    const details = readFileSync(path, 'utf8').split('\nFailed requests:\n')[0]!
    detailsRead.set(path, details)
    return details
  } finally {
    rmSync(path, { force: true })
  }
}
