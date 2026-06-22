"use strict";

/* ============================================================
 * 核心纯逻辑单元测试 (node:test + node:assert，零第三方依赖)
 * 运行：node --test
 *
 * 覆盖 index.html 抽出的核心纯逻辑（src/logic.js），重点测正常值与边界值。
 * ============================================================ */

const test = require("node:test");
const assert = require("node:assert/strict");

const L = require("../src/logic.js");

/* ---------------- AABB 碰撞检测 hit ---------------- */
test("hit: 完全重叠的两个矩形相交", () => {
  const a = { x: 100, y: 100, w: 40, h: 40 };
  const b = { x: 100, y: 100, w: 40, h: 40 };
  assert.equal(L.hit(a, b), true);
});

test("hit: 远离的两个矩形不相交", () => {
  const a = { x: 0, y: 0, w: 10, h: 10 };
  const b = { x: 500, y: 500, w: 10, h: 10 };
  assert.equal(L.hit(a, b), false);
});

test("hit: 恰好接触边界（距离 == 半宽之和）判定为不相交（严格小于）", () => {
  // a 半宽5 + b 半宽5 = 10；中心距正好 10 → 边贴边，按 < 判定不算相交
  const a = { x: 0, y: 0, w: 10, h: 10 };
  const b = { x: 10, y: 0, w: 10, h: 10 };
  assert.equal(L.hit(a, b), false);
});

test("hit: 刚好重叠一点（距离略小于半宽之和）判定相交", () => {
  const a = { x: 0, y: 0, w: 10, h: 10 };
  const b = { x: 9.9, y: 0, w: 10, h: 10 };
  assert.equal(L.hit(a, b), true);
});

test("hit: X 轴相交但 Y 轴分离 → 不相交（两轴都必须重叠）", () => {
  const a = { x: 0, y: 0, w: 20, h: 10 };
  const b = { x: 0, y: 100, w: 20, h: 10 };
  assert.equal(L.hit(a, b), false);
});

test("hit: hitboxScale 缩小命中范围后由相交变为不相交", () => {
  // 默认尺寸下相交：半宽各 20，中心距 30 < 40 → 相交
  const player = { x: 0, y: 0, w: 40, h: 40 };
  const enemy = { x: 30, y: 0, w: 40, h: 40 };
  assert.equal(L.hit(player, enemy), true, "全尺寸应相交");
  // player 命中范围缩到 0.45：半宽 9 + 20 = 29 < 30 → 不再相交（擦边宽容）
  assert.equal(L.hit(player, enemy, 0.45, 1), false, "缩放后擦边不算命中");
});

test("hit: sa/sb 缺省视为 1（与显式传 1 等价）", () => {
  const a = { x: 0, y: 0, w: 10, h: 10 };
  const b = { x: 5, y: 0, w: 10, h: 10 };
  assert.equal(L.hit(a, b), L.hit(a, b, 1, 1));
});

/* ---------------- 连击倍率 comboMultiplier ---------------- */
const TIERS = [
  { combo: 0, mult: 1 },
  { combo: 5, mult: 2 },
  { combo: 10, mult: 3 },
  { combo: 20, mult: 4 },
];

test("comboMultiplier: 0 连击 → 1 倍（基础档）", () => {
  assert.equal(L.comboMultiplier(0, TIERS), 1);
});

test("comboMultiplier: 档位边界值取该档（>= 比较）", () => {
  assert.equal(L.comboMultiplier(5, TIERS), 2);
  assert.equal(L.comboMultiplier(10, TIERS), 3);
  assert.equal(L.comboMultiplier(20, TIERS), 4);
});

test("comboMultiplier: 档位之间取较低档", () => {
  assert.equal(L.comboMultiplier(4, TIERS), 1);
  assert.equal(L.comboMultiplier(9, TIERS), 2);
  assert.equal(L.comboMultiplier(19, TIERS), 3);
});

test("comboMultiplier: 超过最高档仍封顶在最高倍率", () => {
  assert.equal(L.comboMultiplier(999, TIERS), 4);
});

/* ---------------- 火力升降级钳制 addPower / dropPower ---------------- */
test("addPower: 未达上限正常 +1", () => {
  assert.equal(L.addPower(1, 4), 2);
  assert.equal(L.addPower(3, 4), 4);
});

test("addPower: 达到上限不再增加（钳制）", () => {
  assert.equal(L.addPower(4, 4), 4);
});

test("addPower: 超过上限（异常态）也不增长", () => {
  assert.equal(L.addPower(5, 4), 5);
});

test("dropPower: 高于 1 正常 -1", () => {
  assert.equal(L.dropPower(4), 3);
  assert.equal(L.dropPower(2), 1);
});

