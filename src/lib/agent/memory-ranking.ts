/**
 * 长期记忆的反馈调权与衰减（纯函数，便于测试，不触碰 DB schema）。
 *
 * 设计目标：
 * - 频繁命中的记忆置信度缓慢上升（reinforce），并因此在排序中更靠前；
 * - 长期不被使用的记忆通过 recency 衰减在排序中下沉（但不物理修改存储置信度）；
 * - 排序综合 = 基础相关性 × 置信度权重 × recency 衰减。
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/** recency 衰减半衰期（天）：超过该天数未使用，排序权重衰减到一半。 */
export const MEMORY_RECENCY_HALF_LIFE_DAYS = 45;

/** 从未使用过的记忆给一个温和的折扣，避免长期沉睡记忆与刚命中记忆同权。 */
const NEVER_USED_DECAY = 0.6;

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

/**
 * 基于 lastUsedAt 的指数 recency 衰减：age=0 时为 1，达到半衰期时为 0.5。
 */
export const computeRecencyDecay = (
  lastUsedAt: null | string | undefined,
  now: number = Date.now(),
  halfLifeDays: number = MEMORY_RECENCY_HALF_LIFE_DAYS,
): number => {
  if (!lastUsedAt) {
    return NEVER_USED_DECAY;
  }

  const timestamp = Date.parse(lastUsedAt);

  if (!Number.isFinite(timestamp)) {
    return NEVER_USED_DECAY;
  }

  const ageDays = Math.max(0, (now - timestamp) / DAY_MS);

  return Math.pow(0.5, ageDays / Math.max(1, halfLifeDays));
};

/**
 * 命中反馈：被检索并实际注入上下文的记忆置信度小步上调（有上限），形成正反馈。
 * 存储置信度只升不降；“降权”交给 recency 衰减在排序阶段处理。
 */
export const reinforceMemoryConfidence = (
  current: null | number | undefined,
  { cap = 0.97, step = 0.02 }: { cap?: number; step?: number } = {},
): number => {
  const base = typeof current === "number" && Number.isFinite(current) ? current : 0.7;

  if (base >= cap) {
    return Math.round(base * 1000) / 1000;
  }

  return Math.min(cap, Math.round((base + step) * 1000) / 1000);
};

/**
 * 综合排序分：把基础相关性（关键词 0-100 或向量 0-1 都可）与置信度、recency 结合。
 * confidence 贡献限制在 [0.6, 1.0] 区间，避免低置信度记忆被完全压没。
 */
export const computeMemoryRankScore = ({
  baseScore,
  confidence,
  lastUsedAt,
  now = Date.now(),
}: {
  baseScore: number;
  confidence: null | number | undefined;
  lastUsedAt: null | string | undefined;
  now?: number;
}): number => {
  const confidenceWeight = 0.6 + 0.4 * clamp01(typeof confidence === "number" ? confidence : 0.7);
  const recencyWeight = 0.5 + 0.5 * computeRecencyDecay(lastUsedAt, now);

  return baseScore * confidenceWeight * recencyWeight;
};
