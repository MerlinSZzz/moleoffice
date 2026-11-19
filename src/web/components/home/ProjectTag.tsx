// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { createContext, useContext } from 'react'
import { content, t } from '@shared/i18n.ts'
import { Tag } from '../ui.tsx'

const Names = createContext<(id: string) => string>(() => t('decisions.unnamedProject'))
export const HomeProjects = Names.Provider

/** A missing project name never becomes a visible lookup key. */
export function ProjectTag({ id, name }: { id?: string; name?: string }) {
  const nameOf = useContext(Names)
  return <span className="hp-project"><Tag tone="quiet">{content(name ?? (id === undefined ? t('decisions.unnamedProject') : nameOf(id)))}</Tag></span>
}
