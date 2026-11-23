// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE DOORS THIS OFFICE'S LIST OF WHAT THE GRANT CARRIES NAMES, AND WHAT EACH DOES IN ENGLISH AND IN CHINESE. Wave 13s
 * round 2a.
 *
 * A door here is one the person may give an answer about on the secretary's page: every door on the secretary card's
 * lists, and every other door only the person may press. src/shared/what-the-grant-carries.ts says what the list is.
 *
 * EACH DOOR HAS WORDS IN BOTH LANGUAGES, as a role card has (src/config/roles.json): the page draws the one in the
 * page's language. They say what pressing the door does, in a short phrase a person can choose by. A test refuses a door
 * here with no words, and a door on the card's lists or only the person may press that is not here.
 */

/** What one door does, in each language. */
export interface WhatADoorDoes {
  en: string
  zh: string
}

/** Every door the list names, with what it does. Operations first, then the names beside the doors. */
export const THE_DOORS_THE_LIST_NAMES: Readonly<Record<string, WhatADoorDoes>> = {
  'agent.owner-move': {
    en: 'Handing an agent to another owner',
    zh: '将智能体交给另一位负责人',
  },
  'agent.project-move': {
    en: 'Moving an agent to another project',
    zh: '将智能体移到另一个项目',
  },
  'agent.starter-move': {
    en: 'Changing who answers for an agent',
    zh: '更改负责智能体的人或智能体',
  },
  'office.set-address-for-browsers': {
    en: 'Setting the address browsers are sent to',
    zh: '设置浏览器访问的地址',
  },
  'office.resume-a-run': {
    en: 'Resuming an interrupted run',
    zh: '继续一个中断的运行',
  },
  'office.name-owner': {
    en: 'Naming the owner of this office',
    zh: '为本办公室记录管理员是谁',
  },
  'office.set-quick-inputs': {
    en: 'Setting the list of quick inputs',
    zh: '设置快捷输入列表',
  },
  'office.sandbox-memory-cap': {
    en: 'Reading the memory limit of all sandboxes together',
    zh: '读取全部沙箱共用的内存上限',
  },
  'office.set-sandbox-memory-cap': {
    en: 'Setting or removing the sandboxes\' shared memory limit',
    zh: '设置或取消沙箱共用的内存上限',
  },
  'office.start-at-login': {
    en: 'Reading whether the office starts at login',
    zh: '读取办公室是否在登录时启动',
  },
  'office.set-start-at-login': {
    en: 'Turning on or off the office starting at login',
    zh: '开启或关闭办公室登录时启动',
  },
  'office.data-folder': {
    en: 'Reading where the office keeps its data folder on this computer',
    zh: '读取办公室在这台电脑上保存数据文件夹的位置',
  },
  'office.move-data-folder': {
    en: 'Moving the office\'s data folder to another place on this computer',
    zh: '将办公室的数据文件夹移动到这台电脑上的另一个位置',
  },
  'office.confirm-data-folder-move': {
    en: 'Removing the old data folder\'s copied files after a move',
    zh: '在移动后删除旧数据文件夹中已复制的文件',
  },
  'terminals.way-back': {
    en: 'Reading the way back to an agent\'s run. A secretary may do this with its own key.',
    zh: '读取回到智能体运行的命令',
  },
  'terminals.bring-back': {
    en: 'Bringing an agent\'s run back in a terminal',
    zh: '在终端中恢复智能体的运行',
  },
  'terminals.agent-pane': {
    en: 'Finding an agent\'s tmux pane. A secretary may do this with its own key.',
    zh: '查找智能体的终端窗格',
  },
  'terminals.show-pane': {
    en: 'Showing an agent\'s tmux pane',
    zh: '显示智能体的终端窗格',
  },
  'terminals.agent-steps': {
    en: 'Reading a sandboxed run\'s steps. A secretary may do this with its own key.',
    zh: '读取沙箱运行的步骤',
  },
  'terminals.open-an-agent': {
    en: 'Opening an agent in a terminal. A secretary may do this with its own key.',
    zh: '在终端中打开一个智能体',
  },
  'harnesses.list': {
    en: 'Reading the agent tools the office runs',
    zh: '读取办公室运行的智能体工具',
  },
  'harnesses.install': {
    en: 'Installing agent tools',
    zh: '安装智能体工具',
  },
  'harnesses.signed-in': {
    en: 'Reading an agent tool\'s sign-in state',
    zh: '读取智能体工具的登录状态',
  },
  'terminals.list': {
    en: 'Reading the office\'s terminals. A secretary may do this with its own key.',
    zh: '读取办公室的终端列表',
  },
  'terminals.open': {
    en: 'Opening a terminal',
    zh: '打开一个终端',
  },
  'terminals.read': {
    en: 'Reading a terminal. With its own key and no grant, a secretary may read only agents\' terminals, and a terminal it prepared for the person while it runs.',
    zh: '读取一个终端的内容',
  },
  'terminals.type': {
    en: 'Typing into a terminal',
    zh: '在终端中输入文字',
  },
  'terminals.resize': {
    en: 'Resizing a terminal',
    zh: '调整终端的大小',
  },
  'terminals.close': {
    en: 'Closing a terminal',
    zh: '关闭一个终端',
  },
  'terminals.start-holder': {
    en: 'Starting the terminal holder',
    zh: '启动终端托管进程',
  },
  'terminals.restart-holder': {
    en: 'Restarting the terminal holder',
    zh: '重启终端托管进程',
  },
  'terminals.last-line': {
    en: 'Reading the last line typed into a terminal',
    zh: '读取终端中最后输入的一行',
  },
  'terminals.keep-line': {
    en: 'Keeping a terminal\'s last line as the person\'s words',
    zh: '把终端最后一行保存为本人原话',
  },
  'terminals.keeping': {
    en: 'Reading whether a terminal keeps what is typed',
    zh: '读取终端是否保留输入内容',
  },
  'terminals.set-keeping': {
    en: 'Turning on or off keeping what is typed in a terminal',
    zh: '开启或关闭终端保留输入内容',
  },
  // THE CHINESE IS THE ENGLISH until the translation round writes it.
  'terminals.name': {
    en: 'Giving a terminal a name, a group and tags',
    zh: 'Giving a terminal a name, a group and tags',
  },
  'message.remind-me-later': {
    en: 'Asking to be reminded about a message later',
    zh: '稍后提醒这条消息',
  },
  'message.mark-broken': {
    en: 'Reporting a message as broken',
    zh: '报告一条消息已损坏',
  },
  'office.shut-down': {
    en: 'Shutting Mole Office down',
    zh: '关闭办公室服务',
  },
  'office.read-summonses': {
    en: 'Reading the office\'s summonses',
    zh: '读取办公室的召唤消息',
  },
  'office.mail-tool': {
    en: 'Reading whether the mail tool is installed and running',
    zh: '读取邮件工具是否已安装并运行',
  },
  'office.install-mail-tool': {
    en: 'Installing the mail tool with its key as a login service',
    zh: '用密钥安装邮件工具并设为登录服务',
  },
  'office.take-back-mail-tool-key': {
    en: 'Taking back the mail tool\'s key so it reads no summonses',
    zh: '收回邮件工具密钥使其停止读取传唤',
  },
  'office.disable-mail-tool': {
    en: 'Turning the mail tool off without uninstalling it',
    zh: '关闭邮件工具但不卸载',
  },
  'record.file-as-my-words': {
    en: 'Filing a prepared note as the person\'s words',
    zh: '把准备好的便条归档为本人原话',
  },
  'record.not-what-i-said': {
    en: 'Marking a prepared note as not what the person said',
    zh: '标记准备好的便条不是本人所说',
  },
  'record.confirm-all-my-words': {
    en: 'Confirming every prepared note as the person\'s words',
    zh: '确认所有准备好的便条为本人原话',
  },
  'answer.keep': {
    en: 'Saving a draft of the report\'s answers',
    zh: '保存报告答案的草稿',
  },
  'answer.send': {
    en: 'Sending the report\'s answers and recording the choices',
    zh: '提交报告答案并记下所选项',
  },
  'office.close-key-window': {
    en: 'Closing the key window',
    zh: '关闭密钥窗口',
  },
  'office.pause': {
    en: 'Pausing the office and its runs',
    zh: '暂停办公室及其运行',
  },
  'office.resume': {
    en: 'Resuming the office\'s message worker',
    zh: '恢复办公室的消息处理',
  },
  'office.restart': {
    en: 'Restarting the office server',
    zh: '重启办公室服务器',
  },
  'agent.handover': {
    en: 'Reading an agent\'s handover',
    zh: '读取智能体的交接说明',
  },
  'agent.handover-write': {
    en: 'Writing an agent\'s handover',
    zh: '写入智能体的交接说明',
  },
  'office.rules.set-chapter': {
    en: 'Setting a chapter of the office\'s rules',
    zh: '设置办公室规则的一章',
  },
  'office.rules.restore-chapter': {
    en: 'Restoring a chapter of the office\'s rules',
    zh: '恢复办公室规则的一章',
  },
  'office.rules.mark-only-this-office': {
    en: 'Marking a rule chapter as only this office\'s',
    zh: '把规则章节标记为仅本办公室',
  },
  'one-press.agree': {
    en: 'Agreeing to a one-press request',
    zh: '同意一个一键请求',
  },
  'one-press.refuse': {
    en: 'Refusing a one-press request',
    zh: '拒绝一个一键请求',
  },
  'readiness.sign-as-the-person': {
    en: 'Signing a readiness checklist as the person',
    zh: '以本人身份签署就绪清单',
  },
  'signing-packages.sign': {
    en: 'Signing a package of settings and answers',
    zh: '签署一批设置和答复请求',
  },
  'signing-packages.refuse': {
    en: 'Refusing a package of settings and answers',
    zh: '拒绝一批设置和答复请求',
  },
  'signing-packages.take-back': {
    en: 'Taking back a signed package',
    zh: '收回已签署的请求包',
  },
  'office.trust-machine': {
    en: 'Trusting a machine',
    zh: '信任一台机器',
  },
  'office.untrust-machine': {
    en: 'Removing a trusted machine',
    zh: '移除一台受信任的机器',
  },
  'office.confirm-visitor': {
    en: 'Confirming a visiting credential',
    zh: '确认一个访客凭证',
  },
  'office.end-visitor:a-persons-device': {
    en: 'Ending a session on a person\'s device',
    zh: '结束某人设备上的会话',
  },
  'office.revoke-key:a-persons-key': {
    en: 'Revoking a person\'s key',
    zh: '吊销某人的密钥',
  },
  'office.undo-key-revocation:a-persons-key': {
    en: 'Undoing the revocation of a person\'s key',
    zh: '恢复某人被吊销的密钥',
  },
  'record:regulation': {
    en: 'Writing a regulation',
    zh: '写入一条规章',
  },
  'record:decision': {
    en: 'Writing a decision',
    zh: '写入一条决定',
  },
  'delegation.take': {
    en: 'Taking a delegated task',
    zh: '领取一项委派的任务',
  },
  'delegation.return': {
    en: 'Returning a delegated task with what it made',
    zh: '交回委派的任务及其成果',
  },
  'resident.confirm': {
    en: 'Confirming an agent as a resident',
    zh: '确认一个智能体为常驻成员',
  },
  'booking.answer': {
    en: 'Answering whether a booking may go first',
    zh: '回答预约是否可以优先开始',
  },
  'agent.start-a-new-agent': {
    en: 'Starting a new agent from an agent\'s page',
    zh: '从智能体页面启动新智能体',
  },
  'message.start-an-agent': {
    en: 'Starting an agent from a message',
    zh: '从一条消息启动智能体',
  },
  'agent.dispatch': {
    en: 'Starting an agent run for a conversation',
    zh: '为一个对话启动智能体运行',
  },
  'review.send': {
    en: 'Starting an agent run by sending a review',
    zh: '通过发送评审启动智能体运行',
  },
  'role.end-a-grant-early': {
    en: 'Ending a secretary\'s grant early',
    zh: '提前结束一位秘书的委托',
  },
  'role.request': {
    en: 'Answering a role request addressed to the person',
    zh: '答复发给本人的角色申请',
  },
  'message.not-now': {
    en: 'Putting off a message\'s offer for now',
    zh: '暂时搁置消息中的提议',
  },
  'plan:committing-hours': {
    en: 'Committing hours on the calendar',
    zh: '把工时记入日历',
  },
  'office.end-visitor': {
    en: 'Ending a visiting credential',
    zh: '结束一个访客凭证',
  },
  'office.revoke-key': {
    en: 'Revoking a key',
    zh: '吊销一个密钥',
  },
  'office.undo-key-revocation': {
    en: 'Undoing a key\'s revocation',
    zh: '恢复一个被吊销的密钥',
  },
  'role.set-added': {
    en: 'Applying a checked added role card',
    zh: '应用一个已检查的新增角色卡',
  },
  'role.restore-added': {
    en: 'Restoring a checked version of an added role card',
    zh: '恢复新增角色卡的已检查版本',
  },
  'office.set-checks-in-merges-only': {
    en: 'Setting whether checks run only in merges',
    zh: '设置检查是否只在合并时运行',
  },
  'office.set-stale-fork-bases': {
    en: 'Setting the bases used to spot stale forks',
    zh: '设置判断过期分支的基准',
  },
  'office.set-dead-letter-secretary': {
    en: 'Setting the secretary for undelivered messages',
    zh: '设置未送达消息的秘书',
  },
  'office.set-dead-letter-thresholds': {
    en: 'Setting when messages count as undelivered',
    zh: '设置消息视为未送达的时限和数量',
  },
  'office.install-entry': {
    en: 'Writing the skill link and hook lines into the home folder',
    zh: '把技能链接和钩子写入主目录',
  },
  'office.install-entry.other-runtimes.write': {
    en: 'Writing the other runtimes\' global instructions file',
    zh: '写入其他运行工具的全局说明文件',
  },
  'office.set-goal-spans': {
    en: 'Setting the short, medium and long goal spans',
    zh: '设置短中长期目标的时限',
  },
  'office.set-agents-may-inject': {
    en: 'Setting whether agents may inject messages',
    zh: '设置智能体是否可以插入消息',
  },
  'office.set-machine-names': {
    en: 'Setting the names of this office\'s machines',
    zh: '设置本办公室各机器的名称',
  },
  'office.set-merge-queue-owner': {
    en: 'Setting the owner of the merge queue',
    zh: '设置合并队列的负责人',
  },
  'office.set-key': {
    en: 'Writing one of the office\'s provider keys to its file',
    zh: '把办公室的一个服务密钥写入文件',
  },
  'office.test-key': {
    en: 'Sending one of the office\'s keys to its provider to test it',
    zh: '向服务商发送办公室密钥以测试',
  },
  'office.set-load-ranges': {
    en: 'Setting the ranges used to measure load',
    zh: '设置衡量负载的区间',
  },
  'plan.write': {
    en: 'Writing a plan\'s proposals and its hours',
    zh: '写入计划的提议和工时',
  },
  'plan.mark-read': {
    en: 'Marking a plan as read',
    zh: '把计划标为已读',
  },
  'plan.time': {
    en: 'Giving a piece of work hours in a period, or changing or removing them',
    zh: '给一项工作分配某个时段的工时，或修改、移除它们',
  },
  'plugins.switch': {
    en: 'Turning a plugin on or off',
    zh: '开启或关闭一个插件',
  },
  'office.set-price-table': {
    en: 'Setting the table of prices',
    zh: '设置价格表',
  },
  'office.push': {
    en: 'Reading which devices take notifications',
    zh: '读取哪些设备接收通知',
  },
  'office.push-allow': {
    en: 'Adding a device that takes notifications',
    zh: '添加一台接收通知的设备',
  },
  'office.push-stop': {
    en: 'Removing a device that takes notifications',
    zh: '移除一台接收通知的设备',
  },
  'office.push-test': {
    en: 'Sending a test notification to a device',
    zh: '向一台设备发送测试通知',
  },
  'record.change': {
    en: 'Changing a record or releasing its held check',
    zh: '修改记录或解除其保留的检查',
  },
  'office.set-related-tests-first': {
    en: 'Setting whether related tests run first',
    zh: '设置是否先运行相关测试',
  },
  'office.set-run-models': {
    en: 'Setting the models runs use',
    zh: '设置运行使用的模型',
  },
  'office.set-agent-run-model': {
    en: 'Setting the model one agent\'s runs use',
    zh: '设置某个智能体运行使用的模型',
  },
  'office.set-settings': {
    en: 'Setting the office\'s runtime settings',
    zh: '设置办公室的运行时选项',
  },
  'office.hand-over-gate-count-spool': {
    en: 'Giving the gate-count spool to this office\'s world',
    zh: '把关卡计数暂存目录交给本办公室的世界',
  },
  'office.set-sandbox-login': {
    en: 'Writing one login into the sandboxes\' secrets file',
    zh: '把一个登录信息写入沙箱密钥文件',
  },
  'office.clear-sandbox-login': {
    en: 'Taking one login out of the sandboxes\' secrets file',
    zh: '从沙箱密钥文件中删除一个登录信息',
  },
  'office.set-what-is-kept': {
    en: 'Setting what the office keeps and for how long',
    zh: '设置办公室保留什么及保留多久',
  },
  'office.set-restart-grant': {
    en: 'Setting who may restart the office',
    zh: '设置谁可以重启办公室',
  },
  'delegation.confirm': {
    en: 'Confirming a delegated task is complete',
    zh: '确认委派的任务已完成',
  },
  'resident.decline': {
    en: 'Declining an agent\'s residency',
    zh: '拒绝一个智能体的常驻申请',
  },
  'resident.successor': {
    en: 'Naming a resident agent\'s successor',
    zh: '指定常驻智能体的继任者',
  },
  'merge.first': {
    en: 'Moving a merge entry to the front',
    zh: '把合并队列中的一项移到最前',
  },
  'office.scene-settings.change': {
    en: 'Changing whether the office map moves',
    zh: '更改办公室地图是否移动',
  },
  'structure.write': {
    en: 'Writing how a scope and its nodes are presented',
    zh: '写入范围和节点的呈现方式',
  },
  'structure.clear': {
    en: 'Clearing how a scope and its nodes are presented',
    zh: '清除范围和节点的呈现方式',
  },
  'participant.look': {
    en: "Reading one person's look and their own themes",
    zh: '读取某个人的外观及其自己的主题',
  },
  'participant.set-look': {
    en: "Setting one person's look and their own themes",
    zh: '设置某个人的外观及其自己的主题',
  },
  'participant.release-reading': {
    en: 'Setting whether an agent reads a release from the check',
    zh: '设置智能体是否从检查结果读取放行',
  },
  'agent.retire': {
    en: 'Retiring an agent and its keys',
    zh: '让智能体及其密钥退役',
  },
  'agent-rename.approve': {
    en: "Approving an agent's new name that waits for the person",
    zh: '批准等待本人答复的智能体新名称',
  },
  'agent-rename.refuse': {
    en: "Refusing an agent's new name that waits for the person",
    zh: '拒绝等待本人答复的智能体新名称',
  },
  'checklist.changeItem': {
    en: 'Changing a checklist item\'s state',
    zh: '更改清单项的状态',
  },
  'implementation.accept': {
    en: 'Accepting a machine\'s guess about a record\'s code',
    zh: '接受机器对记录所属代码的猜测',
  },
  'record.write': {
    en: 'Writing a new record',
    zh: '写入一条新记录',
  },
  'record.check': {
    en: 'Checking a record without saving it',
    zh: '检查一条记录但不保存',
  },
  'record.remove': {
    en: 'Removing a record',
    zh: '移除一条记录',
  },
  'record.restore': {
    en: 'Restoring a removed record',
    zh: '恢复一条已移除的记录',
  },
  'record.promote': {
    en: 'Settling a proposal by filing its decision',
    zh: '记下提议所求的决定，把提议落定',
  },
  'record.choose-again': {
    en: 'Choosing again on a decision already made',
    zh: '对已经做出的决定重新选择',
  },
  'record.move': {
    en: 'Moving records to another project',
    zh: '把记录移到另一个项目',
  },
  'record.checklist': {
    en: 'Changing a record\'s checklist line or adding a part to it',
    zh: '修改记录的清单项或为它添加部分',
  },
  'revision.restore': {
    en: 'Putting a record back as an earlier version had it',
    zh: '把记录恢复成早先某个版本的样子',
  },
  'act.revoke': {
    en: 'Taking back an agent\'s act done on the person\'s words or grant',
    zh: '收回智能体凭本人原话或授权所做的操作',
  },
  'link.write': {
    en: 'Writing a link between records',
    zh: '写入记录之间的链接',
  },
  'link.remove': {
    en: 'Removing a link between records',
    zh: '移除记录之间的链接',
  },
  'implementation.write': {
    en: 'Removing the code a record claims',
    zh: '移除记录认领的代码',
  },
  'implementation.repository-write': {
    en: 'Pointing a repository at a different folder',
    zh: '把代码库指向另一个文件夹',
  },
  'import.accept': {
    en: 'Accepting a draft piece as a record',
    zh: '接受草稿中的一段作为记录',
  },
  'toolset.confirm': {
    en: 'Confirming a proposed tool category, which files a decision',
    zh: '确认一个提议的工具类别，并由此记下一项决定',
  },
  'restriction.judge': {
    en: 'Judging a restriction again for a record',
    zh: '重新判断限制对记录是否适用',
  },
}

export function isADoorTheListNames(name: string): boolean {
  return Object.hasOwn(THE_DOORS_THE_LIST_NAMES, name)
}

/** What a door the list names does, or a thrown error: a door with no words is one the page could not draw. */
export function whatThisDoorDoes(door: string): WhatADoorDoes {
  const words = Object.hasOwn(THE_DOORS_THE_LIST_NAMES, door) ? THE_DOORS_THE_LIST_NAMES[door] : undefined
  if (words === undefined) throw new Error(`The door ${door} is not one the list of what the grant carries names, so it has no words.`)
  return words
}
