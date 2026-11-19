// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A FULL-LIST READ ASKS THE NEW WAY, AND TAKES AN OLDER OFFICE'S ANSWER AFTER ONE RETRY.
 *
 * record.list, message.pool and project.attention answer narrow by default now, as the owner
 * chose. So a tool that reads whole records asks `?shape=full` (and whole messages
 * `?full=1`). The live office runs the older stable version: its strict query schema refuses that word with a 400,
 * and its default answer is still the whole one. The helper asks the new way, retries the same read
 * once without the word on a 400, and returns the older full answer. It never builds whole rows from
 * a narrow answer.
 *
 * MUTATION THAT MAKES THIS RED: remove the retry from `readAFullList` and the old-office case gets
 * the 400 back.
 */
import { describe, expect, it } from 'vitest'
import { fetchAFullList, readAFullList, withoutTheFullAsk } from '../tools/a-full-list-read.mjs'

describe('reading a full list from an office that may be older', () => {
  it('asks the new way once and takes the whole answer', async () => {
    const asked: string[] = []
    const answer = await readAFullList(async (path: string) => {
      asked.push(path)
      return { status: 200, body: 'the whole rows' }
    }, '/api/records?kind=note&shape=full')
    expect(answer.status).toBe(200)
    expect(answer.body).toBe('the whole rows')
    expect(asked).toEqual(['/api/records?kind=note&shape=full'])
  })

  it('retries once without shape=full when an older office refuses it, and takes its whole answer', async () => {
    const asked: string[] = []
    const answer = await readAFullList(async (path: string) => {
      asked.push(path)
      if (path.includes('shape=full')) return { status: 400, body: 'shape must be one of light, home, session, narrow' }
      return { status: 200, body: 'the older office whole rows' }
    }, '/api/records?kind=note&shape=full')
    expect(answer.status).toBe(200)
    expect(answer.body).toBe('the older office whole rows')
    expect(asked).toEqual(['/api/records?kind=note&shape=full', '/api/records?kind=note'])
  })

  it('retries once without full=1 for the message pool', async () => {
    const asked: string[] = []
    const answer = await readAFullList(async (path: string) => {
      asked.push(path)
      if (path.includes('full=1')) return { status: 400, body: 'Unrecognized key: full' }
      return { status: 200, body: 'the older office whole messages' }
    }, '/api/messages?only=waiting-for-me&full=1')
    expect(answer.body).toBe('the older office whole messages')
    expect(asked).toEqual(['/api/messages?only=waiting-for-me&full=1', '/api/messages?only=waiting-for-me'])
  })

  it('takes a refusal that is not about the new word, with the rest of the query kept', async () => {
    const asked: string[] = []
    const answer = await readAFullList(async (path: string) => {
      asked.push(path)
      return { status: 400, body: 'kind must be one of the kinds this office declares' }
    }, '/api/records?kind=not-a-kind&shape=full')
    expect(answer.status).toBe(400)
    expect(answer.body).toContain('kind must be one of')
    expect(asked).toEqual(['/api/records?kind=not-a-kind&shape=full', '/api/records?kind=not-a-kind'])
  })

  it('takes the new word out of a path and leaves every other pair alone', () => {
    expect(withoutTheFullAsk('/api/records?kind=note&shape=full&limit=25')).toBe('/api/records?kind=note&limit=25')
    expect(withoutTheFullAsk('/api/messages?only=waiting-for-me&full=1')).toBe('/api/messages?only=waiting-for-me')
    expect(withoutTheFullAsk('/api/records?shape=full')).toBe('/api/records')
    expect(withoutTheFullAsk('/api/records?kind=note')).toBe('/api/records?kind=note')
  })

  it('reads through a fetch implementation with the same one retry', async () => {
    const asked: string[] = []
    const fetchImpl = async (url: string) => {
      asked.push(url)
      if (url.includes('shape=full')) return { status: 400 }
      return { status: 200, rows: ['one'] }
    }
    const answer = await fetchAFullList(fetchImpl as never, 'http://office/api/records?kind=report&shape=full')
    expect(answer.status).toBe(200)
    expect(asked).toEqual([
      'http://office/api/records?kind=report&shape=full',
      'http://office/api/records?kind=report',
    ])
  })
})
