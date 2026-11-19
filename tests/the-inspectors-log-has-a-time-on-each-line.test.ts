// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE INSPECTOR'S LOG HAS A TIME AT THE START OF EVERY LINE IT WRITES.
 *
 * The time is clockStamp(clock).instant and one space. A line's stamp is written with its first
 * bytes, the clock is read once per write, a partial line waits for the write that continues it,
 * and the machine line is left byte for byte as written so inspectionUsageIn still reads it.
 */
import { Writable } from 'node:stream'
import { describe, expect, it } from 'vitest'
import { clockStamp, momentOfAnInstant } from '../src/shared/time.ts'
import { CLAUDE_USAGE_LINE, INSPECTION_USAGE_LINE, inspectionUsageIn, inspectionUsageLine } from '../src/config/usage.mjs'
import { stampEachLine, withoutTheTimes } from '../tools/inspector-log-times.mjs'
import { inspectorFixture } from './inspector-tool-fixture.ts'

class ACapturedStream extends Writable {
  readonly pieces: Buffer[] = []

  override _write(chunk: Buffer, _encoding: BufferEncoding, done: (error?: Error | null) => void): void {
    this.pieces.push(Buffer.from(chunk))
    done()
  }

  text(): string {
    return Buffer.concat(this.pieces).toString('utf8')
  }

  bytes(): Buffer {
    return Buffer.concat(this.pieces)
  }
}

const aStampOf = (at: Date): string => clockStamp(() => at).instant
const AT = new Date('2026-11-02T09:01:11.714Z')
const LATER = new Date('2026-11-02T09:02:12.900Z')

describe('a time at the start of every line', () => {
  it('puts the clockStamp instant and one space before each line of one write, reading the clock once', () => {
    const stream = new ACapturedStream()
    let reads = 0
    stampEachLine(stream, () => {
      reads += 1
      return AT
    })
    stream.write('one\ntwo\n')
    expect(stream.text()).toBe(`${aStampOf(AT)} one\n${aStampOf(AT)} two\n`)
    expect(reads).toBe(1)
  })

  it('stamps a partial line where it begins, not where its newline is written', () => {
    const stream = new ACapturedStream()
    const times = [AT, LATER]
    stampEachLine(stream, () => times.shift()!)
    stream.write('a')
    stream.write('b\nc')
    expect(stream.text()).toBe(`${aStampOf(AT)} ab\n${aStampOf(LATER)} c`)
  })

  it("leaves the next line for the next write's clock after a write ends with a newline", () => {
    const stream = new ACapturedStream()
    const times = [AT, LATER]
    stampEachLine(stream, () => times.shift()!)
    stream.write('a\n')
    stream.write('b')
    expect(stream.text()).toBe(`${aStampOf(AT)} a\n${aStampOf(LATER)} b`)
  })

  it('leaves the machine line byte for byte as written, and inspectionUsageIn reads it', () => {
    const stream = new ACapturedStream()
    const machine = inspectionUsageLine('claude-code', '{"result":"Synthetic."}')
    stampEachLine(stream, () => AT)
    stream.write(`before\n${machine}\nafter\n`)
    const text = stream.text()
    expect(text).toBe(`${aStampOf(AT)} before\n${machine}\n${aStampOf(AT)} after\n`)
    expect(text.split('\n')).toContain(machine)
    expect(inspectionUsageIn(text)).toEqual({ runtime: 'claude-code', output: '{"result":"Synthetic."}' })
  })

  it('stamps the bytes of a Buffer write without decoding them, so a character split across writes stays whole', () => {
    const stream = new ACapturedStream()
    const euro = Buffer.from('€', 'utf8')
    expect(euro).toHaveLength(3)
    stampEachLine(stream, () => AT)
    stream.write(euro.subarray(0, 2))
    stream.write(euro.subarray(2))
    expect(stream.bytes()).toEqual(Buffer.concat([Buffer.from(`${aStampOf(AT)} `, 'utf8'), euro]))
  })

  it('keeps the callback and the return value of the write it replaces', async () => {
    const stream = new ACapturedStream()
    const original = stream.write.bind(stream)
    let theOriginalsReturn: unknown
    ;(stream as unknown as { write: (...args: unknown[]) => unknown }).write = (...args: unknown[]) => {
      theOriginalsReturn = (original as unknown as (...a: unknown[]) => unknown)(...args)
      return theOriginalsReturn
    }
    stampEachLine(stream, () => AT)
    let called = false
    const returned = (stream.write as unknown as (...args: unknown[]) => unknown)('a', () => {
      called = true
    })
    await new Promise(setImmediate)
    expect(called).toBe(true)
    expect(returned).toBe(theOriginalsReturn)
    expect(stream.text()).toBe(`${aStampOf(AT)} a`)
  })

  it('removes exactly the stamps and their spaces, leaving the text written', () => {
    const stream = new ACapturedStream()
    const machine = inspectionUsageLine('codex', '{"x":1}')
    const original = `first\nsecond\n${machine}\nthird`
    stampEachLine(stream, () => AT)
    stream.write('first\nsecond\n')
    stream.write(`${machine}\nthird`)
    const text = stream.text()
    expect(text).not.toBe(original)
    expect(withoutTheTimes(text)).toBe(original)
  })

  it('stamps every line the real inspector writes, through its switch', async () => {
    const fixture = await inspectorFixture()
    try {
      fixture.state.onRequest = (request, reply) => {
        if (request.method !== 'POST' || request.url !== `/api/checks/${fixture.run}/prompt`) return false
        reply.statusCode = 500
        reply.setHeader('content-type', 'application/json')
        reply.end(JSON.stringify({ error: 'Synthetic: the prompt door failed.' }))
        return true
      }
      const before = new Date()
      const ran = await fixture.inspect([])
      const after = new Date()
      expect(ran.code, ran.err).not.toBe(0)
      expect(ran.out).not.toBe('')
      expect(ran.err).not.toBe('')
      const unstamped: string[] = []
      for (const line of [...ran.out.split('\n'), ...ran.err.split('\n')]) {
        if (line === '') continue
        if (line.startsWith(INSPECTION_USAGE_LINE) || line.startsWith(CLAUDE_USAGE_LINE)) continue
        const bare = withoutTheTimes(line)
        if (bare === line) {
          unstamped.push(line)
          continue
        }
        const stamp = line.slice(0, line.length - bare.length).trimEnd()
        const moment = momentOfAnInstant(stamp)
        expect(moment, line).not.toBeNull()
        expect(moment!, line).toBeGreaterThanOrEqual(before.getTime())
        expect(moment!, line).toBeLessThanOrEqual(after.getTime())
      }
      expect(unstamped).toEqual([])
    } finally {
      await fixture.close()
    }
  }, 120_000)
})
