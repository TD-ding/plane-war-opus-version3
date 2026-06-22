/* ============================================================
 * 飞机大战核心纯逻辑 (Plane War — core pure logic)
 *
 * WHY 这个文件存在：
 *   index.html 是单文件 Canvas 游戏，绝大部分代码依赖浏览器环境
 *   (canvas / requestAnimationFrame / localStorage / WebAudio)，无法直接
 *   在 Node 里跑测试。但游戏里真正“容易写错且值得回归保护”的部分其实是
 *   一小撮纯函数：碰撞、连击倍率、火力钳制、难度曲线、帧率归一化、最高分
 *   防御。这些逻辑不碰任何浏览器 API，只做数值计算。
 *
 *   于是把它们抽到这里，做成：
 *     - 纯函数：输入显式传参，不读全局，不产生副作用，便于单测；
 *     - UMD 写法：Node 用 module.exports 引入；浏览器用 <script> 引入后
 *       挂到 window.PlaneWarLogic，index.html 可直接调用，保证单文件可玩。
 *
 *   index.html 内保留同样语义的内联实现（以便不依赖此文件也能独立打开），
 *   两边逻辑保持一致；本文件是被测试覆盖的“权威”实现。
 * ============================================================ */

(function (root, factory) {
  // UMD：Node (CommonJS) 用 module.exports；浏览器挂到全局，二者都能用。
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.PlaneWarLogic = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  /* ---------------------------------------------------------- *
   * AABB 矩形相交检测
   *
   * WHY：用“中心点距离 vs 半宽之和”的写法判断两个轴对齐矩形是否相交，
   * 比起左右上下四条边比较更紧凑、不易写反。sa/sb 是各自的命中范围缩放
   * （默认 1 = 完整尺寸）。玩家碰撞时传入较小的 scale，让“擦边”更宽容
   * （机翼空隙不算命中），提升手感。
   *
   * a/b 需含 {x,y,w,h}，x/y 为中心坐标。
   * ---------------------------------------------------------- */
  function hit(a, b, sa, sb) {
    const aw = a.w * (sa || 1), ah = a.h * (sa || 1);
    const bw = b.w * (sb || 1), bh = b.h * (sb || 1);
    return Math.abs(a.x - b.x) * 2 < (aw + bw) &&
           Math.abs(a.y - b.y) * 2 < (ah + bh);
  }

  /* ---------------------------------------------------------- *
   * 连击得分倍率
   *
   * WHY：连续击毁敌机累积连击数，得分按倍率翻倍以奖励连贯操作。
   * tiers 是按 combo 升序排列的档位表，取“连击数已达到的最高档”。
   * 用循环而非硬编码阈值，方便配置表增删档位而不改这里。
   *
   * combo: 当前连击数；tiers: [{combo, mult}, ...]（升序）。
   * ---------------------------------------------------------- */
  function comboMultiplier(combo, tiers) {
    let mult = 1;
    for (const tier of tiers) {
      if (combo >= tier.combo) mult = tier.mult;
    }
    return mult;
  }

  /* ---------------------------------------------------------- *
   * 火力升级（钳制在上限）
   *
   * WHY：拾取 power 道具升一级火力（多打一发散射）。必须钳制在 max，
   * 否则火力会无限叠加、fire() 生成发数失控。返回新的火力等级（纯函数，
   * 不就地改全局，便于测试 & 让调用方决定如何落地）。
   * ---------------------------------------------------------- */
  function addPower(power, max) {
    return power < max ? power + 1 : power;
  }

  /* ---------------------------------------------------------- *
   * 火力降级（不低于 1）
   *
   * WHY：被撞降一级作为惩罚。下限必须是 1（始终至少单发），否则 0 级会
   * 让玩家彻底打不出子弹，陷入无法翻盘的死局。
   * ---------------------------------------------------------- */
  function dropPower(power) {
    return power > 1 ? power - 1 : power;
  }

  /* ---------------------------------------------------------- *
   * 难度速度倍率（随时间递增，带上限）
   *
   * WHY：敌机随游戏时长越来越快。线性爬升但用 Math.min 封顶
   * (1 + maxSpeedScale)，否则长局后期速度会失控到不可玩。
   *
   * elapsed: 已进行时间(ms)；rampMs: 爬满所需时间；maxSpeedScale: 额外倍率上限。
   * ---------------------------------------------------------- */
  function difficultyScale(elapsed, rampMs, maxSpeedScale) {
    return 1 + Math.min(maxSpeedScale, elapsed / rampMs);
  }

  /* ---------------------------------------------------------- *
   * 敌机刷新间隔（随时间缩短，带下限）
   *
   * WHY：游戏越久刷怪越密。从 baseSpawn 线性缩短，但用 Math.max 兜住
   * minSpawn 下限，避免间隔趋近 0 导致一帧刷出一堵墙、必死。
   * reduce 本身也用 spawnReduceCap 封顶。
   * ---------------------------------------------------------- */
  function spawnInterval(elapsed, cfg) {
    // cfg: {baseSpawn, minSpawn, spawnReduceCap, spawnReduceRate}
    const reduce = Math.min(cfg.spawnReduceCap, elapsed / cfg.spawnReduceRate);
    return Math.max(cfg.minSpawn, cfg.baseSpawn - reduce);
  }

  /* ---------------------------------------------------------- *
   * 最高分读取的容错解析
   *
   * WHY：localStorage 里的最高分可能被用户篡改、被其它程序写脏，或解析
   * 失败变成 NaN。直接信任会让 best 显示成 NaN/负数，并污染后续比较。
   * 这里把任何非法值（NaN / 负数 / 非字符串）都归一成 0（fallback），
   * 只接受 >= 0 的有限整数。
   *
   * 入参是 localStorage 取出的原始字符串（可能为 null）。
   * ---------------------------------------------------------- */
  function parseBestScore(raw, fallback) {
    const def = fallback == null ? 0 : fallback;
    const saved = parseInt(raw == null ? "0" : raw, 10);
    if (!isNaN(saved) && saved >= 0) return saved;
    return def;
  }

  /* ---------------------------------------------------------- *
   * 帧率归一化系数
   *
   * WHY：游戏内所有“每帧位移量”都以 60fps 为基准设计。实际刷新率不同
   * （60/120/144Hz），单帧 dt 不同。timeScale 把 dt 换算成相对基准帧的
   * 步进比例：60fps 时≈1，144Hz 单帧≈0.42，位移按比例缩放，从而在任意
   * 刷新率下游戏速度一致。
   *
   * dt: 本帧耗时(ms)；baseFrameMs: 基准帧间隔(通常 1000/60)。
   * ---------------------------------------------------------- */
  function timeScale(dt, baseFrameMs) {
    return dt / baseFrameMs;
  }

  return {
    hit,
    comboMultiplier,
    addPower,
    dropPower,
    difficultyScale,
    spawnInterval,
    parseBestScore,
    timeScale,
  };
});
