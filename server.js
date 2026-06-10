/**
 * 2026世界杯 AI预言家对决 - 后端服务器
 * Claude vs GPT vs Gemini vs DeepSeek vs 豆包
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// 限流保护
const rateLimit = require('express-rate-limit');
const predictLimiter = rateLimit({ windowMs: 60*1000, max: 10, message: { error: '请求太频繁，请稍后再试' } });
const apiLimiter = rateLimit({ windowMs: 60*1000, max: 60 });

app.use(cors());
app.use(express.json());
// ==================== 密码保护 ====================
const AUTH_PASSWORD = process.env.LOGIN_PASSWORD || 'wc2026';
const cookieParser = require('cookie-parser');
app.use(cookieParser());
app.use('/api/predict', predictLimiter);

// 登录页
app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// 密码验证
app.post('/login', (req, res) => {
  if (req.body.password === AUTH_PASSWORD) {
    res.cookie('auth', AUTH_PASSWORD, { maxAge: 30*24*60*60*1000, httpOnly: true });
    return res.json({ success: true });
  }
  res.status(401).json({ success: false, error: '密码错误' });
});

// 鉴权中间件
app.use((req, res, next) => {
  if (req.path === '/login' || req.path.startsWith('/api/')) return next();
  if (req.cookies && req.cookies.auth === AUTH_PASSWORD) return next();
  res.redirect('/login');
});

app.use(express.static(path.join(__dirname, 'public')));

// ==================== 数据文件路径 ====================
const DATA_DIR = path.join(__dirname, 'data');
const MATCHES_FILE = path.join(DATA_DIR, 'matches.json');
const PREDICTIONS_FILE = path.join(DATA_DIR, 'predictions.json');
const BETS_FILE = path.join(DATA_DIR, 'bets.json');

// 确保 data 目录存在
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

// ==================== 数据读写工具 ====================
function readJSON(filepath, fallback = {}) {
  try {
    if (!fs.existsSync(filepath)) return fallback;
    return JSON.parse(fs.readFileSync(filepath, 'utf-8'));
  } catch (e) {
    console.error(`读取 ${filepath} 失败:`, e.message);
    return fallback;
  }
}

function writeJSON(filepath, data) {
  fs.writeFileSync(filepath, JSON.stringify(data, null, 2), 'utf-8');
}

// ==================== DeepSeek 客户端（全部AI统一走DeepSeek API） ====================
const { OpenAI } = require('openai');
let deepseekClient = null;

try {
  if (process.env.DEEPSEEK_API_KEY && process.env.DEEPSEEK_API_KEY !== 'sk-your-deepseek-key-here') {
    deepseekClient = new OpenAI({
      apiKey: process.env.DEEPSEEK_API_KEY,
      baseURL: 'https://api.deepseek.com'
    });
    console.log('✅ DeepSeek 客户端已就绪（5个AI全部走DeepSeek）');
  } else {
    console.log('⚠️  未配置 DEEPSEEK_API_KEY，请在 .env 中设置');
  }
} catch (e) { console.log('DeepSeek 初始化失败:', e.message); }

// ==================== AI 配置表 ====================
// 全部走 DeepSeek API，通过不同人设+温度产生差异化预测
const AI_CONFIG = {
  claude:  { name: 'Claude',   model: 'deepseek-chat', color: '#F97316', emoji: '🧠', temp: 0.3, style: '你是极度保守的防守专家。永远预测总进球<2.5个。比分只会在1-0、2-0、0-0、1-1中选择。从不预测冷门，永远看好实力更强的球队。你反感高比分和进攻足球。' },
  gpt:     { name: 'GPT',      model: 'deepseek-chat', color: '#10B981', emoji: '🤖', temp: 1.2, style: '你是极端激进的分析师，就爱预测冷门和进球大战。永远预测总进球>2.5个。比分只会选3-2、4-2、3-1之类的高比分。每场必猜有冷门，你就是不喜欢热门球队赢。' },
  gemini:  { name: 'Gemini',   model: 'deepseek-chat', color: '#8B5CF6', emoji: '💎', temp: 0.9, style: '你是中立客观的分析师，但有一个怪癖：你特别关注天气和场地对比赛的影响，会把天气作为最关键因素。你的预测往往因为天气原因出人意料。' },
  deepseek:{ name: 'DeepSeek', model: 'deepseek-chat', color: '#3B82F6', emoji: '🔍', temp: 0.5, style: '你是纯数据派。你只相信FIFA排名、历史交锋记录和射门转化率。你会引用真实的数据和统计来支持你的预测。你的预测永远基于数据逻辑，忽略情感和士气因素。' },
  doubao:  { name: '豆包',     model: 'deepseek-chat', color: '#F59E0B', emoji: '🫘', temp: 1.1, style: '你是靠直觉和运气的分析师。你喜欢猜平局和客队爆冷。你特别相信"世界杯魔咒"——卫冕冠军小组出局、东道主必进淘汰赛之类的玄学。你不相信纸面实力，只信玄学。' },
};

// ==================== 深度预测 Prompt 构建 ====================
function buildPredictionPrompt(match, aiStyle) {
  const weather = match.weather || {};
  const weatherStr = match.weather
    ? `${weather.temp || '?'}°C，${weather.condition || '未知'}，湿度${weather.humidity || '?'}%，风速${weather.wind || '?'}m/s`
    : '数据待更新';

  const persona = aiStyle ? `\n## 你的分析风格\n${aiStyle}\n` : '';

  return `你是一位资深足球分析师，曾准确预测多届世界杯。请对以下比赛进行深度分析并预测：${persona}

## 比赛信息
- 对阵：${match.home} vs ${match.away}
- 阶段：${match.stage}${match.group ? ' ' + match.group + '组' : ''}
- 时间：${match.date} ${match.time || ''}
- 场地：${match.venue || '待定'}，${match.city || '待定'}
- 天气：${weatherStr}

## 球队近况（基于你的知识库分析）
- ${match.home}：请根据你掌握的最新数据评估实力和近期状态
- ${match.away}：请根据你掌握的最新数据评估实力和近期状态

## 关键分析维度
请从以下维度逐一分析（每点20-40字）：

1. **战术博弈**：双方阵型和战术风格的克制关系
2. **关键对位**：决定比赛走向的核心球员对决
3. **体能储备**：赛程密度、体能分配和替补深度
4. **心理层面**：大赛经验、抗压能力和更衣室氛围
5. **天气影响**：天气条件对技战术发挥的影响
6. **裁判因素**：如有裁判信息请分析执法风格影响
7. **X因素**：可能出现的意外变量（红牌、点球、伤病等）

## 最终预测
请给出3个可能的比分剧本（信心度总和为1.0），严格按以下JSON格式输出：

\`\`\`json
{
  "dimensions": {
    "tactics": "战术分析（20-40字）",
    "key_matchup": "关键对位分析（20-40字）",
    "physical": "体能分析（20-40字）",
    "mental": "心理分析（20-40字）",
    "weather": "天气影响（20-40字）",
    "referee": "裁判因素（20-40字）",
    "x_factor": "X因素（20-40字）"
  },
  "winner": "主队胜/平局/客队胜",
  "predictions": [
    {"score": "X-X", "confidence": 0.55, "scenario": "最可能剧本"},
    {"score": "X-X", "confidence": 0.30, "scenario": "次要剧本"},
    {"score": "X-X", "confidence": 0.15, "scenario": "冷门剧本"}
  ],
  "total_goals": "大于2.5或小于2.5",
  "key_factor": "一句话总结最关键因素（15字内）",
  "reasoning": "综合推理（80字内）"
}
\`\`\`

请基于你的真实足球知识进行分析，不要编造不存在的数据、统计数字或球员名字。如果对某支球队的具体情况不了解，请诚实说明并从宏观角度判断。请确保predictions中confidence总和为1.0。只输出JSON，不要其他文字。`;
}

// ==================== AI 调用函数 ====================
// 全部 AI 统一走 DeepSeek API，通过不同人设+温度产生差异化预测
async function callAI(aiId, match) {
  const config = AI_CONFIG[aiId];
  if (!config) return { error: `未知 AI: ${aiId}` };
  if (!deepseekClient) return { error: 'DeepSeek API Key 未配置，请在 .env 中设置 DEEPSEEK_API_KEY' };

  const prompt = buildPredictionPrompt(match, config.style);

  try {
    const resp = await deepseekClient.chat.completions.create({
      model: config.model,
      messages: [{ role: 'user', content: prompt }],
      temperature: config.temp,
      max_tokens: 2000,
    });
    return parseAIResponse(resp.choices[0].message.content, aiId);
  } catch (e) {
    console.error(`${aiId} 调用失败:`, e.message);
    return { error: `${config.name} 调用失败: ${e.message}` };
  }
}

function parseAIResponse(text, aiId) {
  try {
    // 尝试提取 JSON（有些 AI 会用 markdown 代码块包裹）
    let jsonStr = text;
    const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) jsonStr = jsonMatch[1].trim();

    const parsed = JSON.parse(jsonStr);

    // 验证必要字段
    if (!parsed.winner || !parsed.predictions) {
      return { error: 'AI 返回格式不完整，缺少 winner 或 predictions', raw: text };
    }

    // 标准化 winner 字段
    const w = parsed.winner;
    if (w.includes('主队') || w.includes('胜')) parsed.winner = '主队胜';
    else if (w.includes('客队') || w.includes('负')) parsed.winner = '客队胜';
    else if (w.includes('平')) parsed.winner = '平局';

    return parsed;
  } catch (e) {
    console.error(`${aiId} 返回解析失败:`, e.message);
    return { error: `解析失败: ${e.message}`, raw: text };
  }
}

// ==================== Champion Prediction Prompt ====================
function buildChampionPrompt() {
  return `你是全球最权威的世界杯预测专家，曾在2010、2014、2018、2022四届世界杯中准确预测冠军。现在请对2026年世界杯进行冠军预测。

## 2026世界杯关键信息
- 主办国：美国、加拿大、墨西哥（三国联办）
- 参赛队伍：48支（历史首次扩军）
- 比赛场次：104场
- 时间：2026年6月11日 - 7月19日
- 决赛场地：大都会人寿体育场（纽约/新泽西）

## 夺冠热门分析（基于2022-2026周期表现）

**第一梯队：**
- 阿根廷：2022世界杯冠军、2024美洲杯冠军，梅西退役后新老交替，斯卡洛尼留任，团队体系成熟
- 法国：2022世界杯亚军、2018世界杯冠军，姆巴佩正值巅峰，人才储备世界第一
- 巴西：世预赛南美区第一，维尼修斯+罗德里戈+恩德里克新三叉戟，20年无冠渴望度拉满
- 英格兰：2022八强、2024欧洲杯决赛，贝林厄姆+凯恩+萨卡黄金一代，索斯盖特体系稳定

**第二梯队：**
- 西班牙：2024欧洲杯冠军，亚马尔+佩德里+加维新黄金一代崛起
- 德国：2024欧洲杯主场复苏，维尔茨+穆西亚拉双核驱动，纳格尔斯曼战术多变
- 葡萄牙：C罗最后一届，B席+B费+莱奥中前场豪华，但后防老化
- 荷兰：2022八强，范戴克+阿克+德容防线世界级，但锋线成疑

**潜在黑马：**
- 摩洛哥：2022四强创造历史，主场优势回归（大量摩洛哥裔在美国）
- 日本：2022连克德国西班牙，旅欧球员超60人，森保一续任体系延续
- 美国：主场作战+黄金一代（普利西奇+麦肯尼+雷纳），中北美优势

**值得关注因素：**
- 主场优势：美国队全部主场作战，墨西哥在阿兹特克有高原优势
- 扩军影响：48队意味着更多弱队，强队小组赛消耗降低
- 赛程密度：7场比赛夺冠（比32队时代多1场），体能管理更关键
- 天气：6-7月北美高温，对欧洲球队体能是考验

## 预测要求
请你综合考虑：近期战绩、阵容深度、主教练能力、大赛经验、主场优势、赛程安排、新星潜力、更衣室团结度等8个维度，做出最专业的冠军预测。

严格按JSON格式输出：
\`\`\`json
{
  "champion": "冠军队名称",
  "confidence": 0.0-1.0,
  "runner_up": "亚军队名称",
  "third_place": "季军队名称",
  "dark_horse": "最大黑马队",
  "golden_boot": "金靴奖预测（球员名）",
  "golden_ball": "金球奖预测（球员名）",
  "semifinalists": ["四强队1", "四强队2", "四强队3", "四强队4"],
  "reasoning": "300字深度分析，必须包含：1.为什么选这支球队 2.最大的对手是谁 3.最关键变量是什么",
  "key_players": ["关键球员1", "关键球员2", "关键球员3"]
}
\`\`\`
只输出JSON，不要其他文字。`;
}

function parseChampionResponse(text, aiId) {
  try {
    let jsonStr = text;
    const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) jsonStr = jsonMatch[1].trim();
    const parsed = JSON.parse(jsonStr);
    if (!parsed.champion) return { error: '未返回冠军预测', raw: text };
    return parsed;
  } catch (e) {
    console.error(`${aiId} 冠军解析失败:`, e.message);
    return { error: `解析失败: ${e.message}`, raw: text };
  }
}

// ==================== 比赛胜负判断 ====================
function checkPredictionCorrect(match, prediction) {
  if (match.home_score === null || match.away_score === null) return null;
  if (!prediction || prediction.error) return null;

  const homeScore = match.home_score;
  const awayScore = match.away_score;
  let actualWinner;
  if (homeScore > awayScore) actualWinner = '主队胜';
  else if (homeScore < awayScore) actualWinner = '客队胜';
  else actualWinner = '平局';

  // 胜负判断
  const winnerCorrect = prediction.winner === actualWinner;

  // 比分完全命中判断
  let scoreCorrect = false;
  if (prediction.predictions && Array.isArray(prediction.predictions)) {
    scoreCorrect = prediction.predictions.some(p => {
      const [h, a] = (p.score || '').split('-').map(Number);
      return h === homeScore && a === awayScore;
    });
  }

  return {
    winner_correct: winnerCorrect,
    score_correct: scoreCorrect,
    actual_winner: actualWinner,
    actual_score: `${homeScore}-${awayScore}`,
  };
}

// ==================== 初始化比赛数据 ====================
function initMatchesData() {
  const existing = readJSON(MATCHES_FILE, null);
  if (existing && existing.matches && existing.matches.length > 0) return existing;

  // 2026世界杯赛程——部分已确认的比赛（开幕式+小组赛框架）
  const matches = [
    // === 小组赛 - 第1轮 ===
    { id:"G01", stage:"小组赛", group:"A", home:"墨西哥",   away:"加拿大",    date:"2026-06-11", time:"14:00", venue:"阿兹特克体育场",     city:"墨西哥城",     weather:{temp:26,condition:"晴",humidity:40,wind:3}, home_score:null,away_score:null,status:"upcoming" },
    { id:"G02", stage:"小组赛", group:"A", home:"法国",     away:"待定A3",    date:"2026-06-11", time:"20:00", venue:"SoFi体育场",         city:"洛杉矶",       weather:{temp:22,condition:"晴",humidity:55,wind:4}, home_score:null,away_score:null,status:"upcoming" },
    { id:"G03", stage:"小组赛", group:"B", home:"巴西",     away:"英格兰",    date:"2026-06-12", time:"14:00", venue:"AT&T体育场",          city:"达拉斯",       weather:{temp:32,condition:"多云",humidity:60,wind:5}, home_score:null,away_score:null,status:"upcoming" },
    { id:"G04", stage:"小组赛", group:"B", home:"待定B3",   away:"待定B4",    date:"2026-06-12", time:"20:00", venue:"李维斯体育场",        city:"旧金山",       weather:{temp:18,condition:"雾",humidity:70,wind:8}, home_score:null,away_score:null,status:"upcoming" },
    { id:"G05", stage:"小组赛", group:"C", home:"阿根廷",   away:"葡萄牙",    date:"2026-06-13", time:"14:00", venue:"梅赛德斯-奔驰体育场",  city:"亚特兰大",     weather:{temp:29,condition:"阴",humidity:65,wind:3}, home_score:null,away_score:null,status:"upcoming" },
    { id:"G06", stage:"小组赛", group:"C", home:"待定C3",   away:"待定C4",    date:"2026-06-13", time:"20:00", venue:"硬石体育场",          city:"迈阿密",       weather:{temp:31,condition:"雷阵雨",humidity:80,wind:6}, home_score:null,away_score:null,status:"upcoming" },
    { id:"G07", stage:"小组赛", group:"D", home:"德国",     away:"西班牙",    date:"2026-06-14", time:"14:00", venue:"大都会人寿体育场",     city:"纽约/新泽西",  weather:{temp:25,condition:"晴",humidity:50,wind:4}, home_score:null,away_score:null,status:"upcoming" },
    { id:"G08", stage:"小组赛", group:"D", home:"待定D3",   away:"待定D4",    date:"2026-06-14", time:"20:00", venue:"吉列体育场",          city:"波士顿",       weather:{temp:22,condition:"多云",humidity:55,wind:5}, home_score:null,away_score:null,status:"upcoming" },
    { id:"G09", stage:"小组赛", group:"E", home:"意大利",   away:"荷兰",      date:"2026-06-15", time:"14:00", venue:"林肯金融球场",        city:"费城",         weather:{temp:27,condition:"晴",humidity:52,wind:3}, home_score:null,away_score:null,status:"upcoming" },
    { id:"G10", stage:"小组赛", group:"E", home:"待定E3",   away:"待定E4",    date:"2026-06-15", time:"20:00", venue:"箭头体育场",          city:"堪萨斯城",     weather:{temp:30,condition:"晴",humidity:58,wind:6}, home_score:null,away_score:null,status:"upcoming" },
    { id:"G11", stage:"小组赛", group:"F", home:"乌拉圭",   away:"哥伦比亚",  date:"2026-06-16", time:"14:00", venue:"NRG体育场",           city:"休斯顿",       weather:{temp:33,condition:"多云",humidity:72,wind:4}, home_score:null,away_score:null,status:"upcoming" },
    { id:"G12", stage:"小组赛", group:"F", home:"待定F3",   away:"待定F4",    date:"2026-06-16", time:"20:00", venue:"流明球场",            city:"西雅图",       weather:{temp:17,condition:"小雨",humidity:75,wind:7}, home_score:null,away_score:null,status:"upcoming" },
    { id:"G13", stage:"小组赛", group:"G", home:"比利时",   away:"克罗地亚",  date:"2026-06-17", time:"14:00", venue:"BMO球场",             city:"多伦多",       weather:{temp:23,condition:"晴",humidity:48,wind:4}, home_score:null,away_score:null,status:"upcoming" },
    { id:"G14", stage:"小组赛", group:"G", home:"待定G3",   away:"待定G4",    date:"2026-06-17", time:"20:00", venue:"BC广场",              city:"温哥华",       weather:{temp:16,condition:"阴",humidity:65,wind:5}, home_score:null,away_score:null,status:"upcoming" },
    { id:"G15", stage:"小组赛", group:"H", home:"日本",     away:"塞内加尔",  date:"2026-06-18", time:"14:00", venue:"奔驰体育场",          city:"亚特兰大",     weather:{temp:28,condition:"多云",humidity:58,wind:3}, home_score:null,away_score:null,status:"upcoming" },
    { id:"G16", stage:"小组赛", group:"H", home:"待定H3",   away:"待定H4",    date:"2026-06-18", time:"20:00", venue:"M&T银行体育场",       city:"巴尔的摩",     weather:{temp:26,condition:"晴",humidity:55,wind:4}, home_score:null,away_score:null,status:"upcoming" },

    // === 焦点小组赛（第2轮部分） ===
    { id:"G17", stage:"小组赛", group:"A", home:"加拿大",   away:"待定A3",    date:"2026-06-16", time:"17:00", venue:"BC广场",              city:"温哥华",       weather:{temp:18,condition:"阴",humidity:62,wind:5}, home_score:null,away_score:null,status:"upcoming" },
    { id:"G18", stage:"小组赛", group:"B", home:"英格兰",   away:"待定B3",    date:"2026-06-17", time:"17:00", venue:"梅赛德斯-奔驰体育场",  city:"亚特兰大",     weather:{temp:28,condition:"多云",humidity:58,wind:3}, home_score:null,away_score:null,status:"upcoming" },
    { id:"G19", stage:"小组赛", group:"C", home:"阿根廷",   away:"待定C3",    date:"2026-06-18", time:"17:00", venue:"硬石体育场",          city:"迈阿密",       weather:{temp:31,condition:"多云",humidity:75,wind:5}, home_score:null,away_score:null,status:"upcoming" },
    { id:"G20", stage:"小组赛", group:"D", home:"西班牙",   away:"待定D3",    date:"2026-06-19", time:"17:00", venue:"SoFi体育场",         city:"洛杉矶",       weather:{temp:24,condition:"晴",humidity:50,wind:4}, home_score:null,away_score:null,status:"upcoming" },

    // === 淘汰赛（占位）===
    { id:"R32-01", stage:"1/16决赛", group:null, home:"A组第1", away:"B组第2", date:"2026-06-28", time:"14:00", venue:"待定", city:"待定", weather:null, home_score:null,away_score:null,status:"upcoming" },
    { id:"R32-02", stage:"1/16决赛", group:null, home:"C组第1", away:"D组第2", date:"2026-06-28", time:"20:00", venue:"待定", city:"待定", weather:null, home_score:null,away_score:null,status:"upcoming" },
    { id:"R32-03", stage:"1/16决赛", group:null, home:"E组第1", away:"F组第2", date:"2026-06-29", time:"14:00", venue:"待定", city:"待定", weather:null, home_score:null,away_score:null,status:"upcoming" },
    { id:"R32-04", stage:"1/16决赛", group:null, home:"G组第1", away:"H组第2", date:"2026-06-29", time:"20:00", venue:"待定", city:"待定", weather:null, home_score:null,away_score:null,status:"upcoming" },
    { id:"R16-01", stage:"1/8决赛",  group:null, home:"待定",    away:"待定",    date:"2026-07-04", time:"14:00", venue:"待定", city:"待定", weather:null, home_score:null,away_score:null,status:"upcoming" },
    { id:"R16-02", stage:"1/8决赛",  group:null, home:"待定",    away:"待定",    date:"2026-07-04", time:"20:00", venue:"待定", city:"待定", weather:null, home_score:null,away_score:null,status:"upcoming" },
    { id:"QF-01",  stage:"1/4决赛",  group:null, home:"待定",    away:"待定",    date:"2026-07-09", time:"14:00", venue:"待定", city:"待定", weather:null, home_score:null,away_score:null,status:"upcoming" },
    { id:"QF-02",  stage:"1/4决赛",  group:null, home:"待定",    away:"待定",    date:"2026-07-10", time:"14:00", venue:"待定", city:"待定", weather:null, home_score:null,away_score:null,status:"upcoming" },
    { id:"SF-01",  stage:"半决赛",   group:null, home:"待定",    away:"待定",    date:"2026-07-14", time:"20:00", venue:"AT&T体育场", city:"达拉斯", weather:null, home_score:null,away_score:null,status:"upcoming" },
    { id:"SF-02",  stage:"半决赛",   group:null, home:"待定",    away:"待定",    date:"2026-07-15", time:"20:00", venue:"梅赛德斯-奔驰体育场", city:"亚特兰大", weather:null, home_score:null,away_score:null,status:"upcoming" },
    { id:"3RD",    stage:"三四名决赛",group:null, home:"待定",    away:"待定",    date:"2026-07-18", time:"14:00", venue:"硬石体育场", city:"迈阿密", weather:null, home_score:null,away_score:null,status:"upcoming" },
    { id:"FINAL",  stage:"决赛",     group:null, home:"待定",    away:"待定",    date:"2026-07-19", time:"14:00", venue:"大都会人寿体育场", city:"纽约/新泽西", weather:{temp:28,condition:"晴",humidity:55,wind:3}, home_score:null,away_score:null,status:"upcoming" },
  ];

  const data = { matches, updated_at: new Date().toISOString() };
  writeJSON(MATCHES_FILE, data);
  return data;
}

// ==================== API 路由 ====================

// --- 比赛相关 ---

// 获取所有比赛
app.get('/api/matches', (req, res) => {
  const data = initMatchesData();
  const { group, stage, status } = req.query;
  let matches = data.matches;

  if (group) matches = matches.filter(m => m.group === group);
  if (stage) matches = matches.filter(m => m.stage === stage);
  if (status) matches = matches.filter(m => m.status === status);

  res.json({ matches, total: matches.length });
});

// 获取单场比赛
app.get('/api/matches/:id', (req, res) => {
  const data = initMatchesData();
  const match = data.matches.find(m => m.id === req.params.id);
  if (!match) return res.status(404).json({ error: '比赛不存在' });
  res.json(match);
});

// 更新比赛结果
app.post('/api/matches/:id/result', (req, res) => {
  const data = initMatchesData();
  const match = data.matches.find(m => m.id === req.params.id);
  if (!match) return res.status(404).json({ error: '比赛不存在' });

  const { home_score, away_score } = req.body;
  if (home_score === undefined || away_score === undefined) {
    return res.status(400).json({ error: '请提供 home_score 和 away_score' });
  }

  match.home_score = home_score;
  match.away_score = away_score;
  match.status = 'completed';
  data.updated_at = new Date().toISOString();
  writeJSON(MATCHES_FILE, data);

  // 自动更新该比赛所有 AI 预测的正确性
  updateMatchPredictions(match);

  res.json({ success: true, match });
});

// 添加/修改比赛
app.post('/api/matches', (req, res) => {
  const data = initMatchesData();
  const { id, ...rest } = req.body;
  if (!id) return res.status(400).json({ error: '请提供比赛 id' });

  const idx = data.matches.findIndex(m => m.id === id);
  if (idx >= 0) {
    data.matches[idx] = { ...data.matches[idx], ...rest };
  } else {
    data.matches.push({ id, ...rest, home_score: null, away_score: null, status: 'upcoming' });
  }
  data.updated_at = new Date().toISOString();
  writeJSON(MATCHES_FILE, data);
  res.json({ success: true, match: data.matches[idx >= 0 ? idx : data.matches.length - 1] });
});

// --- AI 预测相关 ---

// 触发所有 AI 对某场比赛进行预测
app.post('/api/predict/:matchId', async (req, res) => {
  const data = initMatchesData();
  const match = data.matches.find(m => m.id === req.params.matchId);
  if (!match) return res.status(404).json({ error: '比赛不存在' });

  const { ai } = req.query; // 可选: 只调用指定的 AI
  const predictions = readJSON(PREDICTIONS_FILE, { championship: [], matches: [] });

  const aiList = ai ? [ai] : Object.keys(AI_CONFIG);
  const results = {};

  console.log(`\n🤖 开始预测: ${match.home} vs ${match.away}`);
  console.log(`   调用 AI: ${aiList.join(', ')}\n`);

  // 并行调用所有 AI
  const calls = aiList.map(async (aiId) => {
    const config = AI_CONFIG[aiId];
    if (!config) return { aiId, error: '未知 AI' };

    console.log(`   ⏳ 调用 ${config.name}...`);
    const startTime = Date.now();
    const prediction = await callAI(aiId, match);
    const elapsed = Date.now() - startTime;

    if (prediction.error) {
      console.log(`   ❌ ${config.name}: ${prediction.error} (${elapsed}ms)`);
    } else {
      console.log(`   ✅ ${config.name}: ${prediction.winner} | ${prediction.predictions?.[0]?.score || '?'} (${elapsed}ms)`);
    }

    // 保存预测记录
    const record = {
      id: `pred-${match.id}-${aiId}-${Date.now()}`,
      match_id: match.id,
      ai: aiId,
      model: config.model,
      prediction,
      correct: null,
      score_correct: null,
      created_at: new Date().toISOString(),
    };

    // 替换该 AI 对该比赛的旧预测
    const oldIdx = predictions.matches.findIndex(
      p => p.match_id === match.id && p.ai === aiId
    );
    if (oldIdx >= 0) predictions.matches[oldIdx] = record;
    else predictions.matches.push(record);

    return { aiId, record };
  });

  const settled = await Promise.allSettled(calls);
  settled.forEach(r => {
    if (r.status === 'fulfilled' && r.value) {
      results[r.value.aiId] = r.value.record;
    }
  });

  writeJSON(PREDICTIONS_FILE, predictions);

  res.json({
    success: true,
    match_id: match.id,
    results,
  });
});

// 获取某场比赛所有 AI 预测
app.get('/api/predictions/:matchId', (req, res) => {
  const predictions = readJSON(PREDICTIONS_FILE, { championship: [], matches: [] });
  const matchPreds = predictions.matches.filter(p => p.match_id === req.params.matchId);
  res.json({ match_id: req.params.matchId, predictions: matchPreds });
});

// 冠军预测
app.post('/api/predict-champion', async (req, res) => {
  const { ai } = req.query;
  const aiList = ai ? [ai] : Object.keys(AI_CONFIG);
  const predictions = readJSON(PREDICTIONS_FILE, { championship: [], matches: [] });
  const prompt = buildChampionPrompt();
  const results = {};

  console.log('\n👑 开始冠军预测...\n');

  for (const aiId of aiList) {
    const config = AI_CONFIG[aiId];
    if (!config) continue;
    if (!deepseekClient) { results[aiId] = { error: 'DeepSeek API Key 未配置' }; continue; }

    console.log(`   ⏳ 调用 ${config.name}...`);
    const startTime = Date.now();

    try {
      const resp = await deepseekClient.chat.completions.create({
        model: config.model,
        messages: [{ role: 'user', content: prompt + `\n你的分析风格：${config.style}` }],
        temperature: config.temp,
        max_tokens: 1000,
      });
      const text = resp.choices[0].message.content;
      const parsed = parseChampionResponse(text, aiId);
      const elapsed = Date.now() - startTime;
      console.log(`   ✅ ${config.name}: 🏆${parsed.champion || parsed.error || '?'} (${elapsed}ms)`);

      const record = { ai: aiId, model: config.model, prediction: parsed, created_at: new Date().toISOString() };
      results[aiId] = record;

      const oldIdx = predictions.championship.findIndex(p => p.ai === aiId);
      if (oldIdx >= 0) predictions.championship[oldIdx] = record;
      else predictions.championship.push(record);

    } catch (e) {
      console.log(`   ❌ ${config.name}: ${e.message}`);
      results[aiId] = { error: e.message };
    }
  }

  writeJSON(PREDICTIONS_FILE, predictions);
  res.json({ success: true, results });
});

// 获取冠军预测
app.get('/api/predictions-champion', (req, res) => {
  const predictions = readJSON(PREDICTIONS_FILE, { championship: [], matches: [] });
  res.json({ championship: predictions.championship });
});

// --- 热力图数据 ---
app.get('/api/heatmap', (req, res) => {
  const matches = initMatchesData().matches.filter(m => m.stage === '小组赛');
  const predictions = readJSON(PREDICTIONS_FILE, { championship: [], matches: [] });
  const ais = Object.keys(AI_CONFIG);

  const data = matches.map(match => {
    const preds = {};
    ais.forEach(aiId => {
      const p = predictions.matches.find(pr => pr.match_id === match.id && pr.ai === aiId);
      preds[aiId] = p ? { correct: p.correct, score_correct: p.score_correct } : null;
    });
    return {
      id: match.id,
      group: match.group,
      home: match.home,
      away: match.away,
      home_score: match.home_score,
      away_score: match.away_score,
      predictions: preds,
    };
  });

  res.json({ ais, matches: data });
});

// --- 排行榜 ---

app.get('/api/leaderboard', (req, res) => {
  const predictions = readJSON(PREDICTIONS_FILE, { championship: [], matches: [] });
  const matches = initMatchesData().matches;

  const leaderboard = {};

  // 初始化各 AI 统计
  Object.keys(AI_CONFIG).forEach(aiId => {
    leaderboard[aiId] = {
      ai: aiId,
      name: AI_CONFIG[aiId].name,
      color: AI_CONFIG[aiId].color,
      emoji: AI_CONFIG[aiId].emoji,
      total_predictions: 0,
      correct_winner: 0,
      correct_score: 0,
      total_deviation: 0,
      deviation_count: 0,
      // 分阶段统计
      group_stage: { total: 0, correct: 0 },
      knockout: { total: 0, correct: 0 },
      // 冷门捕捉（多数AI预测错误但该AI正确）
      upset_catches: 0,
    };
  });

  // 统计预测结果
  predictions.matches.forEach(p => {
    if (!leaderboard[p.ai]) return;
    const stat = leaderboard[p.ai];
    stat.total_predictions++;

    if (p.correct !== null) {
      if (p.correct) stat.correct_winner++;
      if (p.score_correct) stat.correct_score++;

      const match = matches.find(m => m.id === p.match_id);
      if (match) {
        const stageKey = match.stage.includes('小组赛') ? 'group_stage' : 'knockout';
        stat[stageKey].total++;
        if (p.correct) stat[stageKey].correct++;

        // 偏差计算: |预测-实际|
        if (match.home_score !== null && match.away_score !== null && p.prediction && p.prediction.predictions && p.prediction.predictions[0]) {
          const [ph, pa] = (p.prediction.predictions[0].score || '0-0').split('-').map(Number);
          if (!isNaN(ph) && !isNaN(pa)) {
            stat.total_deviation += Math.abs(ph - match.home_score) + Math.abs(pa - match.away_score);
            stat.deviation_count++;
          }
        }
      }
    }
  });

  // 计算冷门捕捉
  predictions.matches.forEach(p => {
    if (!p.correct || !leaderboard[p.ai]) return;
    // 检查这场比赛是否多数AI预测错误
    const matchPreds = predictions.matches.filter(mp => mp.match_id === p.match_id);
    const totalForMatch = matchPreds.length;
    const correctCount = matchPreds.filter(mp => mp.correct).length;
    // 如果该AI正确但多数错误（正确率<50%），算冷门
    if (totalForMatch >= 3 && correctCount <= totalForMatch / 2) {
      leaderboard[p.ai].upset_catches++;
    }
  });

  // 转为数组并排序
  const rankings = Object.values(leaderboard)
    .filter(l => l.total_predictions > 0)
    .sort((a, b) => {
      const rateA = a.total_predictions > 0 ? a.correct_winner / a.total_predictions : 0;
      const rateB = b.total_predictions > 0 ? b.correct_winner / b.total_predictions : 0;
      return rateB - rateA;
    })
    .map((l, i) => ({
      ...l,
      rank: i + 1,
      winner_rate: l.total_predictions > 0 ? (l.correct_winner / l.total_predictions * 100).toFixed(1) : '0.0',
      score_rate: l.total_predictions > 0 ? (l.correct_score / l.total_predictions * 100).toFixed(1) : '0.0',
      avg_deviation: l.deviation_count > 0 ? (l.total_deviation / l.deviation_count).toFixed(2) : '-',
    }));

  res.json({
    rankings,
    total_matches_completed: matches.filter(m => m.status === 'completed').length,
    updated_at: new Date().toISOString(),
  });
});

// ==================== 辅助函数 ====================
function updateMatchPredictions(match) {
  const predictions = readJSON(PREDICTIONS_FILE, { championship: [], matches: [] });
  let updated = 0;

  predictions.matches.forEach(p => {
    if (p.match_id !== match.id) return;
    if (!p.prediction || p.prediction.error) return;

    const result = checkPredictionCorrect(match, p.prediction);
    if (result) {
      p.correct = result.winner_correct;
      p.score_correct = result.score_correct;
      updated++;
    }
  });

  if (updated > 0) {
    writeJSON(PREDICTIONS_FILE, predictions);
    console.log(`   📊 更新了 ${updated} 条预测记录 (${match.home} ${match.home_score}-${match.away_score} ${match.away})`);
  }
}

// ==================== 启动服务器 ====================
// 初始化数据
initMatchesData();

// 自动冠军预测（如果还没预测过）
async function autoChampionPredict() {
  const predictions = readJSON(PREDICTIONS_FILE, { championship: [], matches: [] });
  if (predictions.championship && predictions.championship.length >= 5) {
    console.log('👑 冠军预测已存在，跳过自动预测');
    return;
  }
  if (!deepseekClient) {
    console.log('⚠️  未配置 API Key，跳过自动冠军预测');
    return;
  }
  console.log('\n👑 首次启动，自动预测冠军...\n');
  const prompt = buildChampionPrompt();
  const results = {};

  for (const [aiId, config] of Object.entries(AI_CONFIG)) {
    console.log(`   ⏳ 调用 ${config.name}...`);
    try {
      const resp = await deepseekClient.chat.completions.create({
        model: config.model,
        messages: [{ role: 'user', content: prompt + `\n你的分析风格：${config.style}` }],
        temperature: config.temp,
        max_tokens: 1000,
      });
      const parsed = parseChampionResponse(resp.choices[0].message.content, aiId);
      console.log(`   ✅ ${config.name}: 🏆${parsed.champion || '?'}`);
      results[aiId] = { ai: aiId, model: config.model, prediction: parsed, created_at: new Date().toISOString() };
    } catch (e) {
      console.log(`   ❌ ${config.name}: ${e.message}`);
    }
  }

  if (Object.keys(results).length > 0) {
    predictions.championship = Object.values(results);
    writeJSON(PREDICTIONS_FILE, predictions);
    console.log(`\n👑 冠军预测完成! ${Object.keys(results).length}/5 成功\n`);
  }
}

// 首页
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// AI 状态查询
app.get('/api/status', (req, res) => {
  const status = {};
  Object.entries(AI_CONFIG).forEach(([id, config]) => {
    status[id] = {
      name: config.name,
      model: config.model,
      color: config.color,
      emoji: config.emoji,
      available: !!deepseekClient,
    };
  });
  res.json({
    status,
    match_count: initMatchesData().matches.length,
    server_time: new Date().toISOString(),
    worldcup_start: '2026-06-11',
    days_until_opening: Math.ceil((new Date('2026-06-11') - new Date()) / (1000 * 60 * 60 * 24)),
  });
});

// --- 记账功能 ---

// 获取所有投注
app.get('/api/bets', (req, res) => {
  const bets = readJSON(BETS_FILE, []);
  const matches = initMatchesData().matches;
  // 关联比赛信息
  const enriched = bets.map(b => {
    const match = matches.find(m => m.id === b.match_id);
    return { ...b, match: match || null };
  });
  res.json({ bets: enriched });
});

// 添加投注
app.post('/api/bets', (req, res) => {
  const { match_id, amount, odds, note } = req.body;
  if (!match_id || !amount) return res.status(400).json({ error: '缺少 match_id 或 amount' });
  const bets = readJSON(BETS_FILE, []);
  const bet = {
    id: 'bet-' + Date.now(),
    match_id, amount: parseFloat(amount),
    odds: parseFloat(odds) || 0,
    note: note || '',
    win_amount: null,
    created_at: new Date().toISOString(),
  };
  bets.push(bet);
  writeJSON(BETS_FILE, bets);
  res.json({ success: true, bet });
});

// 手动设置中奖金额
app.post('/api/bets/:id/win', (req, res) => {
  const bets = readJSON(BETS_FILE, []);
  const bet = bets.find(b => b.id === req.params.id);
  if (!bet) return res.status(404).json({ error: '投注不存在' });
  bet.win_amount = parseFloat(req.body.win_amount) || 0;
  writeJSON(BETS_FILE, bets);
  res.json({ success: true, bet });
});

// 删除投注
app.delete('/api/bets/:id', (req, res) => {
  let bets = readJSON(BETS_FILE, []);
  const before = bets.length;
  bets = bets.filter(b => b.id !== req.params.id);
  if (bets.length === before) return res.status(404).json({ error: '投注不存在' });
  writeJSON(BETS_FILE, bets);
  res.json({ success: true });
});

app.listen(PORT, async () => {
  console.log('========================================');
  console.log('  🏆 2026世界杯 AI预言家对决');
  console.log('  Claude vs GPT vs Gemini vs DeepSeek vs 豆包');
  console.log('========================================');
  console.log(`  🌐 http://localhost:${PORT}`);
  console.log(`  📅 距开幕还有 ${Math.ceil((new Date('2026-06-11') - new Date()) / (1000 * 60 * 60 * 24))} 天`);
  console.log('========================================');

  // 启动时自动预测冠军
  await autoChampionPredict();
});
