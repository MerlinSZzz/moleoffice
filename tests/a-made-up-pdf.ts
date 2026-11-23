// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A MADE-UP PDF, WRITTEN BYTE BY BYTE FROM ITS OBJECTS, for the tests of the office's own PDF drawing.
 *
 * Object n is the nth string given, counted from 1, and object 1 is the catalog. A caller names another object
 * by its place in the list. The cross-reference table is worked out here from the bytes written, so its offsets
 * are right whatever the objects hold.
 */
export function aPdfOf(objects: readonly string[]): Buffer {
  let out = '%PDF-1.7\n%\xE2\xE3\xCF\xD3\n'
  const offsets: number[] = []
  for (const [index, object] of objects.entries()) {
    offsets.push(Buffer.byteLength(out, 'latin1'))
    out += `${String(index + 1)} 0 obj\n${object}\nendobj\n`
  }
  const xref = Buffer.byteLength(out, 'latin1')
  out += `xref\n0 ${String(objects.length + 1)}\n0000000000 65535 f \n`
  for (const offset of offsets) out += `${String(offset).padStart(10, '0')} 00000 n \n`
  out += `trailer\n<< /Size ${String(objects.length + 1)} /Root 1 0 R >>\nstartxref\n${String(xref)}\n%%EOF\n`
  return Buffer.from(out, 'latin1')
}

/** A stream object holding this text, with its length worked out and any other entries of its dictionary. */
export function aStreamOf(text: string, entries = ''): string {
  const length = `/Length ${String(Buffer.byteLength(text, 'latin1'))}`
  return `<< ${entries === '' ? length : `${entries} ${length}`} >>\nstream\n${text}\nendstream`
}

/** The content of a page that writes these words once, in Helvetica, near its top left. */
export function wordsOnAPage(words: string): string {
  return `BT /F1 28 Tf 72 680 Td (${words}) Tj ET`
}
