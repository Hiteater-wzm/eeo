#!/usr/bin/env node
/**
 * gen-taxonomy.cjs —— EEO 品类特质分类法批量生成器（零依赖，Node >= 14）
 *
 * 用法：
 *   node tools/gen-taxonomy.cjs build     从 tools/source/ 与 datasets/brands-1k.json 重建 tools/industries.json
 *   node tools/gen-taxonomy.cjs           读 tools/industries.json，批量生成 standards/taxonomy/auto/ 下的分类法文件
 *   node tools/gen-taxonomy.cjs stats     打印 industries.json 统计
 *
 * 三层行业来源：
 *   1) GB/T 4754-2017 四级类目（tools/source/gbt4754.json，1,971 节点）
 *   2) 新兴与交叉行业（tools/source/emerging.json，人工维护）
 *   3) 品牌库 industry 字段未被前两层与 8 个手工种子覆盖的写法（datasets/brands-1k.json）
 *
 * 手工种子（standards/taxonomy/*.json）不读不写，保持原样。
 */

'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SRC_GBT = path.join(ROOT, 'tools', 'source', 'gbt4754.json');
const SRC_EMERGING = path.join(ROOT, 'tools', 'source', 'emerging.json');
const BRANDS = path.join(ROOT, 'datasets', 'brands-1k.json');
const SEED_DIR = path.join(ROOT, 'standards', 'taxonomy');
const OUT_LIST = path.join(ROOT, 'tools', 'industries.json');
const AUTO_DIR = path.join(ROOT, 'standards', 'taxonomy', 'auto');
const TODAY = '2026-10-05';

/* ------------------------------------------------------------------ */
/* 文本归一化：繁→简、去空白标点、去常见行业后缀，用于跨层去重与品牌映射 */
/* ------------------------------------------------------------------ */
const SIMP = {};
{
  const pairs = '軟:软,產:产,業:业,務:务,銀:银,險:险,統:统,計:计,機:机,車:车,製:制,鋼:钢,鐵:铁,銅:铜,鋁:铝,鉛:铅,鋅:锌,鎳:镍,錫:锡,鎢:钨,礦:矿,採:采,選:选,氣:气,鹽:盐,煙:烟,織:织,紡:纺,紗:纱,漿:浆,縫:缝,紉:纫,記:记,錄:录,攝:摄,視:视,聽:听,藝:艺,術:术,團:团,體:体,遊:游,戲:戏,場:场,館:馆,飯:饭,飲:饮,廳:厅,農:农,漁:渔,雞:鸡,鴨:鸭,豬:猪,蠶:蚕,樹:树,種:种,園:园,綠:绿,學:学,試:试,驗:验,檢:检,測:测,儀:仪,鐘:钟,錶:表,鎖:锁,傘:伞,裝:装,飾:饰,綢:绸,纖:纤,維:维,網:网,絡:络,資:资,訊:讯,傳:传,輸:输,運:运,郵:邮,遞:递,倉:仓,儲:储,醫:医,藥:药,護:护,諮:咨,詢:询,顧:顾,問:问,規:规,劃:划,廣:广,証:证,執:执,績:绩,評:评,審:审,稅:税,師:师,紀:纪,電:电,話:话,腦:脑,號:号,設:设,備:备,質:质,監:监,認:认,證:证,標:标,準:准,勞:劳,派:派,遣:遣,紹:绍,賓:宾,賃:赁,營:营,開:开,發:发,銷:销,賣:卖,購:购,廢:废,飛:飞,港:港,灣:湾,碼:码,頭:头,節:节,目:目,聞:闻,圖:图,書:书,報:报,紙:纸,雜:杂,誌:志,複:复,訂:订,殯:殡,慶:庆,禮:礼,繪:绘,環:环,風:风,熱:热,應:应,鏡:镜,筆:笔,樂:乐,寵:宠,飼:饲,獸:兽,針:针,灸:灸,淨:净,廚:厨,衛:卫,層:层,樓:楼,盤:盘,庫:库,貨:货,櫃:柜,潔:洁,燙:烫,駕:驾,駛:驶,訓:训,練:练,動:动,員:员,續:续,託:托,兒:儿,課:课,創:创,債:债,匯:汇,幣:币,億:亿,萬:万,張:张,壓:压,鑄:铸,鍛:锻,處:处,鍍:镀,塗:涂,劇:剧,院:院,遙:遥,衛:卫,雲:云,數:数,據:据,檔:档,汙:污,寫:写,觀:观,眾:众,國:国,娛:娱,綜:综,調:调,鑽:钻,醬:酱,鹼:碱,鑒:鉴,離:离,聯:联,茲:兹,歷:历,達:达,爾:尔,馬:马,亞:亚,義:义,烏:乌,蘭:兰,瓊:琼,鎮:镇,縣:县,區:区,離:离,島:岛,嶼:屿,錶:表';
  for (const p of pairs.split(',')) { const [a, b] = p.split(':'); if (a && b) SIMP[a] = b; }
}

/**
 * 归一化：繁→简 + 小写 + 去空白与标点 + 去常见行业后缀词。
 */
