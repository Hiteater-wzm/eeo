#!/usr/bin/env node
/*
 * clean-registry.cjs — 注册表质量清洗：把 Wikidata 批量导入的原始合并件过滤成可对外发布的注册表。
 *
 * 规则（按序执行，全部可复核）：
 *   R1 名称是裸 Wikidata Q-id（拉取时缺 label 的残渣）→ 剔除；
 *   R2 名称去空白后不足 2 字符 → 剔除；
 *   R3 空壳条目（无描述且无官网，注册表内无任何可核对信息）→ 剔除；
 *   R4 单场赛事/届会实体（描述同时含 event 类名词与年份，如 “UFC mixed
 *      martial arts event in 2019”，或描述含 第N届/运动会/世博会/选美）→ 剔除；
 *      赛事主办方、场馆、票务仍是品牌，保留；
 *   排序 信息完整度降序（官网 3 分、描述 10 字起 2 分 40 字起再 2 分、行业/别名/
 *   城市/成立年/置信度各 1 分），同分按名称排序——目录默认序即质量序。
 *
 * 输入输出为分片注册表 datasets/registry/（原地清洗，清洗前版本在 git 历史可溯）。
 * 清洗统计写入 stdout；条目数与各规则命中数打印后人工核对。
 */
'use strict';
const { readRegistry, writeRegistry } = require('./registry-lib.cjs');
const { normalizeLabel, normalizeCountry } = require('./normalize-labels.cjs');

const QID_RE = /^q\d+$/i;
const EVENT_RE = /\bevent\b[^.]*\bin (19|20)\d\d|\bin (19|20)\d\d[^.]*\bevent\b|(第.{1,4}届|运动会|世博会|选美大赛|友好运动会)/i;

/* R5 括号消歧义：结尾括注是国家或类型词时从名称剥离；含法定后缀的括注保留 */
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
  if (!core || LEGAL_IN_PAREN.test(inner)) return name; // 法定后缀括注保留
  const low = inner.toLowerCase();
  if (TYPE_EN.test(low) || TYPE_ZH.test(inner) || EN_COUNTRY.test(low) || ZH_COUNTRY.has(inner.replace(/^中国/, '')) || ZH_COUNTRY.has(inner)) {
    return core;
  }
  return name;
}

function score(b) {
  let s = 0;
  if ((b.website || '').trim()) s += 3;
  const d = (b.description || '').trim();
  if (d.length >= 10) s += 2;
  if (d.length >= 40) s += 2;
  if ((b.industry || '').trim()) s += 1;
  if ((b.aliases || []).length) s += 1;
  if ((b.city || '').trim()) s += 1;
  if ((b.founded || '').toString().trim()) s += 1;
  if (b.confidence === 'high') s += 1;
  return s;
}

const main = () => {
  const all = readRegistry();
  const drop = { qid: 0, shortName: 0, shell: 0, event: 0, listOf: 0 };
  let stripped = 0;
  const kept = [];
  for (const b of all) {
    const name = String(b.name || '').trim();
    if (QID_RE.test(name)) { drop.qid++; continue; }               // R1
    if (name.replace(/\s+/g, '').length < 2) { drop.shortName++; continue; } // R2
    if (/^list of\b/i.test(name)) { drop.listOf++; continue; }     // R2b 维基列表页不是品牌
    b.name = stripDisambig(name);
    if (b.name !== name) stripped++;
    // R6 标签归一：国家走白名单（繁简/译名统一+灭亡政体归并继承国+非现行地区清空），行业仅繁简统一
    if (b.country) b.country = normalizeCountry(String(b.country));
    if (b.industry) { const n = normalizeLabel(String(b.industry)); if (n !== b.industry) { b.industry = n; } }
    const hasDesc = !!(b.description || '').trim();
    const hasWeb = !!(b.website || '').trim();
    if (!hasDesc && !hasWeb) { drop.shell++; continue; }           // R3
    if (hasDesc && EVENT_RE.test(b.description)) { drop.event++; continue; } // R4
    kept.push(b);
  }

  kept.sort((x, y) => score(y) - score(x) || (x.name < y.name ? -1 : x.name > y.name ? 1 : 0));

  const shards = writeRegistry(kept);
  console.log(`clean-registry: ${all.length} -> ${kept.length}（剔除 ${all.length - kept.length}）`);
  console.log(`  R1 裸Q-id名称 ${drop.qid}  R2 短名称 ${drop.shortName}  R2b 列表页 ${drop.listOf}  R3 空壳 ${drop.shell}  R4 单场赛事 ${drop.event}  R5 剥离括注 ${stripped}`);
};

main();
