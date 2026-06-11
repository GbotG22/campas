import { serve }        from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const ANTHROPIC_API  = 'https://api.anthropic.com/v1/messages';
const MODEL          = 'claude-haiku-4-5-20251001';
const MAX_TOKENS     = 400;
const MAX_PROMPT_LEN = 5000;

// ── ユーザーごとのレート制限 ──────────────────────────────────────────────────
// メモリキャッシュでシンプルに実装（インスタンス再起動でリセットされるが
// コスト爆発を抑制するには十分）。より厳密には DB や KV ストアを使う。
const RATE_LIMIT_MAX    = 3;   // 同一ユーザーが呼べる最大回数
const RATE_LIMIT_WINDOW = 5 * 60 * 1000; // 5分間（ミリ秒）
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(uid: string): boolean {
  const now   = Date.now();
  const entry = rateLimitMap.get(uid);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(uid, { count: 1, resetAt: now + RATE_LIMIT_WINDOW });
    return true;
  }
  if (entry.count >= RATE_LIMIT_MAX) return false;
  entry.count++;
  return true;
}

// ── CORS ─────────────────────────────────────────────────────────────────────
// モバイルアプリは Origin ヘッダーを送らないため Access-Control-Allow-Origin: *
// でも実害はない。アプリ内からの呼び出しは JWT 必須化（下記）で防御する。
// Web ブラウザ経由の悪用は Origin ヘッダーがあれば制限できるが、
// ネイティブアプリが主用途のため * を維持する。
const corsHeaders = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(body: unknown, status = 200) {
  return new Response(
    JSON.stringify(body),
    { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  );
}

serve(async (req) => {
  // ── CORS プリフライト ────────────────────────────────────────────────────
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  // ── JWT 認証（必須） ────────────────────────────────────────────────────
  // Authorization: Bearer <Supabase JWT> がない・不正な場合は 401 を返す。
  // これにより未ログインユーザー・外部からの不正呼び出しを遮断する。
  const authHeader = req.headers.get('Authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) {
    console.warn('[ai-analyze] Authorization ヘッダーなし');
    return json({ error: 'Unauthorized' }, 401);
  }

  const jwt = authHeader.slice('Bearer '.length);
  const supabaseUrl  = Deno.env.get('SUPABASE_URL')!;
  const supabaseKey  = Deno.env.get('SUPABASE_ANON_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseKey, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  });

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    console.warn('[ai-analyze] JWT 検証失敗:', authError?.message);
    return json({ error: 'Unauthorized' }, 401);
  }

  console.log('[ai-analyze] 認証OK uid:', user.id);

  // ── レート制限チェック ─────────────────────────────────────────────────────
  if (!checkRateLimit(user.id)) {
    console.warn('[ai-analyze] レート制限超過 uid:', user.id);
    return json({ error: 'rate_limit_error' }, 429);
  }

  try {
    // ── リクエストボディ解析 ────────────────────────────────────────────
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return json({ error: 'Invalid JSON' }, 400);
    }

    const { prompt } = body as { prompt?: unknown };
    if (!prompt || typeof prompt !== 'string') {
      return json({ error: 'prompt is required' }, 400);
    }

    // ── prompt 長さ制限 ─────────────────────────────────────────────────
    if (prompt.length > MAX_PROMPT_LEN) {
      console.warn('[ai-analyze] prompt 長超過:', prompt.length);
      return json({ error: 'prompt too long' }, 400);
    }

    console.log('[ai-analyze] prompt長:', prompt.length);

    // ── Anthropic API キー確認 ───────────────────────────────────────────
    const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
    if (!apiKey) {
      // 内部エラーの詳細は外部に出さない
      console.error('[ai-analyze] ANTHROPIC_API_KEY 未設定');
      return json({ error: 'Service temporarily unavailable' }, 503);
    }

    // ── Anthropic API 呼び出し ───────────────────────────────────────────
    console.log('[ai-analyze] Anthropic API 呼び出し中... model:', MODEL);
    const res = await fetch(ANTHROPIC_API, {
      method:  'POST',
      headers: {
        'x-api-key':         apiKey,
        'anthropic-version': '2023-06-01',
        'content-type':      'application/json',
      },
      body: JSON.stringify({
        model:      MODEL,
        max_tokens: MAX_TOKENS,
        messages:   [{ role: 'user', content: prompt }],
      }),
    });

    const data = await res.json();
    console.log('[ai-analyze] Anthropic status:', res.status);

    if (!res.ok) {
      // Anthropic のエラー種別だけログに記録し、詳細はクライアントに返さない
      const errType = (data?.error?.type as string) ?? 'unknown';
      console.error('[ai-analyze] Anthropic エラー type:', errType, 'status:', res.status);

      if (errType === 'rate_limit_error') {
        return json({ error: 'rate_limit_error' }, 429);
      }
      if (errType === 'overloaded_error') {
        return json({ error: 'overloaded' }, 503);
      }
      return json({ error: 'AI service error' }, 502);
    }

    const text = (data.content as Array<{ type: string; text: string }>)
      .filter(c => c.type === 'text')
      .map(c => c.text)
      .join('');

    console.log('[ai-analyze] 成功 テキスト長:', text.length);
    return json({ text });

  } catch (e) {
    // スタックトレースや内部情報はログのみ、クライアントには汎用メッセージ
    console.error('[ai-analyze] 予期しないエラー:', e);
    return json({ error: 'Internal server error' }, 500);
  }
});
