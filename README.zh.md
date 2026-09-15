# dsh-font

[English](README.md) | 中文

在设置里自定义 DeepSeek Harness **Web 界面字体**：界面字体、代码字体，以及三条互相独立的字号轴。

这是一个第三方 [dsh](https://github.com/deepseek-ai/deepseek-harness) profile bundle（插件包）。它是一个「双面」包：Node 半边负责持久化的设置命名空间与首屏绘制前的样式注入，浏览器半边负责实际绘制并注册设置项。

需要 dsh `0.1.5-rc.1` 或更新的 `0.1.5-rc.x`；它用到 `settings.general.item` 插槽、`settingsScope` 服务以及 `ctx.theme.overrideTokens`，这些在 `latest` 与 `next` 两条发布通道里都已具备。

## 功能

在 *设置 → 通用* 中新增一个 **字体** 行，包含五个控件：

| 控件 | 作用 | 范围 |
| --- | --- | --- |
| 界面字体 | `--dsw-font-family`，所有非代码的界面文字 | 任意 CSS `font-family` 列表 |
| 代码字体 | `--ds-font-family-code`，代码块、行内代码、等宽文本 | 任意 CSS `font-family` 列表 |
| 界面字号 | 按比例缩放所有写死的界面文字尺寸 | 75% – 150%，步进 5% |
| 会话正文字号 | 消息正文、标题与表格 | 12 – 20 px |
| 代码字号 | 代码块与行内代码 | 10 – 20 px |

两个字体输入框都支持自由填写，并提供一键预设。所有取值都通过宿主设置文档持久化（`$DSH_HOME/settings.yaml`，命名空间 `ui-font`），因此重启后依然生效，并且对指向同一台宿主的所有浏览器共享。

*界面字号* 与 *会话正文字号* 刻意设计成两条独立的轴：放大界面可以让周围的控件更好读，而不改变屏幕上能显示多少正文；反过来也一样。

## 安装

```sh
dsh plugin --profile web add @citisen/dsh-font
```

直接从 GitHub 安装（同一个包，不走 registry）：

```sh
dsh plugin --profile web add github:citisen/dsh-font
```

然后重启 Web 界面：

```sh
dsh --profile web
```

`dsh plugin` 会在 profile 目录里转发给 pnpm，然后对 `dsh.profile.bundles` 做一次对账：由于本包声明了 `dsh.bundle`，安装时会自动把它追加为一个 profile 层，无需手工修改 `cordis.patch.yml`。

这两条路径都在全新 profile 上实测过：这一行会进入最终 entry 列表，浏览器 roster 也能解析到客户端 bundle。装完后可以用 `node scripts/verify-profile.mjs <profile>` 自己确认。

### 从本地目录安装

在 Windows 上，如果 profile 和代码目录位于**不同盘符**，`dsh plugin --profile web add <路径>` 不可靠——pnpm 会把跨盘符的目录链接解析成一个不存在的路径，随后对账会认为该包没有声明 `dsh.bundle`，于是不把它写进 `bundles`。这时请自己建立链接：

```sh
cd "$DSH_HOME/profiles/web"
pnpm add "D:/path/to/dsh-font"          # 写入依赖
# pnpm 建立的链接指向 <profile>/D:/path/to/dsh-font，该路径不存在，需要修复：
cmd /c rmdir node_modules\dsh-font
cmd /c mklink /J node_modules\dsh-font D:\path\to\dsh-font
# 再手工把 "dsh-font" 加进 package.json 的 dsh.profile.bundles
```

用 `node scripts/verify-profile.mjs` 校验结果；只要这一行没进最终的 entry 列表，它就会直接报错。

## 实现原理

修改代码前请先读这一节；两个半边解决的是不同的问题，这个划分是有意的。

### 为什么字体族走 theme 服务

设计系统只在 `:root` 声明了这两个字体变量：

```css
:root{--dsw-font-family:…;--ds-font-family-code:…}
```

界面上几乎所有排版 token 都经由 `var(--dsw-font-family)` 解析（`--dsw-font-base-16`、`--dsw-font-xs-13`、整条 Markdown 字号阶梯……），shell 自己的 `body` 规则也读取它，所以覆盖这两个变量就等于重新指向整个界面。

但最直观的写法——在 `documentElement` 上设自定义属性——活不下来。`ui-layout` 的 `ThemePresenter` 掌管 `document.body.style`，每次主题变化时它会把**所有不是自己写的自定义属性删掉**，再重新写入当前 token 集合。外部设置的属性会在用户第一次切换浅色/深色时消失。

所以浏览器半边把字体叠加到 theme 上：

```js
ctx.theme.overrideTokens('dsh-font', {
  '--dsw-font-family': { light: uiFontFamily, dark: uiFontFamily },
  '--ds-font-family-code': { light: codeFontFamily, dark: codeFontFamily },
})
```

这个覆盖层会被折进当前快照，presenter 随后会把它写出去，并在每次调色板变化时继续写。`{ light, dark }` 这一对是强制的：`overrideTokens` 对裸字符串会抛出带解释的错误，因为单一取值在另一套调色板下会不可读。

### 为什么字号走样式表

设计系统里**没有**界面字号变量。每个组件都写死 11、12、13、14、16、20、24 px 之一，而 `--dsw-font-*` 是一套固定阶梯（`--dsw-font-xs-13` 就是 13px，没有变量可调）。代码字号同样烘焙在复合 token 里。

因此插件为每个内置尺寸生成一个工具类：

```css
.dsh-font-size-14{font-size:calc(14px * var(--dsh-font-ui-scale,1)) !important}
```

并把对应的类逐个盖章到元素上——在元素还没有盖章时用 `getComputedStyle` 量出它的内置尺寸。`MutationObserver` 会在界面挂载新节点时补盖。

之所以逐元素盖章而不是用通配规则，正是为了让两条字号轴互不影响：`html body *` 这种覆盖会继承进会话区域并与正文字号复合叠加，而且还会改掉那些本来不该缩放的装饰性尺寸（文件类型图标里内嵌的 SVG 文字标签）。逐元素测量还意味着插件不需要知道任何组件的类名，因此能扛住界面重构。

### 正文字号写在哪里

`--dsh-content-font-size` 是写在 `body` 上的**内联**自定义属性，由 `ui-layout` 依据兄弟命名空间 `ui-theme` 写入（它自己的设置项提供 12–17 px）。内联声明无论有没有 `!important` 都压过样式表，所以插件把取值写到完全相同的位置：

```js
document.body.style.setProperty('--dsh-content-font-size', `${contentSize}px`)
```

样式表随后以这个值为基准，用绝对 px 重新推导整条 Markdown 字号阶梯。变量仍然归 `ui-theme` 所有，它每次主题变化仍会写自己的值；插件在每次设置变化时重新写入自己的值。设置项的说明文字会告诉用户：这里的取值会盖过「外观」里的「字号大小」。

### 首屏绘制前

Node 半边响应 `webserver/index-inject`，注入一段内联 `<script>`，在 shell 挂载之前就装好样式表并设好两个字体变量，因此第一帧就已经是用户的字体。它在渲染时读取同一个 `ui-font` 设置段；当设置服务缺失时回退到 schema 默认值。

## 开发

```sh
npm run build     # src/client.js -> lib/client.js
npm run check     # 发布闸门：产物同步 + host/client 校验
npm run check:all # 再加上 profile 组合校验（需要本机有 dsh）
npm run verify    # 只跑校验脚本
npm run watch     # 保存即重建，配合 dsh-client-hmr
```

浏览器半边的唯一真源是 `src/client.js`。它为了可读性写成 ES module，但 DSH 的客户端 bundle 是**传统脚本（classic script）**，只允许通过 `window.__ModuleLoader__` 注册一个惰性 CommonJS 工厂——因此 `scripts/build-client.mjs` 负责套上这层外壳，并把静态 import 改写成 `require` 调用。这个转换刻意做得很窄，遇到无法改写的写法会直接让构建失败，因为没有打包器能替你发现问题。

浏览器半边只允许请求 shell 注入模块表的那九个模块（`react`、`react/jsx-runtime`、`react-dom`、`react-dom/client`、`@deepseek-ai/cordis`、`@deepseek-ai/dsh-client-store`、`@deepseek-ai/dsh-client-ui-slots`、`@deepseek-ai/dsh-client-ui-primitives`、`@deepseek-ai/dsh-client-ui-dockkit`）；其它模块必须写进 `dsh.client.external` 并作为独立的图节点发布。构建会强制检查这一点。

`verify-profile.mjs` 需要本机有 dsh 安装和已初始化的 profile，所以在两者都不存在时会**跳过**（exit 0）——干净的 CI runner 上没有 dsh。设 `DSH_REQUIRE=1` 可以把「跳过」变成失败。

要在运行中的宿主上迭代浏览器半边，开一个 watcher，让 `dsh-client-hmr` 热替换插件——它每 500 ms 轮询一次客户端 bundle，因此保存后的重建无需刷新页面即可生效：

```sh
# 终端 1
npm run watch

# 终端 2
dsh --profile web
```

刷新页面总能拿到新组合的图，所以 watcher 只是便利，不是必需。

### 发布

发布**只**由 GitHub Actions 通过 npm trusted publishing 完成；本仓库里没有 `NPM_TOKEN`，也不应该出现。一次性配置、这套机制能防什么与不能防什么、以及发布步骤都写在 [PUBLISHING.md](PUBLISHING.md)。

## 包结构

| 路径 | 作用 |
| --- | --- |
| `lib/index.js` | Node 半边：设置命名空间、首屏绘制前的注入。由 loader 加载。 |
| `lib/client.js` | 浏览器半边，**由 `src/client.js` 生成**。由 `/plugins/@citisen/dsh-font/client.js` 提供。 |
| `src/client.js` | 浏览器半边源码。 |
| `cordis.patch.yml` | 本 bundle 贡献的 profile 层。 |
| `scripts/` | 构建与校验脚本。 |
| `.github/workflows/publish.yml` | 唯一的发布路径。 |
| `PUBLISHING.md` | 发布与 trusted publishing 配置。 |
| `package.json` | 声明 `dsh.bundle`（profile 层）与 `dsh.client`（浏览器节点）。 |

## 已知限制

- **只处理写死的尺寸。** 界面缩放只作用于样式表里以 px 写死的文字，刻意不动展示级大字号和装饰性字形尺寸，因此 150% 并不等于整个界面的等比 1.5 倍。
- **正文字号会盖过 `ui-theme` 的字号设置项。** 两者都写 `--dsh-content-font-size`，后写者生效，而本插件在设置变化时总会写。请只用其中一个。
- **字体不会被安装。** 只有浏览器或操作系统能解析到的字体名才会生效；插件不打包也不下载 webfont，因此写错名字只会静默回退到列表末尾的通用字体。
- **逐元素盖章的开销与 DOM 规模成正比。** 缩放扫描对每个元素只测量一次并缓存结果，之后按 DOM 变化增量盖章，因此开销有界——但在超长会话里并非免费。
- **设置项只有中英两种文案**，与官方内置的语言对一致。

## 许可证

MIT
