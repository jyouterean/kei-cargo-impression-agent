import OpenAI from "openai";

// Lazy-load OpenAI client to avoid build-time errors
let openaiInstance: OpenAI | null = null;

function getOpenAI(): OpenAI {
  if (!openaiInstance) {
    openaiInstance = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }
  return openaiInstance;
}

export interface PatternExtractionResult {
  format: string;
  hookType: string;
  payloadType: string;
  rhetorical: string;
  lengthBucket: string;
  emojiDensity: string;
  punctuationStyle: string;
  tabooFlags: string[];
  qualityScore: number;
}

export interface GeneratedPost {
  content: string;
  format: string;
  hookType: string;
  topic: string;
}

// Extract structural patterns from a viral tweet (PatternMiner)
export async function extractPattern(tweetText: string): Promise<PatternExtractionResult> {
  const openai = getOpenAI();
  const response = await Promise.race([
    openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.3,
      response_format: { type: "json_object" },
      messages: [
      {
        role: "system",
        content: `あなたはSNS投稿の構造分析の専門家です。軽貨物・配送業界のバズ投稿を分析し、その「構造パターン」を抽出してください。

重要: 文章の内容そのものではなく、「型」「構造」「レトリック」のみを抽出してください。

以下のJSONフォーマットで回答してください:
{
  "format": "one_liner" | "checklist" | "compare" | "story" | "faq" | "question" | "myth_bust",
  "hookType": "警告" | "損失回避" | "逆説" | "数字" | "実体験" | "炎上予防" | "テンプレ宣言",
  "payloadType": "ノウハウ" | "あるある" | "求人心理" | "単価比較" | "税・保険" | "装備" | "季節波動",
  "rhetorical": "箇条書き" | "対比" | "BeforeAfter" | "結論→理由" | "質問→回答",
  "lengthBucket": "short" | "medium" | "long",
  "emojiDensity": "none" | "low" | "medium" | "high",
  "punctuationStyle": "normal" | "emphatic" | "casual" | "formal",
  "tabooFlags": ["煽り強すぎ", "誹謗中傷", "断定的虚偽", "過剰CTA"] (該当するものを配列で),
  "qualityScore": 0.0-1.0 (学習価値。tabooが多いほど低く)
}`,
      },
      {
        role: "user",
        content: `以下の投稿の構造パターンを分析してください:\n\n${tweetText}`,
      },
    ],
    }),
    new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error("OpenAI API timeout (60s)")), 60000);
    }),
  ]);

  const content = response.choices[0]?.message?.content || "{}";
  return JSON.parse(content) as PatternExtractionResult;
}

// Generate a new post based on template weights and topic
export async function generatePost(params: {
  platform: "x" | "threads";
  format: string;
  hookType: string;
  topic: string;
  recentPosts: string[]; // For avoiding repetition
}): Promise<GeneratedPost> {
  const maxLength = params.platform === "x" ? 280 : 500;
  const platformName = params.platform === "x" ? "X（Twitter）" : "Threads";

  const openai = getOpenAI();
  const response = await Promise.race([
    openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.8,
      messages: [
      {
        role: "system",
        content: `あなたは軽貨物・配送業界に詳しいSNSマーケターです。${platformName}向けの投稿を作成してください。

ターゲット: 軽貨物ドライバー、宅配委託ドライバー、配送業を検討している人

ルール:
1. 最大${maxLength}文字以内
2. 自然で人間らしい文体
3. 過度な煽りや誇張は禁止
4. 特定の会社や個人の誹謗中傷禁止
5. 有益な情報を提供する
6. 絵文字は控えめに（0-2個程度）
7. リンクは含めない

避けるべき表現:
- 「〇〇を知らないと損！」のような過度な煽り
- 「業界の闇」等のネガティブ煽り
- 確定的な収入保証の言及

最近の投稿（重複回避）:
${params.recentPosts.slice(0, 5).join("\n---\n")}

上記と似た内容・構成は避けてください。`,
      },
      {
        role: "user",
        content: `以下の条件で投稿を作成してください:
- フォーマット: ${params.format}
- フック: ${params.hookType}
- トピック: ${params.topic}

投稿本文のみを出力してください（説明不要）。`,
      },
    ],
    }),
    new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error("OpenAI API timeout (60s)")), 60000);
    }),
  ]);

  const content = response.choices[0]?.message?.content || "";

  return {
    content: content.trim(),
    format: params.format,
    hookType: params.hookType,
    topic: params.topic,
  };
}

// Check content for safety issues
export async function checkContentSafety(content: string): Promise<{
  isSpam: boolean;
  ragebaitScore: number;
  issues: string[];
}> {
  const openai = getOpenAI();
  const response = await Promise.race([
    openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `あなたはSNS投稿の安全性チェッカーです。以下の観点で投稿を評価してください:

1. スパム性: 過度な宣伝、意味のない繰り返し、クリックベイト
2. 煽りスコア: 過度な感情的煽り、炎上目的の表現
3. 問題点: 誹謗中傷、差別、虚偽情報など

JSON形式で回答:
{
  "isSpam": true/false,
  "ragebaitScore": 0.0-1.0 (0=問題なし, 1=完全に煽り),
  "issues": ["問題点1", "問題点2", ...]
}`,
        },
        {
          role: "user",
          content: content,
        },
      ],
    }),
    new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error("OpenAI API timeout (60s)")), 60000);
    }),
  ]);

  const result = response.choices[0]?.message?.content || "{}";
  return JSON.parse(result) as { isSpam: boolean; ragebaitScore: number; issues: string[] };
}

export { getOpenAI as openai };

