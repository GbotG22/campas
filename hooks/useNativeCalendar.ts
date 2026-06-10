import { useState, useCallback, useEffect } from 'react';
import * as Calendar from 'expo-calendar';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Alert, Platform } from 'react-native';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { localYMD } from '@/lib/dateUtils';

const STORAGE_KEY       = 'native_cal_connected';
const FETCH_DAYS_PAST   = 30;
const FETCH_DAYS_FUTURE = 180;

const IS_EXPO_GO = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

export interface NativeCalEvent {
  id:            string;
  title:         string;
  date:          string;        // YYYY-MM-DD
  time:          string | null; // HH:MM（終日の場合null）
  endTime:       string | null; // HH:MM
  notes:         string | null;
  color:         string;
  calendarTitle: string;
}

export interface UseNativeCalendarResult {
  nativeEvents: NativeCalEvent[];
  isConnected:  boolean;
  isLoading:    boolean;
  error:        string | null;
  connect:      () => Promise<void>;
  disconnect:   () => void;
  refresh:      () => Promise<void>;
}

function toYMD(date: Date): string {
  return localYMD(date);
}

function toHM(date: Date): string {
  const h = date.getHours().toString().padStart(2, '0');
  const m = date.getMinutes().toString().padStart(2, '0');
  return `${h}:${m}`;
}

export function useNativeCalendar(): UseNativeCalendarResult {
  const [nativeEvents, setNativeEvents] = useState<NativeCalEvent[]>([]);
  const [isConnected,  setIsConnected]  = useState(false);
  const [isLoading,    setIsLoading]    = useState(false);
  const [error,        setError]        = useState<string | null>(null);

  const fetchEvents = useCallback(async () => {
    if (Platform.OS !== 'ios') return;

    setIsLoading(true);
    setError(null);

    try {
      const { status } = await Calendar.getCalendarPermissionsAsync();
      if (status !== 'granted') {
        setIsConnected(false);
        await AsyncStorage.removeItem(STORAGE_KEY);
        setIsLoading(false);
        return;
      }

      const calendars = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
      const calendarIds = calendars.map(c => c.id);

      if (calendarIds.length === 0) {
        setNativeEvents([]);
        setIsConnected(true);
        setIsLoading(false);
        return;
      }

      const startDate = new Date();
      startDate.setDate(startDate.getDate() - FETCH_DAYS_PAST);
      const endDate = new Date();
      endDate.setDate(endDate.getDate() + FETCH_DAYS_FUTURE);

      const rawEvents = await Calendar.getEventsAsync(calendarIds, startDate, endDate);

      const calMap = new Map(calendars.map(c => [c.id, c]));

      const mapped: NativeCalEvent[] = rawEvents
        .filter(ev => !!ev.startDate)
        .map(ev => {
          const cal    = calMap.get(ev.calendarId ?? '');
          const startD = new Date(ev.startDate);
          const endD   = ev.endDate ? new Date(ev.endDate) : null;
          const allDay = ev.allDay === true;
          return {
            id:            ev.id,
            title:         ev.title ?? '（タイトルなし）',
            date:          toYMD(startD),
            time:          allDay ? null : toHM(startD),
            endTime:       allDay || !endD ? null : toHM(endD),
            notes:         ev.notes ?? null,
            color:         cal?.color ?? '#6B7280',
            calendarTitle: cal?.title ?? 'カレンダー',
          };
        });

      setNativeEvents(mapped);
      setIsConnected(true);
    } catch (e: any) {
      setError(e?.message ?? 'カレンダーの取得に失敗しました');
    } finally {
      setIsLoading(false);
    }
  }, []);

  // 起動時: 前回連携済みなら自動復元
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then(val => {
      if (val === 'true') fetchEvents();
    });
  }, [fetchEvents]);

  const connect = useCallback(async () => {
    if (IS_EXPO_GO) {
      Alert.alert(
        '端末カレンダー連携',
        '📱 この機能は開発版アプリ（Dev Build）で利用できます。\n\nExpo Go ではカレンダーへのアクセスが制限されています。',
        [{ text: 'OK' }],
      );
      return;
    }
    if (Platform.OS !== 'ios') return;

    setIsLoading(true);
    setError(null);

    try {
      const { status } = await Calendar.requestCalendarPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          'カレンダーへのアクセスを許可してください',
          '設定 → Camply → カレンダーでアクセスを許可することで、iPhoneのカレンダー予定を表示できます。',
          [{ text: 'OK' }],
        );
        setIsLoading(false);
        return;
      }

      await AsyncStorage.setItem(STORAGE_KEY, 'true');
      await fetchEvents();
    } catch (e: any) {
      setError(e?.message ?? 'カレンダーへの接続に失敗しました');
      setIsLoading(false);
    }
  }, [fetchEvents]);

  const disconnect = useCallback(() => {
    AsyncStorage.removeItem(STORAGE_KEY);
    setIsConnected(false);
    setNativeEvents([]);
    setError(null);
  }, []);

  const refresh = useCallback(async () => {
    if (isConnected) await fetchEvents();
  }, [isConnected, fetchEvents]);

  return { nativeEvents, isConnected, isLoading, error, connect, disconnect, refresh };
}
