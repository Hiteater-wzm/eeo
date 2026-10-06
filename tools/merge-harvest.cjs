#!/usr/bin/env node
/*
 * merge-harvest.cjs — 把 harvest 暂存合并进注册表体系，产出待审候选池
 *
 * 流程：
 *   1. 读 datasets/brands-all.json（现行注册表）建 QID 索引；
 *   2. 读 datasets/harvest 各类目子目录下的国家 JSON 暂存，按 QID 去重（已在注册表的跳过）；
 *   3. 新实体先过 clean-registry 同款规则（裸QID名/短名/列表页/空壳/赛事/括注剥离）；
 *   4. 产出 datasets/harvest/candidates.json（待 flash 审查）：
 *      [{ wikidata, name, description, country, industry, website }] ；
 *   5. 审查通过条目由 apply-verdicts.cjs 并回注册表。
 *
 * 可反复运行（按 QID 幂等）：采集每多出一批国家，重跑一次刷新候选池。
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

const STAGE = process.env.EEO_HARVEST_DIR ? path.resolve(process.env.EEO_HARVEST_DIR) : path.join(ROOT, 'datasets', 'harvest');
const OUT = path.join(STAGE, 'candidates.json');

/* 与 clean-registry.cjs 保持一致的质量规则（抽取候选阶段先剔明显垃圾） */
const QID_RE = /^q\d+$/i;
const EVENT_RE = /\bevent\b[^.]*\bin (19|20)\d\d|\bin (19|20)\d\d[^.]*\bevent\b|(第.{1,4}届|运动会|世博会|选美大赛|友好运动会)/i;
const LEGAL_IN_PAREN = /(pvt|ltd|llc|inc|gmbh|s\.?a\.?|c\.?a\.?|s\.r\.o\.|a\/s|asa|co\.,|& co)/i;
const TYPE_EN = /^(company|companies|corporation|firm|business|brand|retailer|retail|retail chain|chain store|chain|store|software|website|video game|game studio|manufacturer|bank|airline|airlines|brewery|distillery|winery|newspaper|magazine|publisher|publishing|record label|television channel|tv channel|radio station|hotel|restaurant|insurance|convenience store|supermarket|logistics|shipping line)$/;
const TYPE_ZH = /^(?:中国|中國|日本|英國|英国|美國|美国|法國|法国|德國|德国|韓國|韩国|印度|台灣|台湾|香港|澳門|澳门)?(?:公司|企業|企业|品牌|零售|連鎖|连锁|便利商店|超市|銀行|银行|航空|航空公司|釀酒|酿酒|報紙|报纸|雜誌|杂志|出版社|唱片|電視|电视|電台|电台|酒店|餐廳|餐厅|保險|保险|網站|网站)$/;
const EN_COUNTRY = /^(united kingdom|uk|usa|united states|japan|norway|germany|canada|czechia|france|brazil|poland|portugal|china|switzerland|south korea|netherlands|india|italy|spain|sweden|denmark|finland|australia|new zealand|ireland|austria|belgium|russia|latvia|estonia|lithuania|slovakia|slovenia|croatia|hungary|romania|bulgaria|greece|turkey|israel|saudi arabia|uae|thailand|vietnam|malaysia|singapore|indonesia|philippines|taiwan|hong kong|macau|mexico|argentina|chile|colombia|peru|venezuela|south africa|egypt|morocco|iceland|luxembourg|monaco|malta|cyprus|ukraine|serbia|georgia|armenia|azerbaijan|kazakhstan|uzbekistan|pakistan|bangladesh|sri lanka|nepal|mongolia)$/;
const ZH_COUNTRY = new Set(['中国', '日本', '韩国', '朝鲜', '捷克', '德国', '英国', '爱尔兰', '法国', '意大利', '西班牙', '葡萄牙', '荷兰', '比利时', '卢森堡', '奥地利', '瑞士', '瑞典', '挪威', '丹麦', '芬兰', '冰岛', '波兰', '斯洛伐克', '斯洛文尼亚', '克罗地亚', '匈牙利', '罗马尼亚', '保加利亚', '希腊', '土耳其', '俄罗斯', '乌克兰', '塞尔维亚', '拉脱维亚', '爱沙尼亚', '立陶宛', '美国', '加拿大', '墨西哥', '巴西', '阿根廷', '智利', '哥伦比亚', '秘鲁', '委内瑞拉', '澳大利亚', '新西兰', '印度', '巴基斯坦', '孟加拉国', '斯里兰卡', '泰国', '越南', '马来西亚', '新加坡', '印度尼西亚', '菲律宾', '中国台湾', '台湾', '中国香港', '香港', '中国澳门', '以色列', '沙特阿拉伯', '阿联酋', '南非', '埃及', '摩洛哥', '蒙古']);

