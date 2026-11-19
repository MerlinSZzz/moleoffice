# 在你的 Mac 上构建、签名 Mole Office

这一页说明怎样在你自己的 Mac 上，用一条命令做出签好名的 Mole Office，以及怎样在第二台 Mac 上试装。
只支持 Apple 芯片的 Mac。

有两种构建：

- **只给你自己这台 Mac 用：** `node scripts/build-on-a-mac.mjs --local`。签名，但不送 Apple 公证，
  所以不用等 Apple，也不需要公证配置。做出来的应用只能在构建它的这台 Mac 上打开。
- **给别人、给另一台 Mac 用：** `node scripts/build-on-a-mac.mjs`。签名并经过 Apple 公证。
  只有这种能拿到别的 Mac 上安装。

## 1. 先安装这些

1. **Apple 的命令行工具。** 在“终端”里运行 `xcode-select --install`，在弹出的窗口里点“安装”。
2. **Node 22（22.18 或更新）。** 从 nodejs.org/dist/latest-v22.x 下载最新的 Node 22 安装包（.pkg 文件）并安装。
   不要下载首页上的 LTS 版：它已经不是 Node 22 了，构建脚本会拒绝它。不要用通过 Rosetta 运行的版本。
3. **git。** 第 1 步装好后就有了。
4. **你的 “Developer ID Application” 证书。** 它必须在这台 Mac 的钥匙串里，并且带着私钥。
   如果没有，就在 Xcode 里创建：设置 › 帐户，选中你的 Apple ID，点“管理证书”，点 +，
   选 “Developer ID Application”。钥匙串里只能有一张这种证书。
5. **公证配置 mole-office-notary（只有完整构建需要，`--local` 不需要）。** 先在 account.apple.com（登录与安全 › App 专用密码）
   生成一个 App 专用密码，再运行：

   ```
   xcrun notarytool store-credentials mole-office-notary --apple-id 你的AppleID邮箱 --team-id 你的团队ID
   ```

   它会自己向你要这个密码，并存进钥匙串。构建脚本看不到这个密码。

## 2. 那一条命令

把仓库克隆到这台 Mac 上，进入这个文件夹，然后运行其中一条：

```
node scripts/build-on-a-mac.mjs --local
```

只给你自己这台 Mac 用。不公证，不等 Apple。

```
node scripts/build-on-a-mac.mjs
```

给别人、给另一台 Mac 用。签名并公证，要等 Apple。

## 3. 你会看到什么

- **缺了什么，它会立刻停下。** 它用英文和中文各说一遍缺的是哪一样、怎样补上，
  最后一句是“什么都没有做”。补上以后再运行同一条命令。
- **一切齐全时**，第一行说它用这台 Mac 上的 Developer ID Application 证书签名，
  不打印证书的名字。完整构建还会说用 mole-office-notary 公证；`--local` 会说跳过公证、
  装订（staple）和 Gatekeeper 检查。
  接着依次是安装依赖包、安装 Electron 运行环境、安装隐私测试用来打开页面的浏览器（Playwright 的 Chromium）、
  构建页面、制作并签名应用。浏览器装在克隆的文件夹里，不装进你的个人文件夹。
- **然后它再做第二个应用。** 它和第一个是同一个应用，只是里面带着办公地图。办公地图是一个插件，
  只读取办公室，不做任何更改；装好后是关着的，要在 设置 › 工具 › 插件 里打开。
  它放在第二个应用里，是因为签好名的应用里再加文件，签名就坏了。
- **钥匙串可能会弹窗**，问 codesign 能不能使用你的私钥。输入这台 Mac 的登录密码，
  点“始终允许”。这是 macOS 自己的窗口，脚本不会读到这个密码。
- **完整构建时，公证要等一段时间**，两个应用和两个 dmg 各等一次，一共四次，长短由 Apple 决定。
  这段时间屏幕上没有新内容是正常的。
  `--local` 没有这一步。
- 如果 Apple 拒绝公证，它会停下，并把 Apple 说的原因打印出来。
- **完整构建成功时**，每个应用做完都会说 Gatekeeper 接受了应用和 dmg，然后是下面这一行。
  所以这一行会出现两次，第二次是带办公地图的应用：

  ```
  dmg 和 zip 在这个文件夹里：……/dist/mac
  ```

- **`--local` 成功时**，每个应用做完都同样说 dmg 和 zip 在哪个文件夹里，最后一行是下面这句，
  也出现两次：

  ```
  本机构建：仅供这台 Mac 使用。未经 Apple 公证，在另一台 Mac 上会被阻止打开。
  ```

## 4. 文件在哪里

在你克隆的文件夹里的 `dist/mac` 下，有四个文件：

- `mole-office-版本号-arm64.dmg`：用来安装，不带办公地图；
- `mole-office-版本号-arm64.zip`：同一个应用的另一种打包方式；
- `mole-office-版本号-arm64-with-the-map.dmg`：用来安装，带办公地图；
- `mole-office-版本号-arm64-with-the-map.zip`：带办公地图的应用的另一种打包方式。

`--local` 做出的文件名多一个 `-local`：`mole-office-版本号-arm64-local.dmg`、
`mole-office-版本号-arm64-local.zip`、`mole-office-版本号-arm64-with-the-map-local.dmg` 和
`mole-office-版本号-arm64-with-the-map-local.zip`。所以两种构建的文件不会互相覆盖，也一眼能看出哪个没有公证。

如果构建中途失败，它会删掉做了一半的文件，不会留下一个没签好的 dmg。
如果是带办公地图的第二个应用失败了，第一个应用的 dmg 和 zip 已经做好并签了名，会留在 `dist/mac` 里。
这时屏幕会说：不带办公地图的应用已经做好并签了名，它的 dmg 和 zip 在 `dist/mac` 里；带办公地图的应用没有做。

## 5. 在第二台 Mac 上试装

第二台也必须是 Apple 芯片的 Mac。要用**完整构建**做出的 dmg（文件名里没有 `-local`）。
`--local` 做出的应用没有公证，在另一台 Mac 上会被 macOS 阻止打开。

1. 用隔空投送或 U 盘把 dmg 拷过去。
2. 双击打开 dmg，把 Mole Office 拖到“应用程序”文件夹里。
3. 在“应用程序”里打开 Mole Office。macOS 会问一次“这是从互联网下载的应用，确定要打开吗”，
   点“打开”。如果它说应用已损坏或无法验证开发者，说明签名或公证有问题，请把这句话原样告诉我们。
4. 菜单栏里会出现 Mole Office 的图标。点它会出现一个菜单，选“打开 Mole Office”就会打开窗口。
   点程序坞里的图标也会打开窗口。
5. 想开机就启动：在菜单栏的 Mole Office 菜单里勾选“登录时打开”。
   之后在 系统设置 › 通用 › 登录项 里也能看到它。

也可以用 zip：双击解压，把 Mole Office 拖进“应用程序”，后面的步骤相同。
