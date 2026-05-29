/**
 * useGoogleCalendar
 * ─────────────────────────────────────────────────────────────────────
 * Googleカレンダー連携フック（読み取り専用）
 *
 * ■ 環境別の動作
 *   ┌─────────────────┬────────────────────────────────────────────────┐
 *   │ 実行環境         │ 使用する Client ID                            │
 *   ├─────────────────┼────────────────────────────────────────────────┤
 *   │ Expo Go (iOS)   │ webClientId のみ（★要 OAuth 追加設定）         │
 *   │ Dev Build / 本番│ iosClientId を優先（ネイティブ OAuth フロー）  │
 *   │ Android         │ webClientId（Android Client ID は未使用）       │
 *   └─────────────────┴────────────────────────────────────────────────┘
 *
 * ■ Expo Go でのOAuth制約
 *   Expo Go は独自の exp:// スキームで動作するため、iOS ネイティブの
 *   OAuth リダイレクト（com.googleusercontent.apps.xxx:/oauthredirect）
 *   を処理できません。そのため Expo Go では webClientId のみ使用します。
 *
 *   ただし Google の web OAuth は exp:// リダイレクトURIを拒否するため、
 *   Expo Go でのテストには Development Build（npx expo run:ios）を推奨します。
 *
 * ■ セットアップ（Google Cloud Console）
 *   【1. ウェブ クライアント ID】
 *     - 「OAuth 2.0 クライアント ID」→「ウェブ アプリケーション」で作成
 *     - 承認済みリダイレクト URI に追加:
 *         https://auth.expo.io/@<Expoユーザー名>/campas  ← Expo Go 用
 *     → EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID に設定
 *
 *   【2. iOS クライアント ID】（Dev Build / 本番ビルド用）
 *     - 「OAuth 2.0 クライアント ID」→「iOS」で作成
 *     - バンドル ID: com.campas.app
 *     → EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID に設定
 *
 * ■ 認証情報の扱い
 *   - 環境変数に保存し、コードに直書きしない
 *   - .gitignore に .env.local が含まれていることを確認
 * ─────────────────────────────────────────────────────────────────────
 */
import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import * as Google from 'expo-auth-session/providers/google';
import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';

// Expo Go でのリダイレクト処理を完了させるために必須
WebBrowser.maybeCompleteAuthSession();

// ── 実行環境チェック ────────────────────────────────────────────────
/** true = Expo Go で実行中（Dev Build / 本番ビルドでは false） */
export const IS_EXPO_GO =
  Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

// ── AsyncStorage キー ──────────────────────────────────────────────
const KEY_TOKEN  = 'gcal_access_token';
const KEY_EXPIRY = 'gcal_token_expiry';

// ── Google Calendar API ────────────────────────────────────────────
const GCAL_BASE = 'https://www.googleapis.com/calendar/v3';

// ── 型定義 ────────────────────────────────────────────────────────
export interface GCalDateTime {
  date?:     string;       // 終日イベント: YYYY-MM-DD
  dateTime?: string;       // 時刻付き: ISO 8601
  timeZone?: string;
}

export interface GCalEvent {
  id:           string;
  summary?:     string;
  description?: string;
  start:        GCalDateTime;
  end:          GCalDateTime;
  colorId?:     string;
  htmlLink?:    string;
  status?:      string;    // 'confirmed' | 'tentative' | 'cancelled'
}

// ── 環境変数の読み込み ─────────────────────────────────────────────
const WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
const IOS_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID || undefined; // 空文字→undefined

