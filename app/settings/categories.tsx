import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';

import { COLORS, RADIUS, SHADOW, SPACING, SUBJECT_COLORS } from '@/constants/theme';
import { useCategories, FALLBACK_CATEGORY, type UserCategory } from '@/hooks/useCategories';

// 支出カテゴリ用パレット（科目パレット＋追加色）
const PALETTE = [...SUBJECT_COLORS, '#E879F9', '#F97316', '#6366F1', '#9CA3AF'];

// ─────────────────────────────────────────────────────────────
// 支出カテゴリ管理画面（Build 50）
// ─────────────────────────────────────────────────────────────
export default function CategoriesScreen() {
  const {
    categories, isLoading,
    addCategory, renameCategory, updateColor, deleteCategory, countExpenses,
  } = useCategories();

  // ── 追加フォーム ───────────────────────────────────────────
  const [newName,  setNewName]  = useState('');
  const [newColor, setNewColor] = useState<string>(PALETTE[0]);
  const [adding,   setAdding]   = useState(false);

  // ── 行の展開（色変更パレット表示） ─────────────────────────
  const [expandedId, setExpandedId] = useState<string | null>(null);

  async function handleAdd() {
    if (adding) return;
    setAdding(true);
    const err = await addCategory(newName, newColor);
    setAdding(false);
    if (err) {
      Alert.alert('追加できません', err);
    } else {
      setNewName('');
    }
  }

  function handleRename(cat: UserCategory) {
    Alert.prompt(
      'カテゴリ名を変更',
      `「${cat.name}」を使っている過去の支出もまとめて新しい名前に変わります。`,
      [
        { text: 'キャンセル', style: 'cancel' },
        {
          text: '変更',
          onPress: async (text?: string) => {
            const err = await renameCategory(cat.id, text ?? '');
            if (err) Alert.alert('変更できません', err);
          },
        },
      ],
      'plain-text',
      cat.name,
    );
  }

  async function handleDelete(cat: UserCategory) {
    const used = await countExpenses(cat.name);
    const message = used > 0
      ? `このカテゴリは ${used} 件の支出で使われています。\n削除すると、該当の支出は「${FALLBACK_CATEGORY}」に変更されます。`
      : `「${cat.name}」を削除しますか？`;
    Alert.alert('カテゴリを削除', message, [
      { text: 'キャンセル', style: 'cancel' },
      {
        text: '削除する',
        style: 'destructive',
        onPress: async () => {
          const err = await deleteCategory(cat.id);
          if (err) Alert.alert('削除できません', err);
        },
      },
    ]);
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* ── ヘッダー ── */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="chevron-back" size={24} color={COLORS.gray700} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>支出カテゴリの編集</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        <Text style={styles.description}>
          カテゴリの追加・名前変更・色変更・削除ができます。{'\n'}
          「{FALLBACK_CATEGORY}」は削除・変更できません。
        </Text>

        {/* ── カテゴリ一覧 ── */}
        <View style={styles.card}>
          {isLoading && categories.length === 0 ? (
            <Text style={styles.emptyText}>読み込み中...</Text>
          ) : categories.map((cat, i) => {
            const isFallback = cat.name === FALLBACK_CATEGORY;
            const expanded   = expandedId === cat.id;
            return (
              <View key={cat.id} style={i < categories.length - 1 && styles.rowBorder}>
                <View style={styles.row}>
                  {/* 色ドット（タップでパレット開閉） */}
                  <TouchableOpacity
                    style={[styles.colorDot, { backgroundColor: cat.color }]}
                    onPress={() => setExpandedId(expanded ? null : cat.id)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  />
                  <Text style={styles.catName}>{cat.name}</Text>

                  {!isFallback && (
                    <>
                      <TouchableOpacity onPress={() => handleRename(cat)} style={styles.iconBtn} hitSlop={{ top: 6, bottom: 6 }}>
                        <Ionicons name="pencil-outline" size={17} color={COLORS.gray500} />
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => handleDelete(cat)} style={styles.iconBtn} hitSlop={{ top: 6, bottom: 6 }}>
                        <Ionicons name="trash-outline" size={17} color={COLORS.danger} />
                      </TouchableOpacity>
                    </>
                  )}
                  {isFallback && (
                    <Text style={styles.fixedLabel}>固定</Text>
                  )}
                </View>

                {/* 色パレット */}
                {expanded && (
                  <View style={styles.paletteRow}>
                    {PALETTE.map(color => (
                      <TouchableOpacity
                        key={color}
                        style={[
                          styles.paletteSwatch,
                          { backgroundColor: color },
                          cat.color === color && styles.paletteSwatchActive,
                        ]}
                        onPress={async () => {
                          const err = await updateColor(cat.id, color);
                          if (err) Alert.alert('変更できません', err);
                          setExpandedId(null);
                        }}
                      />
                    ))}
                  </View>
                )}
              </View>
            );
          })}
        </View>

        {/* ── 新規追加 ── */}
        <Text style={styles.sectionLabel}>新しいカテゴリ</Text>
        <View style={styles.card}>
          <TextInput
            style={styles.input}
            value={newName}
            onChangeText={setNewName}
            placeholder="カテゴリ名（20文字以内）"
            placeholderTextColor={COLORS.gray400}
            maxLength={20}
            returnKeyType="done"
          />
          <View style={styles.paletteRow}>
            {PALETTE.map(color => (
              <TouchableOpacity
                key={color}
                style={[
                  styles.paletteSwatch,
                  { backgroundColor: color },
                  newColor === color && styles.paletteSwatchActive,
                ]}
                onPress={() => setNewColor(color)}
              />
            ))}
          </View>
          <TouchableOpacity
            style={[styles.addBtn, (!newName.trim() || adding) && { opacity: 0.45 }]}
            onPress={handleAdd}
            disabled={!newName.trim() || adding}
            activeOpacity={0.8}
          >
            <Ionicons name="add" size={18} color={COLORS.white} />
            <Text style={styles.addBtnText}>{adding ? '追加中...' : '追加する'}</Text>
          </TouchableOpacity>
        </View>

        <View style={{ height: SPACING.xl }} />
      </ScrollView>
    </SafeAreaView>
  );
}

