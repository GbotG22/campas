import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/auth.store';
import { COLORS } from '@/constants/theme';
import type { Database } from '@/types/database';

export type UserCategory = Database['public']['Tables']['user_categories']['Row'];

/** 削除・名前変更不可の受け皿カテゴリ */
export const FALLBACK_CATEGORY = 'その他';

/** 初回アクセス時に投入するデフォルト支出カテゴリ（現行7種＋フィードバック要望3種） */
const DEFAULT_EXPENSE_CATEGORIES: { name: string; color: string }[] = [
  { name: '食費',    color: '#4F46E5' },
  { name: '飲み会',  color: '#EC4899' },
  { name: '交通',    color: '#06B6D4' },
  { name: 'サブスク', color: '#F59E0B' },
  { name: '書籍',    color: '#10B981' },
  { name: '娯楽',    color: '#8B5CF6' },
  { name: '美容',    color: '#E879F9' },
  { name: '衣服',    color: '#F97316' },
  { name: '日用品',  color: '#84CC16' },
  { name: 'その他',  color: '#9CA3AF' },
];

const cacheKey = (uid: string) => `campas_categories_expense_${uid}`;

/**
 * ユーザー定義の支出カテゴリを管理するフック。
 *
 * ・初回（0件）はデフォルト10種を自動投入（UNIQUE 制約で二重投入防止）
 * ・expenses.category は文字列参照のまま。getColor(name) で色を解決し、
 *   未登録名は gray400 フォールバック（過去データを壊さない）
 * ・削除時：使用中の支出は「その他」へ付け替えてから削除（呼び出し側で確認）
 * ・名前変更時：使用中の支出も新名へ一括更新
 */