function stripDisambig(name) {
  const m = name.match(/^(.*?)\s*\(([^)]{1,24})\)\s*$/);
  if (!m) return name;
  const core = m[1].trim();
  const inner = m[2].trim();
  if (!core || LEGAL_IN_PAREN.test(inner)) return name;
  const low = inner.toLowerCase();
  if (TYPE_EN.test(low) || TYPE_ZH.test(inner) || EN_COUNTRY.test(low) || ZH_COUNTRY.has(inner.replace(/^中国/, '')) || ZH_COUNTRY.has(inner)) return core;
  return name;
}

const main = () => {
  const registry = require('./registry-lib.cjs').readRegistry();
  const known = new Set(registry.map((b) => b.wikidata).filter(Boolean));
  console.log(`注册表 ${registry.length.toLocaleString()} 条（QID ${known.size}）`);

  const dirs = fs.readdirSync(STAGE).filter((d) => fs.statSync(path.join(STAGE, d)).isDirectory() && d !== 'chunks' && d !== 'verdicts').sort();
  const seen = new Set();
  const cands = [];
  let raw = 0, dropRule = { qid: 0, short: 0, list: 0, shell: 0, event: 0, dup: 0 };
  for (const d of dirs) {
    for (const f of fs.readdirSync(path.join(STAGE, d)).sort()) {
      if (!f.endsWith('.json')) continue;
      const rows = JSON.parse(fs.readFileSync(path.join(STAGE, d, f), 'utf8'));
      for (const b of rows) {
        raw++;
        const qid = b.wikidata || '';
        if (qid && (known.has(qid) || seen.has(qid))) { dropRule.dup++; continue; }
        const name = stripDisambig(String(b.name || '').trim());
        if (QID_RE.test(name)) { dropRule.qid++; continue; }
        if (name.replace(/\s+/g, '').length < 2) { dropRule.short++; continue; }
        if (/^list of\b/i.test(name)) { dropRule.list++; continue; }
        const hasDesc = !!(b.description || '').trim();
        const hasWeb = !!(b.website || '').trim();
        if (!hasDesc && !hasWeb) { dropRule.shell++; continue; }
        if (hasDesc && EVENT_RE.test(b.description)) { dropRule.event++; continue; }
        if (qid) seen.add(qid);
        cands.push({
          wikidata: qid, name,
          description: (b.description || '').trim().slice(0, 160),
          country: (b.country || '').trim(), industry: (b.industry || '').trim(),
          website: (b.website || '').trim(),
        });
      }
    }
  }
  fs.writeFileSync(OUT, JSON.stringify(cands));
  console.log(`暂存原始 ${raw.toLocaleString()}　规则剔除 qid${dropRule.qid} 短名${dropRule.short} 列表${dropRule.list} 空壳${dropRule.shell} 赛事${dropRule.event}　重复跳过 ${dropRule.dup.toLocaleString()}`);
  console.log(`候选池 ${cands.length.toLocaleString()} 条 -> ${path.relative(ROOT, OUT)}`);
};

main();