// ─────────────────────────────────────────────────────────────
// スタイル
// ─────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container:     { flex: 1, backgroundColor: COLORS.gray50 },
  scrollContent: { paddingHorizontal: SPACING.md, paddingTop: SPACING.sm },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.lg,
    paddingBottom: SPACING.md,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: COLORS.gray900,
  },

  description: {
    fontSize: 13,
    color: COLORS.gray500,
    lineHeight: 20,
    marginBottom: SPACING.md,
  },

  card: {
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.lg,
    paddingHorizontal: SPACING.md,
    marginBottom: SPACING.md,
    ...SHADOW.sm,
  },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm + 2,
    paddingVertical: SPACING.sm + 4,
  },
  rowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: COLORS.gray100,
  },
  colorDot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: '#00000014',
  },
  catName: {
    flex: 1,
    fontSize: 15,
    color: COLORS.gray900,
  },
  iconBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  fixedLabel: {
    fontSize: 12,
    color: COLORS.gray400,
  },
  emptyText: {
    fontSize: 14,
    color: COLORS.gray400,
    textAlign: 'center',
    paddingVertical: SPACING.md,
  },

  paletteRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    paddingBottom: SPACING.sm + 4,
    paddingTop: 2,
  },
  paletteSwatch: {
    width: 30,
    height: 30,
    borderRadius: 15,
  },
  paletteSwatchActive: {
    borderWidth: 3,
    borderColor: COLORS.gray900,
  },

  sectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.gray400,
    marginBottom: SPACING.xs + 2,
    marginLeft: 4,
    letterSpacing: 0.5,
  },
  input: {
    fontSize: 15,
    color: COLORS.gray900,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.gray200,
    paddingVertical: SPACING.sm + 2,
    marginTop: SPACING.xs,
    marginBottom: SPACING.sm + 2,
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.md,
    paddingVertical: SPACING.sm + 4,
    marginBottom: SPACING.md,
  },
  addBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.white,
  },
});
