import { useState } from 'react';
import {
  Alert, Modal, ScrollView, StyleSheet,
  Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';

import { COLORS } from '@/constants/theme';
import { useSemesters }                      from '@/hooks/useSemesters';
import { usePeriodSettings, PeriodConfig }   from '@/hooks/usePeriodSettings';
import type { Database }                     from '@/types/database';

type Semester = Database['public']['Tables']['semesters']['Row'];

// 出席率基準の選択肢
const RATE_OPTIONS = [
  { label: '60%',     value: 60  },
  { label: '2/3 (67%)', value: 67 },
  { label: '70%',     value: 70  },
  { label: '75%',     value: 75  },
  { label: '80%',     value: 80  },
  { label: '90%',     value: 90  },
];

export default function TimetableSettingsScreen() {
  const {
    semesters, activeSemester,
    addSemester, updateSemester, deleteSemester,
    setActive, assignUnassignedSlots,
  } = useSemesters();
  const { config, save: saveConfig, buildPeriods } = usePeriodSettings();

  // ── 学期追加・編集モーダル ──────────────────────────────────
  const [semModalVisible,  setSemModalVisible]  = useState(false);
  const [editingSemester,  setEditingSemester]  = useState<Semester | null>(null);
  const [semName,          setSemName]          = useState('');
  const [semStart,         setSemStart]         = useState('');
  const [semEnd,           setSemEnd]           = useState('');
  const [semSaving,        setSemSaving]        = useState(false);

  function openAddSemester() {
    setEditingSemester(null);
    setSemName(''); setSemStart(''); setSemEnd('');
    setSemModalVisible(true);
  }

  function openEditSemester(s: Semester) {
    setEditingSemester(s);
    setSemName(s.name);
    setSemStart(s.start_date ?? '');
    setSemEnd(s.end_date ?? '');
    setSemModalVisible(true);
  }

  async function handleSemSave() {
    if (!semName.trim()) { Alert.alert('エラー', '学期名を入力してください'); return; }
    setSemSaving(true);
    if (editingSemester) {
      await updateSemester(editingSemester.id, {
        name: semName.trim(),
        start_date: semStart || null,
        end_date:   semEnd   || null,
      });
    } else {
      const result = await addSemester({
        name:       semName.trim(),
        start_date: semStart || null,
        end_date:   semEnd   || null,
        is_active:  false,
        sort_order: semesters.length,
      });
      // 初めての学期なら既存スロットを割り当てるか確認
      if (!result.error && result.data && semesters.length === 0) {
        Alert.alert(
          '既存の授業を割り当て',
          `「${semName.trim()}」に既存の授業を全て移動しますか？`,
          [
            { text: 'スキップ', style: 'cancel' },
            { text: '移動する', onPress: () => assignUnassignedSlots(result.data!.id) },
          ],
        );
      }
    }
    setSemSaving(false);
    setSemModalVisible(false);
  }

  async function handleDeleteSemester(s: Semester) {
    Alert.alert(
      '学期を削除',
      `「${s.name}」を削除しますか？\nこの学期の授業は全て削除されます。`,
      [
        { text: 'キャンセル', style: 'cancel' },
        { text: '削除', style: 'destructive', onPress: () => deleteSemester(s.id) },
      ],
    );
  }

  // ── 時限数変更 ────────────────────────────────────────────
  async function handlePeriodCountChange(count: number) {
    const newPeriods = buildPeriods(count, config.periods);
    await saveConfig({ ...config, periodCount: count, periods: newPeriods });
  }

  // ── 授業時間変更 ──────────────────────────────────────────
  async function handleTimeChange(period: number, field: 'start' | 'end', value: string) {
    const newPeriods = config.periods.map(p =>
      p.period === period ? { ...p, [field]: value } : p,
    );
    await saveConfig({ ...config, periods: newPeriods });
  }

  // ── 出席率基準変更 ────────────────────────────────────────
  async function handleRateChange(rate: number) {
    await saveConfig({ ...config, requiredRate: rate });
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>

      {/* ヘッダー */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.backText}>‹ 戻る</Text>
        </TouchableOpacity>
        <Text style={styles.title}>時間割の設定</Text>
        <View style={{ width: 48 }} />
      </View>

      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>

        {/* ── 学期管理 ── */}
        <SettingSection title="学期管理">
          {semesters.length === 0 && (
            <Text style={styles.emptyHint}>学期を作成すると前期・後期で別々の時間割を管理できます</Text>
          )}
          {semesters.map(s => (
            <View key={s.id} style={styles.semesterRow}>
              <TouchableOpacity style={styles.semesterCheck} onPress={() => setActive(s.id)}>
                <View style={[styles.radio, s.is_active && styles.radioActive]}>
                  {s.is_active && <View style={styles.radioDot} />}
                </View>
              </TouchableOpacity>
              <View style={styles.semesterInfo}>
                <Text style={[styles.semesterName, s.is_active && { color: COLORS.primary }]}>{s.name}</Text>
                {(s.start_date || s.end_date) && (
                  <Text style={styles.semesterDates}>{s.start_date ?? '?'} 〜 {s.end_date ?? '?'}</Text>
                )}
              </View>
              <TouchableOpacity onPress={() => openEditSemester(s)} style={styles.semRowBtn}>
                <Text style={styles.semRowBtnText}>編集</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => handleDeleteSemester(s)} style={styles.semRowBtn}>
                <Text style={[styles.semRowBtnText, { color: COLORS.danger }]}>削除</Text>
              </TouchableOpacity>
            </View>
          ))}
          {activeSemester && (
            <TouchableOpacity style={styles.clearActiveBtn} onPress={() => setActive(null)}>
              <Text style={styles.clearActiveBtnText}>学期選択を解除（全件表示）</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={styles.addBtn} onPress={openAddSemester}>
            <Text style={styles.addBtnText}>＋ 学期を追加</Text>
          </TouchableOpacity>
        </SettingSection>

        {/* ── 時限数 ── */}
        <SettingSection title="1日の時限数">
          <View style={styles.numRow}>
            {[3, 4, 5, 6, 7].map(n => (
              <TouchableOpacity
                key={n}
                style={[styles.numBtn, config.periodCount === n && styles.numBtnActive]}
                onPress={() => handlePeriodCountChange(n)}
              >
                <Text style={[styles.numBtnText, config.periodCount === n && styles.numBtnTextActive]}>{n}限</Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={styles.hint}>変更すると時間割グリッドの行数が変わります</Text>
        </SettingSection>

        {/* ── 授業時間 ── */}
        <SettingSection title="授業時間の設定">
          <View style={styles.timeHeader}>
            <Text style={styles.timeColLabel}>時限</Text>
            <Text style={styles.timeColLabel}>開始</Text>
            <Text style={styles.timeColLabel}>終了</Text>
          </View>
          {config.periods.slice(0, config.periodCount).map(pt => (
            <View key={pt.period} style={styles.timeRow}>
              <View style={styles.timeNumCell}>
                <Text style={styles.timeNumText}>{pt.period}限</Text>
              </View>
              <TextInput
                style={styles.timeInput}
                value={pt.start}
                onChangeText={v => handleTimeChange(pt.period, 'start', v)}
                placeholder="08:50"
                placeholderTextColor={COLORS.gray400}
                keyboardType="numbers-and-punctuation"
                maxLength={5}
              />
              <Text style={styles.timeSep}>〜</Text>
              <TextInput
                style={styles.timeInput}
                value={pt.end}
                onChangeText={v => handleTimeChange(pt.period, 'end', v)}
                placeholder="10:20"
                placeholderTextColor={COLORS.gray400}
                keyboardType="numbers-and-punctuation"
                maxLength={5}
              />
            </View>
          ))}
          <Text style={styles.hint}>HH:MM 形式で入力してください（例：08:50）</Text>
        </SettingSection>

        {/* ── 出席率基準 ── */}
        <SettingSection title="単位取得に必要な出席率">
          <View style={styles.rateRow}>
            {RATE_OPTIONS.map(opt => (
              <TouchableOpacity
                key={opt.value}
                style={[styles.rateBtn, config.requiredRate === opt.value && styles.rateBtnActive]}
                onPress={() => handleRateChange(opt.value)}
              >
                <Text style={[styles.rateBtnText, config.requiredRate === opt.value && styles.rateBtnTextActive]}>
                  {opt.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={styles.hint}>
            設定した基準を下回ると出欠チップが赤くなります。{'\n'}
            現在の設定: {config.requiredRate}%（あと何回休めるかもこの基準で計算されます）
          </Text>
        </SettingSection>

      </ScrollView>

      {/* ── 学期追加・編集モーダル ── */}
      <Modal visible={semModalVisible} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setSemModalVisible(false)}>
              <Text style={styles.modalCancel}>キャンセル</Text>
            </TouchableOpacity>
            <Text style={styles.modalTitle}>{editingSemester ? '学期を編集' : '学期を追加'}</Text>
            <TouchableOpacity onPress={handleSemSave} disabled={!semName.trim() || semSaving}>
              <Text style={[styles.modalSave, (!semName.trim() || semSaving) && { opacity: 0.4 }]}>
                {semSaving ? '保存中...' : '保存'}
              </Text>
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={{ padding: 20 }} keyboardShouldPersistTaps="handled">
            <ModalInput label="学期名 *"      value={semName}  onChangeText={setSemName}  placeholder="例：2026年前期 / 春学期" />
            <ModalInput label="開始日（任意）" value={semStart} onChangeText={setSemStart} placeholder="例：2026-04-01" keyboardType="numeric" />
            <ModalInput label="終了日（任意）" value={semEnd}   onChangeText={setSemEnd}   placeholder="例：2026-09-30" keyboardType="numeric" />
          </ScrollView>
        </SafeAreaView>
      </Modal>

    </SafeAreaView>
  );
}

// ── 汎用コンポーネント ────────────────────────────────────────────
function SettingSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={secStyles.container}>
      <Text style={secStyles.title}>{title}</Text>
      <View style={secStyles.card}>{children}</View>
    </View>
  );
}

function ModalInput({ label, value, onChangeText, placeholder, keyboardType }: {
  label: string; value: string;
  onChangeText: (t: string) => void;
  placeholder?: string;
  keyboardType?: 'default' | 'numeric' | 'numbers-and-punctuation';
}) {
  return (
    <View style={{ marginBottom: 18 }}>
      <Text style={styles.formLabel}>{label}</Text>
      <TextInput
        style={styles.formInput}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={COLORS.gray400}
        keyboardType={keyboardType ?? 'default'}
      />
    </View>
  );
}

const secStyles = StyleSheet.create({
  container: { marginBottom: 20 },
  title:     { fontSize: 13, fontWeight: '800', color: COLORS.gray600, marginBottom: 8, paddingHorizontal: 4, textTransform: 'uppercase', letterSpacing: 0.5 },
  card:      { backgroundColor: COLORS.white, borderRadius: 16, overflow: 'hidden' },
});

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.gray50 },
  header:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: COLORS.gray100, backgroundColor: COLORS.white },
  backText:  { fontSize: 16, color: COLORS.primary, fontWeight: '600', width: 48 },
  title:     { fontSize: 17, fontWeight: '800', color: COLORS.gray900 },
  body:      { padding: 16, paddingBottom: 40 },

  emptyHint: { fontSize: 13, color: COLORS.gray400, padding: 16 },
  hint:      { fontSize: 12, color: COLORS.gray400, padding: 12 },

  // 学期行
  semesterRow:   { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: COLORS.gray100 },
  semesterCheck: { marginRight: 10 },
  radio:         { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: COLORS.gray200, alignItems: 'center', justifyContent: 'center' },
  radioActive:   { borderColor: COLORS.primary },
  radioDot:      { width: 10, height: 10, borderRadius: 5, backgroundColor: COLORS.primary },
  semesterInfo:  { flex: 1 },
  semesterName:  { fontSize: 14, fontWeight: '700', color: COLORS.gray900 },
  semesterDates: { fontSize: 11, color: COLORS.gray400, marginTop: 2 },
  semRowBtn:     { paddingHorizontal: 8, paddingVertical: 4 },
  semRowBtnText: { fontSize: 13, fontWeight: '600', color: COLORS.primary },
  clearActiveBtn: { margin: 12, paddingVertical: 8, alignItems: 'center', borderRadius: 8, backgroundColor: COLORS.gray100 },
  clearActiveBtnText: { fontSize: 13, color: COLORS.gray600, fontWeight: '600' },
  addBtn:        { margin: 12, paddingVertical: 12, alignItems: 'center', borderRadius: 10, backgroundColor: COLORS.primaryLight },
  addBtnText:    { fontSize: 14, fontWeight: '700', color: COLORS.primary },

  // 時限数
  numRow:          { flexDirection: 'row', gap: 8, padding: 16, flexWrap: 'wrap' },
  numBtn:          { width: 56, height: 44, borderRadius: 10, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: COLORS.gray200, backgroundColor: COLORS.gray50 },
  numBtnActive:    { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  numBtnText:      { fontSize: 14, fontWeight: '700', color: COLORS.gray600 },
  numBtnTextActive:{ color: '#fff' },

  // 授業時間
  timeHeader:    { flexDirection: 'row', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4 },
  timeColLabel:  { fontSize: 11, fontWeight: '700', color: COLORS.gray400, flex: 1, textAlign: 'center' },
  timeRow:       { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: COLORS.gray100, gap: 4 },
  timeNumCell:   { width: 36, alignItems: 'center' },
  timeNumText:   { fontSize: 13, fontWeight: '700', color: COLORS.gray600 },
  timeInput:     {
    flex: 1, borderWidth: 1, borderColor: COLORS.gray200, borderRadius: 8,
    padding: 8, fontSize: 14, color: COLORS.gray900, backgroundColor: COLORS.gray50,
    textAlign: 'center',
  },
  timeSep: { fontSize: 14, color: COLORS.gray400, paddingHorizontal: 2 },

  // 出席率
  rateRow:          { flexDirection: 'row', gap: 8, padding: 16, flexWrap: 'wrap' },
  rateBtn:          { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1.5, borderColor: COLORS.gray200, backgroundColor: COLORS.gray50 },
  rateBtnActive:    { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  rateBtnText:      { fontSize: 13, fontWeight: '600', color: COLORS.gray600 },
  rateBtnTextActive:{ color: '#fff' },

  // モーダル
  modalContainer: { flex: 1, backgroundColor: COLORS.white },
  modalHeader:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: COLORS.gray100 },
  modalTitle:     { fontSize: 16, fontWeight: '700', color: COLORS.gray900 },
  modalCancel:    { fontSize: 15, color: COLORS.gray600 },
  modalSave:      { fontSize: 15, fontWeight: '700', color: COLORS.primary },
  formLabel:      { fontSize: 13, fontWeight: '700', color: COLORS.gray600, marginBottom: 6 },
  formInput:      { borderWidth: 1, borderColor: COLORS.gray200, borderRadius: 10, padding: 12, fontSize: 14, color: COLORS.gray900, backgroundColor: COLORS.gray50 },
});
