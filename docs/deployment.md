# 部署与运行

本项目是一个**单文件 HTML5 Canvas 游戏**：游戏的全部内容（HTML + CSS + JavaScript）都在 `index.html` 里，**零运行时依赖**，不需要构建、打包或安装任何包。`src/logic.js` 仅用于把核心纯逻辑抽出来供单元测试覆盖，浏览器游玩时并不依赖它。

## 运行游戏

### 方式一：直接打开（最简单）

用任意现代浏览器（Chrome / Edge / Firefox / Safari）直接打开 `index.html` 即可游玩：

- 双击 `index.html`，或
- 把 `index.html` 拖进浏览器窗口，或
- 在浏览器地址栏输入文件路径（`file://...`）。

无需联网、无需服务器、无需安装任何东西。

### 方式二：本地静态服务器（推荐）

个别浏览器对 `file://` 协议有安全限制（例如 localStorage、音频上下文在某些设置下表现不同）。为了行为最稳定，可在项目目录起一个本地静态服务器：

```bash
# Python 3
python3 -m http.server 8000
# 然后浏览器访问 http://localhost:8000
```

或使用其它任意静态服务器，例如：

```bash
npx serve .
```

> 提示：浏览器要求用户先有一次交互（点击 / 按键）才允许播放声音。首次操作（按方向键、点击屏幕、回车开始）会自动恢复音频上下文，因此一开始没声音是正常的。

## 运行测试

游戏的核心纯逻辑（碰撞、连击倍率、火力钳制、难度曲线、帧率归一化、最高分容错）被抽到 `src/logic.js`，由 `tests/logic.test.js` 覆盖。测试使用 **Node 内置的 test runner**（`node --test`）和 `node:assert`，**不依赖任何第三方库**，因此无需 `npm install`。

在项目目录执行：

```bash
node --test
```

`node --test` 会自动发现并运行 `tests/` 下的测试文件。预期全部用例通过（当前共 33 个）：

```
# tests 33
# pass 33
# fail 0
```

### 运行时版本要求

| 用途 | 要求 |
| --- | --- |
| 游玩游戏 | 任意现代浏览器，**无需 Node** |
| 运行测试 | **Node.js ≥ 18**（`node --test` 内置 test runner 在 18 起稳定可用） |
| CI 实际使用 | Node.js **22**（见 `.github/workflows/ci.yml`） |

> 说明：浏览器侧不需要 Node；Node 仅用于跑单元测试。本地若已装 Node 18 及以上即可执行 `node --test`，CI 上固定使用 Node 22。

## 持续集成（CI）

仓库在 `.github/workflows/ci.yml` 配置了 GitHub Actions：

- 触发时机：向任意分支提 **Pull Request**，以及 **push 到 `main`**。
- 环境：`ubuntu-latest` + Node.js 22。
- 步骤：检出代码 → 安装 Node → 执行 `node --test`。

因为是单文件 HTML 游戏，CI **不做容器化 / Docker 构建**，只对抽出的核心纯逻辑跑单测，保证回归保护的同时保持轻量。

## 部署到静态托管

由于全部内容都在 `index.html`，部署等同于托管静态文件，把仓库内容（至少 `index.html`）放到任意静态托管即可：

- **GitHub Pages**：开启 Pages，指向仓库根目录，访问对应 `index.html`。
- **Netlify / Vercel / Cloudflare Pages**：无需构建命令，发布目录设为仓库根目录。
- **任意对象存储 / Nginx**：把 `index.html` 作为静态资源提供即可。

无需任何构建步骤或环境变量。
