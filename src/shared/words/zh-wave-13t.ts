// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import type { enWave13t } from './en-wave-13t.ts'

export const zhWave13t = {
  "mergeQueueOwner.allows": "可以把合并条目移到所在通道最前面的智能体。",
  "mergeQueueOwner.loading": "合并队列的负责人",
  "mergeQueueOwner.named": "{who} 负责合并队列。",
  "mergeQueueOwner.nobody.nobodyChose": "没有指定负责人。只有你能把条目移到最前面。",
  "mergeQueueOwner.nobody.notASecretary": "没有负责人：{who} 不是秘书。只有你能把条目移到最前面。",
  "mergeQueueOwner.nobody.notRegistered": "合并队列没有负责人。指定的智能体 {who} 没有在这里登记，所以只有你能把条目移到最前面。",
  "mergeQueueOwner.nobody.retired": "合并队列没有负责人。指定的智能体 {who} 已停用，所以只有你能把条目移到最前面。",
  "mergeQueueOwner.nobodyQualifies": "没有可指定的已登记秘书。",
  "mergeQueueOwner.pick": "秘书",
  "mergeQueueOwner.pickNobody": "无",
  "mergeQueueOwner.save": "指定这位秘书",
  "record.section.movedFirst": "移到最前",
  "server.mergeQueueOwnerNoInstallationRow": "本办公室没有自身设置的记录行，无法保存合并队列负责人。未作更改。",
  "server.mergeQueueOwnerNoSuchAgent": "这里没有智能体使用那个名称，无法指定它负责合并队列。未作更改。",
  "server.mergeQueueOwnerNotASecretary": "那个智能体不是秘书，无法负责合并队列。未作更改。",
  "server.mergeQueueOwnerNotRegistered": "那个智能体没有在这里登记，无法负责合并队列。未作更改。",
  "server.mergeQueueOwnerOwnerNotProved": "本请求未能证明来自管理员。只有管理员能指定合并队列负责人。未作更改。",
  "server.mergeQueueOwnerRetired": "那个智能体已停用，无法负责合并队列。未作更改。",
  "server.mergeQueueOwnerUnreadable": "保存的合并队列负责人信息使用了本办公室无法读取的格式。没有猜测，也未作更改。",
  "settingsPanel.title.mergequeueowner": "合并队列负责人",
  "startAtLogin.windows.signOut": "退出 Windows 会停止办公室。开启此项后，办公室会在你下次登录时重新启动，而不是在电脑开机时。",
  "startAtLogin.windows.where": "在 Windows 上，请通过任务栏右侧通知区域中 Mole Office 图标菜单里的“登录时打开”来开启或关闭此功能。",
} as const satisfies { readonly [K in keyof typeof enWave13t]?: (typeof enWave13t)[K] extends string ? string : { other: string } }
