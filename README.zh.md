# dsh-font

[English](README.md) | 中文

## dsh 起不来怎么办

你正在看的报错就是这三行 ——

    Failed to load plugins
    web boot: 3 entries did not activate
    @citisen/dsh-font: pending (waiting for service: settingsScope)

「启用的条目却始终不激活」在 dsh 里算**启动失败**而不是警告：它会拒绝完成启动，而不是少个插件
照常起来。三条出路，从快到慢，**三条都在 dsh 起不来的情况下可用**。本插件在 profile 里的行是
`id: ui-font`，对应 `name: '@citisen/dsh-font'`。

**1. 禁用它 —— 在 profile 自己的补丁层里加一条**
（`$DSH_HOME/profiles/web/cordis.patch.yml`，这一层在所有 bundle 层之后应用）：

    - id: ui-font
      disabled: true

不用敲命令、不用联网、不用装东西；删掉这两行它就回来了。`dsh --profile web --dump-config`
会打印组装后的树 —— 每个行的 id 和包名，不管它属于谁 —— 补丁生效时这一行会带
`disabled: true`；它不加载任何插件，所以 dsh 起不来时也能用。

**2. 只影响这一次启动，什么都不改** —— 把同样两行写进你自己的文件，当叠加层传进去：

    dsh --profile web --patch ./no-font.yml web

**3. 卸载它** —— 一条命令同时摘掉依赖和 bundle 层（`dsh.profile.bundles` 会按已安装状态自动
对齐）。它只是转发给 profile 目录里的 pnpm，不组装 profile，所以 dsh 起不来时也能跑：

    dsh plugin --profile web remove @citisen/dsh-font

需要 `PATH` 上有 `pnpm`。没有的话，就手工从 `$DSH_HOME/profiles/web/package.json` 的
`dsh.profile.bundles`（以及对应的 `dependencies`）里删掉包名。

**或者先要一个能用的 dsh**：用官方模板起一个干净的 profile，它不带你装的任何 bundle：

    dsh --profile rescue --from-default-profile web

## 兼容性

本构建在两条 dsh 线上都能跑：**0.1.5-rc.x** 系列（也就是当前的 `latest` 和 `next`），以及
**0.1.7-alpha.1** —— 后者的设置模型它同样会说。两条线上，这份插件的 section 都叫同一个名字
`ui-font`：0.1.7 线按 Loader 条目 id 定位设置，而本 bundle 的补丁正是以这个名字插入条目；
0.1.5 线则把同一个名字注册为设置命名空间。

| 它读什么 | 0.1.5-rc.x | 0.1.7-alpha.1 |
| --- | --- | --- |
| 那份持久 section | `settingsScope.bind({ namespace: 'ui-font' })` | `configForms.get('ui-font')`，读条目自己的 `Config` |
| 宿主契约 | `settings.register('ui-font', schema)` | 导出的 `Config`，字段标记为 `.volatile()` |

两者都是**可选绑定**，所以两条服务都不提供的 dsh 也照样激活：插件不会一直 `pending`（那会直接
阻断启动），也不会在激活时抛错。它按出厂默认值工作，而你在设置行上第一次动开关时，它会告诉你为
什么存不下来。`0.2.2` 及更早的版本要求 0.1.5 那条服务，所以在 `0.1.7-alpha.1`
上被报成「未激活」的条目；`0.2.3` 两条线都会说。

### 0.1.7 改名时丢掉的设置

dsh 0.1.7 会把旧的 `$DSH_HOME/settings.yaml` 导入一次 —— 每个 section 写进同名条目 —— 并把文件
改名为 `settings.yaml.imported`。在 `0.2.3` 之前，本插件的条目叫 `font`，于是
`ui-font` 这个 section 无处可去，只留在改名后的文件里。现在名字对上了，dsh 自己的导入就能把
这些值放回去：

1. 把 `$DSH_HOME/settings.yaml.imported` **复制**成 `$DSH_HOME/settings.yaml`（是复制不是移动 ——
   导入跑之前，那个文件是唯一的记录），并且只保留条目现在仍然声明的键：dsh 会用条目自己的 schema
   校验这个 section，只要有一个不认识的键就整段拒绝，所以上面表格没列出的键都要删掉。
