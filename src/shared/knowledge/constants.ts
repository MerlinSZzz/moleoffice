// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * The shared identity and kinds of the knowledge library. Both the server and shared workspace
 * rules need the same list to recognize knowledge records.
 */
export const KNOWLEDGE_WORKSPACE = 'knowledge'
export const KNOWLEDGE_KINDS = ['knowledge_entry', 'knowledge_category', 'knowledge_bookmark', 'knowledge_change', 'knowledge_query', 'knowledge_rating'] as const
/** Say whether a record kind belongs to the knowledge library. */
export const isKnowledgeKind = (kind: string): boolean => (KNOWLEDGE_KINDS as readonly string[]).includes(kind)
