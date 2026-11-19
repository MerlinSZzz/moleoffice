// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE SEAL A RUN NAMES, AS ONE STRING.
 * `theSealARunNames` was moved byte for byte out of src/server/lib/the-seal-read-apart-thread.ts, with no change
 * of behaviour. That file imports it back from here, and src/server/lib/the-seal-read-apart.ts asks it here too.
 * Its server types are type-only imports, so nothing of src/server is loaded when this file runs.
 */
type TheSealReadFiles = {
  sealedTip: Pick<typeof import('../server/lib/sealed-tip.ts'), 'readRunSeal'>
  records: Pick<typeof import('../server/lib/records.ts'), 'PanelError'>
}

/**
 * THE SEAL A RUN NAMES, AS ONE STRING: the seal `readRunSeal` reads, whole, or `null` when the run names none, or
 * the words of its refusal when the run names one that cannot be read. The request thread works it out again when
 * it takes the answer, and a seal that changed in between is refused rather than used.
 */
export function theSealARunNames(runId: string, files: TheSealReadFiles): string {
  try {
    return JSON.stringify(files.sealedTip.readRunSeal(runId))
  } catch (err) {
    if (err instanceof files.records.PanelError) return JSON.stringify({ unreadable: err.message })
    throw err
  }
}
