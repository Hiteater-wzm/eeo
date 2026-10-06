'use strict';
/*
 * stats.cjs — 面板测量的统计内核（纯函数，无 IO，确定性输出）
 *
 * 供 snapshot-run / score-snapshot / logprob-anchor 共用：
 *   - wilsonCI      提及/推荐份额的置信区间（小样本适用）
 *   - cohenKappa    双裁判一致性系数（效度体检）
 *   - braduaryTerry 两两对比的极大似然排名（自带强度与标准误）
 *   - bootstrapCI   中位数的百分位自助区间
 *   - stableStringify 键序固定的 JSON（打分器字节级可复现的前提）
 */

/** Wilson 置信区间（默认 95%）。p̂ = k/n。返回 [lo, hi]。 */
function wilsonCI(k, n, z = 1.96) {
  if (n === 0) return [0, 0];
  const p = k / n;
  const z2 = z * z;
  const denom = 1 + z2 / n;
  const center = (p + z2 / (2 * n)) / denom;
  const half = (z * Math.sqrt((p * (1 - p) + z2 / (4 * n)) / n)) / denom;
  return [Math.max(0, center - half), Math.min(1, center + half)];
}

/** Cohen's kappa：两个裁判对同一批条目的标签一致性。labels: string[] × 2 */
function cohenKappa(a, b) {
  if (a.length !== b.length || a.length === 0) return 0;
  const cats = new Set([...a, ...b]);
  let po = 0;
  const ca = new Map(), cb = new Map();
  for (let i = 0; i < a.length; i++) {
    if (a[i] === b[i]) po++;
    ca.set(a[i], (ca.get(a[i]) || 0) + 1);
    cb.set(b[i], (cb.get(b[i]) || 0) + 1);
  }
  po /= a.length;
  let pe = 0;
  for (const c of cats) pe += ((ca.get(c) || 0) / a.length) * ((cb.get(c) || 0) / a.length);
  if (pe >= 1) return 1;
  return (po - pe) / (1 - pe);
}

/** Bradley-Terry：wins[i][j] = i 击败 j 的次数。返回 [{id, strength, se}]，按强度降序。
 *  MM 迭代求极大似然；标准误用对角 Fisher 信息近似。至少两个选手。 */
function bradleyTerry(ids, wins) {
  const n = ids.length;
  if (n < 2) return ids.map((id) => ({ id, strength: 0, se: 0 }));
  const logS = new Array(n).fill(0);
  const played = wins.map((row) => row.reduce((s, v) => s + v, 0) + row.reduce((s, v, j, i) => (i === j ? s : s + wins[j][i]), 0));
  for (let iter = 0; iter < 200; iter++) {
    let delta = 0;
    for (let i = 0; i < n; i++) {
      let num = 0, den = 0;
      for (let j = 0; j < n; j++) {
        if (i === j) continue;
        const wij = wins[i][j], wji = wins[j][i];
        if (wij + wji === 0) continue;
        const si = Math.exp(logS[i]), sj = Math.exp(logS[j]);
        num += wij;
        den += (wij + wji) / (si / sj + 1);
      }
      if (num === 0 && den === 0) continue;
      const target = num > 0 ? Math.log(Math.max(num, 1e-12) / Math.max(den, 1e-12)) : -4;
      delta = Math.max(delta, Math.abs(target - logS[i]));
      logS[i] = logS[i] + 0.8 * (target - logS[i]);
    }
    if (delta < 1e-10) break;
  }
  // 归一（几何平均为 0）并算 Hessian 对角近似
  const mean = logS.reduce((s, v) => s + v, 0) / n;
  const out = ids.map((id, i) => {
    let info = 0;
    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      const wij = wins[i][j], wji = wins[j][i];
      if (wij + wji === 0) continue;
      const p = 1 / (1 + Math.exp(logS[j] - logS[i]));
      info += (wij + wji) * p * (1 - p);
    }
    const strength = logS[i] - mean;
    return { id, strength, se: info > 0 ? 1 / Math.sqrt(info) : 0, played: played[i] };
  });
  out.sort((a, b) => b.strength - a.strength || (a.id < b.id ? -1 : 1));
  return out;
}

/** 百分位自助区间（中位数场景）。data: number[] */
function bootstrapCI(data, iters = 2000, seed = 20260601) {
  if (data.length < 2) return [data[0] ?? 0, data[0] ?? 0];
  let s = seed >>> 0;
  const rnd = () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) % 100000) / 100000; };
  const meds = [];
  for (let it = 0; it < iters; it++) {
    const sample = [];
    for (let i = 0; i < data.length; i++) sample.push(data[Math.floor(rnd() * data.length)]);
    sample.sort((a, b) => a - b);
    const m = sample[Math.floor(sample.length / 2)];
    meds.push(m);
  }
  meds.sort((a, b) => a - b);
  return [meds[Math.floor(iters * 0.025)], meds[Math.floor(iters * 0.975)]];
}

/** 键序固定的序列化（嵌套对象按字母序，数组保序）——打分器输出字节可复现的基石 */
function stableStringify(v) {
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return '[' + v.map(stableStringify).join(',') + ']';
  const keys = Object.keys(v).sort();
  return '{' + keys.map((k) => JSON.stringify(k) + ':' + stableStringify(v[k])).join(',') + '}';
}

module.exports = { wilsonCI, cohenKappa, bradleyTerry, bootstrapCI, stableStringify };
