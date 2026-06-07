# 🏆 2026世界杯 AI预言家对决

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

5大AI同台竞技，预测2026世界杯每场比赛！**Claude 🆚 GPT 🆚 Gemini 🆚 DeepSeek 🆚 豆包** — 谁才是真·预言帝？

![5 AI Battle](https://img.shields.io/badge/AIs-5-brightgreen) ![World Cup 2026](https://img.shields.io/badge/World_Cup-2026-gold)

> 🌍 2026年6月11日 - 7月19日 | 美国·加拿大·墨西哥 | 48支球队 | 104场比赛

---

## ✨ 特性

- 🔮 **5大AI真实对决** — 每个AI使用各自的API（非模拟），真正的跨模型对比
- 📊 **七维度分析** — 战术博弈、关键对位、体能储备、心理层面、天气影响、裁判因素、X因素
- 👑 **冠军预测** — 综合战绩、阵容、主场优势等8个维度
- 🏆 **实时排行榜** — 胜负准确率、比分命中率、冷门捕捉、五维雷达图
- ⚡ **按需配置** — 配几个AI用几个，不强制全部
- 🎨 **亮/暗主题** — 跟随系统自动切换，手动可覆盖
- 📦 **零数据库** — JSON文件存储，Node.js单文件后端

---

## 🚀 快速开始

### 前提条件

- [Node.js](https://nodejs.org) >= 18.x（下载LTS版本）

### 安装运行

```bash
# 1. 克隆项目
git clone https://github.com/你的用户名/worldcup-ai-predictor.git
cd worldcup-ai-predictor

# 2. 安装依赖
npm install

# 3. 启动
npm start
```

Windows用户也可以直接双击 `start.bat`（自动安装依赖+打开浏览器）。

浏览器打开 `http://localhost:3000` 🎉

> 💡 **不配任何 API Key 也能用！** 可以浏览赛程、查看积分榜、录入比分。只有 AI 预测功能需要 Key。

---

## 🤖 配置 AI 预测

```bash
cp .env.example .env    # 创建配置文件
```

编辑 `.env`，填入你要用的 API Key（配几个用几个）：

### 🧠 Claude（Anthropic）
```env
ANTHROPIC_API_KEY=sk-ant-你的key
```
👉 [申请地址](https://console.anthropic.com) | 默认模型：`claude-sonnet-4-6`

### 🤖 GPT（OpenAI）
```env
OPENAI_API_KEY=sk-你的key
```
👉 [申请地址](https://platform.openai.com/api-keys) | 默认模型：`gpt-4.1`

### 💎 Gemini（Google）
```env
GEMINI_API_KEY=AIza-你的key
```
👉 [申请地址](https://aistudio.google.com/apikey) | 默认模型：`gemini-2.5-flash`

### 🔍 DeepSeek
```env
DEEPSEEK_API_KEY=sk-你的key
```
👉 [申请地址](https://platform.deepseek.com) | 默认模型：`deepseek-chat`

### 🫘 豆包（ByteDance 火山引擎）
```env
DOUBAO_API_KEY=你的key
```
👉 [申请地址](https://console.volcengine.com/ark) | 默认模型：`doubao-1.5-pro-32k`

配置完后重启服务器，页面上的 AI 按钮会自动亮起。

---

## ⚙️ 进阶配置

### 自定义模型

```env
CLAUDE_MODEL=claude-opus-4-8
GPT_MODEL=gpt-4.1
GEMINI_MODEL=gemini-2.5-pro
DEEPSEEK_MODEL=deepseek-reasoner
DOUBAO_MODEL=doubao-1.5-pro-256k
```

### 自定义 API 地址（代理/中转）

```env
DEEPSEEK_BASE_URL=https://your-proxy.com/v1
DOUBAO_BASE_URL=https://your-proxy.com/v1
```

### 修改端口

```env
PORT=8080
```

---

## 📖 使用指南

### 三个 Tab 页

| Tab | 功能 |
|---|---|
| 🏟 **赛事看板** | 浏览赛程、筛选阶段/小组、录入比分、查看积分榜 |
| 🤖 **AI预测对决** | 选比赛→点AI→看预测结果、比分+维度分析+AI共识 |
| 🏆 **排行榜** | 准确率排名、雷达图、柱状图、分阶段统计 |

### 比赛流程

1. 比赛开始前 → 触发 AI 预测
2. 比赛结束后 → 在赛事看板录入比分
3. 系统自动回测 → 排行榜更新

---

## 📁 项目结构

```
worldcup-ai-predictor/
├── server.js           # 后端（5个AI各自API）
├── package.json
├── .env.example        # 配置模板
├── .gitignore
├── start.bat           # Windows一键启动
├── 使用说明.txt         # 详细中文使用说明
├── README.md
├── public/
│   └── index.html      # 前端界面
└── data/
    ├── matches.json      # 比赛赛程
    └── predictions.json  # AI预测记录
```

---

## ❓ 常见问题

| 问题 | 解决 |
|---|---|
| 启动闪退 | 检查是否装了 Node.js |
| 预测报错 | 检查 `.env` 里的 Key 是否正确粘贴 |
| 某个AI灰色 | 对应 Key 未配置，按钮显示不可用 |
| 端口占用 | 改 `.env` 里的 `PORT` |
| 想换模型 | 在 `.env` 里加 `XXX_MODEL=模型名` |

---

## 🔒 安全提醒

- ❌ **绝对不要** 把 `.env` 提交到 GitHub（已默认忽略）
- ❌ **绝对不要** 把含 API Key 的 zip 公开发布
- ✅ 分享前删除 `.env` 中的 Key

---

## 📄 License

MIT — 自由使用、修改、分发。

---

⭐ **如果觉得有用，请给个 Star！**
