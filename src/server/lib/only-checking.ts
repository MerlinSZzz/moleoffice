// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHETHER THE WRITE RUNNING NOW IS ONLY A CHECK, so nothing it does may leave this process.
 *
 * Its own file, importing nothing, because the page channel and the held waits ask it and neither
 * touches the database. `writeOrCheck` in lib/only-a-check.ts is the one caller of `whileChecking`;
 * its header says why the flag is safe.
 */
let checking = false

/** Whether a check is running, so an announcement, a wake or a log line about it must not happen. */
export function onlyChecking(): boolean {
  return checking
}

/** Run `check` with the flag up, and put it down however `check` ends. */
export function whileChecking(check: () => void): void {
  checking = true
  try {
    check()
  } finally {
    checking = false
  }
}
