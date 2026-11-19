// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** Physical file categories. A supplied MIME is descriptive input, never evidence. */
export const STORAGE_CATEGORIES = ['reports', 'text', 'pictures', 'videos', 'other'] as const
export type StorageCategory = typeof STORAGE_CATEGORIES[number]
export const CLASSIFY_PREFIX_BYTES = 8192
export const STORAGE_STORES = ['report-files', 'message-pictures', 'avatars', 'returned-files', 'personal-spaces'] as const
export const DEFERRED_STORAGE_STORES = [] as const

/**
 * Precedence: recognised image/video/PDF signatures; document container + ending;
 * other recognised binary containers; readable text + ending; unknown binary.
 * Endings alone never turn binary bytes into text or a picture. Text SVG is a picture.
 * ZIP and compound-office signatures need a document ending to distinguish documents
 * from general archives without decompressing or reading beyond the prefix.
 */
export function classifyStoredFile(name: string, bytes: Uint8Array, _suppliedMime?: string): StorageCategory {
  const b = bytes.subarray(0, CLASSIFY_PREFIX_BYTES)
  const starts = (...signature: number[]): boolean => signature.every((v, i) => b[i] === v)
  const ascii = (at: number, n: number): string => String.fromCharCode(...b.subarray(at, at + n))
  const retainedName = /(?:^|\/)\.versions\/(.+)\/\d+$/u.exec(name)?.[1] ?? name
  const extension = retainedName.toLowerCase().split('.').at(-1) ?? ''
  if (starts(137, 80, 78, 71, 13, 10, 26, 10) || starts(255, 216, 255) ||
      ascii(0, 6) === 'GIF87a' || ascii(0, 6) === 'GIF89a' ||
      (ascii(0, 4) === 'RIFF' && ascii(8, 4) === 'WEBP') ||
      starts(73, 73, 42, 0) || starts(77, 77, 0, 42) || starts(66, 77)) return 'pictures'
  if (ascii(4, 4) === 'ftyp') {
    return /^(avif|avis|heic|heix|mif1)$/.test(ascii(8, 4)) ? 'pictures' : 'videos'
  }
  if ((ascii(0, 4) === 'RIFF' && ascii(8, 4) === 'AVI ') || starts(26, 69, 223, 163) ||
      starts(0, 0, 1, 186) || starts(0, 0, 1, 179)) return 'videos'
  if (ascii(0, 5) === '%PDF-' || ascii(0, 5) === '{\\rtf') return 'reports'
  const zip = starts(80, 75, 3, 4) || starts(80, 75, 5, 6) || starts(80, 75, 7, 8)
  const compound = starts(208, 207, 17, 224, 161, 177, 26, 225)
  if (zip || compound) {
    return /^(docx?|pptx?|xlsx?|odt|odp|ods|epub|pages|key|numbers)$/.test(extension) ? 'reports' : 'other'
  }
  if (starts(31, 139) || starts(127, 69, 76, 70) || starts(77, 90) || ascii(0, 4) === 'RIFF') return 'other'
  // Decode a bounded prefix; a split final UTF-8 character is allowed by streaming decode.
  let text: string
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(b, { stream: true }) } catch { return 'other' }
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(text)) return 'other'
  if (extension === 'svg' && /<svg(?:\s|>)/iu.test(text)) return 'pictures'
  if (/^(pdf|pptx?|docx?|xlsx?|odp|odt|ods)$/.test(extension)) return 'other'
  if (/^(png|jpe?g|gif|webp|avif|heic|mp4|webm|mov|avi|mkv|zip|gz|exe)$/.test(extension)) return 'other'
  return 'text'
}