// ── フック ────────────────────────────────────────────────────────
export function useGoogleCalendar() {
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [gCalEvents,  setGCalEvents]  = useState<GCalEvent[]>([]);
  const [isLoading,   setIsLoading]   = useState(false);
  const [error,       setError]       = useState<string | null>(null);

  // ── Client ID・リダイレクト URI 決定ロジック ──────────────────
  //
  // 実行環境別の動作:
  //   Dev Build / 本番 (iOS): iosClientId を優先
  //     → リダイレクト URI = com.googleusercontent.apps.XXXX:/oauthredirect
  //       （reversed client ID scheme。app.json の CFBundleURLTypes に登録済み）
  //   Expo Go (iOS):          webClientId のみ使用
  //     → Expo Go の exp:// リダイレクトは Google に拒否されるため非対応
  //
  // Google プロバイダー内部ロジック:
  //   clientId = config[platformKey] ?? config.clientId
  //   iOS:     platformKey = 'iosClientId'
  //   未設定時: config.clientId (= webClientId) にフォールバック
  //
  const useIosNative = Platform.OS === 'ios' && !IS_EXPO_GO && !!IOS_CLIENT_ID;

  // iOS ネイティブ OAuth のリダイレクト URI を計算
  // 例: "1051218592083-xxx.apps.googleusercontent.com"
  //   → "com.googleusercontent.apps.1051218592083-xxx"
  //   → "com.googleusercontent.apps.1051218592083-xxx:/oauthredirect"
  const iosReversedScheme = IOS_CLIENT_ID
    ? `com.googleusercontent.apps.${IOS_CLIENT_ID.split('.apps.googleusercontent.com')[0]}`
    : undefined;
  const iosNativeRedirectUri = iosReversedScheme
    ? `${iosReversedScheme}:/oauthredirect`
    : undefined;

  const [request, response, promptAsync] = Google.useAuthRequest(
    {
      // iosClientId: iOS Dev Build / 本番のみ設定（Expo Go では undefined にして webClientId を使う）
      iosClientId: useIosNative ? IOS_CLIENT_ID : undefined,
      webClientId: WEB_CLIENT_ID,
      // clientId: プラットフォーム固有 ID が undefined の場合のフォールバック
      clientId:    WEB_CLIENT_ID,
      scopes: ['https://www.googleapis.com/auth/calendar.readonly'],
    },
    // iOS Dev Build では reversed client ID スキームをネイティブ URI として明示指定
    // makeRedirectUri は Standalone/Bare 環境で native オプションを優先する
    useIosNative && iosNativeRedirectUri
      ? { native: iosNativeRedirectUri }
      : undefined,
  );

  // 起動時デバッグログ
  useEffect(() => {
    console.log('[GCal] 環境:', IS_EXPO_GO ? 'Expo Go' : 'Dev Build / 本番');
    console.log('[GCal] Platform.OS:', Platform.OS);
    console.log('[GCal] executionEnvironment:', Constants.executionEnvironment);
    console.log('[GCal] WEB_CLIENT_ID:', WEB_CLIENT_ID ? `${WEB_CLIENT_ID.slice(0, 20)}...` : '未設定');
    console.log('[GCal] IOS_CLIENT_ID:', IOS_CLIENT_ID ? `${IOS_CLIENT_ID.slice(0, 20)}...` : '未設定');
    console.log('[GCal] useIosNative:', useIosNative, '(iOS Dev Build で iosClientId を使用)');
    console.log('[GCal] iosNativeRedirectUri:', iosNativeRedirectUri ?? '未使用（webClientId フロー）');

    if (IS_EXPO_GO && Platform.OS === 'ios') {
      console.warn(
        '[GCal] ⚠️ Expo Go + iOS: webClientId を使用。' +
        'Googleの exp:// リダイレクト制約により認証に失敗する可能性があります。' +
        'テストには npx expo run:ios（Development Build）を推奨します。'
      );
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // request が解決したときのリダイレクト URI をログ出力
  useEffect(() => {
    if (request) {
      console.log('[GCal] redirectUri:', request.redirectUri);
      console.log('[GCal] clientId (実際に使用):', (request as any).clientId ?? '不明');
    }
  }, [request]);

  // ── マウント時: 保存済みトークンを読み込む ─────────────────────
  useEffect(() => {
    (async () => {
      try {
        const [token, expStr] = await Promise.all([
          AsyncStorage.getItem(KEY_TOKEN),
          AsyncStorage.getItem(KEY_EXPIRY),
        ]);
        console.log('[GCal] ストレージ確認 → token:', token ? '存在' : 'なし', '期限:', expStr);
        if (token && expStr && Date.now() < parseInt(expStr, 10)) {
          console.log('[GCal] 保存済みトークン有効 → イベント取得開始');
          setAccessToken(token);
          await fetchEvents(token);
        } else if (token) {
          console.log('[GCal] 保存済みトークン期限切れ → クリア');
          await clearToken();
        }
      } catch (e) {
        console.error('[GCal] ストレージ読み込みエラー:', e);
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── OAuth レスポンス処理 ───────────────────────────────────────
  useEffect(() => {
    console.log('[GCal] OAuthレスポンス type:', response?.type ?? 'null');

    if (!response) return;

    if (response.type === 'error') {
      const errMsg = response.error?.message ?? JSON.stringify(response.error);
      console.error('[GCal] ❌ OAuth エラー:', errMsg);
      console.error('[GCal] エラー詳細:', JSON.stringify(response, null, 2));
      setError(`Googleログイン失敗: ${errMsg}`);
      return;
    }

    if (response.type === 'cancel' || response.type === 'dismiss') {
      console.log('[GCal] ユーザーがキャンセルしました');
      return;
    }

    if (response.type !== 'success') {
      console.warn('[GCal] 不明なレスポンス type:', response.type);
      return;
    }

    const token   = response.authentication?.accessToken;
    const expSecs = response.authentication?.expiresIn ?? 3600;

    console.log('[GCal] ✅ OAuth 成功');
    console.log('[GCal] accessToken:', token ? `${token.slice(0, 20)}... (${token.length}文字)` : '取得失敗');
    console.log('[GCal] expiresIn:', expSecs, '秒');
    console.log('[GCal] tokenType:', response.authentication?.tokenType);

    if (!token) {
      const msg = 'アクセストークンが取得できませんでした（認証は成功しましたが token が空です）';
      console.error('[GCal] ❌', msg);
      console.error('[GCal] authentication:', JSON.stringify(response.authentication, null, 2));
      setError(msg);
      return;
    }

    const expiry = Date.now() + expSecs * 1000;
    Promise.all([
      AsyncStorage.setItem(KEY_TOKEN,  token),
      AsyncStorage.setItem(KEY_EXPIRY, String(expiry)),
    ])
      .then(() => console.log('[GCal] トークンをストレージに保存しました'))
      .catch(e => console.error('[GCal] ストレージ保存エラー:', e));

    setAccessToken(token);
    fetchEvents(token);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [response]);

  // ── Calendar API 取得 ─────────────────────────────────────────
  async function fetchEvents(token: string) {
    setIsLoading(true);
    setError(null);
    console.log('[GCal] カレンダーイベント取得開始...');

    try {
      const now     = new Date();
      const timeMin = new Date(now.getTime() - 30  * 86400 * 1000).toISOString();
      const timeMax = new Date(now.getTime() + 180 * 86400 * 1000).toISOString();

      const params = new URLSearchParams({
        timeMin,
        timeMax,
        singleEvents: 'true',
        orderBy:      'startTime',
        maxResults:   '250',
      });

      const url = `${GCAL_BASE}/calendars/primary/events?${params.toString()}`;
      console.log('[GCal] GET', url.slice(0, 80) + '...');

      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });

      console.log('[GCal] API レスポンス status:', res.status);

      if (res.status === 401) {
        console.warn('[GCal] ⚠️ 401 Unauthorized → トークン期限切れ。クリアして再ログインを促す');
        await clearToken();
        setError('Googleの認証が切れました。再ログインしてください。');
        return;
      }

      if (!res.ok) {
        const body = await res.text().catch(() => '(body読み取り失敗)');
        console.error('[GCal] ❌ API エラー:', res.status, body.slice(0, 300));
        throw new Error(`Google Calendar API error ${res.status}: ${body.slice(0, 200)}`);
      }

      const data: { items?: GCalEvent[]; summary?: string } = await res.json();
      const items = (data.items ?? []).filter(e => e.status !== 'cancelled');

      console.log('[GCal] ✅ 取得完了:', items.length, '件（キャンセル除外済み）');
      console.log('[GCal] カレンダー名:', data.summary ?? '(不明)');

      setGCalEvents(items);
    } catch (e: any) {
      const msg = e?.message ?? 'Googleカレンダーの取得に失敗しました';
      console.error('[GCal] ❌ fetchEvents エラー:', msg);
      console.error('[GCal] スタック:', e?.stack?.slice(0, 500));
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  }

  // ── 内部ヘルパー ──────────────────────────────────────────────
  async function clearToken() {
    await Promise.all([
      AsyncStorage.removeItem(KEY_TOKEN),
      AsyncStorage.removeItem(KEY_EXPIRY),
    ]).catch(e => console.error('[GCal] clearToken エラー:', e));
    setAccessToken(null);
    setGCalEvents([]);
    console.log('[GCal] トークンをクリアしました');
  }

  // ── 公開 API ──────────────────────────────────────────────────
  const signIn = useCallback(async () => {
    console.log('[GCal] signIn() 呼び出し');
    if (!WEB_CLIENT_ID) {
      const msg = '.env.local に EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID が設定されていません';
      console.error('[GCal] ❌', msg);
      setError(msg);
      return;
    }
    setError(null);

    if (IS_EXPO_GO && Platform.OS === 'ios') {
      console.warn(
        '[GCal] ⚠️ Expo Go では Google OAuth が動作しない場合があります。\n' +
        '推奨: npx expo run:ios で Development Build を使ってください。'
      );
    }

    console.log('[GCal] promptAsync() 実行...');
    const result = await promptAsync();
    console.log('[GCal] promptAsync() 完了 → type:', result?.type);
  }, [promptAsync]);

  const signOut = useCallback(async () => {
    console.log('[GCal] signOut() 呼び出し');
    await clearToken();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refresh = useCallback(async () => {
    console.log('[GCal] refresh() 呼び出し → accessToken:', accessToken ? '存在' : 'なし');
    if (accessToken) {
      await fetchEvents(accessToken);
    } else {
      await signIn();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken, signIn]);

  return {
    /** Googleカレンダーのイベント一覧 */
    gCalEvents,
    /** Googleアカウントに接続済みか */
    isConnected: !!accessToken,
    /** 取得中か */
    isLoading,
    /** エラーメッセージ（なければ null） */
    error,
    /** Googleアカウントでサインイン（OAuth フロー起動） */
    signIn,
    /** サインアウト（トークン削除） */
    signOut,
    /** イベントを再取得（未接続なら signIn を試みる） */
    refresh,
    /** expo-auth-session の request オブジェクト */
    request,
    /** 実行環境情報（デバッグ用） */
    _debug: { IS_EXPO_GO, useIosNative, redirectUri: request?.redirectUri },
  };
}

// ── ユーティリティ: GCalEvent → schedule.tsx で使う形式に変換 ────
/** GCalEvent の開始日を YYYY-MM-DD で返す */
export function gCalEventDate(ev: GCalEvent): string {
  return ev.start.date ?? ev.start.dateTime?.slice(0, 10) ?? '';
}

/** GCalEvent の開始時刻を HH:MM で返す（終日なら null） */
export function gCalEventTime(ev: GCalEvent): string | null {
  if (ev.start.date) return null;
  const dt = ev.start.dateTime;
  if (!dt) return null;
  const match = dt.match(/T(\d{2}:\d{2})/);
  return match ? match[1] : null;
}

/** GCalEvent の終了時刻を HH:MM で返す（終日なら null） */
export function gCalEventEndTime(ev: GCalEvent): string | null {
  if (ev.end.date) return null;
  const dt = ev.end.dateTime;
  if (!dt) return null;
  const match = dt.match(/T(\d{2}:\d{2})/);
  return match ? match[1] : null;
}
