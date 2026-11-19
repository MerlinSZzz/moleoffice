// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE ZIP WRITER AND THE MANIFEST'S OWN SHAPE.
 *
 * The export needs a zip, and Node has no writer. This file proves the three things the writer must
 * do for a person to open what the office hands them: a zip reader can read every entry back whole,
 * the same entries give the same bytes, and a name that would climb out of the zip is refused. It
 * also pins the manifest's key order and the download's file name, because both are promises the
 * page half will rely on.
 *
 * MUTATIONS. After a green control run: change `whyAZipEntryNameIsUnfit` so a `..` segment is
 * allowed, and the refusal case turns red. Change the method choice to always store, and the
 * deflated-entry case turns red. Restore each time.
 */

import { randomBytes } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { crc32, whyAZipEntryNameIsUnfit, writeZip } from '../src/server/lib/zip-export/zip.ts'
import {
  exportFileName,
  manifestJson,
  ZIP_EXPORT_FORMAT,
  type ZipExportManifest,
} from '../src/shared/zip-export/manifest.ts'
import { entriesOfZip } from './zip-export-read.ts'

describe('the zip writer', () => {
  it('writes entries a zip reader can read back whole', () => {
    const text = Buffer.from('The text the export gives today.\n'.repeat(20), 'utf8')
    const picture = randomBytes(4096)
    const zip = writeZip([
      { name: 'text.txt', bytes: text },
      { name: 'files/message-pictures/a-picture.png', bytes: picture },
    ])
    const entries = entriesOfZip(zip)
    expect([...entries.keys()]).toEqual(['text.txt', 'files/message-pictures/a-picture.png'])
    expect(entries.get('text.txt')?.bytes).toEqual(text)
    expect(entries.get('files/message-pictures/a-picture.png')?.bytes).toEqual(picture)
    // The text compresses; random bytes do not, so the writer keeps them whole rather than growing them.
    expect(entries.get('text.txt')?.method).toBe(8)
    expect(entries.get('files/message-pictures/a-picture.png')?.method).toBe(0)
  })

  it('gives the same bytes for the same entries, and carries one fixed moment', () => {
    const entries = [
      { name: 'text.txt', bytes: Buffer.from('same text', 'utf8') },
      { name: 'manifest.json', bytes: Buffer.from('{"format":"x"}\n', 'utf8') },
    ]
    const first = writeZip(entries)
    const second = writeZip(entries)
    expect(first.equals(second)).toBe(true)
    // The first local header starts at 0: time at 10, date at 12. Both are the fixed moment.
    expect(first.readUInt16LE(10)).toBe(0)
    expect(first.readUInt16LE(12)).toBe(0x0021)
  })

  it('checks the one CRC-32 value every reader knows', () => {
    expect(crc32(Buffer.from('123456789', 'utf8'))).toBe(0xcbf43926)
  })

  it('refuses a name that climbs out of the zip, or that a zip cannot carry', () => {
    for (const name of ['../outside.txt', '/absolute.txt', 'a\\b.txt', 'a\0b.txt', 'a//b.txt', 'dir/../x.txt']) {
      expect(whyAZipEntryNameIsUnfit(name), name).not.toBeNull()
      expect(() => writeZip([{ name, bytes: Buffer.from('x') }]), name).toThrow()
    }
    expect(whyAZipEntryNameIsUnfit('files/report-files/a-file.ts')).toBeNull()
  })

  it('refuses one name twice, so two entries cannot answer to one word', () => {
    expect(() => writeZip([
      { name: 'text.txt', bytes: Buffer.from('one') },
      { name: 'text.txt', bytes: Buffer.from('two') },
    ])).toThrow()
  })
})

describe('the manifest and the download name', () => {
  it('writes the manifest in one fixed key order, indented and ending with a newline', () => {
    const manifest: ZipExportManifest = {
      format: ZIP_EXPORT_FORMAT,
      export: { title: 'Hand this report', n: 2, at: '2026-10-30 20:00:00', line: { bytes: 1, files: 2 } },
      text: { bytes: 3, sha256: 'a'.repeat(64) },
      included: [],
      missing: [],
      leftOut: [],
    }
    const text = manifestJson(manifest)
    expect(text.endsWith('\n')).toBe(true)
    const parsed = JSON.parse(text) as Record<string, unknown>
    expect(Object.keys(parsed)).toEqual(['format', 'export', 'text', 'included', 'missing', 'leftOut'])
    expect(Object.keys(parsed['export'] as Record<string, unknown>)).toEqual(['title', 'n', 'at', 'line'])
    expect(Object.keys(parsed['text'] as Record<string, unknown>)).toEqual(['bytes', 'sha256'])
    expect(parsed['format']).toBe(ZIP_EXPORT_FORMAT)
  })

  it('names the download from the title made safe and the export number, never a path', () => {
    expect(exportFileName('Hand this / report: now', 2)).toBe('Hand-this-report-now-2.zip')
    expect(exportFileName('夹爪的报告', 7)).toBe('export-7.zip')
    expect(exportFileName('', 1)).toBe('export-1.zip')
    expect(exportFileName('../../etc/passwd', 3)).toBe('etc-passwd-3.zip')
    for (const title of ['a/b', '..', 'a\\b', 'c:d']) {
      const made = exportFileName(title, 1)
      expect(made.includes('/'), made).toBe(false)
      expect(made.includes('\\'), made).toBe(false)
      expect(made.endsWith('-1.zip'), made).toBe(true)
    }
  })
})
