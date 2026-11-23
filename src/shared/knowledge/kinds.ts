// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * The published shapes of knowledge records. These specs let the office validate their fields
 * and describe them to readers of the kinds directory.
 */
import type { FieldSpec, KindSpec, ShapeSpec } from '../kinds/kind-common.ts'
import { KNOWLEDGE_WORDS as w } from '../words/en-wave-13u.ts'

const field = (key: keyof typeof w.fields, type: string, example: unknown, required = true): FieldSpec => ({ key, type, required, description: w.fields[key], example })
const spec = (kind: KindSpec['kind'], fields: FieldSpec[], example: Record<string, unknown>): KindSpec => ({
  kind, purpose: w.kindPurpose, whenToRecord: w.kindWhen, humanOnly: false, fields, rules: [], example,
})
export const knowledgeEntryKind = spec('knowledge_entry', [
  field('category', 'string', 'category'), field('body', 'string', w.examples.body),
  field('resources', 'KnowledgeResource[]', [{ what: w.examples.what, where: w.examples.where, how: w.examples.how }]),
  field('sources', 'KnowledgeSource[]', [{ url: 'https://example.invalid/reference' }]),
  field('aliases', 'string[]', [w.examples.alias]), field('language', 'string', 'en'),
  field('attachments', 'KnowledgeAttachment[]', [], false),
  field('lowRatingNotice', 'KnowledgeLowRatingNotice', { message: 'message', at: 'time' }, false),
], { category: 'category', body: w.examples.body, resources: [], sources: [], aliases: [], language: 'en' })
export const knowledgeCategoryKind = spec('knowledge_category', [field('parent', 'string', 'category', false)], {})
export const knowledgeBookmarkKind = spec('knowledge_bookmark', [field('entry', 'string', 'entry')], { entry: 'entry' })
export const knowledgeChangeKind = spec('knowledge_change', [
  field('entry', 'string', 'entry'), field('reason', 'string', w.examples.reason), field('patch', 'string', '{}'),
  field('base', 'string', 'version'), field('state', "'waiting' | 'applied' | 'refused'", 'waiting'),
  field('offeredKind', 'string', 'agent', false), field('offeredId', 'string', 'agent', false),
  field('answerReason', 'string', w.examples.answer, false), field('creation', 'boolean', true, false),
], { entry: 'entry', reason: w.examples.reason, patch: '{}', base: 'version', state: 'waiting' })
export const knowledgeQueryKind = spec('knowledge_query', [
  field('way', "'first' | 'categories' | 'words' | 'flow step'", 'first'), field('asked', 'Record<string, unknown>', {}),
  field('answered', 'string[]', []), field('run', 'string | null', null, false), field('project', 'string', 'project'),
  field('readAfter', 'string[]', []),
], { way: 'first', asked: {}, answered: [], run: null, project: 'project', readAfter: [] })
export const knowledgeRatingKind = spec('knowledge_rating', [
  field('entry', 'string', 'entry'), field('score', 'number', 4), field('text', 'string', w.examples.rating),
  field('suggestion', 'string', w.examples.suggestion), field('run', 'string', 'run'), field('project', 'string', 'project'),
], { entry: 'entry', score: 4, text: w.examples.rating, suggestion: w.examples.suggestion, run: 'run', project: 'project' })
export const KNOWLEDGE_SHAPES: Record<string, ShapeSpec> = {
  KnowledgeAttachment: { name: 'KnowledgeAttachment', description: w.fields.attachments, fields: [field('project', 'string', 'project'), field('flow', 'string', 'flow'), field('step', 'number', 1)] },
  KnowledgeLowRatingNotice: { name: 'KnowledgeLowRatingNotice', description: w.fields.lowRatingNotice, fields: [field('message', 'string', 'message'), field('at', 'string', 'time')] },
  KnowledgeResource: { name: 'KnowledgeResource', description: w.shape, fields: [field('what', 'string', w.examples.what), field('where', 'string', w.examples.where), field('how', 'string', w.examples.how)] },
  KnowledgeSource: { name: 'KnowledgeSource', description: w.shape, fields: [field('record', 'string', 'record', false), field('url', 'string', 'https://example.invalid/reference', false), field('measurement', 'string', w.examples.measurement, false)] },
}
