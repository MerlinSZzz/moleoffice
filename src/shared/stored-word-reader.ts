// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** A lazy connection keeps shipped vocabulary assembly free of import cycles. */
let reader: ((key: string) => string | undefined) | undefined
export function connectStoredWordReader(next: (key: string) => string | undefined): void { reader = next }
/** An absent edit uses the caller's shipped wording; saved labels use the connected i18n reader. */
export function storedWordIfDeclared(key: string): string | undefined { return reader?.(key) }