2. 用你平时用的 profile 启动一次 dsh 0.1.7。凡是现在有条目对应的 section —— 包括
   `ui-font` —— 都会写进那个 profile 的 Cordis patch。
3. dsh 仍然不认的 section 会被报告出来，并继续留在 `settings.yaml.imported` 里；所以**在你把需要
   的东西取出来之前，别删那个文件**。

在设置里自定义 DeepSeek Harness **Web 界面字体**：界面字体与代码字体两条字体栈（各带自己的字重），以及三条互相独立的字号轴。

这是一个第三方 [dsh](https://github.com/deepseek-ai/deepseek-harness) profile bundle（插件包）。它是一个「双面」包：Node 半边负责持久化的设置命名空间与首屏绘制前的样式注入，浏览器半边负责实际绘制并注册设置项。

需要 dsh `0.1.5-rc.1` 或更新的 `0.1.5-rc.x`；它用到 `settings.general.item` 插槽、`settingsScope` 服务以及 `ctx.theme.overrideTokens`，这些在 `latest` 与 `next` 两条发布通道里都已具备。

## 功能

在 *设置 → 通用* 中新增一个 **字体** 行，包含五项：两个字体查询加三条字号轴。

| 字段 | 作用 | 取值 |
| --- | --- | --- |
| 界面字体 | `--dsw-font-family`，所有非代码的界面文字 | 字体查询：字体族，可带字重 |
| 代码字体 | `--ds-font-family-code`，代码块、行内代码、等宽文本 | 字体查询 |
| 界面字号 | 按比例缩放所有写死的界面文字尺寸 | 75% – 150%，步进 5% |
| 会话正文字号 | 消息正文、标题与表格 | 12 – 20 px |
| 代码字号 | 代码块与行内代码 | 10 – 20 px |

两个字体框都是**一门小型字体查询语言的编辑器**，而不是普通输入框：整条字体栈就是一段可以逐字编辑的文本，带语法高亮、自动换行，以及一份来自本机实际字体的补全列表。字重写在查询**里面**、紧挨着它所属的字体族，所以换字体和换字重是同一处的同一次编辑：

```
Geist Mono medium, "Zhuque Fangsong (technical preview)", monospace
└─────┬────┘ └──┬─┘
    字体族      字重
```

- **顺序就是文本的顺序。** 浏览器能解析到的第一个字体族生效，排序靠编辑文本完成：剪切粘贴，或把光标放进某个词条按 <kbd>Alt</kbd>+<kbd>↑</kbd>/<kbd>↓</kbd>。没有需要拖动的胶囊了。
- **这段文字归你。** 插件不会改写它：不加引号、不重排、不整理，也不会把清空的框重新填满。新字体就落在光标处——因为你是在那里打的字；把某个字体放到最前面，要么自己敲 `Inter, `，要么在词条开头从补全列表里选。
- **列表认识你机器上的字体。** 它补全字体族、通用族，以及某个字体族**实际拥有**的字重（从它的字面读取）。本机字体读取不可用或被拒绝时，会退回"探测到的常用字体"名单，并在行上方说明一次；任何名字始终可以手写，目录从不自称完整。
- **输入框永远是同一个等宽字体。** 高亮层和真正的 textarea 共用一个盒子，而 textarea 没法给不同的字符串设不同字体，所以这个框统一使用一套系统等宽字体、字重固定 400、并关闭连字与字距调整——无论查询里写的是什么字体。带连字的字体（Fira Code 的 `->`）会在高亮层画成一个字形、在输入框里画成两个，合成字重也会两边不一致。框下那行读数用的是这条轴自己的字体，所以你选的字体在那里仍然看得见。
- **设置跟着每一次按键走。** 文字归编辑器自己所有，所以没有"提交"这一步：查询边打边解析、边写入，框下的读数也随之更新。<kbd>Tab</kbd>（或点击）才会接受高亮的那条补全——那是唯一会替换文本的情况，因为"选中一条建议"本身就是这个意思。<kbd>Enter</kbd> 同样会接受高亮的补全，除此之外绝不改动文本。
- **写错只标出来，不改。** 本机没有的字体族、字体族没有的字面、没闭合的引号、多出来的词，都会在框下分别以警告色或错误色标出，文本保持你写的样子。空输入框**什么都不写**并说明这一点：已保存的字体栈仍在生效，要回到出厂值按「恢复默认」。

所有取值都通过宿主设置文档持久化（`$DSH_HOME/settings.yaml`，命名空间 `ui-font`），因此重启后依然生效，并且对指向同一台宿主的所有浏览器共享。

*界面字号* 与 *会话正文字号* 刻意设计成两条独立的轴：放大界面可以让周围的控件更好读，而不改变屏幕上能显示多少正文；反过来也一样。

### 如何选字重：`Geist Mono medium`

CSS 没法把字重写进 `font-family` —— `font-family: "Geist Mono" 500, monospace` 本身就是非法声明，整条字体栈会被丢弃。所以这门查询语言把字重写成一个词，紧跟在它所属的字体族后面，插件再把这一对还原成真正生效的两条声明：

```
Geist Mono medium, monospace   →   font-family: "Geist Mono", monospace
                               →   font-weight: 500
```

`Thin`、`ExtraLight`、`Light`、`Book`、`Regular`、`Medium`、`SemiBold`、`Bold`、`ExtraBold`、`Black` 以及常见别名（`Hairline`、`DemiBold`、`UltraBold` 等）都能识别，大小写不敏感。字重属于整条轴而不是某一个字体族，所以写在哪里都算数，但只算一次；规范形式把它写在第一个字体族（也就是生效的那个）后面。

**出厂字重是隐含的**：某条轴停在出厂的 400 时，文本里不会出现任何字重词——每个字体族后面都跟一个 `regular` 是谁也没要求的噪音，而对界面轴来说 400 本来就等于"不做覆盖"。只有真正选了字重，这个词才会出现；把它删掉就回到 400。这条轴当前到底是多少，永远写在输入框下面那一行（`界面字重: 常规 400（出厂值，未覆盖）`），所以省掉那个词并没有藏起任何信息。

字重是一个封闭列表而不是任意数字：所选字体族没有的字重会被浏览器**合成**（伪粗体），把伪粗体当成正常选项提供，比不提供更糟。在能读到字面的机器上（Local Font Access API 会报告每个字面），补全列表只给**这个字体族真正拥有**的字重，缺哪个会在框下点出来：

> Geist Mono 在本机没有 700 这个字面（bold），浏览器会合成

把字重词删掉不会悄悄重置任何东西：这条轴保持它被设成的值，输入框下面那行会写出来；等下次行组件按存储值重建时，那个词也会回来。要回到出厂字重，从列表里选它那一档（`常规 400`）——选中是一条指令，所以即使它的文本只是字体族名，也会把值设成 400。

有一处刻意的例外：如果你输入的内容本身就是本机上的字体族，末尾那个词会被当成名字的一部分。`Book Antiqua`、`Franklin Gothic Medium` 都是真实存在的字体族，把它们当成"字体族 + 字重"处理会静默改错。代价是：真正两者皆是的名字（真有一个字体族叫 `Geist Mono Medium`）也会被当作名字。判断依据就是补全列表给出的那份字体目录。想明确表达"这就是名字"，加引号即可：`"Book Antiqua"` 永远是名字本身。

### 界面字重是可选覆盖

代码区域没有需要保留的字重层级，所以它的字重就是查询里写的那个数。界面有：标题 700、表头 500、正文 400。因此设置界面字重时，基准值会带着标题阶梯一起移动，每一级保持它与 400 的出厂间距，而不是被压平：

```css
/* --dsh-font-ui-weight: 500 */
html body { font-weight: 500 }
--dsh-font-markdown-base: 500 …          /* 正文 */
--dsh-font-markdown-h1: 800 …            /* 700 + (500 - 400) */
--dsh-font-markdown-table-head: 600 …    /* 500 + (500 - 400) */
```

会跟着变的是**继承**字重的那部分文字；设计系统自己写死字重的标签、按钮不受影响，因为它们自己的规则仍然胜出。而出厂的 400 **不产生任何规则**，所以未改动的安装画出来的就是设计系统原本的样子。

### 这门查询语言

```
query  := entry ("," entry)*
entry  := family | weight
family := '"' … '"' | "'" … "'" | word (space word)*
weight := thin | extralight | light | book | regular | roman | medium |
          demibold | semibold | bold | extrabold | black | heavy | …
```

语法就是 CSS `font-family` 列表，加上列表本身装不下的那一样东西。只有**未加引号**词条的**最后一个**词可能是字重，而且整个词条本身不是已收录的字体族时才成立。单独一个 `medium` 也表示"只设字重、不改字体族"。引号里的逗号不是分隔符，所以 `"Foo, Bar"` 是一个字体族。

解析器刻意宽容——这段文字是人手敲的，不是生成的——凡是放不下的东西都按原样保留并在框下报告，而不是悄悄丢掉：没闭合的引号、引号后面多出来的词、写了两次的字重、本机目录里没有的字体族、这个字体族没有的字面。框下同时会写出当前**生效**的字体族，也就是浏览器真正能用上的第一个。

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

### 代码字重写在哪里

设计系统里**完全没有**字重 token——界面上每一处 `font:` 都是字面量，代码那条阶梯写死就是 `400`。所以字重没法像字体族那样搭在字体 token 上，它分两层生效：

```css
/* 三个代码 token 在各自的 font: 简写里带上它…… */
--dsw-font-markdown-code: var(--dsh-font-code-weight,400) var(--dsh-font-code-size,12px) / … ;

/* ……而直接用代码字体族写死的地方，按结构匹配 */
html body pre, html body code, html body [class*="code" i] {
  font-family: var(--ds-font-family-code) !important;
  font-weight: var(--dsh-font-code-weight,400) !important;
}
```

第二条规则的存在，是因为界面上大多数代码根本不读 token：工具 I/O 卡片和终端输出是在组件样式表里用 `font-family: var(--ds-font-family-code)` 加上自己的字面量字重写死的，除了覆盖元素本身没有别的地方可改。`!important` 正是为了压过 `font: 500 12px/18px …`。这条规则刻意**不是**通配规则：周围标签仍保留出厂的字重层级。

### 界面字重写在哪里

界面字重是**可选**的：出厂值 400 不产生任何规则，所以未改动的安装画出来的就是设计系统原本的样子。设成别的值时，插件做两件事：

```css
/* 会继承字重的界面文字整体移动…… */
html body { font-weight: 500 }

/* ……而插件自己已经接管的那条 Markdown 阶梯按出厂的相对差值整体平移 */
--dsh-font-markdown-base: 500 …
--dsh-font-markdown-h1: 800 …
--dsh-font-markdown-table-head: 600 …
```

第二条必须显式写出字重，因为 `font:` 简写里不带字重分量时会把 `font-weight` 重置成 `normal`——只写 `html body` 会被这条简写悄悄抵消。平移而不是压平，是为了让标题相对正文的粗细关系保持出厂的距离。

### 首屏绘制前

Node 半边响应 `webserver/index-inject`，注入一段内联 `<script>`，在 shell 挂载之前就装好样式表并设好字体族与字重变量，因此第一帧就已经是用户的字体。它在渲染时读取同一个 `ui-font` 设置段；当设置服务缺失时回退到 schema 默认值。

## 开发

```sh
npm run build     # src/client.js -> lib/client.js
npm run check     # 发布闸门：产物同步 + host/client 校验
npm run check:all # 再加上 profile 组合校验（需要本机有 dsh）
npm run verify    # 只跑校验脚本
npm run watch     # 保存即重建，配合 dsh-client-hmr
```

浏览器半边的唯一真源是 `src/client.js`。它为了可读性写成 ES module，但 DSH 的客户端 bundle 是**传统脚本（classic script）**，只允许通过 `window.__ModuleLoader__` 注册一个惰性 CommonJS 工厂——因此 `scripts/build-client.mjs` 负责套上这层外壳，并把静态 import 改写成 `require` 调用。这个转换刻意做得很窄，遇到无法改写的写法会直接让构建失败，因为没有打包器能替你发现问题。

浏览器半边只允许向 shell 索取它注入模块表的那九个模块（`react`、`react/jsx-runtime`、`react-dom`、`react-dom/client`、`@deepseek-ai/cordis`、`@deepseek-ai/dsh-client-store`、`@deepseek-ai/dsh-client-ui-slots`、`@deepseek-ai/dsh-client-ui-primitives`、`@deepseek-ai/dsh-client-ui-dockkit`）。其它依赖一律编译进 bundle：库走 `VENDORED` 映射，本插件自己的 `src/font-grammar.js` 走 `LOCAL_MODULES`——它被直接拼进 `src/client.js` 的作用域，因此两者共用同一份常量。另一条有文档的路子是 `dsh.client.external`，但它需要第二个客户端 bundle、第二个 roster 行，以及宿主的配合；而且宿主会静默忽略 supplier 不是活跃插件行的条目。构建会强制检查每个 specifier 走的是哪条路。

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

发布先由 GitHub Actions 通过 npm trusted publishing 完成**暂存（stage）**，再由维护者审批，因此本仓库里没有 `NPM_TOKEN`，也不应该出现。逐步流程见 [RELEASING.md](RELEASING.md)；一次性配置以及这套机制防不住什么见 [PUBLISHING.md](PUBLISHING.md)。

## 包结构

| 路径 | 作用 |
| --- | --- |
| `lib/index.js` | Node 半边：设置命名空间、首屏绘制前的注入。由 loader 加载。 |
| `lib/client.js` | 浏览器半边，**由 `src/client.js` 生成**。由 `/plugins/@citisen/dsh-font/client.js` 提供。 |
| `src/client.js` | 浏览器半边源码。 |
| `src/font-grammar.js` | 字体查询语法，作为一份 `@citisen/litearea` grammar。会被拼进 `src/client.js`。 |
| `cordis.patch.yml` | 本 bundle 贡献的 profile 层。 |
| `scripts/` | 构建与校验脚本。 |
| `.github/workflows/stage.yml` | 唯一发布路径的 CI 半边。 |
| `PUBLISHING.md` | trusted publishing 一次性配置，以及这套机制防不住什么。 |
| `RELEASING.md` | 改完代码之后怎么发布的完整流程。 |
| `package.json` | 声明 `dsh.bundle`（profile 层）与 `dsh.client`（浏览器节点）。 |

## 已知限制

- **只处理写死的尺寸。** 界面缩放只作用于样式表里以 px 写死的文字，刻意不动展示级大字号和装饰性字形尺寸，因此 150% 并不等于整个界面的等比 1.5 倍。
- **正文字号会盖过 `ui-theme` 的字号设置项。** 两者都写 `--dsh-content-font-size`，后写者生效，而本插件在设置变化时总会写。请只用其中一个。
- **字体不会被安装。** 只有浏览器或操作系统能解析到的字体名才会生效；插件不打包也不下载 webfont，因此写错名字只会静默回退到列表末尾的通用字体。
- **逐元素盖章的开销与 DOM 规模成正比。** 缩放扫描对每个元素只测量一次并缓存结果，之后按 DOM 变化增量盖章，因此开销有界——但在超长会话里并非免费。
- **代码字重不能按区域分别设置。** 它一次作用于所有代码区域，覆盖范围是 `pre`、`code` 以及类名里带 `code` 的元素——因此组件自己在代码块里设的字重（语法高亮、加粗的 diff 行）同样会被覆盖。界面字重同理，只是范围相反：只有会继承字重的那部分界面文字跟着变，设计系统写死字重的标签、按钮保持原样。字体族没有的字重浏览器仍会合成，封闭列表和"本机没有这个字面"的提示只是把它挡在选择之外。
- **查询语言是本插件自己的约定，不是 CSS。** 它只存在于这一行的两个字体框里，存储的仍然是合法的 CSS `font-family` 列表加上一个 `font-weight` 数字，所以关掉插件不会有残留。末尾的词算字重还是算名字的一部分，由已加载的字体目录决定，所以本身就以字重词结尾的真实字体族（`Book Antiqua`、`Franklin Gothic Medium`）只有在目录里确实列出了这一整名时才会保持原样——这两个词都在探测列表里，因此正常都能保住；而列表之外的同类名字在拒绝字体权限提示时可能被拆开，用引号可以明确表达"这是名字"。
- **界面字重的平移是固定公式，不是重新设计。** 标题按"出厂字重 +（界面字重 − 400）"平移并封顶在 900，所以界面字重设到 900 时所有阶梯都会撞到同一个上限。
- **输入框不等于设置值。** 存储的是插件对查询的序列化结果（加了引号、字重词落在生效字体族后面）；框里显示的是你的文本，只要这一行还在就原样保留。重新加载页面时会用两个存储值重建输入框，所以你删掉的字重词可能又出现，拼写也可能和你写的不一样。
- **设置项只有中英两种文案**，与官方内置的语言对一致。

## 许可证

MIT
