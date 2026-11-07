# 关键字引擎：这类问题别人怎么解（调研 + 方案）

> 起因（2026-11-08）：`天鹅德式高音八孔竖笛8孔六孔小学生儿童成人专用演奏初中生笛子`
> 要提出「竖笛」。这不是「取前缀/去后缀」能解决的 —— 它属于
> **从无句法结构的商品标题里抽属性/实体**，是一类有成熟做法的问题。
> 本文只做调研与选型，**没有改代码**。

## 一、问题归类

一句话：**短文本、无句法、多属性混杂、要抽一个「最有辨识度的词」**。
学术上对应两条线：

- **关键词抽取（keyphrase extraction）**：从文档里挑出代表性词，无标注。
- **属性/实体抽取（attribute / named-entity extraction）**：给每个词标类型
  （品牌 / 品类 / 规格 / 人群…），有监督。

我们要的东西（「竖笛」）是**品类词**，属于第二条线的 `product type` 槽位。

## 二、已有方案（按出处）

### 1. 序列标注：CRF + 结构化感知机（工业界主流）

More, *Attribute Extraction from Product Titles in eCommerce*, KDD 2016 Workshop
（arXiv:1608.04670，沃尔玛商品目录）。原文结论：
> combining sequence labeling algorithms such as Conditional Random Fields and
> Structured Perceptron with a curated normalization scheme

做法：把标题按字/词打上 B/I/O 标签，标注「品牌」等属性，再归一化。
**优点**：准确率高，能处理词序自由。
**代价**：要标注语料训练；模型要跑在端侧。

### 2. 图算法：TextRank

Mihalcea & Tarau, *TextRank: Bringing Order into Texts*, EMNLP 2004。
把词当节点、共现当边，迭代 PageRank 取分数高的词。
**优点**：无监督、无训练、纯计算。
**短板**：**依赖窗口内的重复共现**；商品标题只有十几个词、每个词出现一次，
图几乎是散的 —— 短标题上效果明显弱于长文档。

### 3. 统计加权：TF-IDF

`jieba.analyse.extract_tags` 用的就是 TF-IDF + 停用词表；同一作者的
TextRank 变体也在 jieba 里（`textrank` 接口）。
**关键前提**：要有一个**语料**才能算 IDF —— 单条标题算不了，得拿整批账单当语料。

### 4. 词典 / 属性词库匹配

专利 CN114818674A 明确写了一种做法：
> 基于规则匹配方式，在对标题文本分词获得多个词条的基础上，
> 将各个词条与预设的属性词库进行精准匹配，将命中属性词库的词条确定为属性词

**优点**：零训练、可解释、命中即准；词库可以增量。
**代价**：覆盖率取决于词库。国标 `消费品分类与代码`、
`全国主要产品分类 产品类别核心元数据`、以及 Shopify 开源的
[product-taxonomy](https://github.com/Shopify/product-taxonomy) 都可以当种子词库。

### 5. 大模型

效果好，但本项目是**零依赖 PWA、离线优先、没有后端**（见 NEXT-SESSION §1），
把关键词抽取交给远端模型等于给账本加一条网络依赖 —— 不做。

## 三、本项目的约束

| 约束 | 影响 |
|---|---|
| 纯前端、零依赖 | 不能引入 CRF/序列标注模型、不能装 jieba 原生模块 |
| 离线可用 | 不能调远端 API |
| 账单是一次性整批导入的 | **有语料**：一份账单几百笔，可以算 IDF |
| 宁可空着也不能写错 | 备注允许为空（v1.480 已定），错标比不标糟 |

## 四、建议路线（三层，按准确率排序）

1. **词典命中（主路）**
   `core/keyword-dict.js` 放一张品类/属性词表（几十到几百词，中文）。
   `天鹅…竖笛…笛子` 命中「竖笛」→ 直接用它。
   词表种子可参考国标分类与 Shopify taxonomy，但**中文消费词得自己攒** —
   随手加一行就能生效，这是最可控的一条。

2. **语料统计（辅路）**
   拿**整份账单**当语料算 IDF：`竖笛` 在全账单只出现 1 次 → 高权重；
   `小学生`、`专用`、`八孔` 出现在很多标题里 → 低权重。
   这一层不需要词表，但单独用会挑错，**只作为词典未命中时的候选**。

3. **不猜（兜底）**
   两层都没结果 → 备注空着，关键字退回商户名。
   这是 v1.480 已经定下的原则：**错的信息比没有更糟**。

TextRank 与序列标注都**不采用**：前者在十几词的短标题上退化，
后者要训练语料，两者都不符合「零依赖 + 离线」。

## 五、参考

- More, A. *Attribute Extraction from Product Titles in eCommerce*. arXiv:1608.04670
  · https://arxiv.org/abs/1608.04670
- Mihalcea, R. & Tarau, P. *TextRank: Bringing Order into Texts*. EMNLP 2004
  · https://scholar.google.com/citations?view_op=view_citation&citation_for_view=JUMRc-oAAAAJ:u5HHmVD_uO8C
- 关键词提取算法研究综述（维普）
  · http://m.qikan.cqvip.com/Article/ArticleDetail?id=7111739179
- 专利 CN114818674A（候选关键词 + 属性词库匹配）
  · https://patentimages.storage.googleapis.com/a7/13/46/ca7d6e2abb9bf6/CN114818674A.pdf
- jieba TF-IDF / TextRank 实现与停用词
  · https://github.com/JustinJiang1994/keyword-extraction
- 哈工大中文停用词表（hit_stopwords）
  · https://atomgit.com/open-source-toolkit/63e0e/tree/main
- Shopify 标准化商品分类（品类词表种子）
  · https://github.com/Shopify/product-taxonomy
- 国标：消费品分类与代码 / 产品类别核心元数据
  · https://www.spc.org.cn/online/dbce3f4b4792643ebf1978d63ad27bc3.html
