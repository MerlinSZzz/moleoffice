// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** getRandomValues also works on the Office's HTTP address, where randomUUID is unavailable. */
export function freshPixelSeed(): string {
  return Array.from(crypto.getRandomValues(new Uint32Array(4)), value => value.toString(16).padStart(8, '0')).join('')
}
