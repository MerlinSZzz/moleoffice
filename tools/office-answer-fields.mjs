// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// @ts-check
/** Local projection of complete, already key-masked office answer texts. No office access. */

/** @typedef {'short' | 'whole' | string[]} OfficeFields */
/** @typedef {{ status: number, location: string | null, body: string, cut: boolean, added: string | null, projectionRefused?: boolean }} OfficeAnswer */
/** @typedef {{ whole: boolean, children: Map<string, FieldTree> }} FieldTree */

/**
 * Validate before any request, including writes. Paths name object keys; arrays traverse members.
 * @param {unknown} fields
 * @returns {OfficeFields}
 */
export function validateOfficeFields(fields) {
  if (fields === undefined) return 'whole'
  if (fields === 'short' || fields === 'whole') return fields
  /** @param {string} why @returns {never} */
  const refuse = why => { throw new Error(`The fields option was refused: ${why}`) }
  if (!Array.isArray(fields) || fields.length === 0) return refuse('use short, whole, or a nonempty list of dotted object paths.')
  const unsafe = new Set(['__proto__', 'prototype', 'constructor'])
  /** @type {string[]} */
  const paths = []
  for (const path of fields) {
    if (typeof path !== 'string' || /\s/.test(path) || path.split('.').some(part => !/^[A-Za-z_][A-Za-z0-9_-]*$/.test(part) || unsafe.has(part))) {
      return refuse('each path must contain safe object keys separated by dots, with no indices, whitespace or prototype keys.')
    }
    if (paths.some(other => path === other || path.startsWith(other + '.') || other.startsWith(path + '.'))) {
      return refuse(`duplicate or overlapping paths are ambiguous (${path}).`)
    }
    paths.push(path)
  }
  return paths
}

/** @returns {FieldTree} */
const branch = () => ({ whole: false, children: new Map() })

/** @param {unknown} value @returns {value is Record<string, any>} */
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value)

/**
 * Select one tree of paths at once so sibling selections merge without overwriting each other.
 * @param {any} value @param {FieldTree} tree @param {string} path
 * @returns {any}
 */
function select(value, tree, path) {
  if (tree.whole) return value
  if (Array.isArray(value)) {
    if (value.length === 0) throw new Error(`the empty array at ${path || 'body'} cannot validate a deeper field`)
    return value.map(member => select(member, tree, path))
  }
  return Object.fromEntries([...tree.children].map(([key, child]) => {
    const at = path === '' ? key : `${path}.${key}`
    if (!object(value) || !Object.hasOwn(value, key)) throw new Error(`the path ${at} does not exist in every requested object`)
    return [key, select(value[key], child, at)]
  }))
}

/** A failed projection leaves the body empty and preserves operational notices.
 * @param {OfficeAnswer} answer @param {string} why @param {{ write?: boolean }} [options]
 * @returns {OfficeAnswer}
 */
export function refuseOfficeProjection(answer, why, { write = false } = {}) {
  return {
    ...answer, body: '', cut: false, projectionRefused: true,
    added: [answer.added, `The fields projection was refused: ${why}.` + (write
      ? ' This write was already sent and may be stored. Read it back through office_request before sending it again; never send it another way.' : '')].filter(Boolean).join(' '),
  }
}

/**
 * Pure saved-answer replay. Whole preserves text bytes; short leaves nonrecord operational text alone.
 * Refusals and redirects retain the ordinary answer. A projection failure exposes no partial body.
 * @param {OfficeAnswer} answer
 * @param {unknown} fields
 * @param {{ write?: boolean }} [options]
 * @returns {OfficeAnswer}
 */
export function projectOfficeAnswer(answer, fields, { write = false } = {}) {
  const mode = validateOfficeFields(fields)
  if (mode === 'whole' || answer.status < 200 || answer.status >= 300) return answer
  /** @param {string} why @returns {OfficeAnswer} */
  const refused = why => refuseOfficeProjection(answer, why, { write })
  if (answer.cut) return refused('the source reply was cut, so it cannot validate selected fields or short forms')
  let value
  try { value = JSON.parse(answer.body) } catch { return refused('the successful reply has a non-JSON body; use whole to read its text') }
  if (mode === 'short') {
    let changed = false
    /** @type {string[]} */
    const notices = []
    /** @param {any} item @param {string} at @returns {any} */
    const visit = (item, at) => {
      if (Array.isArray(item)) return item.map((member, index) => visit(member, `${at}[${index}]`))
      if (!object(item)) return item
      if (['id', 'kind', 'title', 'data'].every(key => Object.hasOwn(item, key)) &&
          typeof item.id === 'string' && typeof item.kind === 'string' && typeof item.title === 'string' && object(item.data)) {
        changed = true
        const shortForms = Object.hasOwn(item.data, 'shortForms') ? item.data.shortForms ?? null : null
        if (shortForms === null) notices.push(`Stored short forms are missing at ${at}; shortForms is null.`)
        return { id: item.id, kind: item.kind, title: item.title, summary: item.summary ?? null, shortForms }
      }
      return Object.fromEntries(Object.entries(item).map(([key, member]) => [key, visit(member, `${at}.${key}`)]))
    }
    const shortened = visit(value, 'body')
    return changed ? { ...answer, body: JSON.stringify(shortened), added: [answer.added, ...notices].filter(Boolean).join(' ') || null } : answer
  }
  const tree = branch()
  for (const path of mode) {
    let node = tree
    for (const key of path.split('.')) {
      let child = node.children.get(key)
      if (child === undefined) { child = branch(); node.children.set(key, child) }
      node = child
    }
    node.whole = true
  }
  try { return { ...answer, body: JSON.stringify(select(value, tree, '')) } } catch (error) {
    return refused(error instanceof Error ? error.message : String(error))
  }
}