test("dropPower: 已是最低级 1 不再下降（保证始终能开火）", () => {
  assert.equal(L.dropPower(1), 1);
});

/* ---------------- 难度曲线 difficultyScale / spawnInterval ---------------- */
const RAMP_MS = 30000;
const MAX_SPEED_SCALE = 2.0;

test("difficultyScale: t=0 时为基础倍率 1", () => {
  assert.equal(L.difficultyScale(0, RAMP_MS, MAX_SPEED_SCALE), 1);
});

test("difficultyScale: 爬升中线性增长", () => {
  // 一半时间 → elapsed/ramp=0.5（未触顶）→ 1 + 0.5 = 1.5
  assert.equal(L.difficultyScale(RAMP_MS / 2, RAMP_MS, MAX_SPEED_SCALE), 1.5);
});

test("difficultyScale: 触顶后封顶在 1 + maxSpeedScale", () => {
  assert.equal(
    L.difficultyScale(RAMP_MS * 100, RAMP_MS, MAX_SPEED_SCALE),
    1 + MAX_SPEED_SCALE
  );
});

const SPAWN_CFG = {
  baseSpawn: 900,
  minSpawn: 320,
  spawnReduceCap: 560,
  spawnReduceRate: 60,
};

test("spawnInterval: t=0 时为初始刷新间隔 baseSpawn", () => {
  assert.equal(L.spawnInterval(0, SPAWN_CFG), 900);
});

test("spawnInterval: 随时间缩短（baseSpawn - reduce）", () => {
  // elapsed=6000 → reduce=100 → 900-100=800
  assert.equal(L.spawnInterval(6000, SPAWN_CFG), 800);
});

test("spawnInterval: 缩短量被 spawnReduceCap 封顶且不低于 minSpawn", () => {
  // 极大 elapsed：reduce 封顶 560 → 900-560=340，仍 >= minSpawn 320
  assert.equal(L.spawnInterval(1e9, SPAWN_CFG), 340);
  assert.ok(L.spawnInterval(1e9, SPAWN_CFG) >= SPAWN_CFG.minSpawn);
});

test("spawnInterval: 永不低于 minSpawn 下限", () => {
  // 构造 reduceCap 大于 (base-min) 的极端配置，验证 minSpawn 兜底
  const cfg = { baseSpawn: 900, minSpawn: 320, spawnReduceCap: 5000, spawnReduceRate: 1 };
  assert.equal(L.spawnInterval(1e9, cfg), 320);
});

/* ---------------- 最高分容错解析 parseBestScore ---------------- */
test("parseBestScore: 正常正整数字符串", () => {
  assert.equal(L.parseBestScore("1500", 0), 1500);
});

test("parseBestScore: 0 是合法值", () => {
  assert.equal(L.parseBestScore("0", 0), 0);
});

test("parseBestScore: null（无存储）视为 0（首次游玩，非异常）", () => {
  // null 表示从未存过分数，应得 0；这是合法初值而非走 fallback
  assert.equal(L.parseBestScore(null, 0), 0);
  assert.equal(L.parseBestScore(null, 42), 0);
});

test("parseBestScore: 负数（被篡改）回退到默认值", () => {
  assert.equal(L.parseBestScore("-500", 0), 0);
});

test("parseBestScore: 非数字（NaN，被写脏）回退到默认值", () => {
  assert.equal(L.parseBestScore("abc", 0), 0);
  assert.equal(L.parseBestScore("", 7), 7);
});

test("parseBestScore: 带前导数字的脏串按 parseInt 取数字前缀", () => {
  // parseInt("123abc") === 123，属可接受（>=0），保持与浏览器实现一致
  assert.equal(L.parseBestScore("123abc", 0), 123);
});

/* ---------------- 帧率归一化 timeScale ---------------- */
const BASE_FRAME_MS = 1000 / 60;

test("timeScale: 恰好 60fps 单帧 → 比例 1", () => {
  assert.equal(L.timeScale(BASE_FRAME_MS, BASE_FRAME_MS), 1);
});

test("timeScale: 高刷屏（144Hz，dt≈6.94ms）→ 比例约 0.42", () => {
  const dt = 1000 / 144;
  const ts = L.timeScale(dt, BASE_FRAME_MS);
  assert.ok(Math.abs(ts - 0.4167) < 0.001, `期望≈0.4167，实际 ${ts}`);
});

test("timeScale: 低帧率（30fps，dt≈33.3ms）→ 比例约 2", () => {
  const dt = 1000 / 30;
  assert.ok(Math.abs(L.timeScale(dt, BASE_FRAME_MS) - 2) < 1e-9);
});

test("timeScale: dt=0 → 比例 0（暂停/同帧无位移）", () => {
  assert.equal(L.timeScale(0, BASE_FRAME_MS), 0);
});
