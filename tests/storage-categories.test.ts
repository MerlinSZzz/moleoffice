// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { describe, expect, it } from 'vitest'
import { CLASSIFY_PREFIX_BYTES, classifyStoredFile } from '../src/shared/storage/categories.ts'

const bytes = (text: string): Buffer => Buffer.from(text, 'binary')
describe('physical file categories', () => {
  it('uses detected signatures before endings and ignores supplied MIME', () => {
    expect(classifyStoredFile('claim.txt', Buffer.from([137,80,78,71,13,10,26,10]), 'text/plain')).toBe('pictures')
    expect(classifyStoredFile('claim.png', bytes('%PDF-1.7 document'), 'image/png')).toBe('reports')
    expect(classifyStoredFile('claim.json', bytes('\x00\x00\x00\x18ftypisom'))).toBe('videos')
    expect(classifyStoredFile('claim.mp4', bytes('RIFF1234WEBP'))).toBe('pictures')
    expect(classifyStoredFile('claim.png', bytes('not an image'), 'image/png')).toBe('other')
  })
  it('uses document endings only with matching binary containers', () => {
    const zip = Buffer.from([80,75,3,4,0,0])
    for (const ending of ['pptx','docx','xlsx','odp']) expect(classifyStoredFile(`deck.${ending}`, zip)).toBe('reports')
    expect(classifyStoredFile('personal-spaces/synthetic/.versions/slides.pptx/1', zip)).toBe('reports')
    expect(classifyStoredFile('archive.zip', zip)).toBe('other')
    expect(classifyStoredFile('pretend.pdf', bytes('plain prose'))).toBe('other')
    expect(classifyStoredFile('archive.pptx', Buffer.from([0,1,2]))).toBe('other')
  })
  it('detects text, code, unknown binary and SVG with a bounded prefix', () => {
    for (const ending of ['txt','md','csv','json','ts','py','']) expect(classifyStoredFile(`file.${ending}`, Buffer.from('中文 and code\n'))).toBe('text')
    expect(classifyStoredFile('vector.svg', Buffer.from('<svg xmlns="example"></svg>'))).toBe('pictures')
    expect(classifyStoredFile('unknown.bin', Buffer.from([0,255,0]))).toBe('other')
    const prefix = Buffer.alloc(CLASSIFY_PREFIX_BYTES + 1, 65)
    prefix[CLASSIFY_PREFIX_BYTES] = 0
    expect(classifyStoredFile('log.txt', prefix)).toBe('text')
    expect(classifyStoredFile('empty.txt', Buffer.alloc(0))).toBe('text')
  })
})
