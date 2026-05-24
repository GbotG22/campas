import { useEffect, useState } from 'react';
import {
  ActivityIndicator, Alert, KeyboardAvoidingView, Modal,
  Platform, ScrollView, StyleSheet, Text, TextInput,
  TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { COLORS } from '@/constants/theme';
import { useAssignments, calcPriorityScore } from '@/hooks/useAssignments';
import { requestNotificationPermission } from '@/lib/notifications';
import type { Database } from '@/types/database';

type Assignment = Database['public']['Tables']['assignments']['Row'];
type Priority = 'low' | 'medium' | 'high';

const PRIORITY_CONFIG: Record<Priority, { label: string; color: string; bg: string }> = {
  high:   { label: '高', color: COLORS.danger,  bg: COLORS.dangerLight },
  medium: { label: '中', color: COLORS.warning, bg: COLORS.warningLight },
  low:    { label: '低', color: COLORS.success, bg: COLORS.successLight },
};

function daysUntil(dateStr: string | null) {
  if (!dateStr) return null;
  return Math.ceil((new Date(dateStr).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}

function DueBadge({ days }: { days: number | null }) {
  if (days === null) return null;
  const urgent = days <= 1;
  const overdue = days < 0;
  const label = overdue
    ? `${Math.abs(days)}日超過`
    : days === 0 ? '今日' : days === 1 ? '明日' : `${days}日後`;
  return (
    <View style={[styles.dueBadge, overdue ? styles.dueBadgeOverdue : urgent ? styles.dueBadgeUrgent : styles.dueBadgeNormal]}>
      <Text style={[styles.dueBadgeText, { color: overdue ? COLORS.danger : urgent ? COLORS.warning : COLORS.gray600 }]}>
        📅 {label}
      </Text>
    </View>
  );
}

function PriorityBadge({ priority }: { priority: string | null }) {
  if (!priority) return null;
  const cfg = PRIORITY_CONFIG[priority as Priority];
  return (
    <View style={[styles.priorityBadge, { backgroundColor: cfg.bg }]}>
      <Text style={[styles.priorityBadgeText, { color: cfg.color }]}>{cfg.label}</Text>
    </View>
  );
}

export default function AssignmentsScreen() {
  const { assignments, isLoading, addAssignment, completeAssignment, deleteAssignment } = useAssignments();
  const [modalVisible, setModalVisible] = useState(false);
  const [filter, setFilter] = useState<string | null>(null); // 科目フィルタ

  // フォーム
  const [title, setTitle] = useState('');
  const [subject, setSubject] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [priority, setPriority] = useState<Priority>('medium');
  const [saving, setSaving] = useState(false);

  // 通知権限をリクエスト
  useEffect(() => {
    requestNotificationPermission().catch(() => {});
  }, []);

  function openModal() {
    setTitle(''); setSubject(''); setDueDate(''); setPriority('medium');
    setModalVisible(true);
  }

  async function handleSave() {
    if (!title.trim()) return;
    setSaving(true);
    const error = await addAssignment({
      title: title.trim(),
      subject_name: subject.trim() || null,
      due_date: dueDate ? new Date(dueDate + 'T23:59:59').toISOString() : null,
      priority,
      status: 'todo',
      description: null,
      ai_priority_score: null,
      timetable_slot_id: null,
    });
    setSaving(false);
    if (error) Alert.alert('エラー', error.message);
    else setModalVisible(false);
  }

  function handleLongPress(item: Assignment) {
    Alert.alert(item.title, undefined, [
      { text: '完了にする', onPress: () => completeAssignment(item.id) },
      { text: '削除', style: 'destructive', onPress: () => deleteAssignment(item.id) },
      { text: 'キャンセル', style: 'cancel' },
    ]);
  }

  // 科目リスト（フィルタ用）
  const subjects = [...new Set(assignments.map(a => a.subject_name).filter(Boolean))] as string[];

  // フィルタ後 → スコア順は fetch 時点で適用済み
  const filtered = filter ? assignments.filter(a => a.subject_name === filter) : assignments;

  // スコアで段階ラベルを付ける
  const overdue = filtered.filter(a => daysUntil(a.due_date) !== null && daysUntil(a.due_date)! < 0);
  const urgent  = filtered.filter(a => { const d = daysUntil(a.due_date); return d !== null && d >= 0 && d <= 3; });
  const upcoming = filtered.filter(a => { const d = daysUntil(a.due_date); return d !== null && d > 3; });
  const noDate  = filtered.filter(a => a.due_date === null);

  const Section = ({ label, color, items }: { label: string; color: string; items: Assignment[] }) =>
    items.length === 0 ? null : (
      <>
        <View style={styles.sectionRow}>
          <View style={[styles.sectionDot, { backgroundColor: color }]} />
          <Text style={styles.sectionLabel}>{label}</Text>
          <Text style={styles.sectionCount}>{items.length}件</Text>
        </View>
        {items.map(item => <AssignmentRow key={item.id} item={item} onLongPress={handleLongPress} onComplete={completeAssignment} />)}
      </>
    );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>課題管理</Text>
        <TouchableOpacity style={styles.addBtn} onPress={openModal}>
          <Text style={styles.addBtnText}>＋ 追加</Text>
        </TouchableOpacity>
      </View>

      {/* 科目フィルタ */}
      {subjects.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
          <TouchableOpacity
            style={[styles.filterChip, filter === null && styles.filterChipActive]}
            onPress={() => setFilter(null)}
          >
            <Text style={[styles.filterChipText, filter === null && styles.filterChipTextActive]}>すべて</Text>
          </TouchableOpacity>
          {subjects.map(s => (
            <TouchableOpacity
              key={s}
              style={[styles.filterChip, filter === s && styles.filterChipActive]}
              onPress={() => setFilter(s)}
            >
              <Text style={[styles.filterChipText, filter === s && styles.filterChipTextActive]}>{s}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      {isLoading ? (
        <ActivityIndicator style={{ flex: 1 }} color={COLORS.primary} />
      ) : filtered.length === 0 ? (
        <View style={styles.empty}>
          <Text style={{ fontSize: 52 }}>✅</Text>
          <Text style={styles.emptyText}>課題はありません</Text>
          <Text style={styles.emptySubText}>「＋ 追加」で課題を登録しましょう</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.list}>
          <Section label="⚠️ 期限切れ" color={COLORS.danger} items={overdue} />
          <Section label="🔥 3日以内" color={COLORS.warning} items={urgent} />
          <Section label="📅 4日以降" color={COLORS.primary} items={upcoming} />
          <Section label="📌 締切なし" color={COLORS.gray400} items={noDate} />
        </ScrollView>
      )}

      {/* 追加モーダル */}
      <Modal visible={modalVisible} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView style={styles.modalContainer}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={{ flex: 1 }}
          >
            <View style={styles.modalHeader}>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <Text style={styles.cancelText}>キャンセル</Text>
              </TouchableOpacity>
              <Text style={styles.modalTitle}>課題を追加</Text>
              <TouchableOpacity onPress={handleSave} disabled={saving || !title.trim()}>
                <Text style={[styles.saveText, (!title.trim() || saving) && { opacity: 0.4 }]}>
                  {saving ? '保存中...' : '追加'}
                </Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={{ padding: 16 }} keyboardShouldPersistTaps="handled">
              <Text style={styles.inputLabel}>課題名 *</Text>
              <TextInput
                style={styles.input}
                placeholder="例: 情報数学 レポート第3回"
                value={title}
                onChangeText={setTitle}
                autoFocus
              />

              <Text style={styles.inputLabel}>科目名</Text>
              <TextInput
                style={styles.input}
                placeholder="例: 情報数学"
                value={subject}
                onChangeText={setSubject}
              />

              <Text style={styles.inputLabel}>締切日</Text>
              <TextInput
                style={styles.input}
                placeholder="例: 2026-06-15"
                value={dueDate}
                onChangeText={setDueDate}
                keyboardType="numbers-and-punctuation"
              />

              <Text style={styles.inputLabel}>優先度</Text>
              <View style={styles.priorityRow}>
                {(['high', 'medium', 'low'] as Priority[]).map(p => (
                  <TouchableOpacity
                    key={p}
                    style={[styles.priorityChip, priority === p && { backgroundColor: PRIORITY_CONFIG[p].color }]}
                    onPress={() => setPriority(p)}
                  >
                    <Text style={[styles.priorityChipText, priority === p && { color: '#fff' }]}>
                      {PRIORITY_CONFIG[p].label}優先
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

function AssignmentRow({
  item, onLongPress, onComplete,
}: {
  item: Assignment;
  onLongPress: (a: Assignment) => void;
  onComplete: (id: string) => void;
}) {
  const days = daysUntil(item.due_date);
  return (
    <TouchableOpacity
      style={styles.card}
      onLongPress={() => onLongPress(item)}
      activeOpacity={0.8}
    >
      {/* チェックボタン */}
      <TouchableOpacity
        style={styles.checkbox}
        onPress={() => {
          Alert.alert('完了', `「${item.title}」を完了にしますか？`, [
            { text: 'キャンセル', style: 'cancel' },
            { text: '完了', onPress: () => onComplete(item.id) },
          ]);
        }}
      >
        <View style={styles.checkboxInner} />
      </TouchableOpacity>

      <View style={styles.cardBody}>
        <Text style={styles.cardTitle} numberOfLines={2}>{item.title}</Text>
        <View style={styles.cardMeta}>
          {item.subject_name ? <Text style={styles.subjectTag}>{item.subject_name}</Text> : null}
          <DueBadge days={days} />
          <PriorityBadge priority={item.priority} />
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.gray50 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12 },
  title: { fontSize: 22, fontWeight: '800', color: COLORS.gray900 },
  addBtn: { backgroundColor: COLORS.primary, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 7 },
  addBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  filterRow: { paddingHorizontal: 12, paddingVertical: 6, gap: 6 },
  filterChip: { borderRadius: 16, paddingHorizontal: 12, paddingVertical: 6, backgroundColor: COLORS.gray100 },
  filterChipActive: { backgroundColor: COLORS.primary },
  filterChipText: { fontSize: 13, fontWeight: '600', color: COLORS.gray600 },
  filterChipTextActive: { color: '#fff' },
  list: { padding: 12, gap: 6 },
  sectionRow: { flexDirection: 'row', alignItems: 'center', marginTop: 8, marginBottom: 4, gap: 6 },
  sectionDot: { width: 8, height: 8, borderRadius: 4 },
  sectionLabel: { fontSize: 13, fontWeight: '700', color: COLORS.gray600, flex: 1 },
  sectionCount: { fontSize: 12, color: COLORS.gray400 },
  card: {
    backgroundColor: COLORS.white, borderRadius: 12, padding: 12,
    flexDirection: 'row', alignItems: 'center', gap: 10,
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, elevation: 1,
  },
  checkbox: {
    width: 26, height: 26, borderRadius: 13,
    borderWidth: 2, borderColor: COLORS.gray200,
    justifyContent: 'center', alignItems: 'center',
  },
  checkboxInner: { width: 12, height: 12, borderRadius: 6 },
  cardBody: { flex: 1 },
  cardTitle: { fontSize: 15, fontWeight: '600', color: COLORS.gray900, marginBottom: 4 },
  cardMeta: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  subjectTag: { fontSize: 11, color: COLORS.primary, backgroundColor: COLORS.primaryLight, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  dueBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  dueBadgeOverdue: { backgroundColor: COLORS.dangerLight },
  dueBadgeUrgent: { backgroundColor: COLORS.warningLight },
  dueBadgeNormal: { backgroundColor: COLORS.gray100 },
  dueBadgeText: { fontSize: 11, fontWeight: '600' },
  priorityBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  priorityBadgeText: { fontSize: 11, fontWeight: '700' },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 10 },
  emptyText: { fontSize: 18, fontWeight: '700', color: COLORS.gray600 },
  emptySubText: { fontSize: 14, color: COLORS.gray400 },
  // Modal
  modalContainer: { flex: 1, backgroundColor: COLORS.white },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: COLORS.gray100 },
  modalTitle: { fontSize: 16, fontWeight: '700', color: COLORS.gray900 },
  cancelText: { fontSize: 16, color: COLORS.gray600 },
  saveText: { fontSize: 16, fontWeight: '700', color: COLORS.primary },
  inputLabel: { fontSize: 13, fontWeight: '600', color: COLORS.gray600, marginBottom: 6, marginTop: 16 },
  input: { borderWidth: 1, borderColor: COLORS.gray200, borderRadius: 10, padding: 12, fontSize: 16, backgroundColor: COLORS.gray50 },
  priorityRow: { flexDirection: 'row', gap: 8, marginTop: 4 },
  priorityChip: { flex: 1, borderRadius: 10, paddingVertical: 12, alignItems: 'center', backgroundColor: COLORS.gray100 },
  priorityChipText: { fontSize: 14, fontWeight: '700', color: COLORS.gray600 },
});