function normalize(s) {
  let t = String(s || '');
  t = t.split('').map((ch) => SIMP[ch] || ch).join('');
  t = t.toLowerCase();
  t = t.replace(/[\s（）()·、，,。．.\-—－_/\\'’“”"]/g, '');
  t = t.replace(/(industry|manufacturing|manufacture|manufacturer|services|service|sector|agencies|agency)$/g, '');
  t = t.replace(/(行业|产业|工业|制造业|服务业|公司|行业类别)$/g, '');
  t = t.replace(/(业|制造|生产|销售|经营)$/g, '');
  return t;
}

/* 数据集中出现的英文/杂项写法 → 标准中文名（人工核对） */
const EN_DICT = {
  'real estate industry': '房地产业', 'furniture industry': '家具制造业', 'printing industry': '印刷业',
  'management consulting industry': '企业管理咨询', 'insurance intermediation': '保险代理与经纪',
  'fast food industry': '快餐服务', 'film equipment industry': '影视设备制造', 'biotechnology industry': '生物技术',
  'ball and roller bearing manufacturing': '轴承制造', 'cement industry': '水泥制造', 'wind power industry': '风力发电',
  'bicycle manufacturing': '自行车制造', 'motorcycle industry': '摩托车制造', 'manufacture of watches and clocks': '钟表制造',
  'non-alcoholic beverage industry': '饮料制造', 'private security industry': '保安服务', 'energy consulting': '能源咨询服务',
  'consulting': '咨询服务', 'razor industry': '剃须刀制造', 'antiquarian seller': '古董与旧货零售',
  'sporting goods manufacturer': '体育用品制造', 'library service': '图书馆服务', 'event sector': '会展服务',
  'service sector': '居民服务业', 'temporary work agency': '劳务派遣', 'other mining and quarrying': '其他采矿业',
  'health technology': '医疗科技', 'engineering services': '工程技术与设计服务', 'software publishing': '软件开发',
  'other software publishing': '软件开发', 'manufacturing': '制造业', 'manufacture of food': '食品制造业',
  'agency': '广告业', 'electronics manufacturer': '电子器件制造',
  'management consulting': '咨询与调查', 'real estate brokerage': '房地产中介服务',
  'private security industry': '安全保护服务', 'jewelry industry': '珠宝首饰及有关物品制造',
  'perfumes industry': '化妆品制造', 'hairdressing industry': '理发及美容服务',
  'agricultural machinery industry': '机械化农业及园艺机具制造',
  'metal recycling': '金属废料和碎屑加工处理', 'lutherie': '乐器制造',
  'musical instrument making': '乐器制造', 'window covering': '窗帘、布艺类产品制造',
  'energy consulting': '能源咨询', 'energy sector': '能源', 'insurtech': '保险科技',
  'regulatory affairs': '合规咨询', 'health technology': '医疗科技',
  'business and professional associations, unions': '商务与专业协会',
};
/* 不是行业的杂项写法，跳过不生成 */
const JUNK = new Set(['S.A.', 'Q11409188', 'Q112165353', '2040年', '波蘭國徽', 'Jan Hendriks', 'Samuel Swinfin Burdett', 'Walter Friedrich', '遊戲樹', '量子力学', '高效液相色谱法', '统筹', '郵票研究']);
/* 个别生僻写法 → 标准写法；值为 null 表示不是行业（跳过） */
const ZH_DICT = { '高效液相色谱法': null };

/* ------------------------------------------------------------------ */
/* 通用模板：按行业原型（archetype）给四个通用维度 + 8 道通用 FAQ      */
/* ------------------------------------------------------------------ */
const P1 = '购买决策', P2 = '服务细节', P3 = '风险保障';
const GID = { d: 'decision', t: 'detail', r: 'risk' };

const ARCH = {
  farm: {
    groups: [
      { id: 'sales', label: '销售渠道', select: 'many' },
      { id: 'org', label: '生产组织', select: 'many' },
      { id: 'buyer', label: '主要买方', select: 'many' },
      { id: 'tier', label: '产品定位', select: 'one' },
    ],
    traits: [
      { id: 'wholesale_local', group: 'sales', label: '产地批发给收购商', description: '主要在产地批发市场或通过收购商走货' },
      { id: 'direct_supply', group: 'sales', label: '商超餐饮直供', description: '与商超、餐饮企业签订直供协议' },
      { id: 'ecom_direct', group: 'sales', label: '电商直销', description: '自有网店或平台店铺直接卖给消费者' },
      { id: 'member_delivery', group: 'sales', label: '会员周期配送', description: '按周期向会员家庭宅配' },
      { id: 'own_base', group: 'org', label: '自有基地生产', description: '产品产自自营种养基地' },
      { id: 'farmer_order', group: 'org', label: '农户订单收购', description: '与农户签订单按标准收购' },
      { id: 'coop', group: 'org', label: '合作社联营', description: '以合作社形式组织生产销售' },
      { id: 'b_processor', group: 'buyer', label: '加工企业', description: '主要买方是下游加工厂' },
      { id: 'b_retail', group: 'buyer', label: '零售与餐饮企业', description: '主要买方是零售商、餐饮企业' },
      { id: 'b_consumer', group: 'buyer', label: '个人消费者', description: '直接卖给个人买家' },
      { id: 't_bulk', group: 'tier', label: '大宗经济型', description: '走量为主，按大宗行情定价' },
      { id: 't_mid', group: 'tier', label: '常规中端', description: '常规品质，价格带位于市场中位' },
      { id: 't_premium', group: 'tier', label: '精品高端', description: '分级精选、礼盒或认证产品，价格高于大宗行情' },
    ],
    faqs: [
      { id: 'origin', group: 'decision', question: '东西产自哪里？什么季节上市？', hint: '回答应给出产地、上市时间和当季供应量' },
      { id: 'grade', group: 'decision', question: '怎么分级定价？一级和二级差在哪？', hint: '回答应说明分级标准和各级价差' },
      { id: 'moq', group: 'decision', question: '起批量是多少？散买卖不卖？', hint: '回答应给出起批量和零售是否可单买' },
      { id: 'visit', group: 'detail', question: '基地能参观吗？能看现场采摘或分拣吗？', hint: '回答应说明是否开放参观及预约方式' },
      { id: 'delivery_fresh', group: 'detail', question: '发货后几天到？损耗坏了怎么算？', hint: '回答应给出运输时限和破损坏果的赔付规则' },
      { id: 'trace', group: 'detail', question: '能查到这批货的产地和检测记录吗？', hint: '回答应说明溯源方式和检测报告获取渠道' },
      { id: 'cert', group: 'risk', question: '宣传的有机、绿色认证，证书编号在哪查？', hint: '回答应给出证书类型、编号和官方查询入口' },
      { id: 'settle', group: 'risk', question: '大宗采购怎么签合同？价格波动谁承担？', hint: '回答应说明合同定价方式、订金和违约条款' },
    ],
  },
  mining: {
    groups: [
      { id: 'biz', label: '业务形态', select: 'many' },
      { id: 'buyer', label: '主要客户', select: 'many' },
      { id: 'deliver', label: '交付方式', select: 'many' },
      { id: 'pricing', label: '定价机制', select: 'one' },
    ],
    traits: [
      { id: 'own_mine', group: 'biz', label: '自有矿区开采', description: '持有采矿权自行开采' },
      { id: 'contracting', group: 'biz', label: '工程与技术承包', description: '承包开采、洗选或技术服务' },
      { id: 'trading', group: 'biz', label: '矿产品贸易', description: '以购销贸易为主' },
      { id: 'b_smelter', group: 'buyer', label: '冶炼与制造企业', description: '主要卖给下游冶炼厂、材料厂' },
      { id: 'b_trader', group: 'buyer', label: '贸易商', description: '通过贸易商走货' },
      { id: 'b_public', group: 'buyer', label: '政府与公共项目', description: '供应政府储备或公共工程' },
      { id: 'ex_factory', group: 'deliver', label: '矿区厂交', description: '矿区或选厂交货，运费买方承担' },
      { id: 'to_plant', group: 'deliver', label: '到厂交付', description: '送货到买方厂区' },
      { id: 'port_delivery', group: 'deliver', label: '港口交割', description: '在指定港口或交割库交货' },
      { id: 'p_spot', group: 'pricing', label: '现货随行就市', description: '按市场行情逐单议价' },
      { id: 'p_long', group: 'pricing', label: '长协合同价', description: '与客户签长期协议锁量锁价' },
      { id: 'p_index', group: 'pricing', label: '挂指数定价', description: '按公开价格指数加减点定价' },
    ],
    faqs: [
      { id: 'spec', group: 'decision', question: '品位和规格怎么样？有化验单吗？', hint: '回答应给出品位区间并提供每批化验单' },
      { id: 'capacity', group: 'decision', question: '月供量能到多少？能稳定供多久？', hint: '回答应给出可供货量和稳定供货周期' },
      { id: 'sample', group: 'decision', question: '可以先寄样品吗？费用谁出？', hint: '回答应说明样品政策' },
      { id: 'logistics', group: 'detail', question: '运输和装卸谁负责？运费怎么算？', hint: '回答应写明交货地点和运费承担' },
      { id: 'settle', group: 'detail', question: '结算方式是什么？验货后付款还是预付？', hint: '回答应说明付款节奏和结算依据' },
      { id: 'quality_claim', group: 'detail', question: '到货品位对不上怎么处理？', hint: '回答应说明复检机制和差异处理规则' },
      { id: 'license', group: 'risk', question: '采矿证、安全生产许可证齐全吗？在哪查？', hint: '回答应给出证照编号或官方查询渠道' },
      { id: 'enviro', group: 'risk', question: '环保和复垦方面有没有处罚记录？', hint: '回答应说明环保合规情况及查询方式' },
    ],
  },
  mfg: {
    groups: [
      { id: 'production', label: '生产方式', select: 'many' },
      { id: 'sales', label: '销售模式', select: 'many' },
      { id: 'buyer', label: '主要客户', select: 'many' },
      { id: 'tier', label: '定价档位', select: 'one' },
    ],
    traits: [
      { id: 'own_factory', group: 'production', label: '自有工厂量产', description: '产品在自有工厂批量生产' },
      { id: 'manual_small', group: 'production', label: '手工与小批量定制', description: '以手工或小批量按订单生产' },
      { id: 'auto_line', group: 'production', label: '自动化产线', description: '关键工序由自动化产线完成' },
      { id: 'odm_oem', group: 'production', label: '承接代工（OEM/ODM）', description: '为其他品牌代工生产或代设计生产' },
      { id: 'direct_sale', group: 'sales', label: '厂家直销', description: '绕过经销商由厂家直接销售' },
      { id: 'distribution', group: 'sales', label: '经销分销体系', description: '通过经销商、代理商铺货' },
      { id: 'flagship', group: 'sales', label: '电商旗舰店', description: '在天猫、京东等平台开官方店' },
      { id: 'export_main', group: 'sales', label: '出口为主', description: '主要产能面向海外订单' },
      { id: 'b_business', group: 'buyer', label: '企业与机构客户', description: '主要客户是企业、工程或机构采购' },
      { id: 'b_consumer', group: 'buyer', label: '个人消费者', description: '主要客户是终端个人消费者' },
      { id: 'b_overseas', group: 'buyer', label: '海外市场', description: '主要客户在境外' },
      { id: 't_economy', group: 'tier', label: '经济型', description: '主打低价走量档位' },
      { id: 't_mid', group: 'tier', label: '中端', description: '主流价格带，面向大众消费' },
      { id: 't_upper', group: 'tier', label: '中高端', description: '价格带高于主流品牌一档' },
      { id: 't_lux', group: 'tier', label: '高端', description: '同品类中的高档价位' },
    ],
    faqs: [
      { id: 'moq', group: 'decision', question: '起订量多少？打样要多久、收不收费？', hint: '回答应给出最小起订量、打样周期和打样费退还规则' },
      { id: 'quality_proof', group: 'decision', question: '怎么证明你们的质量？有检测报告吗？', hint: '回答应给出可查的检测报告、认证证书或质保条款' },
      { id: 'warranty', group: 'decision', question: '质保多久？保什么、不保什么？', hint: '回答应分列保修范围、免责情形和处理时限' },
      { id: 'lead_time', group: 'detail', question: '交货周期一般多久？加急能不能做？', hint: '回答应给出常规交期和加急条件' },
      { id: 'custom_vs_std', group: 'detail', question: '定制和标准品价格差多少？开模费怎么算？', hint: '回答应给出定制溢价幅度和模具费归属' },
      { id: 'qc_report', group: 'detail', question: '出厂带检验报告吗？都检哪些项目？', hint: '回答应说明出厂检验项目和报告随货情况' },
      { id: 'defect', group: 'risk', question: '收到货有质量问题怎么处理？运费谁出？', hint: '回答应写明退换流程、时限和运费承担' },
      { id: 'parts_supply', group: 'risk', question: '停产型号的配件还能供应多久？', hint: '回答应给出停产后备件供应年限承诺' },
      { id: 'official_channel', group: 'decision', question: '在哪买是官方正品渠道？怎么防串货和假货？', hint: '回答应列出官方购买渠道和防伪查验方式' },
      { id: 'nationwide_warranty', group: 'detail', question: '全国联保吗？人在异地能修吗？', hint: '回答应说明保修网络覆盖和异地送修流程' },
    ],
  },
  energy: {
    groups: [
      { id: 'user', label: '用户类型', select: 'many' },
      { id: 'scope', label: '经营范围', select: 'many' },
      { id: 'pricing', label: '价格机制', select: 'one' },
      { id: 'biz', label: '业务环节', select: 'many' },
    ],
    traits: [
      { id: 'u_resident', group: 'user', label: '居民用户', description: '面向家庭用户供应或服务' },
      { id: 'u_business', group: 'user', label: '工商业用户', description: '面向工厂、商铺等经营用户' },
      { id: 'u_grid', group: 'user', label: '电力上网', description: '所产电力上网销售' },
      { id: 'u_park', group: 'user', label: '园区集中供能', description: '向园区多家用户集中供应' },
      { id: 's_local', group: 'scope', label: '本地经营', description: '在单一城市或园区内经营' },
      { id: 's_multi', group: 'scope', label: '跨区域经营', description: '在多个省市有项目或用户' },
      { id: 'p_gov', group: 'pricing', label: '政府定价或指导价', description: '执行政府核价或指导价' },
      { id: 'p_market', group: 'pricing', label: '市场化交易', description: '通过市场化交易形成价格' },
      { id: 'p_contract', group: 'pricing', label: '长期合同价', description: '与用户签长期合同锁定价格' },
      { id: 'b_generate', group: 'biz', label: '生产供应', description: '自营生产电、热、气或水' },
      { id: 'b_network', group: 'biz', label: '管网与输配', description: '运营管网或输配设施' },
      { id: 'b_service', group: 'biz', label: '安装与维保服务', description: '提供接入安装、运维检修服务' },
    ],
    faqs: [
      { id: 'price_check', group: 'decision', question: '价格怎么定的？在哪能查到收费标准？', hint: '回答应给出价格构成和官方可查渠道' },
      { id: 'access', group: 'decision', question: '报装要什么材料、多久能通？', hint: '回答应列出报装材料和办理时限' },
      { id: 'plan_diff', group: 'decision', question: '有几种套餐或计价方式？适合哪种用量？', hint: '回答应分档说明并给出用量适配建议' },
      { id: 'meter', group: 'detail', question: '计量表怎么抄、怎么核对用量？', hint: '回答应说明抄表周期和用量查询方式' },
      { id: 'outage', group: 'detail', question: '停供或故障怎么报修？多久恢复？', hint: '回答应给出报修渠道和抢修时限承诺' },
      { id: 'bill', group: 'detail', question: '账单怎么开？能开增值税发票吗？', hint: '回答应说明账单周期和开票渠道' },
      { id: 'safety', group: 'risk', question: '户内设施安全问题谁负责？有定期检查吗？', hint: '回答应划分责任边界并说明入户安检安排' },
      { id: 'complaint', group: 'risk', question: '对计量或收费有争议找谁？', hint: '回答应给出争议复核渠道和处理时限' },
    ],
  },
  build: {
    groups: [
      { id: 'contract', label: '承接方式', select: 'many' },
      { id: 'buyer', label: '主要客户', select: 'many' },
      { id: 'settle', label: '结算方式', select: 'one' },
      { id: 'qualification', label: '资质等级', select: 'many' },
    ],
    traits: [
      { id: 'gc', group: 'contract', label: '施工总承包', description: '作为总包承接整项工程' },
      { id: 'sub', group: 'contract', label: '专业分包', description: '承接单项专业工程分包' },
      { id: 'epc', group: 'contract', label: '设计施工一体化（EPC）', description: '从设计到施工一体化承接' },
      { id: 'reno', group: 'contract', label: '装修改造专项', description: '专注装修、改造、翻新工程' },
      { id: 'b_dev', group: 'buyer', label: '房地产开发商', description: '主要客户是房企' },
      { id: 'b_gov', group: 'buyer', label: '政府与市政', description: '主要客户是政府投资项目' },
      { id: 'b_enterprise', group: 'buyer', label: '企事业单位', description: '主要客户是企业厂房、办公楼' },
      { id: 'b_personal', group: 'buyer', label: '个人业主', description: '主要客户是家装的个体业主' },
      { id: 'fixed', group: 'settle', label: '固定总价', description: '按合同总价包干结算' },
      { id: 'boq', group: 'settle', label: '清单计价按实结算', description: '按工程量清单据实结算' },
      { id: 'unit_price', group: 'settle', label: '单价包干', description: '按单价乘工程量结算' },
      { id: 'q_first', group: 'qualification', label: '一级及以上总承包资质', description: '持施工总承包一级或特级资质' },
      { id: 'q_prof', group: 'qualification', label: '专业承包资质', description: '持相应专业承包资质' },
      { id: 'q_design', group: 'qualification', label: '设计资质', description: '持工程设计相应等级资质' },
    ],
    faqs: [
      { id: 'quote', group: 'decision', question: '报价怎么出？免费量房或勘测吗？', hint: '回答应说明报价流程和勘测是否收费' },
      { id: 'reference', group: 'decision', question: '附近有做过的项目能看看吗？', hint: '回答应提供可参观或可核实的过往项目' },
      { id: 'schedule', group: 'decision', question: '工期多长？延误了怎么赔？', hint: '回答应给出工期和延期违约条款' },
      { id: 'payment_steps', group: 'detail', question: '工程款分几笔付？验收标准是什么？', hint: '回答应列出付款节点和验收依据' },
      { id: 'changes', group: 'detail', question: '施工中改方案怎么计价？', hint: '回答应说明变更签证流程和计价规则' },
      { id: 'site_mgmt', group: 'detail', question: '工地怎么管理？能看进度吗？', hint: '回答应说明现场管理和进度反馈方式' },
      { id: 'warranty', group: 'risk', question: '竣工后保修几年？防水、隐蔽工程保多久？', hint: '回答应分列各部位保修年限' },
      { id: 'bond', group: 'risk', question: '有质保金吗？出了问题扣谁的？', hint: '回答应说明质保金比例和返还条件' },
    ],
  },
  trade: {
    groups: [
      { id: 'scale', label: '经营形态', select: 'many' },
      { id: 'moq', label: '起订门槛', select: 'one' },
      { id: 'logistics', label: '配送方式', select: 'many' },
      { id: 'payment', label: '结算方式', select: 'many' },
    ],
    traits: [
      { id: 'single_cat', group: 'scale', label: '单品类深耕', description: '专注一个品类做深做全' },
      { id: 'multi_cat', group: 'scale', label: '多品类综合', description: '跨多个品类合并配货' },
      { id: 'own_brand', group: 'scale', label: '自有品牌贴牌', description: '有自有品牌或定制贴牌货' },
      { id: 'agency_brand', group: 'scale', label: '品牌授权代理', description: '持有品牌方的区域代理授权' },
      { id: 'm_retail_ok', group: 'moq', label: '支持小额混批', description: '低起订额且可多款混批' },
      { id: 'm_case', group: 'moq', label: '整箱整托起订', description: '按整箱或整托起订' },
      { id: 'm_big_only', group: 'moq', label: '面向大客户定制', description: '只接大单或定向供货' },
      { id: 'own_fleet', group: 'logistics', label: '自有车队配送', description: '自有车辆送货' },
      { id: 'third_logi', group: 'logistics', label: '第三方物流发货', description: '委托快递物流公司发货' },
      { id: 'self_pick', group: 'logistics', label: '支持自提', description: '买家可到仓自提' },
      { id: 'cash', group: 'payment', label: '现款现货', description: '付款后发货，不做账期' },
      { id: 'monthly', group: 'payment', label: '月结账期', description: '与客户约定账期按月结算' },
      { id: 'supply_chain_finance', group: 'payment', label: '支持供应链金融', description: '可通过供应链金融工具付款' },
    ],
    faqs: [
      { id: 'moq_price', group: 'decision', question: '起订量多少？不同数量价格差多少？', hint: '回答应给出起订量和阶梯价' },
      { id: 'stock', group: 'decision', question: '现货还是订货？多久能发？', hint: '回答应区分现货品种和订货周期' },
      { id: 'sample', group: 'decision', question: '能先拿样品确认再下单吗？', hint: '回答应说明样品价格和退还规则' },
      { id: 'shipping_cost', group: 'detail', question: '运费怎么算？到哪送货？', hint: '回答应说明运费承担和送达范围' },
      { id: 'shortage', group: 'detail', question: '缺货少件怎么补？', hint: '回答应说明短缺核对和补货流程' },
      { id: 'invoice_w', group: 'detail', question: '开票品名和税率按什么开？', hint: '回答应说明开票内容' },
      { id: 'return_w', group: 'risk', question: '质量有问题退换货谁承担运费？', hint: '回答应写明质量问题退换的运费归属' },
      { id: 'price_drop', group: 'risk', question: '拿货后跌价了怎么办？能补差吗？', hint: '回答应说明价格保护政策' },
    ],
  },
  retail: {
    groups: [
      { id: 'channel', label: '经营渠道', select: 'many' },
      { id: 'strategy', label: '价格策略', select: 'one' },
      { id: 'service', label: '售后服务', select: 'many' },
      { id: 'buyer', label: '客群定位', select: 'many' },
    ],
    traits: [
      { id: 'store', group: 'channel', label: '实体门店', description: '有线下的零售门店' },
      { id: 'flagship', group: 'channel', label: '电商平台旗舰店', description: '在天猫、京东等平台开官方店' },
      { id: 'live_regular', group: 'channel', label: '直播常态化', description: '有固定直播间的常态化带货' },
      { id: 'private_domain', group: 'channel', label: '小程序与私域', description: '自有小程序或社群成交' },
      { id: 'vending', group: 'channel', label: '自动售货点位', description: '通过无人售货设备销售' },
      { id: 'edlp', group: 'strategy', label: '天天平价少促销', description: '日常低价格、少搞促销活动' },
      { id: 'member_price', group: 'strategy', label: '会员价体系', description: '会员享受专属价格或折扣' },
      { id: 'promo_heavy', group: 'strategy', label: '高频促销驱动', description: '靠大促、券和满减驱动成交' },
      { id: 'seven_day', group: 'service', label: '七天无理由退换', description: '支持七天无理由退换货' },
      { id: 'same_city', group: 'service', label: '同城即时配送', description: '同城下单后即时送达' },
      { id: 'free_install', group: 'service', label: '免费配送安装', description: '大件免费送货并安装' },
      { id: 'points', group: 'service', label: '会员积分体系', description: '消费积分可累计兑换' },
      { id: 'b_mass', group: 'buyer', label: '大众客群', description: '面向大众消费者' },
      { id: 'b_family', group: 'buyer', label: '家庭客群', description: '以家庭采购为主要客群' },
      { id: 'b_premium', group: 'buyer', label: '中高端客群', description: '面向消费力较高的客群' },
    ],
    faqs: [
      { id: 'price_compare', group: 'decision', question: '和别的店比，你们价格怎么样？保价吗？', hint: '回答应说明价格策略和保价政策' },
      { id: 'stock_check', group: 'decision', question: '怎么查门店有没有货？能留货吗？', hint: '回答应给出库存查询和留货方式' },
      { id: 'member_benefit', group: 'decision', question: '办会员有什么实际优惠？', hint: '回答应给出会员具体折扣和权益' },
      { id: 'delivery', group: 'detail', question: '线上下单多久送到？满多少免运费？', hint: '回答应给出配送时效和免邮门槛' },
      { id: 'return_policy', group: 'detail', question: '退换货怎么操作？多久到账？', hint: '回答应写明退换流程和退款时限' },
      { id: 'invoice_r', group: 'detail', question: '发票怎么开？电子的还是纸质的？', hint: '回答应说明开票渠道和类型' },
      { id: 'warranty_r', group: 'risk', question: '买的东西出问题找你们还是找厂家？', hint: '回答应说明售后责任划分' },
      { id: 'gift_card', group: 'risk', question: '购物卡、储值余额能退吗？', hint: '回答应说明预付余额的退还规则' },
    ],
  },
  transport: {
    groups: [
      { id: 'service', label: '业务类型', select: 'many' },
      { id: 'sla', label: '时效承诺', select: 'many' },
      { id: 'buyer', label: '主要客户', select: 'many' },
      { id: 'claim', label: '丢损赔付', select: 'one' },
    ],
    traits: [
      { id: 'ftl', group: 'service', label: '整车运输', description: '按整车承运' },
      { id: 'ltl', group: 'service', label: '零担运输', description: '接受不足整车的小批量货物拼载' },
      { id: 'express', group: 'service', label: '快递寄递', description: '提供门到门快递服务' },
      { id: 'instant', group: 'service', label: '即时配送', description: '同城小时级或分钟级配送' },
      { id: 'warehousing', group: 'service', label: '仓配一体', description: '提供仓储加配送一体化服务' },
      { id: 'cold_chain_t', group: 'service', label: '冷链运输', description: '全程温控运输' },
      { id: 'dangerous', group: 'service', label: '危险品运输', description: '持有危险品运输资质' },
      { id: 'same_day', group: 'sla', label: '当日达', description: '承诺当日送达' },
      { id: 'next_day', group: 'sla', label: '次日达', description: '承诺次日送达' },
      { id: 'timed', group: 'sla', label: '定时达', description: '可约定具体时间窗送达' },
      { id: 'b_corp', group: 'buyer', label: '企业合同物流', description: '与企业签年度合同价' },
      { id: 'b_personal', group: 'buyer', label: '个人寄递', description: '服务个人散单' },
      { id: 'c_insured', group: 'claim', label: '保价按声明价值赔', description: '按保价额和声明价值理赔' },
      { id: 'c_multiple', group: 'claim', label: '按运费倍数赔付', description: '未保价时按运费倍数封顶赔付' },
    ],
    faqs: [
      { id: 'price_t', group: 'decision', question: '怎么收费？按重量还是体积？', hint: '回答应给出计费规则和首重续重单价' },
      { id: 'time_quote', group: 'decision', question: '几天能到？超时了有赔付吗？', hint: '回答应给出时效承诺和超时处理' },
      { id: 'coverage', group: 'decision', question: '哪些地方能到？偏远地区加钱吗？', hint: '回答应说明覆盖范围和偏远附加费' },
      { id: 'pack', group: 'detail', question: '帮忙打包吗？包装收费吗？', hint: '回答应说明包装服务和收费' },
      { id: 'track', group: 'detail', question: '怎么跟踪货物位置？', hint: '回答应给出轨迹查询方式' },
      { id: 'cod', group: 'detail', question: '支持代收货款吗？多久结算？', hint: '回答应说明代收货款和结算周期' },
      { id: 'lost', group: 'risk', question: '丢了坏了怎么赔？没保价赔多少？', hint: '回答应写明保价与未保价两种赔付标准' },
      { id: 'dispute', group: 'risk', question: '理赔纠纷找谁？多久给结果？', hint: '回答应给出理赔渠道和答复时限' },
    ],
  },
  hospitality: {
    groups: [
      { id: 'format', label: '经营形态', select: 'many' },
      { id: 'buyer', label: '客群定位', select: 'many' },
      { id: 'tier', label: '价格档位', select: 'one' },
      { id: 'channel', label: '预订渠道', select: 'many' },
    ],
    traits: [
      { id: 'chain_direct', group: 'format', label: '连锁直营', description: '同一品牌多店直营管理' },
      { id: 'franchise', group: 'format', label: '加盟连锁', description: '品牌以加盟方式扩张' },
      { id: 'independent', group: 'format', label: '独立单体', description: '非连锁的独立经营门店' },
      { id: 'b_business', group: 'buyer', label: '商旅客群', description: '以商旅客户为主' },
      { id: 'b_family', group: 'buyer', label: '家庭亲子', description: '以家庭、亲子客群为主' },
      { id: 'b_young', group: 'buyer', label: '年轻客群', description: '以年轻消费群体为主' },
      { id: 't_economy', group: 'tier', label: '经济型', description: '同业态中的经济价位' },
      { id: 't_midscale', group: 'tier', label: '中端', description: '同业态中的主流价位' },
      { id: 't_upper', group: 'tier', label: '中高端', description: '高于主流价位一档' },
      { id: 't_lux', group: 'tier', label: '高端', description: '同业态中的高档价位' },
      { id: 'ota', group: 'channel', label: '平台线上预订', description: '可通过 OTA 或点评平台预订' },
      { id: 'direct_book', group: 'channel', label: '官方渠道直订', description: '官网、官方 App 或电话直订' },
      { id: 'walk_in', group: 'channel', label: '到店即客', description: '以现场到店客为主' },
    ],
    faqs: [
      { id: 'price_h', group: 'decision', question: '平常和周末节假日价格差多少？', hint: '回答应给出不同时段的价格区间' },
      { id: 'cancel', group: 'decision', question: '预订后能免费取消吗？提前多久？', hint: '回答应说明取消政策和时限' },
      { id: 'choice', group: 'decision', question: '这家和旁边同价位的比，选哪家值？', hint: '回答应给出本店可核实的差异点，不贬低同行' },
      { id: 'peak', group: 'detail', question: '高峰时段要排队吗？怎么避免？', hint: '回答应说明高峰时段和预约方式' },
      { id: 'parking', group: 'detail', question: '有停车场吗？收费吗？', hint: '回答应说明停车位数量和收费' },
      { id: 'invoice_h', group: 'detail', question: '能开发票吗？怎么开？', hint: '回答应说明开票方式' },
      { id: 'deposit', group: 'risk', question: '收押金吗？怎么退、多久退？', hint: '回答应说明押金金额和退还时限' },
      { id: 'prepaid_h', group: 'risk', question: '办的储值卡、次卡没用完能退吗？', hint: '回答应说明余额和剩余次数的退费规则' },
    ],
  },
  tech: {
    groups: [
      { id: 'delivery', label: '交付形态', select: 'many' },
      { id: 'deploy', label: '部署方式', select: 'many' },
      { id: 'buyer', label: '客户类型', select: 'many' },
      { id: 'pricing', label: '收费模式', select: 'one' },
    ],
    traits: [
      { id: 'saas', group: 'delivery', label: '标准产品订阅', description: '标准化产品按订阅提供服务' },
      { id: 'project_dev', group: 'delivery', label: '项目定制开发', description: '按客户需求定制开发交付' },
      { id: 'outsourcing', group: 'delivery', label: '技术服务外包', description: '承接驻场或离岸技术服务' },
      { id: 'hw_bundle', group: 'delivery', label: '软硬件一体交付', description: '设备与软件打包交付' },
      { id: 'cloud_pub', group: 'deploy', label: '公有云部署', description: '部署在公有云上交付' },
      { id: 'private_d', group: 'deploy', label: '私有化部署', description: '可部署在客户自有环境' },
      { id: 'b_enterprise', group: 'buyer', label: '大型企业', description: '主要服务大型企业客户' },
      { id: 'b_sme', group: 'buyer', label: '中小企业', description: '主要服务中小企业' },
      { id: 'b_personal', group: 'buyer', label: '个人用户', description: '面向个人用户提供服务' },
      { id: 'b_gov', group: 'buyer', label: '政府事业单位', description: '主要服务政府和事业单位' },
      { id: 'freemium', group: 'pricing', label: '免费增值', description: '基础功能免费，高级功能付费' },
      { id: 'per_seat', group: 'pricing', label: '按席位订阅', description: '按账号或席位数量按期订阅' },
      { id: 'one_time', group: 'pricing', label: '一次性买断', description: '一次付费永久或长期使用' },
      { id: 'per_project', group: 'pricing', label: '项目制报价', description: '按项目工作量评估报价' },
    ],
    faqs: [
      { id: 'trial', group: 'decision', question: '能先免费试用吗？试用版有限制吗？', hint: '回答应说明试用期限和功能限制' },
      { id: 'price_tech', group: 'decision', question: '怎么收费？我们这个规模大概多少钱一年？', hint: '回答应给出定价方式和典型规模的价格区间' },
      { id: 'migrate', group: 'decision', question: '现在用的系统数据能迁过来吗？', hint: '回答应说明数据迁移支持范围和费用' },
      { id: 'training', group: 'detail', question: '上线给你们培训吗？员工不会用怎么办？', hint: '回答应说明培训安排和后续支持' },
      { id: 'sla_tech', group: 'detail', question: '系统出故障多久响应？有服务承诺吗？', hint: '回答应给出响应和解决时限承诺' },
      { id: 'update', group: 'detail', question: '后续升级收费吗？多久更新一次？', hint: '回答应区分免费升级和付费功能' },
      { id: 'data_own', group: 'risk', question: '我们的数据存在哪？不用了能导出删除吗？', hint: '回答应说明数据存放位置和退出时的导出删除政策' },
      { id: 'lock_in', group: 'risk', question: '续费涨价怎么办？不续费服务就停吗？', hint: '回答应说明续费价格规则和到期处理' },
    ],
  },
  finance: {
    groups: [
      { id: 'buyer', label: '客户类型', select: 'many' },
      { id: 'channel', label: '服务渠道', select: 'many' },
      { id: 'pricing', label: '收费透明度', select: 'one' },
      { id: 'license', label: '牌照资质', select: 'many' },
    ],
    traits: [
      { id: 'b_retail', group: 'buyer', label: '个人客户', description: '面向个人零售客户' },
      { id: 'b_corp', group: 'buyer', label: '企业客户', description: '面向企业机构客户' },
      { id: 'b_both', group: 'buyer', label: '个人企业兼营', description: '同时服务个人与企业' },
      { id: 'branch', group: 'channel', label: '线下网点', description: '有实体网点柜台办理' },
      { id: 'app', group: 'channel', label: 'App 线上办理', description: '可通过 App 或线上渠道办理' },
      { id: 'agent_ch', group: 'channel', label: '代理与经纪人', description: '通过持证代理或经纪人展业' },
      { id: 'fee_public', group: 'pricing', label: '费率公示可查', description: '收费标准对外公示且可查验' },
      { id: 'fee_neg', group: 'pricing', label: '一事一议', description: '按项目情况单独报价' },
      { id: 'l_national', group: 'license', label: '全国性牌照', description: '持全国展业牌照' },
      { id: 'l_local', group: 'license', label: '区域性牌照', description: '持区域展业牌照' },
      { id: 'l_intermediary', group: 'license', label: '中介或代理资质', description: '以持牌机构代理身份展业' },
    ],
    faqs: [
      { id: 'cost_f', group: 'decision', question: '你们收多少费用？什么环节收？', hint: '回答应逐项列明费用名目和费率' },
      { id: 'compare_f', group: 'decision', question: '和同类机构比，你们的费率什么水平？', hint: '回答应给出可对比的费率数据和口径' },
      { id: 'threshold', group: 'decision', question: '办理门槛是什么？什么情况办不了？', hint: '回答应说明准入条件和常见拒绝情形' },
      { id: 'timeline_f', group: 'detail', question: '流程要多久？中间哪些节点要我到场？', hint: '回答应给出办理时长和必须到场的环节' },
      { id: 'disclosure', group: 'detail', question: '合同里的关键条款能逐条解释吗？', hint: '回答应对收费、期限、违约等关键条款作说明' },
      { id: 'redeem', group: 'detail', question: '到期或退出，资金多久到账？', hint: '回答应给出到期处理和资金到账时限' },
      { id: 'license_f', group: 'risk', question: '你们的牌照编号是多少？在哪查真伪？', hint: '回答应给出监管牌照信息和官方查询入口' },
      { id: 'dispute_f', group: 'risk', question: '出了纠纷找谁？有投诉专线吗？', hint: '回答应给出投诉渠道和处理时限' },
    ],
  },
  realestate: {
    groups: [
      { id: 'biz', label: '业务类型', select: 'many' },
      { id: 'asset', label: '业态', select: 'many' },
      { id: 'buyer', label: '客群定位', select: 'many' },
      { id: 'channel', label: '交易渠道', select: 'many' },
    ],
    traits: [
      { id: 'develop_sale', group: 'biz', label: '开发销售', description: '开发后出售物业' },
      { id: 'hold_operate', group: 'biz', label: '持有运营', description: '自持物业出租运营' },
      { id: 'agency_r', group: 'biz', label: '经纪代理', description: '提供买卖租赁的居间代理' },
      { id: 'mgmt_r', group: 'biz', label: '物业管理', description: '提供物业服务' },
      { id: 'residential', group: 'asset', label: '住宅', description: '以住宅物业为主' },
      { id: 'commercial', group: 'asset', label: '商办物业', description: '以商业办公物业为主' },
      { id: 'industrial_park', group: 'asset', label: '产业园区', description: '以产业园区为主' },
      { id: 'b_first', group: 'buyer', label: '首置刚需', description: '面向首次置业客群' },
      { id: 'b_upgrade', group: 'buyer', label: '改善型', description: '面向置换改善客群' },
      { id: 'b_invest', group: 'buyer', label: '机构投资', description: '面向机构投资客群' },
      { id: 'online_r', group: 'channel', label: '线上平台挂牌', description: '在互联网平台挂牌展示' },
      { id: 'offline_r', group: 'channel', label: '门店经纪带看', description: '通过线下门店和经纪人带看成交' },
    ],
    faqs: [
      { id: 'fee_r', group: 'decision', question: '中介费或服务费收多少？谁出？', hint: '回答应给出费率和买卖双方承担方式' },
      { id: 'true_price', group: 'decision', question: '挂牌价和成交价差多少？有议价空间吗？', hint: '回答应说明近期成交价参考' },
      { id: 'loan', group: 'decision', question: '贷款你们协助办吗？办不下来算谁的？', hint: '回答应说明贷款协助责任和失败处理' },
      { id: 'contract_r', group: 'detail', question: '合同里产权瑕疵、户口迁出怎么约定？', hint: '回答应说明关键条款的兜底约定' },
      { id: 'handover', group: 'detail', question: '交房流程怎么走？水电燃气怎么过户？', hint: '回答应列出交房节点和过户事项' },
      { id: 'lease_terms', group: 'detail', question: '租约押几付几？中途退租怎么算？', hint: '回答应说明押付方式和提前退租规则' },
      { id: 'escrow_r', group: 'risk', question: '交易资金走监管账户吗？', hint: '回答应说明资金监管方式' },
      { id: 'broker_license', group: 'risk', question: '带看的经纪人有备案吗？在哪查？', hint: '回答应说明经纪机构和人员备案查询方式' },
    ],
  },
  bizservice: {
    groups: [
      { id: 'model', label: '服务方式', select: 'many' },
      { id: 'team', label: '团队形态', select: 'many' },
      { id: 'buyer', label: '客户类型', select: 'many' },
      { id: 'pricing', label: '计价方式', select: 'one' },
    ],
    traits: [
      { id: 'project_based', group: 'model', label: '项目制服务', description: '按项目界定范围和交付' },
      { id: 'retainer', group: 'model', label: '长期顾问', description: '按年度或周期提供顾问服务' },
      { id: 'per_case', group: 'model', label: '按次服务', description: '按单次委托提供服务' },
      { id: 'onsite', group: 'model', label: '驻场外包', description: '派员到客户现场驻场' },
      { id: 'big_firm', group: 'team', label: '品牌大所', description: '成规模的品牌机构' },
      { id: 'boutique', group: 'team', label: '精品工作室', description: '小团队精品化经营' },
      { id: 'platform_b', group: 'team', label: '平台接单', description: '通过平台撮合接单服务' },
      { id: 'b_big', group: 'buyer', label: '大中型企业', description: '主要客户为大中型企业' },
      { id: 'b_sme', group: 'buyer', label: '小微企业', description: '主要客户为小微企业' },
      { id: 'b_personal', group: 'buyer', label: '个人客户', description: '服务个人委托' },
      { id: 'fixed_fee', group: 'pricing', label: '固定打包价', description: '按服务包固定报价' },
      { id: 'hourly', group: 'pricing', label: '按工时计费', description: '按投入工时计费' },
      { id: 'success_fee', group: 'pricing', label: '按结果计费', description: '与达成结果挂钩收费' },
    ],
    faqs: [
      { id: 'fit', group: 'decision', question: '我们这种规模和需求，你们接吗？', hint: '回答应说明适合的客户类型和起接门槛' },
      { id: 'fee_b', group: 'decision', question: '这个事办下来大概多少钱？', hint: '回答应给出典型情形的价格区间和计价口径' },
      { id: 'team_who', group: 'decision', question: '具体谁来做？干活的是资深的人还是新人？', hint: '回答应说明项目团队构成和资历' },
      { id: 'process_b', group: 'detail', question: '流程怎么走？多久出结果？', hint: '回答应列出阶段、节点和周期' },
      { id: 'deliver_b', group: 'detail', question: '最后交付什么？修改次数有限制吗？', hint: '回答应说明交付物和修改范围' },
      { id: 'contact_b', group: 'detail', question: '对接人怎么联系？多久回复？', hint: '回答应给出对接安排和响应时限' },
      { id: 'confidential', group: 'risk', question: '我们的商业信息会保密吗？签保密协议吗？', hint: '回答应说明保密安排' },
      { id: 'refund_b', group: 'risk', question: '办不成怎么办？费用退吗？', hint: '回答应说明未达成结果的费用处理' },
    ],
  },
  techservice: {
    groups: [
      { id: 'service', label: '服务类型', select: 'many' },
      { id: 'accredit', label: '资质与效力', select: 'many' },
      { id: 'buyer', label: '客户类型', select: 'many' },
      { id: 'pricing', label: '计价方式', select: 'one' },
    ],
    traits: [
      { id: 'testing', group: 'service', label: '检验检测', description: '出具检测数据的检验检测服务' },
      { id: 'rd_out', group: 'service', label: '研发与试验外包', description: '承接研发、试验与开发设计' },
      { id: 'survey_map', group: 'service', label: '勘察与测绘', description: '提供勘察、测绘类技术服务' },
      { id: 'cert_consult', group: 'service', label: '认证与咨询', description: '协助认证申报与技术咨询' },
      { id: 'cma', group: 'accredit', label: 'CMA 检验检测资质', description: '持检验检测机构资质认定，报告具法律效力' },
      { id: 'cnas', group: 'accredit', label: 'CNAS 实验室认可', description: '获 CNAS 实验室认可' },
      { id: 'report_gov', group: 'accredit', label: '报告可用于政府事项', description: '报告被监管或审批环节采信' },
      { id: 'b_corp', group: 'buyer', label: '企业委托', description: '主要承接企业委托' },
      { id: 'b_gov', group: 'buyer', label: '政府委托', description: '承接政府购买服务或监督抽检' },
      { id: 'b_personal', group: 'buyer', label: '个人委托', description: '接受个人委托检测' },
      { id: 'per_item', group: 'pricing', label: '按项目计价', description: '按检测项目逐项计价' },
      { id: 'package', group: 'pricing', label: '打包套餐价', description: '按套餐打包计价' },
    ],
    faqs: [
      { id: 'legal', group: 'decision', question: '出的报告有法律效力吗？能用于诉讼或审批吗？', hint: '回答应说明资质和报告效力范围' },
      { id: 'cycle', group: 'decision', question: '多久出报告？能加急吗？加急费多少？', hint: '回答应给出常规周期和加急选项' },
      { id: 'sampling', group: 'decision', question: '样品怎么采？你们来采还是我送？', hint: '回答应说明采样方式和代表性问题' },
      { id: 'items', group: 'detail', question: '检哪些项目？标准依据是什么？', hint: '回答应列出检测项目和依据标准' },
      { id: 'retest', group: 'detail', question: '对结果有异议能复检吗？', hint: '回答应说明复检流程和费用' },
      { id: 'report_sample', group: 'detail', question: '能给看过往报告样式吗？', hint: '回答应提供脱敏样例报告' },
      { id: 'fake_report', group: 'risk', question: '报告真伪怎么验证？', hint: '回答应给出官方验真渠道' },
      { id: 'conflict', group: 'risk', question: '检测不合格会影响后续申报吗？你们帮忙整改吗？', hint: '回答应说明不合格后的处理与整改支持' },
    ],
  },
  environment: {
    groups: [
      { id: 'biz', label: '业务类型', select: 'many' },
      { id: 'buyer', label: '客户类型', select: 'many' },
      { id: 'model', label: '合作模式', select: 'many' },
      { id: 'pricing', label: '计价方式', select: 'one' },
    ],
    traits: [
      { id: 'engineering', group: 'biz', label: '工程治理', description: '承接污染治理工程的建设施工' },
      { id: 'operation', group: 'biz', label: '设施运营', description: '长期托管运营治理设施' },
      { id: 'monitoring', group: 'biz', label: '监测检测', description: '提供环境监测与检测服务' },
      { id: 'consult_e', group: 'biz', label: '咨询与管家', description: '提供环保咨询、管家式服务' },
      { id: 'b_gov', group: 'buyer', label: '政府与国企', description: '主要客户为政府平台与国企' },
      { id: 'b_factory', group: 'buyer', label: '工业企业', description: '主要客户为排污工业企业' },
      { id: 'b_park', group: 'buyer', label: '园区', description: '主要客户为工业园区' },
      { id: 'epc_e', group: 'model', label: 'EPC 总承包', description: '工程总承包交付' },
      { id: 'bot', group: 'model', label: 'BOT 特许经营', description: '投资建设并特许运营' },
      { id: 'third_party', group: 'model', label: '第三方治理', description: '按第三方治理模式托管治污' },
      { id: 'per_project_e', group: 'pricing', label: '按项目计价', description: '按工程或服务项目计价' },
      { id: 'per_ton', group: 'pricing', label: '按处理量计价', description: '按吨或水量等处理量计费' },
    ],
    faqs: [
      { id: 'effect', group: 'decision', question: '治理后能稳定达标吗？达不了标怎么办？', hint: '回答应给出达标承诺和未达标的责任条款' },
      { id: 'case_e', group: 'decision', question: '有同类项目的案例吗？运行数据能看吗？', hint: '回答应提供可核实的同类项目案例' },
      { id: 'subsidy', group: 'decision', question: '能申请什么补贴？你们协助申报吗？', hint: '回答应说明可申请的政策支持和代办范围' },
      { id: 'run_cost', group: 'detail', question: '建好后日常运行成本多少？', hint: '回答应给出能耗、药剂、人工等运行成本测算' },
      { id: 'monitor_data', group: 'detail', question: '运行数据我们能看到吗？多长上报一次？', hint: '回答应说明数据开放方式和上报频率' },
      { id: 'maintenance', group: 'detail', question: '设备维护谁管？备件多久到？', hint: '回答应说明维保责任和响应时限' },
      { id: 'compliance', group: 'risk', question: '被环保检查查出问题，责任怎么分？', hint: '回答应划分运营方与业主的责任边界' },
      { id: 'penalty', group: 'risk', question: '你们有过环保处罚记录吗？在哪查？', hint: '回答应说明合规记录和公开查询渠道' },
    ],
  },
  lifeservice: {
    groups: [
      { id: 'mode', label: '服务方式', select: 'many' },
      { id: 'format', label: '经营形态', select: 'many' },
      { id: 'buyer', label: '客群定位', select: 'many' },
      { id: 'pricing', label: '价格透明度', select: 'one' },
    ],
    traits: [
      { id: 'in_store', group: 'mode', label: '到店服务', description: '顾客到门店接受服务' },
      { id: 'door_to_door', group: 'mode', label: '上门服务', description: '服务人员上门服务' },
      { id: 'online_book', group: 'mode', label: '线上预约', description: '支持线上选时段预约' },
      { id: 'chain_l', group: 'format', label: '连锁品牌', description: '多门店连锁经营' },
      { id: 'solo', group: 'format', label: '个体门店', description: '个体经营的单店' },
      { id: 'platform_l', group: 'format', label: '平台接单', description: '通过本地生活平台接单' },
      { id: 'b_family_l', group: 'buyer', label: '家庭客群', description: '以家庭客户为主' },
      { id: 'b_white', group: 'buyer', label: '上班族', description: '以上班族为主' },
      { id: 'b_senior', group: 'buyer', label: '老年客群', description: '以老年客户为主' },
      { id: 'price_board', group: 'pricing', label: '明码标价公示', description: '服务价目表对外公示' },
      { id: 'price_case', group: 'pricing', label: '按情况报价', description: '上门查看后按情形报价' },
    ],
    faqs: [
      { id: 'price_l', group: 'decision', question: '大概多少钱？会不会到现场再加价？', hint: '回答应给出价格区间和加价的触发条件' },
      { id: 'staff', group: 'decision', question: '上门的是什么人？有证件吗？', hint: '回答应说明人员身份核验方式' },
      { id: 'book_l', group: 'decision', question: '怎么预约？最快什么时候能来？', hint: '回答应给出预约渠道和最快响应时间' },
      { id: 'material', group: 'detail', question: '材料辅料谁提供？用什么牌子？', hint: '回答应说明辅材的品牌和收费' },
      { id: 'duration', group: 'detail', question: '一次服务多长时间？做完怎么验收？', hint: '回答应给出服务时长和验收标准' },
      { id: 're_visit', group: 'detail', question: '做完不满意能返工吗？收费吗？', hint: '回答应说明返工规则' },
      { id: 'damage', group: 'risk', question: '服务中弄坏了东西怎么赔？', hint: '回答应说明损坏赔偿规则和保险情况' },
      { id: 'prepaid_l', group: 'risk', question: '办的卡没用完怎么办？', hint: '回答应说明储值卡余额和剩余次数的处理' },
    ],
  },
  education: {
    groups: [
      { id: 'mode', label: '授课形式', select: 'many' },
      { id: 'format', label: '机构形态', select: 'many' },
      { id: 'buyer', label: '学员群体', select: 'many' },
      { id: 'pricing', label: '价格与付费', select: 'many' },
    ],
    traits: [
      { id: 'offline_edu', group: 'mode', label: '线下面授', description: '在固定场地线下授课' },
      { id: 'live_edu', group: 'mode', label: '线上直播', description: '老师实时在线授课' },
      { id: 'recorded', group: 'mode', label: '录播加答疑', description: '录制课程加老师答疑' },
      { id: 'one_on_one_edu', group: 'mode', label: '一对一辅导', description: '一名老师对一名学员' },
      { id: 'chain_edu', group: 'format', label: '连锁校区', description: '同一品牌多校区经营' },
      { id: 'single_campus', group: 'format', label: '单一校区', description: '单个校区或单点经营' },
      { id: 'online_only', group: 'format', label: '纯线上机构', description: '无线下场地，纯线上交付' },
      { id: 'b_kid', group: 'buyer', label: '少儿学员', description: '面向学龄前或中小学学员' },
      { id: 'b_adult', group: 'buyer', label: '成人学员', description: '面向成年学员' },
      { id: 'b_corp_edu', group: 'buyer', label: '企业团训', description: '承接企业内训团课' },
      { id: 'free_trial_edu', group: 'pricing', label: '免费试听', description: '提供免费试听或体验课' },
      { id: 'installment', group: 'pricing', label: '支持分期', description: '学费可分期支付' },
      { id: 'refund_terms', group: 'pricing', label: '未上课程可退', description: '剩余课时按规则退费' },
    ],
    faqs: [
      { id: 'price_edu', group: 'decision', question: '怎么收费？一次要交多久的钱？', hint: '回答应给出单价、课包和最长收费周期' },
      { id: 'teacher_edu', group: 'decision', question: '老师什么背景？稳定吗？', hint: '回答应说明教师资历和流失后的替补安排' },
      { id: 'effect_edu', group: 'decision', question: '学多久能见效？怎么判断有没有用？', hint: '回答应给出可观察的阶段性节点' },
      { id: 'schedule_edu', group: 'detail', question: '课表怎么排？缺课能补吗？', hint: '回答应说明排课方式和补课规则' },
      { id: 'feedback_edu', group: 'detail', question: '学得怎么样有反馈吗？多久一次？', hint: '回答应说明反馈形式和频率' },
      { id: 'material_edu', group: 'detail', question: '教材教具要另买吗？多少钱？', hint: '回答应说明教材费用构成' },
      { id: 'refund_edu', group: 'risk', question: '中途不学了，学费怎么退？', hint: '回答应写明退费计算方式和到账时限' },
      { id: 'license_edu', group: 'risk', question: '办学资质在哪查？', hint: '回答应给出证照名称和查验渠道' },
    ],
  },
  health: {
    groups: [
      { id: 'nature', label: '机构性质', select: 'one' },
      { id: 'service', label: '服务范围', select: 'many' },
      { id: 'insurance', label: '医保情况', select: 'one' },
      { id: 'buyer', label: '患者来源', select: 'many' },
    ],
    traits: [
      { id: 'public_h', group: 'nature', label: '公立机构', description: '政府举办的公立机构' },
      { id: 'private_profit', group: 'nature', label: '民营营利性', description: '登记为营利性医疗机构' },
      { id: 'private_nonprofit', group: 'nature', label: '民营非营利性', description: '登记为非营利性医疗机构' },
      { id: 'outpatient', group: 'service', label: '门诊服务', description: '提供门诊诊疗' },
      { id: 'inpatient', group: 'service', label: '住院服务', description: '设床位提供住院' },
      { id: 'surgery', group: 'service', label: '手术服务', description: '开展手术项目' },
      { id: 'physical_exam', group: 'service', label: '体检服务', description: '提供健康体检' },
      { id: 'online_clinic', group: 'service', label: '线上问诊', description: '提供互联网问诊' },
      { id: 'insurance_yes', group: 'insurance', label: '医保定点', description: '为医保定点机构' },
      { id: 'insurance_no', group: 'insurance', label: '自费为主', description: '非医保定点，费用以自费为主' },
      { id: 'b_referral', group: 'buyer', label: '转诊患者', description: '以上级转诊患者为主' },
      { id: 'b_local', group: 'buyer', label: '周边居民', description: '服务周边社区居民' },
      { id: 'b_nationwide', group: 'buyer', label: '全国患者', description: '患者来自全国各地' },
    ],
    faqs: [
      { id: 'appointment', group: 'decision', question: '怎么挂号？当天能挂上吗？', hint: '回答应给出挂号渠道和号源情况' },
      { id: 'insurance_q', group: 'decision', question: '能用医保吗？哪些项目报不了？', hint: '回答应说明医保覆盖范围和自费项目' },
      { id: 'doctor_q', group: 'decision', question: '哪个医生看这个病好？怎么选？', hint: '回答应说明医生专长和查询方式，不代替诊断' },
      { id: 'cost_h', group: 'detail', question: '看一次大概花多少钱？', hint: '回答应给出常见诊疗路径的费用区间' },
      { id: 'report_h', group: 'detail', question: '检查报告多久出？怎么拿？', hint: '回答应说明报告时限和获取方式' },
      { id: 'revisit', group: 'detail', question: '复诊还要重新挂号吗？', hint: '回答应说明复诊流程' },
      { id: 'emergency', group: 'risk', question: '晚上或急诊能看吗？', hint: '回答应说明急诊和夜间服务安排' },
      { id: 'complaint_h', group: 'risk', question: '对诊疗有异议找谁？', hint: '回答应给出院内投诉和医患沟通渠道' },
    ],
  },
  culture: {
    groups: [
      { id: 'format', label: '内容形态', select: 'many' },
      { id: 'revenue', label: '变现方式', select: 'many' },
      { id: 'buyer', label: '受众与客户', select: 'many' },
      { id: 'pricing', label: '定价方式', select: 'one' },
    ],
    traits: [
      { id: 'live_show', group: 'format', label: '现场演出', description: '售票的现场演出内容' },
      { id: 'screen_content', group: 'format', label: '影视内容', description: '影视、剧集、短片等内容制作' },
      { id: 'publishing_c', group: 'format', label: '出版物', description: '图书、报刊、音像出版' },
      { id: 'digital_content', group: 'format', label: '数字内容', description: '线上数字内容产品' },
      { id: 'ticket_rev', group: 'revenue', label: '票房与票务', description: '以售票收入为主' },
      { id: 'copyright_rev', group: 'revenue', label: '版权授权', description: '以版权授权收入为主' },
      { id: 'ad_rev', group: 'revenue', label: '广告与赞助', description: '以广告赞助收入为主' },
      { id: 'derivative_rev', group: 'revenue', label: '衍生品', description: '以周边衍生品收入为主' },
      { id: 'b_audience', group: 'buyer', label: '大众受众', description: '面向大众消费者' },
      { id: 'b_fans', group: 'buyer', label: '垂直圈层', description: '面向特定兴趣圈层' },
      { id: 'b_advertiser', group: 'buyer', label: '品牌广告主', description: '主要收入来自品牌客户' },
      { id: 'p_ticket', group: 'pricing', label: '按场次售票', description: '按场次和座位定价售票' },
      { id: 'p_subscription', group: 'pricing', label: '会员订阅', description: '以会员订阅方式收费' },
      { id: 'p_free', group: 'pricing', label: '免费加广告', description: '内容免费以广告变现' },
    ],
    faqs: [
      { id: 'content_fit', group: 'decision', question: '适合什么人看？孩子能看吗？', hint: '回答应说明内容定位和适宜提示' },
      { id: 'price_c', group: 'decision', question: '票价多少钱？座位怎么选？', hint: '回答应给出票价结构和选座建议' },
      { id: 'refund_c', group: 'decision', question: '临时有事能退票吗？扣多少？', hint: '回答应说明退改签规则' },
      { id: 'duration_c', group: 'detail', question: '一场多长时间？中途能出场吗？', hint: '回答应说明时长和出入规则' },
      { id: 'access_c', group: 'detail', question: '在哪看？怎么取票？', hint: '回答应给出观看或取票方式' },
      { id: 'new_content', group: 'detail', question: '多久更新或上新一次？', hint: '回答应给出上新频率' },
      { id: 'license_c', group: 'risk', question: '演出或出版有审批文号吗？', hint: '回答应给出审批信息及查询方式' },
      { id: 'privacy_c', group: 'risk', question: '会员信息和支付安全怎么保障？', hint: '回答应说明账户与支付安全保障' },
    ],
  },
  public: {
    groups: [
      { id: 'mode', label: '办理方式', select: 'many' },
      { id: 'fee', label: '收费情况', select: 'one' },
      { id: 'buyer', label: '服务对象', select: 'many' },
      { id: 'area', label: '管辖范围', select: 'one' },
    ],
    traits: [
      { id: 'window', group: 'mode', label: '窗口办理', description: '线下窗口现场办理' },
      { id: 'online_gov', group: 'mode', label: '线上办理', description: '可通过网上平台办理' },
      { id: 'appointment_gov', group: 'mode', label: '预约办理', description: '支持提前预约取号' },
      { id: 'one_stop', group: 'mode', label: '一窗综合受理', description: '一个窗口受理全套事项' },
      { id: 'self_service', group: 'mode', label: '自助终端办理', description: '设有自助办理终端' },
      { id: 'free_gov', group: 'fee', label: '不收费', description: '服务事项不收费' },
      { id: 'std_fee', group: 'fee', label: '按标准收费', description: '按公示标准收费' },
      { id: 'b_citizen', group: 'buyer', label: '个人', description: '面向个人办事' },
      { id: 'b_org', group: 'buyer', label: '企业与组织', description: '面向企业和社会组织' },
      { id: 'a_local', group: 'area', label: '本级辖区', description: '管辖本辖区事项' },
      { id: 'a_cross', group: 'area', label: '跨区域通办', description: '支持跨区域办理' },
    ],
    faqs: [
      { id: 'materials', group: 'decision', question: '要带什么材料？缺一样能办吗？', hint: '回答应列出材料清单和容缺范围' },
      { id: 'gov_fee', group: 'decision', question: '收不收费？收多少？', hint: '回答应给出收费标准依据' },
      { id: 'where', group: 'decision', question: '去哪办？几点上班？', hint: '回答应给出办理地点和时段' },
      { id: 'time_gov', group: 'detail', question: '多久能办完？怎么查进度？', hint: '回答应给出办理时限和进度查询方式' },
      { id: 'validity', group: 'detail', question: '办出来的证件有效期多久？到期怎么办？', hint: '回答应说明有效期和续期方式' },
      { id: 'online_help', group: 'detail', question: '线上办不会操作有人教吗？', hint: '回答应说明帮办渠道' },
      { id: 'appeal', group: 'risk', question: '对结果不服怎么办？', hint: '回答应给出复核或申诉渠道' },
      { id: 'complaint_gov', group: 'risk', question: '投诉找谁？多久回复？', hint: '回答应给出投诉渠道和答复时限' },
    ],
  },
};

/* 门类 → 原型；大类码可覆盖（更准） */
const GATE_ARCH = { A: 'farm', B: 'mining', C: 'mfg', D: 'energy', E: 'build', F: 'trade', G: 'transport', H: 'hospitality', I: 'tech', J: 'finance', K: 'realestate', L: 'bizservice', M: 'techservice', N: 'environment', O: 'lifeservice', P: 'education', Q: 'health', R: 'culture', S: 'public', T: 'public' };
const MAJOR_ARCH_OVERRIDES = { '52': 'retail', '73': 'techservice', '74': 'techservice', '75': 'techservice' };
const GATE_OF_NAME = { '农、林、牧、渔业': 'A', '采矿业': 'B', '制造业': 'C', '电力、热力、燃气及水生产和供应业': 'D', '建筑业': 'E', '批发和零售业': 'F', '交通运输、仓储和邮政业': 'G', '住宿和餐饮业': 'H', '信息传输、软件和信息技术服务业': 'I', '金融业': 'J', '房地产业': 'K', '租赁和商务服务业': 'L', '科学研究和技术服务业': 'M', '水利、环境和公共设施管理业': 'N', '居民服务、修理和其他服务业': 'O', '教育': 'P', '卫生和社会工作': 'Q', '文化、体育和娱乐业': 'R', '公共管理、社会保障和社会组织': 'S', '国际组织': 'T' };

/* ------------------------------------------------------------------ */
/* 关键词规则：命中行业名（含上级路径与附加关键词）后追加行业特质组与 FAQ */
/* ------------------------------------------------------------------ */
const RULES = [
  /* ---- 农林牧渔 ---- */
  { id: 'crop', kw: ['种植', '种植场'], groups: [{ id: 'mode', label: '种植方式', select: 'many' }, { id: 'cert_f', label: '种植认证', select: 'many' }], traits: [
    { id: 'open_field', group: 'mode', label: '露天大田种植', description: '在露天大田进行生产' },
    { id: 'greenhouse', group: 'mode', label: '设施大棚种植', description: '在温室或大棚等设施内生产' },
    { id: 'rotation', group: 'mode', label: '轮作与休耕', description: '按轮作休耕安排茬口' },
    { id: 'organic_f', group: 'cert_f', label: '有机产品认证', description: '持有效有机产品认证证书' },
    { id: 'green_food', group: 'cert_f', label: '绿色食品认证', description: '持有效绿色食品标志使用证书' },
    { id: 'geo_f', group: 'cert_f', label: '地理标志产品', description: '产自地理标志保护产区' },
  ], faqs: [
    { id: 'season', group: 'decision', question: '一年几茬？什么月份有货？', hint: '回答应给出产季和供应窗口' },
    { id: 'pesticide', group: 'risk', question: '打不打农药？用了什么？停药期多久？', hint: '回答应说明用药情况和安全间隔期' },
    { id: 'seed_source', group: 'detail', question: '用的什么种？自己留种还是买的？', hint: '回答应说明种源和品种' },
  ] },
  { id: 'breed', kw: ['养殖', '饲养', '畜禽'], groups: [{ id: 'mode_b', label: '养殖方式', select: 'many' }, { id: 'health_v', label: '防疫与用药', select: 'many' }], traits: [
    { id: 'free_range', group: 'mode_b', label: '散养放养', description: '以散养或放养方式饲养' },
    { id: 'intensive', group: 'mode_b', label: '舍饲圈养', description: '以圈舍集中饲养为主' },
    { id: 'pasture', group: 'mode_b', label: '牧场放牧', description: '在草场放牧饲养' },
    { id: 'no_agp', group: 'health_v', label: '不使用促生长抗生素', description: '承诺不使用促生长用途抗生素，可查用药记录' },
    { id: 'vaccine_public', group: 'health_v', label: '免疫记录可查', description: '检疫和免疫记录可向买家出示' },
  ], faqs: [
    { id: 'drug_residue', group: 'risk', question: '兽药残留怎么控制？有检测吗？', hint: '回答应说明休药期管理和出栏检测' },
    { id: 'quarantine', group: 'risk', question: '出栏有检疫证明吗？', hint: '回答应说明动物检疫合格证明随货情况' },
    { id: 'breed_cycle', group: 'decision', question: '养多久出栏（出产）？和快速育肥的差别在哪？', hint: '回答应给出饲养周期并说明与速成产品的区别' },
  ] },
  { id: 'aquatic', kw: ['水产', '渔业', '养殖渔'], groups: [{ id: 'mode_b', label: '捕捞与养殖' }, { id: 'sales', label: '产销方式' }], traits: [
    { id: 'sea_farm', group: 'mode_b', label: '海水养殖', description: '在海域进行养殖' },
    { id: 'fresh_farm', group: 'mode_b', label: '淡水养殖', description: '在淡水水体养殖' },
    { id: 'wild_catch', group: 'mode_b', label: '捕捞', description: '以天然捕捞为主' },
    { id: 'live_transport', group: 'sales', label: '活鲜运输', description: '以活鲜方式运输交付' },
  ], faqs: [
    { id: 'freshness', group: 'decision', question: '是养殖的还是海捕的？怎么区分？', hint: '回答应说明来源和可核验的区分方法' },
    { id: 'death_rate', group: 'risk', question: '活鲜运输死了多少算谁的？', hint: '回答应给出活鲜成活率承诺和死损赔付规则' },
  ] },
  { id: 'tea', kw: ['茶叶', '精制茶', '茶'], traits: [
    { id: 'origin_tea', group: 'org', label: '自有茶园', description: '茶叶产自自有茶园' },
    { id: 'hand_made', group: 'org', label: '手工制作', description: '主要工序手工完成' },
    { id: 'tea_grade', group: 'sales', label: '明前或头采', description: '主打明前、头采等早期高档原料' },
  ], faqs: [
    { id: 'tea_true', group: 'risk', question: '怎么证明是这个山头、这个等级的茶？', hint: '回答应给出产地证明或检测报告' },
    { id: 'tea_store', group: 'detail', question: '买回去怎么存？能放多久？', hint: '回答应按茶类给出存放条件和适饮期' },
  ] },
  /* ---- 采矿能源 ---- */
  { id: 'coal', kw: ['煤炭'], traits: [ { id: 'washing_c', group: 'biz', label: '配洗选加工', description: '自有洗选或配煤加工能力' } ], faqs: [
    { id: 'calorie', group: 'decision', question: '热值和硫分什么水平？有质检单吗？', hint: '回答应给出热值、硫分区间和随批质检单' },
  ] },
  { id: 'oilgas', kw: ['石油', '天然气', '油气'], traits: [
    { id: 'exploration', group: 'biz', label: '勘探开发', description: '从事勘探与开发作业' },
    { id: 'oilfield_srv', group: 'biz', label: '油田技术服务', description: '提供钻井、压裂等技术服务' },
    { id: 'lng', group: 'deliver', label: 'LNG 液态交付', description: '以液化天然气方式交付' },
  ], faqs: [
    { id: 'oil_quality', group: 'detail', question: '气质组分和热值报告能提供吗？', hint: '回答应说明组分检测报告的提供方式' },
  ] },
  /* ---- 食品制造 ---- */
  { id: 'bakery', kw: ['焙烤', '糕点', '面包', '烘焙'], traits: [
    { id: 'baked_daily', group: 'production', label: '每日现烤', description: '门店或工厂每日现烤生产' },
    { id: 'short_shelf', group: 'production', label: '短保质期', description: '主打短保产品，当日或数日内售完' },
    { id: 'no_trans', group: 'production', label: '标注零反式脂肪', description: '配料与工艺标注不含反式脂肪' },
  ], faqs: [
    { id: 'fresh_date', group: 'risk', question: '当天卖不完的怎么处理？日期怎么标？', hint: '回答应说明临期处理和生产日期标注规则' },
    { id: 'allergen_b', group: 'risk', question: '含麸质、坚果、蛋奶这些过敏原吗？', hint: '回答应说明过敏原标注情况' },
  ] },
  { id: 'dairy', kw: ['乳制品', '乳业', '液态奶', '奶粉'], traits: [
    { id: 'own_ranch', group: 'production', label: '自有牧场奶源', description: '奶源来自自有牧场' },
    { id: 'cold_chain_d', group: 'sales', label: '全程冷链', description: '出厂到货架全程低温' },
    { id: 'pasteurized', group: 'production', label: '低温巴氏杀菌', description: '采用巴氏杀菌工艺，需冷藏' },
  ], faqs: [
    { id: 'milk_source', group: 'decision', question: '奶源是自己的还是收的？', hint: '回答应说明奶源构成并可查证' },
    { id: 'milk_cold', group: 'risk', question: '冷链断了怎么发现？坏奶怎么赔？', hint: '回答应说明冷链监控和坏品赔付' },
  ] },
  { id: 'meat', kw: ['肉制品', '屠宰', '肉类'], traits: [
    { id: 'own_slaughter', group: 'production', label: '自有屠宰产能', description: '自有屠宰加工产能' },
    { id: 'trace_meat', group: 'production', label: '一物一码可溯源', description: '产品可按码查到批次与产地' },
    { id: 'cold_meat', group: 'sales', label: '冷链排酸', description: '经冷链排酸工艺处理' },
  ], faqs: [
    { id: 'meat_quarantine', group: 'risk', question: '检疫章和溯源码在哪看？', hint: '回答应说明检疫证明和溯源码位置' },
    { id: 'meat_cut', group: 'detail', question: '能按部位定制分割吗？', hint: '回答应说明定制分割服务' },
  ] },
  { id: 'liquor', kw: ['白酒', '啤酒', '葡萄酒', '黄酒', '烈酒', '果酒', '酿酒', '酒制造'], groups: [{ id: 'craft', label: '工艺与酒体', select: 'many' }], traits: [
    { id: 'aged', group: 'craft', label: '标注基酒年份', description: '标注所用基酒的年份信息' },
    { id: 'pure_grain', group: 'craft', label: '纯粮固态发酵', description: '采用纯粮固态发酵工艺' },
    { id: 'fresh_brew', group: 'craft', label: '现酿短陈', description: '现酿即售，短陈酿工艺' },
  ], faqs: [
    { id: 'alcohol_true', group: 'risk', question: '年份酒、原产地怎么证明？', hint: '回答应给出可核验的年份与产地凭证' },
    { id: 'alcohol_ship', group: 'detail', question: '快递能发酒吗？破损怎么赔？', hint: '回答应说明配送限制和破损赔付' },
  ] },
  { id: 'beverage', kw: ['饮料制造', '包装饮用水', '矿泉水', '纯净水'], traits: [
    { id: 'sugar_free', group: 'production', label: '无糖配方', description: '按国标标注无糖（糖含量≤0.5g/100ml）' },
    { id: 'water_source', group: 'production', label: '标注水源地', description: '包装标注具体水源地' },
  ], faqs: [
    { id: 'bev_nutri', group: 'decision', question: '营养成分表在哪？含糖多少？', hint: '回答应指向包装营养成分表并给出关键数值' },
  ] },
  { id: 'condiment', kw: ['调味品', '酱油', '醋', '发酵制品'], traits: [
    { id: 'brew_cond', group: 'production', label: '传统酿造工艺', description: '标注传统酿造（非配制）工艺' },
    { id: 'zero_add', group: 'production', label: '标注零添加', description: '标注不使用味精、防腐剂等添加剂' },
  ], faqs: [
    { id: 'cond_brew', group: 'decision', question: '是酿造的还是配制的？怎么看出来？', hint: '回答应说明工艺类型和配料表识别方法' },
  ] },
  /* ---- 材料与重工业 ---- */
  { id: 'steel', kw: ['钢铁', '炼铁', '炼钢', '钢压延', '轧钢'], traits: [
    { id: 'coil_service', group: 'sales', label: '提供剪切配送加工', description: '可按需求剪切分卷后配送' },
    { id: 'mill_cert', group: 'production', label: '质保书随货', description: '每批附材质证明书' },
  ], faqs: [
    { id: 'steel_cert', group: 'risk', question: '材质证明和炉号能对上吗？', hint: '回答应说明质保书与批次的对应关系' },
  ] },
  { id: 'smelt', kw: ['冶炼', '有色金属', '电解', '稀土'], traits: [
    { id: 'recycle_metal', group: 'production', label: '使用再生原料', description: '以废料再生为主要原料来源' },
    { id: 'ingot_cast', group: 'sales', label: '可定制铸锭规格', description: '可按客户要求定制锭型规格' },
  ], faqs: [
    { id: 'metal_purity', group: 'decision', question: '牌号和纯度怎么保证？', hint: '回答应说明牌号标准与检测方式' },
  ] },
  { id: 'cement', kw: ['水泥', '混凝土', '石膏'], traits: [
    { id: 'bulk_cement', group: 'deliver', label: '散装水泥直供', description: '以散装方式罐车直供' },
    { id: 'ready_mix', group: 'sales', label: '商品混凝土搅拌', description: '提供预拌混凝土配送浇筑' },
  ], faqs: [
    { id: 'cement_grade', group: 'decision', question: '标号够吗？28 天强度报告有吗？', hint: '回答应说明标号与强度检测报告' },
  ] },
  { id: 'glass', kw: ['玻璃'], traits: [ { id: 'low_e', group: 'production', label: 'Low-E 深加工', description: '提供镀膜、钢化等深加工' } ], faqs: [
    { id: 'glass_thick', group: 'decision', question: '厚度和透光率能定制吗？', hint: '回答应说明可定制规格范围' },
  ] },
  { id: 'ceramics', kw: ['陶瓷', '瓷砖', '卫生陶瓷'], traits: [
    { id: 'full_body', group: 'production', label: '通体砖坏', description: '标注通体坯体工艺' },
    { id: 'custom_print', group: 'sales', label: '接受定制花色', description: '可按图定制花色与规格' },
  ], faqs: [
    { id: 'ceramic_grade', group: 'decision', question: '优等品和合格品差在哪？怎么验货？', hint: '回答应说明等级差异和验货方法' },
  ] },
  { id: 'plastic', kw: ['塑料', '橡胶'], traits: [
    { id: 'injection_mold', group: 'production', label: '注塑成型', description: '以注塑工艺生产制品' },
    { id: 'recycle_plastic', group: 'production', label: '再生料应用', description: '使用或标注再生塑料比例' },
    { id: 'mold_open', group: 'production', label: '代开模具', description: '可为客户开模定制产品' },
  ], faqs: [
    { id: 'plastic_material', group: 'decision', question: '用的什么料？新料还是回料？', hint: '回答应说明材料等级并可验货' },
  ] },
  { id: 'chem', kw: ['化学原料', '化学纤维', '化学制品', '合成材料', '专用化学'], traits: [
    { id: 'msds', group: 'sales', label: '随货提供 MSDS', description: '随货提供安全技术说明书' },
    { id: 'haz_trans', group: 'deliver', label: '危化品资质运输', description: '具备危化品运输条件' },
  ], faqs: [
    { id: 'chem_purity', group: 'decision', question: '纯度指标多少？COA 随货吗？', hint: '回答应给出纯度指标和随货分析报告' },
    { id: 'chem_storage', group: 'risk', question: '储存和运输有什么特殊要求？', hint: '回答应说明储运条件与应急措施' },
  ] },
  { id: 'paint', kw: ['涂料', '油墨', '颜料', '染料'], traits: [
    { id: 'low_voc', group: 'production', label: '低 VOC 配方', description: '标注低挥发性有机物配方' },
    { id: 'color_match', group: 'service_p', label: '调色服务', description: '提供按需调色服务' },
  ], faqs: [
    { id: 'paint_env', group: 'decision', question: '环保等级达到什么标准？有报告吗？', hint: '回答应给出环保认证和检测报告' },
  ] },
  { id: 'fertilizer', kw: ['肥料', '复混', '有机肥'], traits: [
    { id: 'slow_release', group: 'production', label: '缓控释配方', description: '提供缓控释类配方产品' },
    { id: 'soil_test', group: 'service_p', label: '测土配方服务', description: '提供测土后按需配肥' },
  ], faqs: [
    { id: 'fert_npk', group: 'decision', question: '养分含量和执行标准是什么？', hint: '回答应给出氮磷钾含量和包装标注标准' },
  ] },
  { id: 'pesticide_r', kw: ['农药'], traits: [
    { id: 'bio_pest', group: 'production', label: '生物源农药', description: '以生物源成分为主' },
    { id: 'pest_reg', group: 'sales', label: '登记证号可查', description: '产品农药登记证号可在官方渠道查验' },
  ], faqs: [
    { id: 'pest_license', group: 'risk', question: '农药登记证和生产许可证号在哪查？', hint: '回答应给出证号和官方查验入口' },
  ] },
  { id: 'paper', kw: ['造纸', '纸浆', '纸制品'], traits: [
    { id: 'recycle_paper', group: 'production', label: '再生浆占比标注', description: '标注再生浆使用比例' },
    { id: 'fsc', group: 'production', label: '森林认证（FSC/PEFC）', description: '原料持森林可持续认证' },
  ], faqs: [
    { id: 'paper_food', group: 'decision', question: '食品接触用纸有检测吗？', hint: '回答应给出食品级检测报告' },
  ] },
  { id: 'printing', kw: ['印刷', '装订'], traits: [
    { id: 'digital_print', group: 'production', label: '数码快印', description: '支持小批量数码印刷' },
    { id: 'offset', group: 'production', label: '胶印大批量', description: '以胶印承接批量印刷' },
    { id: 'green_ink', group: 'production', label: '环保油墨', description: '使用环保型油墨并可查证' },
  ], faqs: [
    { id: 'print_proof', group: 'decision', question: '先打样确认再批量印吗？打样收费吗？', hint: '回答应说明打样流程和费用' },
    { id: 'print_color', group: 'risk', question: '批量印出来颜色和打样不一致怎么办？', hint: '回答应说明色差标准和处理规则' },
  ] },
  { id: 'packaging', kw: ['包装'], traits: [
    { id: 'custom_pack', group: 'production', label: '定制包装', description: '按客户设计与规格定制生产' },
    { id: 'stock_pack', group: 'production', label: '现货包装', description: '常规件型备有现货' },
    { id: 'degradable_pack', group: 'production', label: '可降解材质', description: '提供可降解材质产品' },
  ], faqs: [
    { id: 'pack_moq', group: 'decision', question: '定制起订量多少？版费怎么收？', hint: '回答应给出起订量和制版费规则' },
  ] },
  { id: 'dailychem', kw: ['日用化学', '肥皂', '洗涤', '化妆品', '口腔清洁'], traits: [
    { id: 'gmp_cos', group: 'production', label: '化妆品生产许可', description: '持化妆品生产许可证' },
    { id: 'efficacy_claim', group: 'production', label: '功效宣称有备案', description: '功效宣称完成备案可查' },
  ], faqs: [
    { id: 'cos_ingr', group: 'decision', question: '全成分表在哪看？有没有争议成分？', hint: '回答应指向包装全成分标注并说明关键成分' },
    { id: 'cos_license', group: 'risk', question: '生产许可和备案凭证在哪查？', hint: '回答应给出官方查询方式' },
  ] },
  /* ---- 纺织服装轻工 ---- */
  { id: 'textile', kw: ['纺织', '印染', '织造', '面料'], traits: [
    { id: 'oeko', group: 'production', label: 'Oeko-Tex 等织物认证', description: '面料通过织物有害物质检测认证' },
    { id: 'quick_sample', group: 'sales', label: '提供色卡样布', description: '可索取色卡与样布确认后下单' },
  ], faqs: [
    { id: 'textile_shrink', group: 'detail', question: '缩水率和色牢度什么水平？', hint: '回答应给出检测数据' },
  ] },
  { id: 'garment', kw: ['服装', '服饰', '服装制造', '针织'], traits: [
    { id: 'custom_fit', group: 'service_p', label: '量体定制', description: '提供量体定制服务' },
    { id: 'small_batch_g', group: 'production', label: '小单快反', description: '支持小批量快速翻单生产' },
    { id: 'fabric_source', group: 'production', label: '面料来源可查', description: '可提供面料供应信息' },
  ], faqs: [
    { id: 'garment_size', group: 'decision', question: '尺码怎么选？版型偏大偏小？', hint: '回答应给出版型特点和尺码建议' },
    { id: 'garment_return', group: 'risk', question: '穿过洗过还能退吗？', hint: '回答应说明退换条件' },
  ] },
  { id: 'footwear', kw: ['制鞋', '鞋'], traits: [
    { id: 'custom_last', group: 'service_p', label: '定制楦型', description: '可按脚型定制鞋楦' },
    { id: 'resole', group: 'service_p', label: '提供换底维修', description: '提供售后换底维修服务' },
  ], faqs: [
    { id: 'shoe_fit', group: 'decision', question: '磨不磨脚？能试穿吗？', hint: '回答应说明试穿和不适处理' },
  ] },
  { id: 'furniture', kw: ['家具', '全屋定制'], traits: [
    { id: 'solid_wood', group: 'production', label: '实木主体', description: '主体采用实木材料并标注树种' },
    { id: 'e0_board', group: 'production', label: '标注环保板材等级', description: '标注板材环保等级（如 E0、ENF）' },
    { id: 'install_f', group: 'service_p', label: '免费测量安装', description: '提供免费上门测量与安装' },
    { id: 'custom_f', group: 'production', label: '全屋定制', description: '按户型定制整体家具' },
  ], faqs: [
    { id: 'furn_formal', group: 'risk', question: '甲醛释放量什么等级？有检测报告吗？', hint: '回答应给出板材等级和检测报告' },
    { id: 'furn_delivery', group: 'detail', question: '定制多久交货？延误怎么赔？', hint: '回答应给出交期和延期条款' },
  ] },
  { id: 'stationery', kw: ['文具', '笔制造', '教学用品'], traits: [
    { id: 'env_station', group: 'production', label: '环保标准件', description: '产品符合学生用品安全通用要求' },
  ], faqs: [
    { id: 'station_safe', group: 'risk', question: '孩子用的安全吗？符合学生用品标准吗？', hint: '回答应说明执行的安全标准' },
  ] },
  { id: 'toys', kw: ['玩具'], traits: [
    { id: 'ccc_toy', group: 'production', label: '3C 认证', description: '列入目录的玩具持 3C 认证' },
    { id: 'age_mark', group: 'production', label: '标注适用年龄', description: '包装标注适用年龄与警示' },
  ], faqs: [
    { id: 'toy_safe', group: 'risk', question: '小零件和材料安全怎么保证？', hint: '回答应说明安全标准与检测报告' },
  ] },
  { id: 'instrument_m', kw: ['乐器'], traits: [
    { id: 'hand_tone', group: 'production', label: '手工调试', description: '出厂前经人工调音调试' },
    { id: 'trial_play', group: 'sales', label: '支持试奏', description: '线下或线上可试奏试音' },
  ], faqs: [
    { id: 'instr_maint', group: 'detail', question: '保养和调音怎么做？收费吗？', hint: '回答应说明保养周期与费用' },
  ] },
  { id: 'sporting', kw: ['体育用品', '运动器材'], traits: [
    { id: 'pro_gear', group: 'production', label: '赛事级产品线', description: '有通过赛事认证的产品线' },
    { id: 'size_range', group: 'sales', label: '全尺码段供应', description: '提供覆盖青少年到成人的尺码' },
  ], faqs: [
    { id: 'sport_std', group: 'decision', question: '达到什么比赛标准？有认证吗？', hint: '回答应给出产品认证和适用级别' },
  ] },
  { id: 'jewelry', kw: ['珠宝', '金银', '贵金属', '钻石'], traits: [
    { id: 'gem_cert', group: 'sales', label: '宝玉石鉴定证书', description: '附带权威机构鉴定证书' },
    { id: 'gold_mark', group: 'production', label: '印记与纯度标注', description: '按国标打刻纯度印记' },
    { id: 'custom_jewel', group: 'service_p', label: '来料定制', description: '可来料加工定制' },
  ], faqs: [
    { id: 'gold_weight', group: 'risk', question: '克重和纯度怎么核？以什么为准？', hint: '回答应说明复秤复检规则' },
    { id: 'jewel_ret', group: 'risk', question: '一口价黄金能换能退吗？', hint: '回答应说明一口价产品的退换规则' },
  ] },
  { id: 'eyewear', kw: ['眼镜'], traits: [
    { id: 'optometry', group: 'service_p', label: '持证验光', description: '由持证验光师提供验光' },
    { id: 'fast_lens', group: 'service_p', label: '立等可取配镜', description: '常规镜片可现场取镜' },
  ], faqs: [
    { id: 'lens_true', group: 'risk', question: '镜片品牌和折射率怎么防假？', hint: '回答应说明镜片防伪与质保卡' },
  ] },
  { id: 'watch', kw: ['钟表'], traits: [
    { id: 'movement_w', group: 'production', label: '自产机芯', description: '搭载自产机芯' },
    { id: 'warranty_w', group: 'service_p', label: '官方保修网点', description: '有官方售后保修网点' },
  ], faqs: [
    { id: 'watch_water', group: 'decision', question: '防水等级多少？游泳能戴吗？', hint: '回答应给出防水等级和适用场景' },
  ] },
  /* ---- 装备与电子 ---- */
  { id: 'machinetool', kw: ['机床', '数控'], traits: [
    { id: 'five_axis', group: 'production', label: '五轴及以上机型', description: '具备五轴及以上产品' },
    { id: 'turnkey_mt', group: 'service_p', label: '交钥匙工程', description: '提供产线级交钥匙交付' },
  ], faqs: [
    { id: 'mt_precision', group: 'decision', question: '定位精度多少？验收怎么测？', hint: '回答应给出精度指标和验收标准' },
    { id: 'mt_service', group: 'risk', question: '停机了多久到现场？备件多久到？', hint: '回答应给出响应时限和备件供应承诺' },
  ] },
  { id: 'engmach', kw: ['工程机械', '矿山机械', '建筑机械', '起重', '农业机械', '农机', '园艺机具'], traits: [
    { id: 'rental_em', group: 'sales', label: '设备租赁', description: '提供设备经营性租赁' },
    { id: 'used_em', group: 'sales', label: '官方二手机', description: '有官方翻新二手机业务' },
    { id: 'operator_train', group: 'service_p', label: '操作手培训', description: '提供设备操作培训' },
  ], faqs: [
    { id: 'em_parts', group: 'risk', question: '停工等配件怎么办？多久能到？', hint: '回答应给出常用件库存和到货时限' },
    { id: 'em_price', group: 'decision', question: '买和租哪个划算？租怎么计价？', hint: '回答应给出租金计价方式与购买对比口径' },
  ] },
  { id: 'elecequip', kw: ['电机', '输配电', '电力设备', '变压器', '配电'], traits: [
    { id: 'type_test', group: 'production', label: '型式试验报告', description: '产品有权威型式试验报告' },
    { id: 'grid_cert', group: 'sales', label: '入围电网招标', description: '有电网公司供应商入围记录' },
  ], faqs: [
    { id: 'ee_eff', group: 'decision', question: '能效等级几级？有标识吗？', hint: '回答应给出能效等级和标识' },
  ] },
  { id: 'cable', kw: ['电线电缆', '光纤光缆'], traits: [
    { id: 'ccc_cable', group: 'production', label: '3C 强制认证', description: '电线电缆产品持 3C 认证' },
    { id: 'copper_meas', group: 'production', label: '标注导体截面与铜纯度', description: '标注实际导体规格可送检' },
  ], faqs: [
    { id: 'cable_true', group: 'risk', question: '非标线缆怎么防？能送检吗？', hint: '回答应说明可送第三方检测并承担规则' },
  ] },
  { id: 'pumpvalve', kw: ['泵', '阀门', '压缩机', '风机'], traits: [
    { id: 'custom_pv', group: 'production', label: '按工况选型定制', description: '按介质与工况参数选型定制' },
    { id: 'pv_stock', group: 'sales', label: '常用件现货', description: '常用型号有现货库存' },
  ], faqs: [
    { id: 'pv_select', group: 'decision', question: '我这种工况选什么型号？', hint: '回答应基于参数给出选型建议' },
  ] },
  { id: 'bearinggear', kw: ['轴承', '齿轮', '传动', '紧固件', '弹簧'], traits: [
    { id: 'precision_bg', group: 'production', label: '高精度等级产品', description: '提供高精度等级产品线' },
    { id: 'batch_bg', group: 'production', label: '大批量标准件', description: '标准件大批量供货' },
  ], faqs: [
    { id: 'bg_grade', group: 'decision', question: '精度等级和材质证明有吗？', hint: '回答应给出精度等级与材质单' },
  ] },
  { id: 'mold', kw: ['模具'], traits: [
    { id: 'mold_life', group: 'production', label: '承诺模具寿命', description: '合同标注模次寿命' },
    { id: 'mold_own', group: 'sales', label: '模具产权归客户', description: '验收后模具产权归属客户' },
  ], faqs: [
    { id: 'mold_iter', group: 'decision', question: '试模不满意能改吗？改模费谁出？', hint: '回答应说明试模修改的费用规则' },
  ] },
  { id: 'robot', kw: ['机器人'], traits: [
    { id: 'cobots', group: 'production', label: '协作机器人', description: '有协作型机械臂产品' },
    { id: 'integration_r', group: 'service_p', label: '集成方案交付', description: '提供选型到部署的集成交付' },
    { id: 'robot_trainer', group: 'service_p', label: '示教编程服务', description: '提供现场示教与编程服务' },
  ], faqs: [
    { id: 'robot_roi', group: 'decision', question: '多久能收回成本？怎么测算？', hint: '回答应给出回收周期的测算依据' },
    { id: 'robot_safe', group: 'risk', question: '出了安全事故谁负责？做风险评估吗？', hint: '回答应说明安全评估与责任划分' },
  ] },
  { id: 'drone', kw: ['无人机'], traits: [
    { id: 'drone_cert_op', group: 'service_p', label: '持证飞手', description: '由持照人员执飞' },
    { id: 'drone_insurance', group: 'service_p', label: '承保第三者险', description: '作业投保第三者责任险' },
    { id: 'no_fly_apply', group: 'service_p', label: '代办空域申请', description: '协助办理空域与飞行申请' },
  ], faqs: [
    { id: 'drone_weather', group: 'risk', question: '天气不好飞不了怎么办？改期收费吗？', hint: '回答应说明改期规则' },
  ] },
  { id: 'rail_equip', kw: ['轨道交通'], traits: [ { id: 'rail_cert', group: 'production', label: '通过装备认证', description: '产品通过轨道交通装备认证' } ], faqs: [
    { id: 'rail_delivery', group: 'detail', question: '交付周期和质保期多长？', hint: '回答应给出交期和质保条款' },
  ] },
  { id: 'ship', kw: ['船舶', '船用'], traits: [
    { id: 'class_soc', group: 'production', label: '船级社认证', description: '产品通过船级社认证' },
    { id: 'repair_dock', group: 'service_p', label: '修船与坞修', description: '提供船舶修理与坞修服务' },
  ], faqs: [
    { id: 'ship_cycle', group: 'decision', question: '造（修）一条多久？逾期怎么算？', hint: '回答应给出周期和逾期条款' },
  ] },
  { id: 'aerospace', kw: ['航空航天', '航天', '航空器', '飞机制造'], traits: [
    { id: 'as9100', group: 'production', label: 'AS9100 体系', description: '通过航空质量管理体系认证' },
    { id: 'airworthy', group: 'production', label: '适航认证产品', description: '产品取得适航认证' },
    { id: 'mro', group: 'service_p', label: '维修（MRO）服务', description: '提供维修检修服务' },
  ], faqs: [
    { id: 'air_cert', group: 'risk', question: '资质和体系认证能查到吗？', hint: '回答应给出认证编号或查询方式' },
  ] },
  { id: 'auto_mfg', kw: ['汽车整车', '整车制造', '汽车制造', '新能源整车'], traits: [
    { id: 'direct_store_a', group: 'sales', label: '直营渠道', description: '以直营门店销售' },
    { id: 'dealer_4s_a', group: 'sales', label: '授权 4S 网络', description: '通过授权经销网络销售售后' },
    { id: 'nev', group: 'production', label: '新能源产品线', description: '有新能源车型产品' },
  ], faqs: [
    { id: 'delivery_a', group: 'decision', question: '订车多久提车？延期有补偿吗？', hint: '回答应给出交期和延期规则' },
    { id: 'battery_w', group: 'risk', question: '三电质保多久？限不限首任车主？', hint: '回答应分列三电质保条款和限制' },
  ] },
  { id: 'auto_parts', kw: ['汽车零部件', '汽车零件', '车用'], traits: [
    { id: 'oe_supply', group: 'sales', label: '主机厂配套（OE）', description: '进入整车厂配套体系' },
    { id: 'aftermarket_p', group: 'sales', label: '售后市场供应', description: '面向维修售后市场供货' },
  ], faqs: [
    { id: 'parts_true', group: 'risk', question: '怎么证明是原厂件？', hint: '回答应说明防伪与供货凭证' },
  ] },
  { id: 'battery', kw: ['电池', '锂离子'], traits: [
    { id: 'cell_self', group: 'production', label: '自产电芯', description: '电芯自制而非外购' },
    { id: 'cycle_life', group: 'production', label: '标注循环寿命', description: '公开标注循环寿命数据' },
    { id: 'battery_recycle', group: 'service_p', label: '以旧回收', description: '提供旧电池回收渠道' },
  ], faqs: [
    { id: 'battery_safe', group: 'risk', question: '起火风险怎么控？有什么认证？', hint: '回答应说明安全标准与认证情况' },
  ] },
  { id: 'semi', kw: ['半导体', '集成电路', '芯片', '晶圆', '封装'], traits: [
    { id: 'fabless', group: 'production', label: '设计（Fabless）', description: '以芯片设计为主，制造外包' },
    { id: 'foundry', group: 'production', label: '晶圆代工', description: '提供晶圆制造代工' },
    { id: 'auto_grade', group: 'production', label: '车规级产品', description: '有通过车规认证的产品' },
    { id: 'kit_support', group: 'service_p', label: '提供开发套件', description: '提供评估板与开发支持' },
  ], faqs: [
    { id: 'semi_lead', group: 'decision', question: '交期多久？缺货周期怎么排？', hint: '回答应给出供货周期与备货机制' },
    { id: 'semi_spec', group: 'detail', question: '规格书和可靠性报告提供吗？', hint: '回答应说明技术文档的提供方式' },
  ] },
  { id: 'display', kw: ['显示面板', '显示屏', '显示屏器件'], traits: [
    { id: 'panel_gen', group: 'production', label: '标注世代线', description: '公开产线世代信息' },
    { id: 'custom_cut_d', group: 'sales', label: '定制切割尺寸', description: '可按需求定制切割规格' },
  ], faqs: [
    { id: 'panel_grade_d', group: 'risk', question: '坏点标准是什么？验收怎么算？', hint: '回答应给出坏点判定等级标准' },
  ] },
  { id: 'ele_comp', kw: ['电子元件', '电子器件', '印制电路板', '连接器'], traits: [
    { id: 'aecq', group: 'production', label: 'AEC-Q 认证', description: '车规元器件通过 AEC-Q 认证' },
    { id: 'moq_reel', group: 'sales', label: '最小起订整盘', description: '按整盘或最小包装起订' },
  ], faqs: [
    { id: 'comp_date', group: 'risk', question: '存货周期（Date Code）能给新的吗？', hint: '回答应说明器件生产日期承诺' },
  ] },
  { id: 'computer', kw: ['计算机', '服务器', '整机'], traits: [
    { id: 'custom_config', group: 'sales', label: '按需配置', description: '可按需求选配硬件配置' },
    { id: 'on_site_it', group: 'service_p', label: '上门装机维保', description: '提供上门安装与维保' },
  ], faqs: [
    { id: 'pc_warranty', group: 'risk', question: '主要部件保多久？上门还是送修？', hint: '回答应分部件给出保修方式' },
  ] },
  { id: 'phone', kw: ['智能手机', '手机', '智能终端', '移动电话'], traits: [
    { id: 'store_official', group: 'sales', label: '官方直营渠道', description: '有官方商城或直营店' },
    { id: 'trade_in', group: 'service_p', label: '官方以旧换新', description: '提供官方回收置换' },
    { id: 'os_years', group: 'production', label: '承诺系统更新年限', description: '公开承诺系统维护年限' },
  ], faqs: [
    { id: 'phone_warranty', group: 'risk', question: '碎屏、进水保不保？延保多少钱？', hint: '回答应说明保修范围与延保价格' },
  ] },
  { id: 'appliance', kw: ['家电', '家用电器', '制冷', '空调', '洗衣机', '厨房电器', '白色家電', '白色家电'], traits: [
    { id: 'ten_year_w', group: 'service_p', label: '主要部件长包', description: '压缩机等主要部件有十年等长期包修' },
    { id: 'install_free', group: 'service_p', label: '免费安装', description: '购机免费上门安装' },
    { id: 'smart_home_iot', group: 'production', label: '支持互联控制', description: '支持 App 或生态互联控制' },
    { id: 'energy_star', group: 'production', label: '一级能效', description: '主力产品达一级能效' },
  ], faqs: [
    { id: 'app_warranty', group: 'risk', question: '保修几年？上门费收不收？', hint: '回答应分部件给出保修年限和上门政策' },
    { id: 'app_install', group: 'detail', question: '安装要另收费吗？旧机帮搬走吗？', hint: '回答应说明安装收费与旧机回收' },
  ] },
  { id: 'av', kw: ['音响', '电视', '视听', '广播电视设备', '电视机'], traits: [
    { id: 'tune_room', group: 'service_p', label: '上门调校', description: '提供上门安装调校服务' },
    { id: 'panel_warranty', group: 'service_p', label: '屏体质保', description: '屏幕面板有单独质保条款' },
  ], faqs: [
    { id: 'av_install', group: 'detail', question: '挂架、走线包安装吗？', hint: '回答应说明安装范围与收费' },
  ] },
  { id: 'lighting', kw: ['照明', '灯', '灯具'], traits: [
    { id: 'dali_dim', group: 'production', label: '支持智能调光', description: '支持智能调光控制协议' },
    { id: 'light_design', group: 'service_p', label: '配光设计服务', description: '提供照明设计与配光方案' },
  ], faqs: [
    { id: 'light_life', group: 'decision', question: '光效和寿命什么水平？质保几年？', hint: '回答应给出光效数据与质保年限' },
  ] },
  { id: 'pv', kw: ['光伏', '太阳能'], traits: [
    { id: 'bifacial', group: 'production', label: '双面组件', description: '有双面发电组件产品' },
    { id: 'tier1', group: 'sales', label: 'Bloomberg Tier 1', description: '列入行业一线评级名单' },
    { id: 'install_epc', group: 'service_p', label: '含安装并网', description: '提供安装与并网手续代办' },
    { id: 'yield_warranty', group: 'service_p', label: '发电量质保', description: '合同承诺首年与逐年发电量' },
  ], faqs: [
    { id: 'pv_payback', group: 'decision', question: '几年回本？发电量怎么保证？', hint: '回答应给出回收期测算和发电量承诺' },
    { id: 'pv_typhoon', group: 'risk', question: '台风冰雹坏了谁负责？保险吗？', hint: '回答应说明灾害责任与保险安排' },
  ] },
  { id: 'instrument', kw: ['仪器仪表', '测量仪器', '光学仪器'], traits: [
    { id: 'cal_service', group: 'service_p', label: '提供校准服务', description: '提供出厂校准与周期校准' },
    { id: 'cnas_i', group: 'accredit', label: '校准实验室认可', description: '校准实验室获 CNAS 认可' },
  ], faqs: [
    { id: 'cal_cycle', group: 'detail', question: '多久校一次？费用多少？', hint: '回答应给出校准周期和收费' },
  ] },
  { id: 'commequip', kw: ['通信设备', '光通信', '通信系统'], traits: [
    { id: 'net_access', group: 'production', label: '进网许可证', description: '设备持电信设备进网许可' },
    { id: 'odb_support', group: 'service_p', label: '提供文档与培训', description: '交付附技术文档与培训' },
  ], faqs: [
    { id: 'net_true', group: 'risk', question: '进网许可编号在哪查？', hint: '回答应给出官方查验方式' },
  ] },
  /* ---- 医药 ---- */
  { id: 'pharma', kw: ['制药', '药品', '化学药品', '原料药', '生物药品', '疫苗'], traits: [
    { id: 'gmp', group: 'production', label: 'GMP 认证', description: '生产线通过药品 GMP 认证' },
    { id: 'consignment', group: 'production', label: '接受委托生产', description: '提供委托生产（CMO）服务' },
    { id: 'drug_code', group: 'sales', label: '批准文号可查', description: '药品批准文号可在官方平台查验' },
  ], faqs: [
    { id: 'drug_true', group: 'risk', question: '批准文号和说明书在哪查？', hint: '回答应给出官方查询渠道' },
    { id: 'drug_cold', group: 'detail', question: '冷链药品怎么运输？温度记录能给吗？', hint: '回答应说明冷链与全程温度记录' },
  ] },
  { id: 'tcm', kw: ['中药', '中成药', '中药饮片'], traits: [
    { id: 'tcm_trace', group: 'production', label: '药材基地溯源', description: '标注药材种植基地可溯源' },
    { id: 'classic_formula', group: 'production', label: '经典名方', description: '有按经典名方目录获批的产品' },
  ], faqs: [
    { id: 'tcm_source', group: 'decision', question: '药材是道地产区的吗？怎么证明？', hint: '回答应说明药材来源与溯源方式' },
  ] },
  { id: 'meddevice', kw: ['医疗器械', '医疗仪器', '医用'], traits: [
    { id: 'md_registration', group: 'production', label: '注册证可查', description: '产品注册证编号可官方查验' },
    { id: 'md_class3', group: 'production', label: '三类器械产品', description: '有第三类高风险器械产品' },
    { id: 'md_service', group: 'service_p', label: '装机与培训', description: '提供装机、培训与维保' },
  ], faqs: [
    { id: 'md_true', group: 'risk', question: '注册证号和生产许可在哪查？', hint: '回答应给出官方查询入口' },
    { id: 'md_maintain', group: 'risk', question: '设备坏了多久修？有备用机吗？', hint: '回答应给出维保响应和备机安排' },
  ] },
  { id: 'healthfood', kw: ['保健食品', '营养食品', '膳食补充'], traits: [
    { id: 'blue_hat', group: 'production', label: '保健食品注册（蓝帽子）', description: '产品有保健食品注册或备案号' },
  ], faqs: [
    { id: 'hf_claim', group: 'risk', question: '宣传的功效有批件吗？批号多少？', hint: '回答应给出注册备案号和宣称范围' },
  ] },
  /* ---- 建筑与房产 ---- */
  { id: 'housebuild', kw: ['房屋建筑', '住宅工程'], traits: [
    { id: 'pc_construction', group: 'contract', label: '装配式施工', description: '采用预制装配式工艺' },
    { id: 'bim', group: 'service_p', label: 'BIM 应用', description: '项目应用建筑信息模型技术' },
  ], faqs: [
    { id: 'quality_inspect', group: 'risk', question: '业主能参与分户验收吗？', hint: '回答应说明业主参与验收的安排' },
  ] },
  { id: 'decoration', kw: ['装饰', '装修', '建筑安装'], traits: [
    { id: 'all_inclusive', group: 'settle', label: '整装一口价', description: '按面积整装打包报价' },
    { id: 'clear_quotation', group: 'settle', label: '清单透明报价', description: '逐项列明材料人工单价' },
    { id: 'env_test_after', group: 'service_p', label: '完工环保检测', description: '完工后提供室内环境检测' },
  ], faqs: [
    { id: 'add_on', group: 'risk', question: '施工中会不会不停加项加钱？', hint: '回答应说明增项比例上限和处理规则' },
    { id: 'deco_warranty', group: 'risk', question: '装修保几年？出了问题多久修？', hint: '回答应分项给出保修年限和响应时限' },
  ] },
  { id: 'firefit', kw: ['消防'], traits: [
    { id: 'fire_cert', group: 'qualification', label: '消防设施资质', description: '持消防设施工程专业资质' },
    { id: 'fire_inspect', group: 'service_p', label: '年检维保', description: '提供年度检测维保服务' },
  ], faqs: [
    { id: 'fire_std', group: 'decision', question: '产品和服务符合什么验收标准？', hint: '回答应给出依据的消防标准' },
  ] },
  { id: 'property_mgmt', kw: ['物业管理'], traits: [
    { id: 'prop_public_report', group: 'service_p', label: '公共收益公示', description: '公共区域收益定期公示' },
    { id: 'prop_grade', group: 'qualification', label: '一级物业资质', description: '持一级物业服务资质' },
  ], faqs: [
    { id: 'prop_fee', group: 'decision', question: '物业费怎么定？调价要什么程序？', hint: '回答应说明定价依据和调价程序' },
    { id: 'prop_repair', group: 'risk', question: '维修资金怎么动用？', hint: '回答应说明维修资金使用流程' },
  ] },
  /* ---- 流通 ---- */
  { id: 'wholesale', kw: ['批发'], traits: [
    { id: 'agency_area', group: 'scale', label: '区域总代总经销', description: '持品牌区域总经销授权' },
    { id: 'supply_stable', group: 'logistics', label: '常备库存', description: '常备现货库存保障快发' },
  ], faqs: [
    { id: 'auth_true', group: 'risk', question: '授权书能给看吗？怎么验证？', hint: '回答应提供授权凭证及品牌方核实渠道' },
  ] },
  { id: 'supermarket', kw: ['超市', '百货', '仓储会员', '综合零售'], traits: [
    { id: 'private_label_s', group: 'scale', label: '自有品牌商品', description: '销售自有品牌商品' },
    { id: 'fresh_zone', group: 'service', label: '生鲜现场制售', description: '门店有现场制售生鲜档口' },
    { id: 'price_match', group: 'strategy', label: '价保补差', description: '买贵可退差价' },
  ], faqs: [
    { id: 'sm_fresh_time', group: 'risk', question: '临期食品怎么处理？打折规则是什么？', hint: '回答应说明临期折扣与下架规则' },
  ] },
  { id: 'convenience', kw: ['便利店'], traits: [
    { id: 'open_24', group: 'service', label: '24 小时营业', description: '全天营业' },
    { id: 'hot_food_c', group: 'service', label: '热食鲜食', description: '供应现制热食鲜食' },
  ], faqs: [
    { id: 'c_store_delivery', group: 'detail', question: '能外送吗？起送多少？', hint: '回答应说明外送范围和起送门槛' },
  ] },
  { id: 'ecommerce', kw: ['互联网零售', '电子商务', '网络零售', '电商'], traits: [
    { id: 'self_operated', group: 'channel', label: '平台自营', description: '平台自营采购销售' },
    { id: 'pop_model', group: 'channel', label: '第三方入驻', description: '接受第三方商家入驻' },
    { id: 'cross_border_e', group: 'channel', label: '跨境购', description: '提供跨境零售业务' },
  ], faqs: [
    { id: 'genuine', group: 'risk', question: '怎么保证是正品？假一赔几？', hint: '回答应说明正品保障和赔付承诺' },
    { id: 'customs_tax', group: 'detail', question: '跨境商品税费怎么算？被税了谁出？', hint: '回答应说明税费计算与承担' },
  ] },
  { id: 'pharmacy', kw: ['药店', '药品零售'], traits: [
    { id: 'pharmacist_24', group: 'service', label: '执业药师值班', description: '营业时间有执业药师在岗' },
    { id: 'drug_insurance', group: 'service', label: '医保刷卡', description: '支持医保结算' },
    { id: 'delivery_rx', group: 'service', label: '送药上门', description: '提供送药上门服务' },
  ], faqs: [
    { id: 'rx_rule', group: 'risk', question: '处方药怎么买？没有处方能买吗？', hint: '回答应说明处方药销售规则' },
  ] },
  { id: 'gas_station', kw: ['加油站'], traits: [
    { id: 'self_refuel', group: 'service', label: '自助加油', description: '提供自助加油并有优惠' },
    { id: 'fuel_app', group: 'channel', label: 'App 支付优惠', description: '支持 App 支付享折扣' },
  ], faqs: [
    { id: 'fuel_quality', group: 'risk', question: '油品质量怎么看？有检测公示吗？', hint: '回答应说明油品来源和检测公示' },
  ] },
  { id: 'secondhand', kw: ['二手', '旧货', '中古'], traits: [
    { id: 'graded_used', group: 'service', label: '成色分级', description: '对二手商品做成色分级出售' },
    { id: 'warranty_used', group: 'service', label: '二手质保', description: '对二手商品提供质保' },
  ], faqs: [
    { id: 'used_return', group: 'risk', question: '二手商品有问题能退吗？多久内？', hint: '回答应说明二手退换规则和时限' },
  ] },
  /* ---- 运输物流 ---- */
  { id: 'express', kw: ['快递', '寄递', '邮政'], traits: [
    { id: 'door_pickup', group: 'service', label: '上门取件', description: '支持上门取件' },
    { id: 'smart_locker', group: 'service', label: '智能柜投递', description: '支持快递柜自助投取' },
    { id: 'insured_mail', group: 'claim', label: '保价服务', description: '提供保价寄递服务' },
  ], faqs: [
    { id: 'lost_comp', group: 'risk', question: '没保价丢了怎么赔？', hint: '回答应给出未保价赔付标准' },
  ] },
  { id: 'freight', kw: ['货物运输', '道路货运', '物流', '货运'], traits: [
    { id: 'gps_track', group: 'sla', label: '全程 GPS 可查', description: '运输全程位置可查' },
    { id: 'return_load', group: 'pricing', label: '回程车报价', description: '可提供回程车优惠运价' },
  ], faqs: [
    { id: 'trans_damage', group: 'risk', question: '货损货差怎么赔？装卸谁负责？', hint: '回答应说明装卸责任与货损理赔' },
  ] },
  { id: 'warehouse', kw: ['仓储', '配送', '供应链管理'], traits: [
    { id: 'wms_open', group: 'service', label: '库存系统对客户开放', description: '客户可实时查询库存与流水' },
    { id: 'b2b_b2c_mix', group: 'service', label: '一件代发', description: '支持一件代发履约' },
  ], faqs: [
    { id: 'storage_fee', group: 'decision', question: '仓储费怎么算？出入库费另收吗？', hint: '回答应给出计费口径' },
  ] },
  { id: 'shipping_m', kw: ['水上运输', '航运', '船舶运输', '港口', '码头'], traits: [
    { id: 'own_vessel', group: 'biz', label: '自营船队', description: '自有运力自营航线' },
    { id: 'charter', group: 'biz', label: '租船经纪', description: '提供租船订舱经纪服务' },
  ], faqs: [
    { id: 'schedule_s', group: 'decision', question: '船期固定吗？甩柜了怎么办？', hint: '回答应说明船期稳定性与甩柜处理' },
  ] },
  { id: 'aircargo', kw: ['航空旅客运输', '航空货物运输', '通用航空'], traits: [
    { id: 'dg_air', group: 'service', label: '危险品承运资质', description: '具备空运危险品承运资质' },
    { id: 'charter_air', group: 'service', label: '包机服务', description: '提供包机运力服务' },
  ], faqs: [
    { id: 'air_rate', group: 'decision', question: '运价怎么报？旺季会涨多少？', hint: '回答应说明计费重与淡旺季价差' },
  ] },
  { id: 'passenger', kw: ['客运', '公交', '出租车', '旅客运输', '城市轨道交通'], traits: [
    { id: 'real_time_bus', group: 'service', label: '到站实时查询', description: '支持车辆到站实时查询' },
    { id: 'low_floor', group: 'service', label: '无障碍设施', description: '车辆配无障碍设施' },
  ], faqs: [
    { id: 'lost_item', group: 'risk', question: '东西落车上了怎么找回？', hint: '回答应给出失物招领渠道' },
  ] },
  /* ---- 住宿餐饮 ---- */
  { id: 'hotel', kw: ['住宿', '饭店', '旅馆', '民宿'], traits: [
    { id: 'member_price_h', group: 'channel', label: '会员直订价', description: '官方渠道订有会员价' },
    { id: 'late_checkout', group: 'service', label: '延迟退房', description: '可申请延迟退房' },
    { id: 'kids_stay', group: 'service', label: '儿童免费同住', description: '规定年龄内儿童免费加床' },
  ], faqs: [
    { id: 'room_type', group: 'decision', question: '房型差在哪？图片是实拍吗？', hint: '回答应说明房型差异和图片真实性' },
    { id: 'checkin_rule', group: 'detail', question: '几点入住？外宾能住吗？', hint: '回答应给出入住规则和接待范围' },
  ] },
  { id: 'restaurant', kw: ['餐饮', '正餐', '餐馆', '餐厅', '饭店经营'], traits: [
    { id: 'central_kitchen_r', group: 'production', label: '中央厨房配送', description: '门店餐品由中央厨房统一配送' },
    { id: 'open_kitchen', group: 'production', label: '明厨亮灶', description: '后厨可视或直播可视' },
    { id: 'food_delivery_r', group: 'channel', label: '外卖平台在售', description: '在外卖平台有店' },
    { id: 'private_room', group: 'service', label: '有包间', description: '设有包间可预订' },
  ], faqs: [
    { id: 'food_license_r', group: 'risk', question: '食品经营许可证公示吗？在哪看？', hint: '回答应说明证照公示位置' },
    { id: 'table_wait', group: 'detail', question: '周末要排队吗？能订位吗？', hint: '回答应说明等位与订位规则' },
  ] },
  { id: 'fastfood', kw: ['快餐', '小吃'], traits: [
    { id: 'drive_thru', group: 'service', label: '得来速（车道点餐）', description: '有车道点餐取餐服务' },
    { id: 'meal_set', group: 'pricing', label: '套餐组合优惠', description: '提供固定组合套餐价' },
  ], faqs: [
    { id: 'nutri_f', group: 'decision', question: '有热量和过敏原信息吗？', hint: '回答应说明营养与过敏原信息获取方式' },
  ] },
  { id: 'drinkshop', kw: ['茶饮', '咖啡', '饮品店', '制茶', '冷饮', '饮料及冷饮', '酸奶', '鲜奶吧', '果汁'], traits: [
    { id: 'sugar_level', group: 'service', label: '甜度冰量可调', description: '可自选甜度与冰量' },
    { id: 'real_tea', group: 'production', label: '现泡茶底', description: '茶底门店现泡现制' },
    { id: 'own_farm_d', group: 'org', label: '自有原料基地', description: '主要原料来自自有基地' },
  ], faqs: [
    { id: 'cal_cup', group: 'decision', question: '一杯热量多少？有低卡选项吗？', hint: '回答应给出热量参考和低卡选择' },
  ] },
  /* ---- 信息与金融 ---- */
  { id: 'telecom', kw: ['电信', '广播电视传输', '增值电信'], traits: [
    { id: 'own_network', group: 'biz', label: '自营网络设施', description: '拥有自营网络基础设施' },
    { id: 'mvno', group: 'biz', label: '转售业务', description: '开展电信业务转售' },
  ], faqs: [
    { id: 'telecom_num', group: 'risk', question: '号码和宽带怎么过户销户？余额退吗？', hint: '回答应说明过户销户与余额处理' },
  ] },
  { id: 'internet', kw: ['互联网', '在线', '网络科技', '信息科技'], traits: [
    { id: 'app_product', group: 'delivery', label: '自有 App 产品', description: '运营自有 App 或站点' },
    { id: 'platform_model', group: 'delivery', label: '平台撮合模式', description: '以平台撮合供需为主要模式' },
    { id: 'content_drive', group: 'revenue', label: '内容驱动获客', description: '以内容运营为主要获客方式' },
  ], faqs: [
    { id: 'privacy_i', group: 'risk', question: '收集哪些个人信息？怎么用？', hint: '回答应指向隐私政策并说明关键条款' },
    { id: 'account_del', group: 'risk', question: '账号能注销吗？数据删干净吗？', hint: '回答应说明注销流程和数据删除' },
  ] },
  { id: 'software', kw: ['软件开发', '软件', '程序'], traits: [
    { id: 'source_delivery', group: 'delivery', label: '可交付源码', description: '项目可约定交付源代码' },
    { id: 'agile', group: 'delivery', label: '敏捷迭代交付', description: '按迭代周期持续交付' },
    { id: 'own_ip', group: 'sales', label: '软著登记', description: '核心产品有软件著作权登记' },
  ], faqs: [
    { id: 'ip_owner', group: 'risk', question: '开发出来的代码产权归谁？', hint: '回答应明确知识产权归属约定' },
    { id: 'accept_bug', group: 'risk', question: '验收后发现 bug 还修吗？维保多久？', hint: '回答应说明缺陷责任期与维保范围' },
  ] },
  { id: 'datasrv', kw: ['数据处理', '大数据', '数据服务'], traits: [
    { id: 'compliant_out', group: 'service_p', label: '合规数据来源', description: '数据来源与授权链路合规可查' },
    { id: 'anon', group: 'service_p', label: '脱敏处理', description: '交付数据经匿名化脱敏' },
  ], faqs: [
    { id: 'data_legal', group: 'risk', question: '数据来源合法吗？能用在我们产品里吗？', hint: '回答应说明授权链路与使用限制' },
  ] },
  { id: 'ai', kw: ['人工智能', '大模型', '机器学习', 'ai'], traits: [
    { id: 'model_self', group: 'production', label: '自研模型', description: '核心模型为自研' },
    { id: 'on_prem_ai', group: 'deploy', label: '支持私有化部署', description: '模型可部署在客户环境' },
    { id: 'human_review', group: 'service_p', label: '人工复核机制', description: '关键输出保留人工复核环节' },
  ], faqs: [
    { id: 'ai_effect', group: 'decision', question: '效果怎么验证？准确率多少？', hint: '回答应给出可复现的评测口径与数据' },
    { id: 'ai_data', group: 'risk', question: '我们喂的数据会被拿去训练吗？', hint: '回答应说明客户数据的使用边界' },
  ] },
  { id: 'cybersec', kw: ['网络安全', '信息安全', '安全服务'], traits: [
    { id: 'eval_qualified', group: 'accredit', label: '等保测评资质', description: '持等级保护测评机构资质' },
    { id: 'src_team', group: 'team', label: '自研攻防团队', description: '有自有攻防研究团队' },
  ], faqs: [
    { id: 'sec_report', group: 'detail', question: '测完给什么报告？能过等保吗？', hint: '回答应说明交付物与整改支持' },
  ] },
  { id: 'game', kw: ['游戏', '电竞'], traits: [
    { id: 'game_license_g', group: 'license', label: '版号可查', description: '游戏持版号可官方查验' },
    { id: 'anti_addiction', group: 'service_p', label: '实名与防沉迷', description: '接入实名认证与防沉迷系统' },
  ], faqs: [
    { id: 'minor_pay', group: 'risk', question: '孩子偷充的钱能退吗？流程多久？', hint: '回答应说明未成年人退费流程与时限' },
  ] },
  { id: 'bank', kw: ['银行', '储蓄', '货币金融'], traits: [
    { id: 'deposit_insure', group: 'license', label: '存款保险参保', description: '参加存款保险制度' },
    { id: 'remote_bank', group: 'channel', label: '远程视频柜员', description: '支持远程视频办理业务' },
  ], faqs: [
    { id: 'rate_b', group: 'decision', question: '存款利率多少？在哪查最新利率？', hint: '回答应给出利率查询渠道' },
    { id: 'fee_b', group: 'detail', question: '跨行取现、转账收不收费？', hint: '回答应给出主要收费项目标准' },
  ] },
  { id: 'insurance', kw: ['保险'], traits: [
    { id: 'direct_sale_i', group: 'channel', label: '官网直售', description: '官网或官方渠道直接投保' },
    { id: 'claim_online', group: 'service', label: '线上理赔', description: '支持线上提交理赔' },
    { id: 'long_term_i', group: 'product_i', label: '长期险产品', description: '有长期人身险产品' },
  ], faqs: [
    { id: 'claim_time', group: 'risk', question: '理赔多久到账？拖着找谁？', hint: '回答应给出理赔时限承诺和催办渠道' },
    { id: 'exclude_i', group: 'decision', question: '哪些情况不赔？等待期多久？', hint: '回答应列明主要免责与等待期' },
  ] },
  { id: 'securities', kw: ['证券', '期货', '基金管理'], traits: [
    { id: 'low_comm', group: 'fee_public', label: '佣金公开', description: '交易佣金标准对外公示' },
    { id: 'research_own', group: 'team', label: '自建研究所', description: '有自营研究团队' },
  ], faqs: [
    { id: 'fee_s', group: 'decision', question: '开户和交易都收什么费？', hint: '回答应逐项列出费用标准' },
  ] },
  { id: 'payment', kw: ['支付', '清算'], traits: [
    { id: 'pay_license', group: 'license', label: '支付业务许可', description: '持支付业务许可证' },
    { id: 'fund_custody', group: 'service', label: '备付金集中存管', description: '客户备付金按规集中存管' },
  ], faqs: [
    { id: 'pay_fee_p', group: 'decision', question: '费率多少？秒到还是次日到？', hint: '回答应给出费率与结算周期' },
    { id: 'pay_risk', group: 'risk', question: '被拒付、盗刷了怎么办？', hint: '回答应说明风控与赔付流程' },
  ] },
  { id: 'lease_f', kw: ['融资租赁'], traits: [
    { id: 'leaseback', group: 'model', label: '售后回租', description: '提供售后回租方案' },
  ], faqs: [
    { id: 'lease_rate', group: 'decision', question: '综合年化成本多少？怎么算？', hint: '回答应给出综合成本口径' },
  ] },
  /* ---- 商务与生活服务 ---- */
  { id: 'consulting', kw: ['咨询', '管理咨询', '顾问'], traits: [
    { id: 'industry_focus', group: 'team', label: '专注特定行业', description: '聚焦特定行业领域服务' },
    { id: 'case_public', group: 'team', label: '案例可核实', description: '可提供可核实的过往案例' },
  ], faqs: [
    { id: 'consult_result', group: 'risk', question: '方案落不了地算谁的？', hint: '回答应说明成果界定与责任边界' },
  ] },
  { id: 'accounting', kw: ['会计', '审计', '税务'], traits: [
    { id: 'cpa_firm', group: 'qualification', label: '执业资质齐全', description: '持会计师事务所执业证书' },
    { id: 'audit_listed', group: 'team', label: '有证券业务资格', description: '具备上市公司审计业务经验或资格' },
  ], faqs: [
    { id: 'audit_ind', group: 'risk', question: '审计出问题执业责任怎么担？', hint: '回答应说明执业责任与职业保险' },
  ] },
  { id: 'legal', kw: ['律师', '法律咨询', '法律援助'], traits: [
    { id: 'licensed_lawyer', group: 'qualification', label: '执业律师', description: '由持证执业律师承办' },
    { id: 'specialty_law', group: 'team', label: '专业领域分工', description: '按专业领域设团队分工' },
  ], faqs: [
    { id: 'law_fee', group: 'decision', question: '律师费怎么收？风险代理能做吗？', hint: '回答应给出计费方式和风险代理条件' },
  ] },
  { id: 'hr', kw: ['人力资源', '招聘', '劳务派遣', '人才'], traits: [
    { id: 'dispatch_license', group: 'qualification', label: '劳务派遣许可', description: '持劳务派遣经营许可证' },
    { id: 'rpo', group: 'model', label: '招聘流程外包（RPO）', description: '承接招聘流程整体外包' },
    { id: 'background_check', group: 'service_p', label: '背景调查', description: '提供候选人背调服务' },
  ], faqs: [
    { id: 'labor_risk', group: 'risk', question: '派遣工出了工伤谁负责？', hint: '回答应划分用工责任与保险安排' },
  ] },
  { id: 'advertising', kw: ['广告'], traits: [
    { id: 'own_media', group: 'model', label: '自有媒介资源', description: '拥有自有媒体或点位资源' },
    { id: 'roas_report', group: 'service_p', label: '效果数据报告', description: '投放后提供可核对的效果数据' },
  ], faqs: [
    { id: 'ad_effect', group: 'risk', question: '投了没效果怎么算？数据造假怎么办？', hint: '回答应说明效果口径与反作弊核查' },
  ] },
  { id: 'exhibition', kw: ['会展', '会议展览', '展览'], traits: [
    { id: 'own_venue', group: 'model', label: '自有展馆', description: '拥有自营展览场馆' },
    { id: 'booth_build', group: 'service_p', label: '展台搭建', description: '提供展台设计搭建服务' },
  ], faqs: [
    { id: 'exhibit_cancel', group: 'risk', question: '展会延期或取消，展位费退吗？', hint: '回答应说明不可抗力下的退改规则' },
  ] },
  { id: 'security_g', kw: ['保安', '守护'], traits: [
    { id: 'guard_license', group: 'qualification', label: '保安服务许可', description: '持保安服务许可证' },
    { id: 'tech_defense', group: 'service', label: '联网报警', description: '提供联网报警技防服务' },
  ], faqs: [
    { id: 'guard_liability', group: 'risk', question: '值守期间出事故责任怎么分？', hint: '回答应说明责任条款与投保情况' },
  ] },
  { id: 'laundry', kw: ['洗染', '洗衣', '洗涤服务'], traits: [
    { id: 'eco_solvent', group: 'service', label: '环保溶剂', description: '使用环保型干洗溶剂' },
    { id: 'damage_pay', group: 'service', label: '洗坏赔付标准', description: '公示洗损赔付标准' },
  ], faqs: [
    { id: 'laundry_lost', group: 'risk', question: '衣服洗坏或丢了怎么赔？', hint: '回答应给出赔付标准与流程' },
  ] },
  { id: 'hair', kw: ['理发', '美发', '美甲', '美体'], traits: [
    { id: 'no_push', group: 'service', label: '不办卡不推销承诺', description: '公开承诺不推销办卡' },
    { id: 'licensed_stylist', group: 'team', label: '持证技师', description: '技师持健康证与职业资格' },
    { id: 'transparent_h', group: 'pricing', label: '价目表公示', description: '服务价目对外公示' },
  ], faqs: [
    { id: 'card_h', group: 'risk', question: '办卡后涨价、闭店怎么办？', hint: '回答应说明预付卡履约保障' },
  ] },
  { id: 'photo', kw: ['摄影', '照相', '摄像'], traits: [
    { id: 'raw_delivery', group: 'service', label: '交付原片', description: '承诺交付全部原片' },
    { id: 'refund_p', group: 'service', label: '不满意重拍', description: '不满意可重拍的条款' },
  ], faqs: [
    { id: 'photo_extra', group: 'risk', question: '精修加片怎么收费？底片给不给？', hint: '回答应说明底片归属与加片价格' },
  ] },
  { id: 'housekeep', kw: ['家政', '家庭服务', '保洁'], traits: [
    { id: 'insured_hk', group: 'service', label: '家政责任险', description: '服务人员投保责任险' },
    { id: 'background_hk', group: 'service', label: '人员背景核验', description: '服务人员经背景核验' },
    { id: 'standard_hk', group: 'service', label: '服务清单化', description: '按清单交付并可验收' },
  ], faqs: [
    { id: 'hk_change', group: 'detail', question: '阿姨不合适能换吗？换几次？', hint: '回答应说明换人规则' },
  ] },
  { id: 'moving', kw: ['搬家'], traits: [
    { id: 'fixed_quote_m', group: 'pricing', label: '上门报价一口价', description: '上门评估后一口价不再加价' },
    { id: 'insured_move', group: 'service', label: '搬运保险', description: '搬迁物品投保货运险' },
  ], faqs: [
    { id: 'move_add', group: 'risk', question: '搬一半说加钱怎么办？', hint: '回答应说明报价约束与加价申诉' },
  ] },
  { id: 'repair', kw: ['修理', '维修', '修理业'], traits: [
    { id: 'warranty_repair', group: 'service', label: '维修件保修', description: '维修更换件有保修期' },
    { id: 'quote_first', group: 'pricing', label: '先报价后修', description: '检测报价确认后再维修' },
    { id: 'original_parts', group: 'service', label: '可指定原厂件', description: '可按需选择原厂或品牌件' },
  ], faqs: [
    { id: 'repair_fail', group: 'risk', question: '修完还坏怎么办？重复收费吗？', hint: '回答应说明返修规则' },
  ] },
  { id: 'elderly', kw: ['养老', '老年人', '托养'], traits: [
    { id: 'care_grade', group: 'service', label: '分级护理', description: '按能力评估分级护理' },
    { id: 'med_hookup', group: 'service', label: '医养结合', description: '内设或合作医疗服务' },
    { id: 'bed_bond', group: 'pricing', label: '押金与退住规则公示', description: '公示押金和退住结算规则' },
  ], faqs: [
    { id: 'elderly_emerg', group: 'risk', question: '老人突发疾病怎么处理？', hint: '回答应说明应急预案与就医安排' },
    { id: 'elderly_visit', group: 'detail', question: '家属能随时探视吗？', hint: '回答应说明探视安排' },
  ] },
  { id: 'childcare', kw: ['托育', '托儿'], traits: [
    { id: 'nurse_ratio', group: 'service', label: '公示保育比例', description: '公示保育师与幼儿配比' },
    { id: 'cam_open', group: 'service', label: '监控对家长开放', description: '家长可查看监控' },
  ], faqs: [
    { id: 'cc_license', group: 'risk', question: '托育备案和消防验收在哪查？', hint: '回答应给出备案信息与查验方式' },
  ] },
  { id: 'wedding', kw: ['婚庆', '婚姻服务', '婚礼'], traits: [
    { id: 'one_stop_w', group: 'model', label: '全流程婚庆统筹', description: '统筹婚宴、布置、影像等全部环节' },
    { id: 'backup_w', group: 'service', label: '人员设备备份', description: '关键人员设备有备份方案' },
  ], faqs: [
    { id: 'wedding_plan_b', group: 'risk', question: '当天下雨或人员来不了怎么办？', hint: '回答应说明应急预案' },
  ] },
  { id: 'funeral', kw: ['殡葬', '殡仪'], traits: [
    { id: 'price_public_f', group: 'pricing', label: '价目公示', description: '服务价目表对外公示' },
    { id: 'one_price_f', group: 'pricing', label: '套餐一口价', description: '提供打包一口价套餐' },
  ], faqs: [
    { id: 'funeral_add', group: 'risk', question: '会不会中途加价？', hint: '回答应说明套餐外收费规则' },
  ] },
  { id: 'travel', kw: ['旅行社', '旅游', '游览'], traits: [
    { id: 'no_forced_shop', group: 'service', label: '纯玩无购物', description: '行程无购物点或明示购物安排' },
    { id: 'tour_leader', group: 'service', label: '全程领队', description: '配全程领队或导游' },
    { id: 'travel_insurance', group: 'service', label: '含旅行社责任险', description: '投保旅行社责任险' },
  ], faqs: [
    { id: 'travel_change', group: 'risk', question: '行程缩水或临时改点怎么赔？', hint: '回答应说明行程变更的赔付标准' },
    { id: 'travel_deposit', group: 'decision', question: '定金退不退？签证拒了怎么办？', hint: '回答应给出退改与拒签处理规则' },
  ] },
  { id: 'sport_venue', kw: ['体育场馆', '健身', '游泳场馆', '体育组织'], traits: [
    { id: 'coach_cert_s', group: 'team', label: '持证教练', description: '教练持有相应职业或等级证书' },
    { id: 'venue_insurance', group: 'service', label: '场地运动意外险', description: '提供或可购运动意外险' },
    { id: 'peak_price', group: 'pricing', label: '分时段定价', description: '按高峰低峰分时段定价' },
  ], faqs: [
    { id: 'injury_s', group: 'risk', question: '运动受伤了怎么处理？谁负责？', hint: '回答应说明应急处理与保险安排' },
  ] },
  { id: 'performance', kw: ['演出', '表演', '剧场', '文艺创作'], traits: [
    { id: 'live_approval', group: 'license', label: '演出报批文号', description: '营业性演出有审批文号' },
    { id: 'ticket_refund_p', group: 'service', label: '缺演退赔', description: '演员或场次变更的退赔规则公示' },
  ], faqs: [
    { id: 'cast_change', group: 'risk', question: '主演临时换了能退票吗？', hint: '回答应说明阵容变更的退改规则' },
  ] },
  { id: 'publishing', kw: ['出版', '图书', '报刊'], traits: [
    { id: 'isbn', group: 'license', label: '书号刊号可查', description: '出版物书号刊号可官方查验' },
    { id: 'digital_pub', group: 'format', label: '数字出版', description: '有数字版出版物' },
  ], faqs: [
    { id: 'pub_true', group: 'risk', question: '怎么辨别正版？盗版怎么赔？', hint: '回答应说明正版识别特征与赔付' },
  ] },
  { id: 'film', kw: ['电影', '影视'], traits: [
    { id: 'film_license_f', group: 'license', label: '公映许可', description: '影片持公映许可证' },
    { id: 'settlement_box', group: 'revenue', label: '票房分账', description: '收入以票房分账为主' },
  ], faqs: [
    { id: 'film_invest', group: 'risk', question: '影视投资份额是真是假？资金监管吗？', hint: '回答应说明份额发行的真实性与风险提示' },
  ] },
  { id: 'scenic', kw: ['景区', '公园', '游览景区'], traits: [
    { id: 'ticket_grade_s', group: 'pricing', label: '执行政府指导价', description: '门票执行政府定价或指导价' },
    { id: 'free_open', group: 'service', label: '有免费开放时段', description: '设免费或优惠开放时段' },
    { id: 'queue_virtual', group: 'service', label: '线上排队预约', description: '热门项目可预约排队' },
  ], faqs: [
    { id: 'ticket_refund_s', group: 'risk', question: '门票能退吗？临时闭园怎么办？', hint: '回答应说明退票规则和闭园补偿' },
  ] },
  { id: 'entertainment_v', kw: ['娱乐', '歌舞', '游乐园', '休闲观光'], traits: [
    { id: 'age_limit_e', group: 'service', label: '未成年人时限规定', description: '按规执行未成年人进入时限' },
    { id: 'safety_check_e', group: 'service', label: '设施日检', description: '游乐设施每日安全检查' },
  ], faqs: [
    { id: 'safety_e', group: 'risk', question: '大型设施有年检吗？出事怎么赔？', hint: '回答应说明检验标志与保险' },
  ] },
  /* ---- 教育医疗补充 ---- */
  { id: 'school', kw: ['学校', '学历教育', '学前教育', '幼儿园'], traits: [
    { id: 'public_school', group: 'format', label: '公办', description: '公办学校' },
    { id: 'private_school', group: 'format', label: '民办', description: '民办学校，收费公示' },
    { id: 'boarding', group: 'service', label: '寄宿制', description: '提供寄宿' },
  ], faqs: [
    { id: 'school_fee', group: 'decision', question: '学费多少？收费公示在哪看？', hint: '回答应给出收费标准和公示渠道' },
    { id: 'enroll_area', group: 'decision', question: '招生范围和条件是什么？', hint: '回答应说明招生片区与条件' },
  ] },
  { id: 'training', kw: ['培训', '辅导', '教育咨询'], traits: [
    { id: 'trial_t', group: 'pricing', label: '免费试听', description: '提供免费试听课' },
    { id: 'teacher_cert_t', group: 'team', label: '教师资质公示', description: '教师资质对外公示' },
    { id: 'pay_by_term_t', group: 'pricing', label: '按期收费不超期', description: '收费不超过规定周期' },
  ], faqs: [
    { id: 'prepay_t', group: 'risk', question: '会不会让一次交很多钱？有没有监管账户？', hint: '回答应说明收费周期与资金监管' },
  ] },
  { id: 'studyabroad', kw: ['留学'], traits: [
    { id: 'offer_guarantee', group: 'service_p', label: '结果对赌条款', description: '有未达结果的退费条款' },
    { id: 'oversea_office', group: 'team', label: '有境外服务团队', description: '在目的国设有服务团队' },
  ], faqs: [
    { id: 'sa_refund', group: 'risk', question: '没拿到 offer 服务费退吗？', hint: '回答应说明退费条款与流程' },
  ] },
  { id: 'hospital', kw: ['医院', '卫生院'], traits: [
    { id: 'jci', group: 'qualification', label: '国际医院评审', description: '通过国际医院评审认证' },
    { id: 'grade_3a', group: 'qualification', label: '三级医院', description: '卫生部门评定的三级医院' },
    { id: 'appointment_app_h', group: 'service', label: '线上预约挂号', description: '支持线上预约挂号' },
    { id: 'one_stop_h', group: 'service', label: '入出院床旁结算', description: '入院出院手续在床旁一次办结' },
  ], faqs: [
    { id: 'bed_wait', group: 'detail', question: '住院要等床吗？平均等多久？', hint: '回答应说明等床情况和预估时长' },
    { id: 'self_pay', group: 'decision', question: '异地医保能直接结算吗？', hint: '回答应说明异地结算支持情况' },
  ] },
  { id: 'clinic', kw: ['门诊部', '诊所', '卫生所'], traits: [
    { id: 'night_clinic', group: 'service', label: '夜间门诊', description: '提供夜间门诊时段' },
    { id: 'walk_in_c', group: 'service', label: '免预约接诊', description: '可到店直接就诊' },
  ], faqs: [
    { id: 'clinic_scope', group: 'decision', question: '能看哪些病？超出范围怎么转诊？', hint: '回答应说明诊疗范围与转诊安排' },
  ] },
  { id: 'eldercare_q', kw: ['护理', '康复', '社工'], traits: [
    { id: 'licensed_nurse', group: 'team', label: '注册护士执业', description: '由注册护士提供护理服务' },
    { id: 'care_plan', group: 'service', label: '个案照护计划', description: '按评估制定个案照护计划' },
  ], faqs: [
    { id: 'nurse_door', group: 'detail', question: '上门护理都有什么项目？', hint: '回答应列出可上门的护理项目' },
  ] },
  /* ---- 交叉新兴关键词 ---- */
  { id: 'livestream', kw: ['直播'], traits: [
    { id: 'own_studio', group: 'delivery', label: '自有直播间', description: '有自有直播间与设备' },
    { id: 'data_dashboard', group: 'service_p', label: '播后数据复盘', description: '提供场次数据复盘报告' },
  ], faqs: [
    { id: 'ls_fake', group: 'risk', question: '在线人数和销量数据真实吗？', hint: '回答应说明数据口径与第三方可核验方式' },
  ] },
  { id: 'crossborder', kw: ['跨境', '出海'], traits: [
    { id: 'oversea_warehouse', group: 'service_p', label: '海外仓履约', description: '有海外仓可本地发货' },
    { id: 'customs_clear', group: 'service_p', label: '清关代办', description: '提供清关手续代办' },
  ], faqs: [
    { id: 'cb_return', group: 'risk', question: '跨境退换货怎么走？运费谁出？', hint: '回答应说明跨境退换流程与费用' },
  ] },
  { id: 'saas_kw', kw: ['saas', '订阅'], traits: [
    { id: 'trial_s', group: 'pricing', label: '免费试用期', description: '提供正式付费前的试用期' },
    { id: 'data_export_s', group: 'service_p', label: '数据可导出', description: '支持全量数据导出' },
  ], faqs: [
    { id: 'saas_price_up', group: 'risk', question: '续费涨价有上限吗？停用数据怎么给？', hint: '回答应说明续费规则与数据交付' },
  ] },
  { id: 'blockchain', kw: ['区块链'], traits: [
    { id: 'chain_audit', group: 'accredit', label: '链上可审计', description: '链上数据与业务可审计核验' },
    { id: 'no_token', group: 'license', label: '不涉代币发行', description: '业务不涉及代币发行业务' },
  ], faqs: [
    { id: 'bc_legit', group: 'risk', question: '区块链信息服务备案了吗？', hint: '回答应给出备案编号' },
  ] },
  { id: 'vr', kw: ['vr', 'ar', '虚拟现实', '增强现实', '元宇宙'], traits: [
    { id: 'motion_sick', group: 'service_p', label: '限时体验提示', description: '公示体验时长与不适提示' },
    { id: 'hygiene_vr', group: 'service_p', label: '设备消毒', description: '头显设备每客消毒' },
  ], faqs: [
    { id: 'vr_safety', group: 'risk', question: '小孩能玩吗？有年龄和健康限制吗？', hint: '回答应给出适宜年龄与健康提示' },
  ] },
  { id: 'pet', kw: ['宠物'], traits: [
    { id: 'licensed_vet', group: 'team', label: '执业兽医师', description: '有执业兽医师坐诊' },
    { id: 'pet_insurance', group: 'service', label: '可衔接宠物险', description: '支持宠物保险结算或衔接' },
    { id: 'cage_free_p', group: 'service', label: '寄养监控可看', description: '寄养期间监控对主人开放' },
  ], faqs: [
    { id: 'pet_vac', group: 'risk', question: '寄养就医要提供疫苗证明吗？', hint: '回答应说明防疫要求' },
  ] },
  { id: 'camping', kw: ['露营', '营地'], traits: [
    { id: 'equipped_site', group: 'service', label: '拎包入住营位', description: '提供帐篷装备齐全的营位' },
    { id: 'safety_patrol', group: 'service', label: '夜间安全巡查', description: '营地有夜间巡查制度' },
  ], faqs: [
    { id: 'camp_weather', group: 'risk', question: '恶劣天气能改期退费吗？', hint: '回答应说明天气退改规则' },
  ] },
  { id: 'hanfu', kw: ['汉服', '国潮', '国风'], traits: [
    { id: 'formal_set', group: 'service_p', label: '含妆造整体服务', description: '提供服装加妆造的整体服务' },
    { id: 'size_fitting', group: 'service_p', label: '到店试穿调整', description: '支持到店试穿与尺寸调整' },
  ], faqs: [
    { id: 'hanfu_deposit', group: 'risk', question: '租赁押金多少？污损怎么算？', hint: '回答应说明押金与污损赔偿规则' },
  ] },
  { id: 'secondhand_lux', kw: ['奢侈品'], traits: [
    { id: 'auth_expert', group: 'team', label: '专职鉴定师', description: '有专职鉴定团队' },
    { id: 'auth_recheck', group: 'service', label: '复检通道', description: '支持第三方复检' },
  ], faqs: [
    { id: 'lux_fake', group: 'risk', question: '鉴定错了怎么办？赔多少？', hint: '回答应说明鉴定责任与赔付标准' },
  ] },
  { id: 'blindbox', kw: ['盲盒', '潮玩'], traits: [
    { id: 'rate_public', group: 'service', label: '公示抽取概率', description: '公示各等级抽取概率' },
    { id: 'no_forced_set', group: 'pricing', label: '可单买不强制整套', description: '支持单品购买' },
  ], faqs: [
    { id: 'bb_minor', group: 'risk', question: '未成年人购买有限制吗？', hint: '回答应说明未成年人销售限制' },
  ] },
  { id: 'charging', kw: ['充电', '换电'], traits: [
    { id: 'fast_180', group: 'service', label: '液冷超充', description: '有大功率快充桩' },
    { id: 'idle_fee', group: 'pricing', label: '占位费公示', description: '公示充电后占位费规则' },
    { id: 'roaming_c', group: 'service', label: '多平台漫游', description: '支持第三方 App 启动' },
  ], faqs: [
    { id: 'charge_price', group: 'decision', question: '一度电多少钱？服务费怎么算？', hint: '回答应给出电价与服务费构成' },
    { id: 'charge_broken', group: 'risk', question: '充电中断、扣错钱找谁？', hint: '回答应给出故障申报与退款渠道' },
  ] },
  { id: 'energy_storage', kw: ['储能'], traits: [
    { id: 'cell_grade_e', group: 'production', label: '标注电芯来源', description: '公开电芯品牌与来源' },
    { id: 'fire_protection', group: 'production', label: '消防设计', description: '系统配备消防与预警设计' },
  ], faqs: [
    { id: 'es_life', group: 'decision', question: '循环寿命和质保怎么算？', hint: '回答应给出寿命口径与质保条款' },
  ] },
  { id: 'hydrogen', kw: ['氢能', '制氢', '加氢', '氢气', '燃料电池'], traits: [
    { id: 'station_license_h', group: 'qualification', label: '燃气经营许可', description: '加氢业务持相应经营许可' },
    { id: 'h2_purity', group: 'production', label: '标注氢气纯度', description: '公开氢气纯度与检测方式' },
  ], faqs: [
    { id: 'h2_price', group: 'decision', question: '一公斤氢多少钱？和油电怎么比？', hint: '回答应给出价格与运行成本对比' },
  ] },
  { id: 'carbon', kw: ['双碳', '碳排放', '碳资产', '碳足迹', '碳交易'], traits: [
    { id: 'verified_method', group: 'accredit', label: '采用公认核算方法', description: '按公认标准方法学核算' },
    { id: 'third_verify', group: 'service_p', label: '支持第三方核证', description: '成果支持第三方核证' },
  ], faqs: [
    { id: 'carbon_valid', group: 'risk', question: '算出来的数据交易所认吗？', hint: '回答应说明数据采信范围与依据' },
  ] },
  { id: 'recycle', kw: ['回收', '再生资源', '资源利用'], traits: [
    { id: 'licensed_recycle', group: 'qualification', label: '再生资源回收备案', description: '完成回收业务备案' },
    { id: 'data_destruction', group: 'service_p', label: '隐私数据销毁', description: '回收设备提供数据销毁证明' },
  ], faqs: [
    { id: 'recycle_price', group: 'decision', question: '回收价怎么定？估价和成交价差多少？', hint: '回答应说明估价方式与到手价规则' },
  ] },
  { id: 'metaverse', kw: ['数字人', '数字藏品'], traits: [
    { id: 'copyright_m', group: 'license', label: '版权归属明确', description: '数字内容版权归属与授权范围明确' },
  ], faqs: [
    { id: 'nft_trade', group: 'risk', question: '买的东西能转卖吗？版权是谁的？', hint: '回答应说明权益范围与转售规则' },
  ] },
  { id: 'lowaltitude', kw: ['低空', 'evtol'], traits: [
    { id: 'air_route_ok', group: 'qualification', label: '获批空域航线', description: '已获批复的空域或航线' },
    { id: 'pilot_license_l', group: 'team', label: '持照飞行员', description: '由持照人员执飞' },
  ], faqs: [
    { id: 'la_weather', group: 'risk', question: '天气取消怎么退改？', hint: '回答应说明飞行条件与退改规则' },
  ] },
  { id: 'smart_home', kw: ['智能家居', '智能门锁', '全屋智能'], traits: [
    { id: 'protocol_open', group: 'production', label: '支持主流生态互联', description: '支持主流智能家居生态接入' },
    { id: 'local_control', group: 'production', label: '断网可本地控制', description: '断网时本地控制可用' },
  ], faqs: [
    { id: 'sh_install', group: 'detail', question: '旧门旧房能装吗？收上门费吗？', hint: '回答应说明适配条件与安装收费' },
  ] },
  { id: 'iot', kw: ['物联网', '车联网', '工业互联网'], traits: [
    { id: 'iot_protocol', group: 'production', label: '开放协议接入', description: '支持标准协议第三方设备接入' },
    { id: 'iot_local', group: 'deploy', label: '支持边缘本地运行', description: '断云时可本地运行' },
  ], faqs: [
    { id: 'iot_scale', group: 'decision', question: '我们这个设备量，费用大概多少？', hint: '回答应给出接入规模与费用测算' },
  ] },
  { id: 'medical_beauty', kw: ['医美', '医疗美容', '植发'], traits: [
    { id: 'licensed_clinic_mb', group: 'qualification', label: '医疗机构执业许可', description: '持医疗机构执业许可证' },
    { id: 'physician_mb', group: 'team', label: '主诊医师资质公示', description: '主诊医师资质可查' },
    { id: 'price_list_mb', group: 'pricing', label: '价目公示', description: '项目价格对外公示' },
  ], faqs: [
    { id: 'mb_risk', group: 'risk', question: '出了并发症怎么处理？修复费用谁出？', hint: '回答应说明并发症处理与责任条款' },
    { id: 'mb_minor', group: 'risk', question: '未成年人能做吗？', hint: '回答应说明对未成年人的限制' },
  ] },
  { id: 'oral', kw: ['口腔'], traits: [
    { id: 'implant_brand_o', group: 'service', label: '种植体品牌可查', description: '所用种植体品牌型号可查验' },
    { id: 'sterilize_o', group: 'service', label: '一人一机消毒', description: '器械按一人一用一消毒执行' },
  ], faqs: [
    { id: 'oral_price', group: 'decision', question: '种一颗牙全程多少钱？含不含牙冠？', hint: '回答应给出全程费用构成' },
  ] },
  { id: 'fitness', kw: ['健身'], traits: [
    { id: 'open_24_f', group: 'service', label: '24 小时营业', description: '全天可锻炼' },
    { id: 'freeze_member', group: 'pricing', label: '会员可冻结', description: '会员卡可申请冻结' },
  ], faqs: [
    { id: 'gym_close', group: 'risk', question: '门店关了卡怎么办？能转店退卡吗？', hint: '回答应说明闭店后的处置安排' },
  ] },
  { id: 'psych', kw: ['心理'], traits: [
    { id: 'licensed_psych', group: 'team', label: '持证咨询师', description: '咨询师持相关职业认证并公示' },
    { id: 'supervision', group: 'team', label: '定期督导', description: '咨询师接受定期督导' },
    { id: 'referral_med', group: 'service', label: '异常转介医疗', description: '超出咨询范围时转介医疗机构' },
  ], faqs: [
    { id: 'psych_secret', group: 'risk', question: '谈话内容保密吗？什么情况会突破保密？', hint: '回答应说明保密原则与例外情形' },
  ] },
  { id: 'maker', kw: ['体验馆', 'diy', '手作', '工坊'], traits: [
    { id: 'walk_in_mk', group: 'mode', label: '可随到随做', description: '无需预约随到随体验' },
    { id: 'kid_friendly_mk', group: 'buyer', label: '亲子可参与', description: '提供亲子共作项目' },
  ], faqs: [
    { id: 'mk_price', group: 'decision', question: '一次多少钱？包含材料和带走的作品吗？', hint: '回答应说明费用包含范围' },
  ] },
  { id: 'weddingphoto', kw: ['写真', '旅拍'], traits: [
    { id: 'no_hidden_fee_wp', group: 'pricing', label: '套餐外不强制消费', description: '承诺无强制后期消费' },
  ], faqs: [
    { id: 'wp_add', group: 'risk', question: '选片加片贵吗？能只要底片吗？', hint: '回答应说明底片与加片价格' },
  ] },
  { id: 'oster', kw: ['产后', '月子', '母婴'], traits: [
    { id: 'medical_support_o', group: 'service', label: '医护驻店', description: '有医护团队驻店支持' },
    { id: 'meal_std', group: 'service', label: '月子餐公示', description: '餐食标准与菜单公示' },
  ], faqs: [
    { id: 'mm_nurse', group: 'risk', question: '宝宝和妈妈出健康问题怎么办？', hint: '回答应说明医疗应急安排' },
  ] },
  { id: 'organize', kw: ['收纳', '整理'], traits: [
    { id: 'before_after_o', group: 'service', label: '前后对比交付', description: '交付前后对比记录' },
    { id: 'plan_o', group: 'service', label: '出收纳方案', description: '先出方案再动手' },
  ], faqs: [
    { id: 'org_time', group: 'decision', question: '全屋整理要几天？费用怎么算？', hint: '回答应给出工期与计价方式' },
  ] },
  { id: 'accompany', kw: ['陪诊', '陪练'], traits: [
    { id: 'cert_escort', group: 'team', label: '陪诊人员培训认证', description: '陪诊人员经培训认证' },
    { id: 'no_med_decide', group: 'service', label: '不代替医疗决策', description: '明确不干预医生诊疗决策' },
  ], faqs: [
    { id: 'pd_scope', group: 'risk', question: '陪诊出了意外责任怎么分？', hint: '回答应说明服务边界与责任约定' },
  ] },
  { id: 'gene', kw: ['基因'], traits: [
    { id: 'lab_cert_g', group: 'accredit', label: '检测实验室资质', description: '实验室持相应技术资质' },
    { id: 'genetic_counsel', group: 'service', label: '含遗传咨询', description: '报告配套遗传咨询解读' },
  ], faqs: [
    { id: 'gene_privacy', group: 'risk', question: '基因数据怎么存？会被共享吗？', hint: '回答应说明数据存储与使用授权' },
  ] },
  { id: '3dprint', kw: ['3d打印', '增材制造'], traits: [
    { id: 'materials_3d', group: 'production', label: '多材料可选', description: '支持金属或树脂等多种材料' },
    { id: 'tolerance_3d', group: 'production', label: '标注打印精度', description: '公示精度与公差范围' },
  ], faqs: [
    { id: 'p3d_file', group: 'detail', question: '图纸保密吗？文件怎么交？', hint: '回答应说明保密协议与文件管理' },
  ] },
  { id: 'esg', kw: ['esg'], traits: [
    { id: 'framework_esg', group: 'accredit', label: '采用公认披露框架', description: '按公认框架编制报告' },
  ], faqs: [
    { id: 'esg_accept', group: 'risk', question: '出的报告投资机构认吗？', hint: '回答应说明报告采信情况' },
  ] },
  { id: 'auction', kw: ['拍卖'], traits: [
    { id: 'licensed_auction', group: 'qualification', label: '拍卖经营许可', description: '持拍卖经营批准证书' },
    { id: 'deposit_rule_a', group: 'pricing', label: '保证金规则公示', description: '公示保证金与佣金规则' },
  ], faqs: [
    { id: 'auction_true', group: 'risk', question: '拍品真伪谁担保？拍了不想要怎么办？', hint: '回答应说明拍品担保与违约处理' },
  ] },
  { id: 'translation', kw: ['翻译'], traits: [
    { id: 'native_review', group: 'team', label: '母语审校', description: '译文经母语审校' },
    { id: 'free_revise', group: 'service_p', label: '修改响应', description: '约定时限内免费修改' },
  ], faqs: [
    { id: 'trans_conf', group: 'risk', question: '稿件保密吗？', hint: '回答应说明保密协议安排' },
  ] },
  { id: 'ipagent', kw: ['知识产权', '商标代理', '专利代理'], traits: [
    { id: 'patent_bar', group: 'qualification', label: '专利代理机构执业', description: '持专利代理机构执业许可证' },
    { id: 'fee_public_ip', group: 'pricing', label: '官费代缴透明', description: '官费与代理费分项列明' },
  ], faqs: [
    { id: 'ip_guarantee', group: 'risk', question: '说包注册成功靠谱吗？', hint: '回答应说明注册风险与承诺边界' },
  ] },
];

/* ------------------------------------------------------------------ */
/* 构建 industries.json                                                */
/* ------------------------------------------------------------------ */
function loadJSON(p) { return JSON.parse(fs.readFileSync(p, 'utf8')); }

function buildIndex(list) {
  const idx = new Map();
  for (const ind of list) {
    for (const a of ind.aliases || [ind.industry]) {
      const n = normalize(a);
      if (n && !idx.has(n)) idx.set(n, ind.id);
    }
  }
  return idx;
}

function build() {
  const gbt = loadJSON(SRC_GBT);
  const em = loadJSON(SRC_EMERGING);
  const seedAliases = new Set();
  for (const f of fs.readdirSync(SEED_DIR)) {
    if (!f.endsWith('.json')) continue;
    const j = loadJSON(path.join(SEED_DIR, f));
    seedAliases.add(j.industry);
    for (const a of j.industry_aliases || []) seedAliases.add(a);
  }
  const seedNorm = new Set([...seedAliases].map(normalize));

  /* 第一层：GB/T 全部节点 */
  const industries = [];
  const layer1Skipped = [];
  for (const r of gbt) {
    const norm = normalize(r.name);
    if (seedNorm.has(norm)) { layer1Skipped.push(r); continue; }
    industries.push({
      id: 'gbt-' + r.code.toLowerCase(),
      layer: 1,
      industry: r.name,
      code: r.code,
      level: r.level,
      path: r.path,
      aliases: [r.code, r.name, ...r.path.filter((p) => p !== r.name)],
    });
  }

  /* 第二层：新兴行业，先与第一层按归一名去重 */
  const normL1 = new Set();
  for (const r of gbt) normL1.add(normalize(r.name));
  const emList = [];
  let emDup = 0, emSeq = 0;
  for (const [sector, entries] of Object.entries(em.sectors)) {
    for (const e of entries) {
      const [name, kw] = e;
      if (normL1.has(normalize(name)) || seedNorm.has(normalize(name))) { emDup++; continue; }
      emSeq += 1;
      emList.push({
        id: 'em-' + String(emSeq).padStart(4, '0'),
        layer: 2,
        industry: name,
        sector,
        keywords: (kw || '').split(/\s+/).filter(Boolean),
        aliases: [name],
      });
    }
  }

  /* 第三层：品牌库 industry 字段未覆盖写法 */
  const brands = loadJSON(BRANDS);
  const freq = new Map();
  for (const b of (Array.isArray(brands) ? brands : brands.brands || [])) {
    const s = String(b.industry || '').trim();
    if (s) freq.set(s, (freq.get(s) || 0) + 1);
  }
  const all = [...industries, ...emList];
  const idx = buildIndex(all);
  const matched = [], unmatched = [];
  const layer3 = [];
  const entries = [...freq.entries()].sort((a, b) => b[1] - a[0].localeCompare(b[0]));
  let dsSeq = 0, junkCount = 0, seedCovered = 0;
  for (const [raw, count] of entries) {
    if (JUNK.has(raw)) { junkCount++; continue; }
    // 8 个手工种子的 industry_aliases 已覆盖的写法不再建新条目
    if (seedNorm.has(normalize(raw))) { seedCovered++; continue; }
    const mapped = (ZH_DICT[raw] && ZH_DICT[raw] !== null ? ZH_DICT[raw] : EN_DICT[raw.toLowerCase()]) || null;
    const probe = mapped || raw;
    if (mapped && seedNorm.has(normalize(probe))) { seedCovered++; continue; }
    const hit = matchIndustry(probe, idx);
    if (hit) {
      matched.push([raw, hit]);
      const ind = all.find((i) => i.id === hit);
      if (ind && !ind.aliases.includes(raw)) ind.aliases.push(raw);
    } else {
      if (ZH_DICT[raw] === null) { junkCount++; continue; }
      unmatched.push(raw);
      dsSeq += 1;
      const simpName = mapped || raw.split('').map((ch) => SIMP[ch] || ch).join('');
      layer3.push({ id: 'ds-' + String(dsSeq).padStart(4, '0'), layer: 3, industry: simpName, count, aliases: [raw] });
    }
  }

  const out = {
    meta: {
      generated: TODAY,
      generator: 'tools/gen-taxonomy.cjs build',
      sources: {
        layer1: 'GB/T 4754-2017 国民经济行业分类（tools/source/gbt4754.json）',
        layer2: '新兴与交叉行业（tools/source/emerging.json，人工维护）',
        layer3: 'datasets/brands-1k.json industry 字段未覆盖写法',
      },
      counts: {
        layer1: industries.length, layer1_skipped_vs_seeds: layer1Skipped.length,
        layer2: emList.length, layer2_dup_vs_layer1: emDup,
        layer3: layer3.length, brand_strings_total: freq.size, brand_matched: matched.length, brand_seed_covered: seedCovered, brand_junk: junkCount,
      },
    },
    industries: [...industries, ...emList, ...layer3],
  };
  fs.writeFileSync(OUT_LIST, JSON.stringify(out, null, 1));
  console.log('[build] industries.json 写入完成：');
  console.log('  第一层 GB/T 节点:', industries.length, '（与手工种子重名跳过', layer1Skipped.length, '）');
  console.log('  第二层 新兴行业:', emList.length, '（与第一层重名跳过', emDup, '）');
  console.log('  第三层 品牌库写法:', layer3.length, '（匹配既有条目', matched.length, '，杂项跳过', junkCount, '）');
  console.log('  合计:', out.industries.length);
}

/* 品牌字符串 → 既有行业条目匹配 */
function matchIndustry(probe, idx) {
  const cands = [probe];
  // "大类-细分" 写法：取各段
  for (const part of probe.split(/[-—－]/)) if (part && part.length >= 2) cands.push(part);
  for (const c of cands) {
    const n = normalize(c);
    if (n && idx.has(n)) return idx.get(n);
  }
  // 包含匹配：候选键被包含或包含候选键（长度>=3 防误伤）
  let best = null, bestLen = 0;
  const nProbe = normalize(probe);
  const isCjk = (x) => /^[一-鿿]+$/.test(x);
  for (const [k, id] of idx) {
    const minLen = isCjk(k) ? 2 : 4;
    if (k.length < minLen || nProbe.length < minLen) continue;
    if ((nProbe.includes(k) || k.includes(nProbe)) && k.length > bestLen) { best = id; bestLen = k.length; }
  }
  return best;
}

/* ------------------------------------------------------------------ */
/* 生成 auto/ 分类法文件                                               */
/* ------------------------------------------------------------------ */
/* 规则特质可能引用原型没有的通用组（如 service_p/qualification），这里兜底补组 */
const GROUP_FALLBACK = {
  service_p: { label: '配套服务', select: 'many' },
  qualification: { label: '资质与认证', select: 'many' },
  production: { label: '生产方式', select: 'many' },
  sales: { label: '销售与渠道', select: 'many' },
  pricing: { label: '价格与付费', select: 'many' },
  team: { label: '团队构成', select: 'many' },
  license: { label: '许可与备案', select: 'many' },
  accredit: { label: '资质与效力', select: 'many' },
  channel: { label: '经营渠道', select: 'many' },
  deploy: { label: '部署方式', select: 'many' },
  format: { label: '经营形态', select: 'many' },
  model: { label: '业务模式', select: 'many' },
  revenue: { label: '收入方式', select: 'many' },
  biz: { label: '业务环节', select: 'many' },
  deliver: { label: '交付方式', select: 'many' },
  buyer: { label: '客群定位', select: 'many' },
  mode_b: { label: '生产方式', select: 'many' },
  settle: { label: '结算方式', select: 'many' },
  service: { label: '服务与保障', select: 'many' },
  org: { label: '生产组织', select: 'many' },
  claim: { label: '赔付规则', select: 'many' },
  delivery: { label: '交付方式', select: 'many' },
  scale: { label: '经营规模', select: 'many' },
  logistics: { label: '配送方式', select: 'many' },
  fee_public: { label: '收费公示', select: 'many' },
  product_i: { label: '产品构成', select: 'many' },
  mode: { label: '服务方式', select: 'many' },
  sla: { label: '时效承诺', select: 'many' },
  strategy: { label: '价格策略', select: 'many' },
};

function deriveArchetype(ind) {
  if (ind.layer === 1) {
    const gateName = ind.level === 0 ? ind.industry : ind.path[0];
    const letter = GATE_OF_NAME[gateName];
    let arch = GATE_ARCH[letter] || 'public';
    if (ind.level >= 1) {
      const mc = ind.code.slice(0, 2);
      if (MAJOR_ARCH_OVERRIDES[mc]) arch = MAJOR_ARCH_OVERRIDES[mc];
    }
    return arch;
  }
  if (ind.layer === 2) {
    const s = ind.sector;
    const nm = ind.industry + ' ' + (ind.keywords || []).join(' ');
    // 互联网板块里的代运营/MCN/经纪/营销类是服务公司，不是软件产品公司，用商务服务模板
    if (s === 'internet' && /运营|代播|mcn|公会|经纪|孵化|营销|内容机构|服务商|基地/.test(nm.toLowerCase())) return 'bizservice';
    // 消费板块混着产品品牌、门店业态和服务业态，按名字再分路
    if (s === 'consumer') {
      if (/餐饮|餐厅|酒馆|食堂|小吃|快餐|烧烤|火锅|轻食|沙拉|酸奶吧|鲜奶吧|果汁店/.test(nm)) return 'hospitality';
      if (/培训|教室|课程/.test(nm)) return 'education';
      if (/服务|管家|月嫂|收纳|保洁|清洗|洗护|维修|回收|上门|摄影|写真|体验|工坊|画室|馆|中心|营地|农场|策划/.test(nm)) return 'lifeservice';
      return 'retail';
    }
    const map = { internet: 'tech', consumer: 'retail', service: 'lifeservice', energy: 'energy', hardware: 'mfg', mobility: 'mfg', bio: 'mfg', space: 'mfg', media: 'culture', fintech: 'finance', environment: 'environment', advanced: 'mfg' };
    return map[s] || 'bizservice';
  }
  // 第三层：按关键词猜原型
  const t = ind.industry;
  if (/互联网|软件|信息|数据|智能|科技/.test(t)) return 'tech';
  if (/银行|保险|证券|基金|金融|投资|支付|典当|租赁/.test(t)) return 'finance';
  if (/医院|医疗|药|卫生|护理|康复/.test(t)) return 'health';
  if (/教育|培训|学校/.test(t)) return 'education';
  if (/运输|物流|快递|仓储/.test(t)) return 'transport';
  if (/建筑|工程|施工|装修/.test(t)) return 'build';
  if (/餐饮|餐厅|食品/.test(t)) return 'hospitality';
  if (/批发/.test(t)) return 'trade';
  if (/零售|店|商城|电商/.test(t)) return 'retail';
  if (/房地产|物业/.test(t)) return 'realestate';
  if (/咨询|法律|会计|广告|会展/.test(t)) return 'bizservice';
  if (/文化|娱乐|影视|传媒|出版|艺术|体育/.test(t)) return 'culture';
  if (/环境|环保|水利/.test(t)) return 'environment';
  if (/制造|加工|工业|装备|设备/.test(t)) return 'mfg';
  if (/农业|种植|养殖|渔/.test(t)) return 'farm';
  return 'bizservice';
}

function matchRules(ind) {
  // 门类名（如“农、林、牧、渔业”）包含多个行业字样，会造成规则误命中，排除；
  // 门类节点本身（level 0）不匹配行业规则，只用通用模板。
  const parents = (ind.path || []).slice(1);
  if (ind.layer === 1 && ind.level === 0) return [];
  const text = [ind.industry, ...parents, ...(ind.keywords || [])].join(' ').toLowerCase();
  const hits = [];
  for (const rule of RULES) {
    for (const k of rule.kw) {
      if (text.includes(k.toLowerCase())) { hits.push(rule); break; }
    }
  }
  // 规则多的场景取前 5 条，避免特质表爆炸
  return hits.slice(0, 5);
}

function generate() {
  const list = loadJSON(OUT_LIST);
  if (!fs.existsSync(AUTO_DIR)) fs.mkdirSync(AUTO_DIR, { recursive: true });
  for (const d of ['gbt', 'emerging', 'brands']) {
    const p = path.join(AUTO_DIR, d);
    if (fs.existsSync(p)) for (const f of fs.readdirSync(p)) fs.unlinkSync(path.join(p, f));
    else fs.mkdirSync(p, { recursive: true });
  }
  const index = [];
  const stats = { traitMin: 1e9, traitMax: 0, faqMin: 1e9, faqMax: 0, lowTrait: [], lowFaq: [] };
  for (const ind of list.industries) {
    const arch = ARCH[deriveArchetype(ind)] || ARCH.public;
    const rules = matchRules(ind);
    const groups = [...arch.groups];
    const traits = arch.traits.map((t) => ({ ...t }));
    const faqs = arch.faqs.map((f) => ({ ...f }));
    for (const rule of rules) {
      const ownGroups = new Set((rule.groups || []).map((g) => g.id));
      for (const g of rule.groups || []) {
        const gid = rule.id + '_' + g.id;
        groups.push({ select: 'many', ...g, id: gid });
        ownGroups.add(g.id); // 保持原 id 可被本规则特质引用
      }
      for (const t of rule.traits || []) {
        const inOwn = ownGroups.has(t.group);
        const gid = inOwn ? rule.id + '_' + t.group : t.group;
        const tid = rule.id + '_' + t.id;
        if (traits.some((x) => x.id === tid)) continue;
        traits.push({ ...t, group: gid, id: tid });
      }
      for (const f of rule.faqs || []) {
        const fid = rule.id + '_' + f.id;
        if (faqs.some((x) => x.id === fid)) continue;
        faqs.push({ ...f, id: fid });
      }
    }
    // 补齐特质引用到但组清单里没有的组（规则引用原型组而原型未定义时兜底）
    const groupIds = new Set(groups.map((g) => g.id));
    for (const t of traits) {
      if (!groupIds.has(t.group)) {
        const fb = GROUP_FALLBACK[t.group] || { label: '业务特征', select: 'many' };
        groups.push({ id: t.group, label: fb.label, select: fb.select });
        groupIds.add(t.group);
      }
    }
    // 丢弃仍未命中任何组的特质（防御）
    const finalTraits = traits.filter((t) => groupIds.has(t.group));
    // 剪裁到上限（README：FAQ ≤25）
    const faqsOut = faqs.slice(0, 25);
    const taxonomy = {
      schema: 'eeo.taxonomy.v1',
      id: ind.id,
      industry: ind.industry,
      industry_aliases: [...new Set(ind.aliases || [ind.industry])],
      updated: TODAY,
      trait_groups: groups,
      traits: finalTraits,
      faq_groups: [{ id: 'decision', label: P1 }, { id: 'detail', label: P2 }, { id: 'risk', label: P3 }],
      faqs: faqsOut,
    };
    const dir = ind.layer === 1 ? 'gbt' : ind.layer === 2 ? 'emerging' : 'brands';
    fs.writeFileSync(path.join(AUTO_DIR, dir, ind.id + '.json'), JSON.stringify(taxonomy, null, 2));
    index.push({ id: ind.id, layer: ind.layer, industry: ind.industry, traits: finalTraits.length, faqs: faqsOut.length, file: 'auto/' + dir + '/' + ind.id + '.json', aliases: taxonomy.industry_aliases.length });
    if (finalTraits.length < stats.traitMin) stats.traitMin = finalTraits.length;
    if (finalTraits.length > stats.traitMax) stats.traitMax = finalTraits.length;
    if (faqsOut.length < stats.faqMin) stats.faqMin = faqsOut.length;
    if (faqsOut.length > stats.faqMax) stats.faqMax = faqsOut.length;
    if (finalTraits.length < 10) stats.lowTrait.push(ind.id + '(' + finalTraits.length + ')');
    if (faqsOut.length < 8) stats.lowFaq.push(ind.id + '(' + faqsOut.length + ')');
  }
  fs.writeFileSync(path.join(AUTO_DIR, 'index.json'), JSON.stringify({ generated: TODAY, count: index.length, industries: index }, null, 1));
  console.log('[generate] 生成完成：' + index.length + ' 个行业文件');
  console.log('  特质数 min/max:', stats.traitMin + '/' + stats.traitMax, '  FAQ 数 min/max:', stats.faqMin + '/' + stats.faqMax);
  if (stats.lowTrait.length) console.log('  特质<10 的行业:', stats.lowTrait.length, stats.lowTrait.slice(0, 10));
  if (stats.lowFaq.length) console.log('  FAQ<8 的行业:', stats.lowFaq.length, stats.lowFaq.slice(0, 10));
}

function stats() {
  const list = loadJSON(OUT_LIST);
  const byLayer = {};
  for (const i of list.industries) byLayer[i.layer] = (byLayer[i.layer] || 0) + 1;
  console.log('合计', list.industries.length, '个行业；分层:', byLayer);
  console.log('meta:', JSON.stringify(list.meta.counts));
}

const cmd = process.argv[2] || '';
if (cmd === 'build') build();
else if (cmd === 'stats') stats();
else generate();
