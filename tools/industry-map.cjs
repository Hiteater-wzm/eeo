#!/usr/bin/env node
'use strict';
/*
 * industry-map.cjs — 行业标签归位：自由文本标签 → 分类法正名
 *
 * 两层：standards/taxonomy 全量别名表（industry + industry_aliases）
 *      + SUPPLEMENT 人工补的高频映射（目标必须是分类法里真实存在的正名，加载时断言）。
 * 未命中的标签原样返回（保持归一后的写法），不强塞。
 */
const fs = require('fs');
const path = require('path');
const { normalizeLabel } = require('./normalize-labels.cjs');

const SUPPLEMENT = {
  '创意产业': '文化艺术业',
  '汽车工业': '汽车制造业',
  'automotive industry': '汽车制造业',
  'vehicle construction': '汽车制造业',
  '电信业': '电信、广播电视和卫星传输服务',
  '移动电话产业': '计算机、通信和其他电子设备制造业',
  '医药产业': '医药制造业',
  '医疗产业': '卫生',
  'hospitals and rehabilitation': '卫生',
  'financial services': '其他金融业',
  'financial service activities, except insurance and pension funding': '其他金融业',
  '银行业': '货币金融服务',
  '银行': '货币金融服务',
  '电影产业': '广播、电视、电影和录音制作业',
  '日本动画产业': '广播、电视、电影和录音制作业',
  'film production': '广播、电视、电影和录音制作业',
  '大众媒体': '广播、电视、电影和录音制作业',
  '铁路运输': '铁路运输业',
  'rail transport': '铁路运输业',
  '载客运输': '道路运输业',
  '水运': '水上运输业',
  '造船': '铁路、船舶、航空航天和其他运输设备制',
  '航天工业': '铁路、船舶、航空航天和其他运输设备制',
  'aerospace industry': '铁路、船舶、航空航天和其他运输设备制',
  '航空产业': '航空运输业',
  'crop production': '农业',
  '服装业': '纺织服装、服饰业',
  'clothing industry': '纺织服装、服饰业',
  'textile and clothing industry': '纺织服装、服饰业',
  '时尚': '纺织服装、服饰业',
  'food and tobacco industry': '食品制造业',
  '煤炭工业': '煤炭开采和洗选业',
  'petroleum industry': '石油、煤炭及其他燃料加工业',
  '能源工业': '电力、热力生产和供应业',
  '能源供应': '电力、热力生产和供应业',
  '发电': '电力、热力生产和供应业',
  'electric power generation, transmission and distribution': '电力、热力生产和供应业',
  '色情影片产业': '娱乐业',
  '娱乐': '娱乐业',
  'metal industry': '金属制品业',
  '铝业': '有色金属冶炼和压延加工业',
  'video game industry': '电子游戏产业',
  '游戏产业': '电子游戏产业',
  '批发': '批发业',
  'retail': '零售业',
  'software industry': '软件和信息技术服务业',
  '音乐产业': '文化艺术业',
  'publishing': '新闻和出版业',
  'music publishing': '新闻和出版业',
  'paper and publishing industry': '造纸和纸制品业',
  '机械工业': '通用设备制造业',
  'machinery industry and plant construction': '通用设备制造业',
  '广告': '商务服务业',
  '电气工业': '电气机械和器材制造业',
  '学校体育': '体育',
  '职业摔角': '体育',
  '房地产开发': '房地产业',
  '教育技术学': '教育',
  '快餐': '餐饮业',
};

function build() {
  const alias = new Map();
  const walk = (dir) => {
    for (const f of fs.readdirSync(dir)) {
      const p = path.join(dir, f);
      if (fs.statSync(p).isDirectory()) { walk(p); continue; }
      if (!f.endsWith('.json')) continue;
      try {
        const d = JSON.parse(fs.readFileSync(p, 'utf8'));
        if (!d.industry) continue;
        alias.set(d.industry, d.industry);
        for (const a of d.industry_aliases || []) if (!alias.has(a)) alias.set(a, d.industry);
      } catch { /* 坏文件跳过 */ }
    }
  };
  walk(path.join(__dirname, '..', 'standards', 'taxonomy'));
  let bad = 0;
  for (const [k, v] of Object.entries(SUPPLEMENT)) {
    if (alias.has(v)) alias.set(k, v);
    else { bad++; console.error(`[industry-map] 目标正名不存在，弃用：${k} -> ${v}`); }
  }
  if (bad) console.error(`[industry-map] ${bad} 条补充映射目标缺失（分类法无此正名）`);
  return alias;
}

const cache = new Map();
let table = null;

/** 标签 → 分类法正名；未命中返回归一化后的原标签 */
function mapIndustry(label) {
  if (!label) return label;
  if (!table) table = build();
  const key = normalizeLabel(String(label));
  if (cache.has(key)) return cache.get(key);
  const hit = table.get(key) || table.get(String(label).toLowerCase()) || key;
  cache.set(key, hit);
  return hit;
}

module.exports = { mapIndustry, build };
