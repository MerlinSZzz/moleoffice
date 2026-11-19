// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { agentTagColourIsVisible, type AgentTag, type PersonalAgentMark } from '@shared/agent-tags.ts'
import { t } from '@shared/i18n.ts'
import { useEffect, useState } from 'react'
import { errorMessage, faultOf, getActor, request, type Fault } from '../api.ts'
import { ErrorNote } from './ui.tsx'

export const PERSONAL_AGENT_TAGS_CHANGED = 'personal-agent-tags-changed'

/** Draw a person's colours beside the office's project marks. */
export function PersonalAgentMarks({ marks }: { marks: readonly PersonalAgentMark[] }) {
  if (marks.length === 0) return null
  return <span style={{ display: 'inline-flex', flexWrap: 'wrap', gap: '0.25rem', minWidth: 0 }}>
    {marks.map((mark) => <span key={mark.name} data-personal-agent-tag data-chat-content style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', border: `2px solid ${mark.colour}`, borderRadius: '0.3rem', color: 'var(--text)', padding: '0 0.3rem', fontSize: '0.75rem', overflowWrap: 'anywhere' }}>
      <span aria-hidden="true" style={{ background: mark.colour, borderRadius: '50%', width: '0.55rem', height: '0.55rem', flex: 'none' }} />{mark.name}
    </span>)}
  </span>
}

/** The profile lets a person make a tag and change its assignment to this agent. */
export function PersonalAgentTags({ agent }: { agent: string }) {
  const [tags, setTags] = useState<AgentTag[] | null>(null)
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState('')
  const [colour, setColour] = useState('#7860a8')
  const [fault, setFault] = useState<{ message: string; fault: Fault | null } | null>(null)
  const [changed, setChanged] = useState(false)
  const [saving, setSaving] = useState(false)
  const human = getActor().type === 'human'
  useEffect(() => {
    if (!human) return
    let active = true
    setTags(null)
    setEditing(false)
    setFault(null)
    setChanged(false)
    void request<{ tags: AgentTag[] }>('/api/agent-tags').then((answer) => { if (active) setTags(answer.tags) }).catch((error: unknown) => { if (active) setFault({ message: errorMessage(error), fault: faultOf(error) }) })
    return () => { active = false }
  }, [agent, human])
  if (!human) return null
  const save = async (next: AgentTag[]) => {
    setFault(null)
    setChanged(false)
    setSaving(true)
    const previous = tags
    setTags(next)
    try {
      const answer = await request<{ tags: AgentTag[] }>('/api/agent-tags', { method: 'PUT', body: JSON.stringify({ tags: next }) })
      setTags(answer.tags)
      window.dispatchEvent(new Event(PERSONAL_AGENT_TAGS_CHANGED))
      return true
    } catch (error: unknown) {
      const fault = faultOf(error)
      setTags(previous)
      if (fault?.code === 'agentTagsUnknownAgent') { setChanged(true); setFault(null) }
      else setFault({ message: errorMessage(error), fault })
      return false
    }
    finally { setSaving(false) }
  }
  const readAgain = async () => {
    setFault(null)
    setSaving(true)
    try { setTags((await request<{ tags: AgentTag[] }>('/api/agent-tags')).tags); setChanged(false) }
    catch (error: unknown) { setFault({ message: errorMessage(error), fault: faultOf(error) }) }
    finally { setSaving(false) }
  }
  const create = () => {
    if (!agentTagColourIsVisible(colour)) { setFault({ message: t('agentTags.colourRefused'), fault: null }); return }
    if (name.trim() === '') { setFault({ message: t('agentTags.nameRequired'), fault: null }); return }
    void save([...(tags ?? []), { name: name.trim(), colour, agents: [agent] }]).then((saved) => { if (saved) setName('') })
  }
  const assigned = (tags ?? []).filter((tag) => tag.agents.includes(agent))
  return <section aria-label={t('agentTags.heading')} style={{ display: 'grid', gap: '0.45rem', marginTop: '0.5rem', minWidth: 0 }}>
    <strong>{t('agentTags.heading')}</strong>
    <PersonalAgentMarks marks={assigned} />
    {tags === null ? <span>{t('agentTags.loading')}</span> : !editing ? <button type="button" className="px-btn" style={{ justifySelf: 'start' }} onClick={() => { setName(''); setColour('#7860a8'); setFault(null); setChanged(false); setEditing(true) }}>{t('agentTags.change')}</button> : <>
      {tags.map((tag) => <label key={tag.name} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', overflowWrap: 'anywhere' }}>
        <input type="checkbox" checked={tag.agents.includes(agent)} disabled={saving} onChange={(event) => {
          const checked = event.currentTarget.checked
          void save(tags.map((one) => one.name !== tag.name ? one : { ...one, agents: checked ? [...one.agents, agent] : one.agents.filter((id) => id !== agent) }))
        }} />
        <span aria-hidden="true" style={{ background: tag.colour, width: '0.7rem', height: '0.7rem', borderRadius: '50%', flex: 'none' }} />{tag.name}
      </label>)}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'end', gap: '0.5rem' }}>
        <label>{t('agentTags.name')} <input value={name} maxLength={60} onChange={(event) => setName(event.currentTarget.value)} /></label>
        <label>{t('agentTags.colour')} <input type="color" value={colour} onChange={(event) => setColour(event.currentTarget.value)} /></label>
        <button type="button" className="px-btn" disabled={saving} onClick={create}>{t('agentTags.create')}</button>
        <button type="button" className="px-btn" disabled={saving} onClick={() => { setEditing(false); setFault(null); setChanged(false) }}>{t('g6b.profile.cancel')}</button>
      </div>
    </>}
    {changed ? <div role="alert" style={{ display: 'grid', gap: '0.35rem', justifyItems: 'start' }}>
      <span>{t('agentTags.changed')}</span>
      <span>{t('server.agentTagsUnknownAgent')}</span>
      <button type="button" className="px-btn" disabled={saving} onClick={() => void readAgain()}>{t('agentTags.readAgain')}</button>
    </div> : null}
    {fault === null ? null : <ErrorNote message={fault.message} fault={fault.fault} />}
  </section>
}
