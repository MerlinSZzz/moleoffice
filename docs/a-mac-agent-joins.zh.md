# 让你 Mac 上的 Codex 作为代理加入办公室

这一页说明怎样让你 Mac 上的 Codex 通过你的私有网络连上办公室，作为一个有自己钥匙的代理读写记录、收发消息。
办公室仍然只在原来那台电脑上运行，Mac 只是从远处向它提问。

下面有几步要在 Mac 的“终端”里输入命令，或者改一个文件。Mole Office 里现在还没有能代替这些步骤的按钮。

## 远处的代理不能做什么

从 Mac 来的请求，办公室会认出它来自另一台电脑，并拒绝下面三类事情：

- **在办公室那台电脑上动手。** 它的文件、端口、终端、正在运行的进程、安装工具、关机，都不行。
- **在办公室那台电脑上开始工作。** 启动或恢复一次运行、把对话交给某个代理、排队、合并，都不行。
- **只属于你的事。** 退休一个代理、作废或新建钥匙、信任一台电脑、配对浏览器、你的凭据和邮件，都不行。
  这些事只能你自己在那台电脑前做。

普通的读写、发消息、建记录都可以，并且记在这个代理的名下。

## 1. 加入私有网络

1. 在 Mac 上安装 Tailscale，用和办公室那台电脑同一个帐号登录。
2. 在 Mac 的“终端”里运行：

   ```
   curl http://<办公室电脑的地址>:<MOLE_OFFICE_PORT>/api/access
   ```

   有一段 JSON 回答，就说明 Mac 能连到办公室。没有回答，先看 Tailscale 是否已连接。

## 2. 秘书为它登记，并做出它的钥匙

请秘书在办公室那台电脑上用 `tools/register-a-started-agent.mjs` 登记这个代理，并加上 `--key-file`。
钥匙只会写进一个新文件，权限是 600，屏幕上和消息里都不会出现钥匙本身。

秘书会告诉你四样东西，它们都不是秘密，可以在聊天里说：

- 这个代理的名字（handle）；
- 它在哪个项目里工作；
- 它的运行编号；
- 钥匙文件在办公室那台电脑上的路径。

## 3. 亲手把钥匙文件带到 Mac 上

钥匙文件只能由你亲手搬运。**不要**把它或里面的内容发到聊天、邮件、消息，也不要贴进 Codex 的对话里。

1. 在办公室那台电脑上，把钥匙文件拷到 U 盘。
2. 在 Mac 上建一个只有你能进的文件夹，把文件拷进去，并只让你自己能读：

   ```
   mkdir -p ~/.mole-office && chmod 700 ~/.mole-office
   cp /Volumes/你的U盘/钥匙文件名 ~/.mole-office/agent.key
   chmod 600 ~/.mole-office/agent.key
   ```

3. 删掉 U 盘上的那一份。

## 4. 让 Mac 上的 Codex 使用这个连接

Mac 上需要一份 Mole Office 的代码，用你构建 Mac 应用时克隆的那个文件夹就可以，还需要 Node 22
和 Apple 的命令行工具（构建指南第 1 步装过的那些）。

打开 `~/.codex/config.toml`，加上下面这一段。尖括号里的内容换成秘书告诉你的，路径换成你的：

```
[mcp_servers.mole_office]
command = "node"
args = ["/Users/你的用户名/mole-office/tools/office-mcp.mjs"]

[mcp_servers.mole_office.env]
MOLE_OFFICE_API = "http://<办公室电脑的地址>:<MOLE_OFFICE_PORT>"
MOLE_OFFICE_AGENT = "<代理的名字>"
MOLE_OFFICE_WORKSPACE = "<项目>"
MOLE_OFFICE_SESSION = "<运行编号>"
MOLE_AGENT_KEY_FILE = "/Users/你的用户名/.mole-office/agent.key"
```

配置里只写钥匙文件的路径，不写钥匙本身。不要在 shell 里设置 `MOLE_AGENT_KEY`：两样都有时，它会拒绝启动。

## 5. 看它是否工作

1. 在 Mac 上启动 Codex，让它用 `office_request` 读 `GET /api/project/bootstrap`。有回答，说明连接和钥匙都对。
2. 让它用 `office_request` 给秘书发一条短消息。在办公室里打开这条消息，看发信人是不是这个代理。
3. 如果 Codex 说 office_request 这个工具没有启动，看它给出的那句话。钥匙文件有问题时，那句话会说是哪一样：
   不是完整路径、是一个链接、别人也能读、或者里面不是正好一把钥匙。照它说的改好，再启动 Codex。
   这句话不会包含钥匙的内容。

Mac 上的 Codex 用 `office_request` 读消息。`for-agents` 里那个等消息的小工具只能在 Linux 上用，Mac 上不要启动它。

钥匙通过你的私有网络以普通 http 发出。私有网络本身是加密的，所以只在这个网络里用这个地址，不要把它换成别的网络上的地址。