export function useCategories() {
  const { user } = useAuthStore();
  const [categories, setCategories] = useState<UserCategory[]>([]);
  const [isLoading,  setIsLoading]  = useState(true);

  const colorMap = useMemo(() => {
    const map = new Map<string, string>();
    categories.forEach(c => map.set(c.name, c.color));
    return map;
  }, [categories]);

  const saveCache = useCallback((data: UserCategory[]) => {
    if (!user) return;
    AsyncStorage.setItem(cacheKey(user.id), JSON.stringify(data)).catch(() => {});
  }, [user]);

  // ── 取得（0件ならデフォルト投入） ──────────────────────────
  const fetch = useCallback(async () => {
    if (!user) return;
    setIsLoading(true);

    try {
      const cached = await AsyncStorage.getItem(cacheKey(user.id));
      if (cached) { setCategories(JSON.parse(cached)); setIsLoading(false); }
    } catch { /* ignore */ }

    try {
      const { data, error } = await supabase
        .from('user_categories')
        .select('*')
        .eq('user_id', user.id)
        .eq('type', 'expense')
        .order('sort_order')
        .order('created_at');

      if (error) {
        console.error('[Categories] fetch error:', error.code, error.message);
      } else if (data && data.length === 0) {
        // 初回：デフォルトカテゴリを投入
        const rows = DEFAULT_EXPENSE_CATEGORIES.map((c, i) => ({
          user_id:    user.id,
          type:       'expense' as const,
          name:       c.name,
          color:      c.color,
          sort_order: i,
          is_default: true,
        }));
        const { data: seeded, error: seedErr } = await supabase
          .from('user_categories')
          .insert(rows)
          .select();
        if (!seedErr && seeded) {
          const sorted = seeded.sort((a, b) => a.sort_order - b.sort_order);
          setCategories(sorted);
          saveCache(sorted);
        } else if (seedErr) {
          // UNIQUE 衝突（並行投入）等 → 再取得で回復
          const { data: retry } = await supabase
            .from('user_categories')
            .select('*')
            .eq('user_id', user.id)
            .eq('type', 'expense')
            .order('sort_order');
          if (retry) { setCategories(retry); saveCache(retry); }
        }
      } else if (data) {
        setCategories(data);
        saveCache(data);
      }
    } catch (e) {
      console.error('[Categories] fetch exception:', e);
    }
    setIsLoading(false);
  }, [user, saveCache]);

  useEffect(() => { fetch(); }, [fetch]);

  // ── 追加 ──────────────────────────────────────────────────
  const addCategory = async (name: string, color: string): Promise<string | null> => {
    if (!user) return 'ログインが必要です';
    const trimmed = name.trim();
    if (!trimmed) return 'カテゴリ名を入力してください';
    if (trimmed.length > 20) return 'カテゴリ名は20文字以内にしてください';
    if (categories.some(c => c.name === trimmed)) return '同じ名前のカテゴリがあります';

    const maxOrder = categories.reduce((m, c) => Math.max(m, c.sort_order), -1);
    const { data, error } = await supabase
      .from('user_categories')
      .insert({ user_id: user.id, type: 'expense', name: trimmed, color, sort_order: maxOrder + 1 })
      .select()
      .single();
    if (error) return '追加に失敗しました';
    const next = [...categories, data];
    setCategories(next);
    saveCache(next);
    return null;
  };

  // ── 名前変更（使用中の支出も一括更新） ─────────────────────
  const renameCategory = async (id: string, newName: string): Promise<string | null> => {
    if (!user) return 'ログインが必要です';
    const target = categories.find(c => c.id === id);
    if (!target) return 'カテゴリが見つかりません';
    if (target.name === FALLBACK_CATEGORY) return '「その他」は変更できません';
    const trimmed = newName.trim();
    if (!trimmed) return 'カテゴリ名を入力してください';
    if (trimmed.length > 20) return 'カテゴリ名は20文字以内にしてください';
    if (trimmed === target.name) return null;
    if (categories.some(c => c.id !== id && c.name === trimmed)) return '同じ名前のカテゴリがあります';

    const { data, error } = await supabase
      .from('user_categories')
      .update({ name: trimmed })
      .eq('id', id)
      .select()
      .single();
    if (error) return '変更に失敗しました';

    // 過去の支出を新カテゴリ名へ付け替え（色が消えないように）
    await supabase
      .from('expenses')
      .update({ category: trimmed })
      .eq('user_id', user.id)
      .eq('category', target.name);

    const next = categories.map(c => (c.id === id ? data : c));
    setCategories(next);
    saveCache(next);
    return null;
  };

  // ── 色変更 ────────────────────────────────────────────────
  const updateColor = async (id: string, color: string): Promise<string | null> => {
    const { data, error } = await supabase
      .from('user_categories')
      .update({ color })
      .eq('id', id)
      .select()
      .single();
    if (error) return '変更に失敗しました';
    const next = categories.map(c => (c.id === id ? data : c));
    setCategories(next);
    saveCache(next);
    return null;
  };

  // ── 使用中の支出件数（削除確認用） ─────────────────────────
  const countExpenses = async (name: string): Promise<number> => {
    if (!user) return 0;
    const { count } = await supabase
      .from('expenses')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('category', name);
    return count ?? 0;
  };

  // ── 削除（使用中の支出は「その他」へ付け替え） ──────────────
  const deleteCategory = async (id: string): Promise<string | null> => {
    if (!user) return 'ログインが必要です';
    const target = categories.find(c => c.id === id);
    if (!target) return 'カテゴリが見つかりません';
    if (target.name === FALLBACK_CATEGORY) return '「その他」は削除できません';

    // 使用中の支出を受け皿へ付け替えてから削除
    const { error: moveErr } = await supabase
      .from('expenses')
      .update({ category: FALLBACK_CATEGORY })
      .eq('user_id', user.id)
      .eq('category', target.name);
    if (moveErr) return '支出の付け替えに失敗しました';

    const { error } = await supabase.from('user_categories').delete().eq('id', id);
    if (error) return '削除に失敗しました';

    const next = categories.filter(c => c.id !== id);
    setCategories(next);
    saveCache(next);
    return null;
  };

  // ── 色解決（未登録名はグレー：過去データを壊さない） ────────
  const getColor = useCallback(
    (name: string | null | undefined): string => colorMap.get(name ?? '') ?? COLORS.gray400,
    [colorMap],
  );

  /** カテゴリ名の配列（チップ表示用） */
  const names = useMemo(() => categories.map(c => c.name), [categories]);

  return {
    categories, names, isLoading,
    fetch, addCategory, renameCategory, updateColor, deleteCategory,
    countExpenses, getColor,
  };
}
