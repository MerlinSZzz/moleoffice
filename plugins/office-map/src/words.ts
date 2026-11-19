// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import type { ReadFailure } from './contracts.ts'
import type { GeometryFailure } from './geometry-client.ts'

/** New words go in English only and wait for the translation round, so Chinese shows these in English until then. */
const awaitingTranslation = {
  asleepUnread: 'Who is asleep could not be read, so nobody is drawn asleep.',
  asleepPlate: 'Asleep',
} as const

export const words = {
  en: {
    title: 'Office Map', waiting: 'Waiting for the office.',
    map: 'Office seats', mapLoading: 'Laying out the current roster.',
    layoutStopped: 'The seats could not be placed, so the map is not drawn.',
    layoutError: 'The layout stopped with this message: "{message}".',
    layoutRoster: 'The roster lists {agent} twice, and an agent can have only one seat.',
    layoutWorker: 'The layout program stopped, and the browser said: "{message}".',
    layoutSilent: 'The layout program stopped, and the browser gave no reason.',
    layoutListed: 'The agent list still works.',
    namesLeftOut: 'Some area names do not fit at this zoom, so they are not shown. Zoom in to read them.',
    membership: 'Recorded projects', projectUnknown: 'Project name not supplied',
    offlineOutside: 'Offline, drawn outside: {count}.', offlineHidden: 'Offline or retired, not drawn: {count}.',
    onlineUnread: 'Who is online could not be read, so every agent is drawn.',
    asleepNoPlace: 'Asleep agents with no place left: {count}.',
    asleepMadeUp: 'Made up for a picture: who is asleep was set by a picture tool, not read from the office.',
    madeUpSleep: 'Made-up sleep', ...awaitingTranslation,
    refresh: 'Refresh', pause: 'Pause reads', resume: 'Resume reads', all: 'Whole office',
    filter: 'Project', search: 'Find a person', loading: 'Reading', ready: 'Last read', stale: 'Stale · last read',
    unavailable: 'Unavailable', permission: 'Access refused. The previous reading has been cleared.',
    readTooLong: 'Read failed. The request is {bytes} bytes; the limit is {limit} bytes.',
    readError: 'Read failed.', invalid: 'The reading could not be understood.', never: 'No successful reading yet.',
    restricted: 'Some data is withheld.', quiet: 'Quiet view',
    motionNote: 'Walks do not show whether a message was read.',
    wavePreview: 'Preview wave', stopWave: 'Stop wave preview',
    reduced: 'Reduced motion: nobody walks.', quietNote: 'Quiet view: nobody walks.',
    zoomIn: 'Zoom in', zoomOut: 'Zoom out', fit: 'Fit office', locate: 'Locate', follow: 'Follow during walks', following: 'Stop following',
    rooms: 'Rooms', showRoom: 'Show room', sleepingHouse: 'Sleeping house',
    controls: 'Drag or use arrow keys to pan. Pinch or use + / − to zoom. Home fits the office; Escape stops following.',
    pick: 'Choose an agent to see its details.', close: 'Close details',
    list: 'Agents', matches: 'Matching agents', clear: 'Clear filters', previous: 'Previous', next: 'Next',
    supplied: 'Agents',
    packLoading: 'Loading woodland art.', packMissing: 'Woodland art did not load, so only names and markers are drawn.',
    summary: 'Point to an agent to read about it here.',
    contactCount: 'New messages', walkNotShown: 'The map could not show {from} walking to {to}.',
    page: 'Page', noPeople: 'No agents were found.',
    hidden: 'Reads paused', noResults: 'No agents match this project and search.',
    noWork: 'No current work established', workUnavailable: 'Work unavailable', noProjectWork: 'No current work supplied for this project',
    standingLook: 'Standing look', standingFallback: 'The saved look cannot be drawn, so this is a stand-in that other agents may share.', sizeUnavailable: 'Size unavailable', portraitUnavailable: 'Portrait unavailable',
    started: 'Started by', relationshipUnavailable: 'Starter relationship unavailable', role: 'Recorded role',
    roleUnknown: 'Role not supplied', presence: 'Presence', presenceUnavailable: 'Presence not supplied',
    presenceDetails: 'Presence reasons are not supplied.', details: 'Read details',
    appearance: 'Stored appearance', scale: 'Saved scale', generationRole: 'Role when size was drawn',
    chosen: 'Appearance explicitly chosen', association: 'Association', state: 'Original state', executing: 'Process running',
    doing: 'Recorded activity', updated: 'Updated', standing: 'Run standing', notSupplied: 'Not supplied',
    people: 'People', noContacts: 'No people were found.',
    unmatched: 'Work without a current roster match', more: 'Not all messages are loaded. Press Refresh to load more.',
    restrictedTalk: 'Only messages you may see are shown.',
    errorArt: 'Scene image unavailable.', visible: 'Shown', omitted: 'More agents are supplied. Narrow the search to see them.',
    noContactsFound: 'No contacts match the search', priorFacts: 'Previous details; not current', rosterView: 'Roster', projectUnloaded: 'Project match unknown', factsUnloaded: 'Details not loaded', agentAbsent: 'Agent absent from the last successful reading', partialFacts: 'Loaded agents only; project totals are unknown',
    projects: 'Projects', peopleView: 'People', workView: 'Work', talkView: 'Contacts', population: 'people',
    visitor: 'Visitors', team: 'Team', leadership: 'Supervisors who started supervisors', secretary: 'Secretaries',
    inspector: 'Inspectors', unassigned: 'Other recorded roles',
  },
  zh: {
    title: '办公地图', waiting: '正在等待办公室。',
    map: '办公室工位', mapLoading: '正在排列当前成员的工位。',
    layoutStopped: '无法排列工位，所以没有画出地图。',
    layoutError: '布局停止了，程序给出的信息是：“{message}”。',
    layoutRoster: '成员名单把 {agent} 列了两次，而一个智能体只能有一个工位。',
    layoutWorker: '布局程序停止了，浏览器给出的信息是：“{message}”。',
    layoutSilent: '布局程序停止了，浏览器没有说明原因。',
    layoutListed: '智能体列表仍然可用。',
    namesLeftOut: '有些区域名称在这个缩放比例下放不下，所以没有显示。放大后即可看到。',
    membership: '记录的项目', projectUnknown: '未提供项目名称',
    offlineOutside: '离线、画在外面的：{count} 个。', offlineHidden: '离线或已退役、未画出的：{count} 个。',
    onlineUnread: '无法读取谁在线，所以画出了每一个智能体。',
    asleepNoPlace: '没有睡觉位置的智能体：{count} 个。',
    asleepMadeUp: '图片专用虚构内容：谁在睡觉由图片工具设定，不是从办公室读取的。',
    madeUpSleep: '虚构睡眠', ...awaitingTranslation,
    refresh: '刷新', pause: '暂停读取', resume: '恢复读取', all: '整个办公室',
    filter: '项目', search: '查找成员', loading: '正在读取', ready: '上次读取', stale: '已过时 · 上次读取',
    unavailable: '不可用', permission: '访问被拒绝，已清除之前的数据。',
    readTooLong: '读取失败。请求为 {bytes} 字节；上限为 {limit} 字节。',
    readError: '读取失败。', invalid: '无法理解读取的数据。', never: '还没有成功读取。',
    restricted: '部分数据未获授权。', quiet: '安静视图',
    motionNote: '走动不说明消息是否已读。',
    wavePreview: '预览挥手', stopWave: '停止挥手预览',
    reduced: '减少动态效果：没有走动。', quietNote: '安静视图：没有走动。',
    zoomIn: '放大', zoomOut: '缩小', fit: '显示整个办公室', locate: '定位', follow: '走动时跟随', following: '停止跟随',
    rooms: '房间', showRoom: '显示房间', sleepingHouse: '睡觉的屋子',
    controls: '拖动或用方向键平移，双指或 + / − 缩放。Home 显示全部，Escape 停止跟随。',
    pick: '选择一个智能体查看详情。', close: '关闭详情',
    list: '智能体', matches: '匹配的智能体', clear: '清除筛选', previous: '上一页', next: '下一页',
    supplied: '智能体',
    packLoading: '正在加载林地图片。', packMissing: '林地图片没有加载，所以只画出名称和标记。',
    summary: '指向一个智能体，在这里查看简要信息。',
    contactCount: '新消息', walkNotShown: '地图无法显示 {from} 走向 {to}。',
    page: '页', noPeople: '没有找到智能体。',
    hidden: '已暂停读取', noResults: '没有匹配此项目和搜索条件的智能体。',
    noWork: '尚未确定当前工作', workUnavailable: '工作不可用', noProjectWork: '未提供此项目的当前工作',
    standingLook: '站立外观', standingFallback: '无法画出保存的外观，所以这是替代外观，其他智能体可能也是这个外观。', sizeUnavailable: '未提供体型大小', portraitUnavailable: '外观不可用',
    started: '启动者', relationshipUnavailable: '启动关系不可用', role: '记录的角色',
    roleUnknown: '未提供角色', presence: '在场状态', presenceUnavailable: '未提供在场状态',
    presenceDetails: '未提供在场状态的原因。', details: '查看详情',
    appearance: '保存的外观', scale: '保存的大小', generationRole: '生成大小时的角色',
    chosen: '外观是否主动选择', association: '关联', state: '原始状态', executing: '进程运行中',
    doing: '记录的活动', updated: '更新于', standing: '运行阶段', notSupplied: '未提供',
    people: '人员', noContacts: '没有找到人员。',
    unmatched: '没有当前成员匹配的工作', more: '消息未全部加载，点击刷新加载更多。',
    restrictedTalk: '只显示你获准查看的消息。',
    errorArt: '场景图片不可用。', visible: '已显示', omitted: '还提供了更多智能体，可缩小搜索范围查看。',
    noContactsFound: '没有匹配搜索条件的联系人', priorFacts: '先前详情；当前尚未确认', rosterView: '成员名册', projectUnloaded: '项目匹配未知', factsUnloaded: '详情尚未加载', agentAbsent: '上次成功读取中没有此智能体', partialFacts: '仅含已加载成员；项目总数未知',
    projects: '项目', peopleView: '成员', workView: '工作', talkView: '联系', population: '人',
    visitor: '访客', team: '团队', leadership: '启动其他主管的主管', secretary: '秘书',
    inspector: '检查员', unassigned: '其他记录的角色',
  },
} as const

/** What stopped the layout in plain words, then the program's own message where it gave one. A function
 * replaces each mark, so a `$` in the message is shown as written. */
export function layoutFailureWords(language: 'en' | 'zh', failure: GeometryFailure, agent: (identity: string) => string): string {
  const said = words[language]
  const reason = failure.cause === 'roster' ? said.layoutRoster.replace('{agent}', () => agent(failure.agent)) :
    failure.cause === 'layout' ? said.layoutError.replace('{message}', () => failure.message) :
    failure.message ? said.layoutWorker.replace('{message}', () => failure.message) : said.layoutSilent
  return [said.layoutStopped, reason, said.layoutListed].join(language === 'zh' ? '' : ' ')
}

export function readFailureWords(language: 'en' | 'zh', failure?: ReadFailure | null): string {
  return failure ? words[language].readTooLong.replace('{bytes}', String(failure.bytes)).replace('{limit}', String(failure.limit)) : words[language].readError
}
