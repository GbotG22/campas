export type Json = string | number | boolean | null | { [key: string]: Json } | Json[];

export type EventType =
  | 'assignment' | 'test' | 'report' | 'school_event'
  | 'circle'     | 'personal' | 'class_cancel' | 'class_makeup' | 'other';

export type IncomeType = 'salary' | 'allowance' | 'bonus' | 'part_time' | 'other';
export type ExternalSource = 'manual' | 'google_calendar' | 'ios_calendar' | 'shiftboard';

export type Database = {
  public: {
    Tables: {

      // ──────────────────────────────────────────
      // 汎用予定
      // ──────────────────────────────────────────
      events: {
        Row: {
          id:                string;
          user_id:           string;
          title:             string;
          description:       string | null;
          event_type:        EventType;
          start_date:        string;
          end_date:          string | null;
          start_time:        string | null;
          end_time:          string | null;
          all_day:           boolean;
          is_done:           boolean;
          color:             string | null;
          timetable_slot_id: string | null;
          external_source:   ExternalSource;
          external_id:       string | null;
          notification_enabled:        boolean;
          notification_minutes_before: number;
          created_at:        string;
          updated_at:        string;
        };
        Insert: {
          id?:                string;
          user_id:            string;
          title:              string;
          description?:       string | null;
          event_type?:        EventType;
          start_date:         string;
          end_date?:          string | null;
          start_time?:        string | null;
          end_time?:          string | null;
          all_day?:           boolean;
          is_done?:           boolean;
          color?:             string | null;
          timetable_slot_id?: string | null;
          external_source?:   ExternalSource;
          external_id?:       string | null;
          notification_enabled?:        boolean;
          notification_minutes_before?: number;
          created_at?:        string;
          updated_at?:        string;
        };
        Update: {
          id?:                string;
          user_id?:           string;
          title?:             string;
          description?:       string | null;
          event_type?:        EventType;
          start_date?:        string;
          end_date?:          string | null;
          start_time?:        string | null;
          end_time?:          string | null;
          all_day?:           boolean;
          is_done?:           boolean;
          color?:             string | null;
          timetable_slot_id?: string | null;
          external_source?:   ExternalSource;
          external_id?:       string | null;
          notification_enabled?:        boolean;
          notification_minutes_before?: number;
          created_at?:        string;
          updated_at?:        string;
        };
        Relationships: [];
      };

      // ──────────────────────────────────────────
      // バイト先
      // ──────────────────────────────────────────
      workplaces: {
        Row: {
          id:                   string;
          user_id:              string;
          name:                 string;
          hourly_wage:          number;
          color:                string;
          note:                 string | null;
          is_active:            boolean;
          closing_day:          number;   // 締め日（31=月末）
          payday_month_offset:  number;   // 翌月払い=1 / 当月払い=0
          payday_day:           number;   // 給料日（31=月末）
          external_source:      ExternalSource;
          external_id:          string | null;
          created_at:           string;
          updated_at:           string;
        };
        Insert: {
          id?:                   string;
          user_id:               string;
          name:                  string;
          hourly_wage?:          number;
          color?:                string;
          note?:                 string | null;
          is_active?:            boolean;
          closing_day?:          number;
          payday_month_offset?:  number;
          payday_day?:           number;
          external_source?:      ExternalSource;
          external_id?:          string | null;
          created_at?:           string;
          updated_at?:           string;
        };
        Update: {
          id?:                   string;
          user_id?:              string;
          name?:                 string;
          hourly_wage?:          number;
          color?:                string;
          note?:                 string | null;
          is_active?:            boolean;
          closing_day?:          number;
          payday_month_offset?:  number;
          payday_day?:           number;
          external_source?:      ExternalSource;
          external_id?:          string | null;
          created_at?:           string;
          updated_at?:           string;
        };
        Relationships: [];
      };

      // ──────────────────────────────────────────
      // シフト
      // ──────────────────────────────────────────
      shifts: {
        Row: {
          id:              string;
          user_id:         string;
          workplace_id:    string;
          date:            string;
          start_time:      string;
          end_time:        string;
          break_minutes:   number;
          estimated_wage:  number | null;
          note:            string | null;
          external_source: ExternalSource;
          external_id:     string | null;
          notification_enabled:        boolean;
          notification_minutes_before: number;
          created_at:      string;
          updated_at:      string;
        };
        Insert: {
          id?:              string;
          user_id:          string;
          workplace_id:     string;
          date:             string;
          start_time:       string;
          end_time:         string;
          break_minutes?:   number;
          estimated_wage?:  number | null;
          note?:            string | null;
          external_source?: ExternalSource;
          external_id?:     string | null;
          notification_enabled?:        boolean;
          notification_minutes_before?: number;
          created_at?:      string;
          updated_at?:      string;
        };
        Update: {
          id?:              string;
          user_id?:         string;
          workplace_id?:    string;
          date?:            string;
          start_time?:      string;
          end_time?:        string;
          break_minutes?:   number;
          estimated_wage?:  number | null;
          note?:            string | null;
          external_source?: ExternalSource;
          external_id?:     string | null;
          notification_enabled?:        boolean;
          notification_minutes_before?: number;
          created_at?:      string;
          updated_at?:      string;
        };
        Relationships: [];
      };

      // ──────────────────────────────────────────
      // 収入記録
      // ──────────────────────────────────────────
      incomes: {
        Row: {
          id:              string;
          user_id:         string;
          title:           string;
          amount:          number;
          income_type:     IncomeType;
          received_at:     string;
          note:            string | null;
          external_source: ExternalSource;
          external_id:     string | null;
          created_at:      string;
          updated_at:      string;
        };
        Insert: {
          id?:              string;
          user_id:          string;
          title:            string;
          amount:           number;
          income_type?:     IncomeType;
          received_at:      string;
          note?:            string | null;
          external_source?: ExternalSource;
          external_id?:     string | null;
          created_at?:      string;
          updated_at?:      string;
        };
        Update: {
          id?:              string;
          user_id?:         string;
          title?:           string;
          amount?:          number;
          income_type?:     IncomeType;
          received_at?:     string;
          note?:            string | null;
          external_source?: ExternalSource;
          external_id?:     string | null;
          created_at?:      string;
          updated_at?:      string;
        };
        Relationships: [];
      };

      // ──────────────────────────────────────────
      // 給与実績
      // ──────────────────────────────────────────
      salary_records: {
        Row: {
          id:           string;
          user_id:      string;
          workplace_id: string | null;
          year_month:   string;
          amount:       number;
          note:         string | null;
          created_at:   string;
          updated_at:   string;
        };
        Insert: {
          id?:           string;
          user_id:       string;
          workplace_id?: string | null;
          year_month:    string;
          amount:        number;
          note?:         string | null;
          created_at?:   string;
          updated_at?:   string;
        };
        Update: {
          id?:           string;
          user_id?:      string;
          workplace_id?: string | null;
          year_month?:   string;
          amount?:       number;
          note?:         string | null;
          created_at?:   string;
          updated_at?:   string;
        };
        Relationships: [];
      };

      // ──────────────────────────────────────────
      // 学期管理
      // ──────────────────────────────────────────
      semesters: {
        Row: {
          id:         string;
          user_id:    string;
          name:       string;
          start_date: string | null;
          end_date:   string | null;
          is_active:  boolean;
          sort_order: number;
          created_at: string;
        };
        Insert: {
          id?:         string;
          user_id:     string;
          name:        string;
          start_date?: string | null;
          end_date?:   string | null;
          is_active?:  boolean;
          sort_order?: number;
          created_at?: string;
        };
        Update: {
          id?:         string;
          user_id?:    string;
          name?:       string;
          start_date?: string | null;
          end_date?:   string | null;
          is_active?:  boolean;
          sort_order?: number;
          created_at?: string;
        };
        Relationships: [];
      };

      // ──────────────────────────────────────────
      // 時限・授業時間設定
      // ──────────────────────────────────────────
      period_settings: {
        Row: {
          id:            string;
          user_id:       string;
          period_count:  number;
          periods:       Json;   // PeriodTime[]
          required_rate: number;
          updated_at:    string;
          created_at:    string;
        };
        Insert: {
          id?:            string;
          user_id:        string;
          period_count?:  number;
          periods?:       Json;
          required_rate?: number;
          updated_at?:    string;
          created_at?:    string;
        };
        Update: {
          id?:            string;
          user_id?:       string;
          period_count?:  number;
          periods?:       Json;
          required_rate?: number;
          updated_at?:    string;
          created_at?:    string;
        };
        Relationships: [];
      };

      // ──────────────────────────────────────────
      // 時間割（既存 + semester_id 追加）
      // ──────────────────────────────────────────
      timetable_slots: {
        Row: {
          id:                       string;
          user_id:                  string;
          subject_name:             string;
          teacher_name:             string | null;
          room:                     string | null;
          day_of_week:              number;
          period:                   number;
          color:                    string | null;
          google_calendar_event_id: string | null;
          semester:                 string | null;
          semester_id:              string | null;
          created_at:               string;
          updated_at:               string;
        };
        Insert: {
          id?:                       string;
          user_id:                   string;
          subject_name:              string;
          teacher_name?:             string | null;
          room?:                     string | null;
          day_of_week:               number;
          period:                    number;
          color?:                    string | null;
          google_calendar_event_id?: string | null;
          semester?:                 string | null;
          semester_id?:              string | null;
          created_at?:               string;
          updated_at?:               string;
        };
        Update: {
          id?:                       string;
          user_id?:                  string;
          subject_name?:             string;
          teacher_name?:             string | null;
          room?:                     string | null;
          day_of_week?:              number;
          period?:                   number;
          color?:                    string | null;
          google_calendar_event_id?: string | null;
          semester?:                 string | null;
          semester_id?:              string | null;
          created_at?:               string;
          updated_at?:               string;
        };
        Relationships: [];
      };

      // ──────────────────────────────────────────
      // 休講・補講・テスト等イベント
      // ──────────────────────────────────────────
      class_events: {
        Row: {
          id:         string;
          slot_id:    string;
          user_id:    string;
          date:       string;
          event_type: 'cancel' | 'makeup' | 'test' | 'report' | 'presentation' | 'other';
          title:      string;
          note:       string | null;
          created_at: string;
        };
        Insert: {
          id?:        string;
          slot_id:    string;
          user_id:    string;
          date:       string;
          event_type: 'cancel' | 'makeup' | 'test' | 'report' | 'presentation' | 'other';
          title:      string;
          note?:      string | null;
          created_at?: string;
        };
        Update: {
          id?:         string;
          slot_id?:    string;
          user_id?:    string;
          date?:       string;
          event_type?: 'cancel' | 'makeup' | 'test' | 'report' | 'presentation' | 'other';
          title?:      string;
          note?:       string | null;
          created_at?: string;
        };
        Relationships: [];
      };

      // ──────────────────────────────────────────
      // 出欠記録
      // ──────────────────────────────────────────
      attendance_records: {
        Row: {
          id:         string;
          slot_id:    string;
          user_id:    string;
          date:       string;
          status:     'present' | 'absent' | 'late' | 'early_leave';
          note:       string | null;
          created_at: string;
        };
        Insert: {
          id?:        string;
          slot_id:    string;
          user_id:    string;
          date:       string;
          status:     'present' | 'absent' | 'late' | 'early_leave';
          note?:      string | null;
          created_at?: string;
        };
        Update: {
          id?:        string;
          slot_id?:   string;
          user_id?:   string;
          date?:      string;
          status?:    'present' | 'absent' | 'late' | 'early_leave';
          note?:      string | null;
          created_at?: string;
        };
        Relationships: [];
      };

      // ──────────────────────────────────────────
      // 科目メモ
      // ──────────────────────────────────────────
      class_memos: {
        Row: {
          id:         string;
          slot_id:    string;
          user_id:    string;
          content:    string;
          updated_at: string;
          created_at: string;
        };
        Insert: {
          id?:        string;
          slot_id:    string;
          user_id:    string;
          content?:   string;
          updated_at?: string;
          created_at?: string;
        };
        Update: {
          id?:        string;
          slot_id?:   string;
          user_id?:   string;
          content?:   string;
          updated_at?: string;
          created_at?: string;
        };
        Relationships: [];
      };

      // ──────────────────────────────────────────
      // 授業スケジュール（第N回）
      // ──────────────────────────────────────────
      class_schedules: {
        Row: {
          id:             string;
          slot_id:        string;
          user_id:        string;
          session_number: number;
          title:          string;
          date:           string | null;
          description:    string | null;
          created_at:     string;
        };
        Insert: {
          id?:             string;
          slot_id:         string;
          user_id:         string;
          session_number:  number;
          title:           string;
          date?:           string | null;
          description?:    string | null;
          created_at?:     string;
        };
        Update: {
          id?:             string;
          slot_id?:        string;
          user_id?:        string;
          session_number?: number;
          title?:          string;
          date?:           string | null;
          description?:    string | null;
          created_at?:     string;
        };
        Relationships: [];
      };

      // ──────────────────────────────────────────
      // 課題
      // ──────────────────────────────────────────
      assignments: {
        Row: {
          id:                 string;
          user_id:            string;
          title:              string;
          description:        string | null;
          subject_name:       string | null;
          due_date:           string | null;
          priority:           'low' | 'medium' | 'high' | null;
          ai_priority_score:  number | null;
          status:             'todo' | 'in_progress' | 'done';
          timetable_slot_id:  string | null;
          created_at:         string;
          updated_at:         string;
        };
        Insert: {
          id?:                string;
          user_id:            string;
          title:              string;
          description?:       string | null;
          subject_name?:      string | null;
          due_date?:          string | null;
          priority?:          'low' | 'medium' | 'high' | null;
          ai_priority_score?: number | null;
          status?:            'todo' | 'in_progress' | 'done';
          timetable_slot_id?: string | null;
          created_at?:        string;
          updated_at?:        string;
        };
        Update: {
          id?:                string;
          user_id?:           string;
          title?:             string;
          description?:       string | null;
          subject_name?:      string | null;
          due_date?:          string | null;
          priority?:          'low' | 'medium' | 'high' | null;
          ai_priority_score?: number | null;
          status?:            'todo' | 'in_progress' | 'done';
          timetable_slot_id?: string | null;
          created_at?:        string;
          updated_at?:        string;
        };
        Relationships: [];
      };

      // ──────────────────────────────────────────
      // 固定費
      // ──────────────────────────────────────────
      fixed_expenses: {
        Row: {
          id:          string;
          user_id:     string;
          name:        string;
          amount:      number;
          payment_day: number;
          category:    'rent' | 'electricity' | 'gas' | 'water' | 'telecom' | 'insurance' | 'other';
          memo:        string | null;
          is_active:   boolean;
          created_at:  string;
          updated_at:  string;
        };
        Insert: {
          id?:          string;
          user_id:      string;
          name:         string;
          amount:       number;
          payment_day:  number;
          category?:    'rent' | 'electricity' | 'gas' | 'water' | 'telecom' | 'insurance' | 'other';
          memo?:        string | null;
          is_active?:   boolean;
          created_at?:  string;
          updated_at?:  string;
        };
        Update: {
          id?:          string;
          user_id?:     string;
          name?:        string;
          amount?:      number;
          payment_day?: number;
          category?:    'rent' | 'electricity' | 'gas' | 'water' | 'telecom' | 'insurance' | 'other';
          memo?:        string | null;
          is_active?:   boolean;
          created_at?:  string;
          updated_at?:  string;
        };
        Relationships: [];
      };

      // ──────────────────────────────────────────
      // フィードバック
      // ──────────────────────────────────────────
      feedback: {
        Row: {
          id:             string;
          user_id:        string;
          category:       '不具合報告' | '改善要望' | '新機能の提案' | 'その他';
          message:        string;
          status:         'open' | 'in_progress' | 'resolved' | 'wont_fix';
          screenshot_url: string | null;
          app_version:    string | null;
          created_at:     string;
        };
        Insert: {
          id?:            string;
          user_id:        string;
          category:       '不具合報告' | '改善要望' | '新機能の提案' | 'その他';
          message:        string;
          status?:        'open' | 'in_progress' | 'resolved' | 'wont_fix';
          screenshot_url?: string | null;
          app_version?:   string | null;
          created_at?:    string;
        };
        Update: {
          id?:            string;
          user_id?:       string;
          category?:      '不具合報告' | '改善要望' | '新機能の提案' | 'その他';
          message?:       string;
          status?:        'open' | 'in_progress' | 'resolved' | 'wont_fix';
          screenshot_url?: string | null;
          app_version?:   string | null;
          created_at?:    string;
        };
        Relationships: [];
      };

      // ──────────────────────────────────────────
      // 支出
      // ──────────────────────────────────────────
      credit_cards: {
        Row: {
          id:                   string;
          user_id:              string;
          name:                 string;
          color:                string;
          closing_day:          number;
          payment_day:          number;
          payment_month_offset: number;
          is_active:            boolean;
          created_at:           string;
          updated_at:           string;
        };
        Insert: {
          id?:                   string;
          user_id:               string;
          name:                  string;
          color?:                string;
          closing_day:           number;
          payment_day:           number;
          payment_month_offset?: number;
          is_active?:            boolean;
          created_at?:           string;
          updated_at?:           string;
        };
        Update: {
          id?:                   string;
          user_id?:              string;
          name?:                 string;
          color?:                string;
          closing_day?:          number;
          payment_day?:          number;
          payment_month_offset?: number;
          is_active?:            boolean;
          created_at?:           string;
          updated_at?:           string;
        };
        Relationships: [];
      };

      expenses: {
        Row: {
          id:             string;
          user_id:        string;
          title:          string;
          amount:         number;
          category:       string | null;
          paid_at:        string;
          note:           string | null;
          payment_method: 'cash' | 'credit' | 'other';
          credit_card_id: string | null;
          created_at:     string;
          updated_at:     string;
        };
        Insert: {
          id?:             string;
          user_id:         string;
          title:           string;
          amount:          number;
          category?:       string | null;
          paid_at:         string;
          note?:           string | null;
          payment_method?: 'cash' | 'credit' | 'other';
          credit_card_id?: string | null;
          created_at?:     string;
          updated_at?:     string;
        };
        Update: {
          id?:             string;
          user_id?:        string;
          title?:          string;
          amount?:         number;
          category?:       string | null;
          paid_at?:        string;
          note?:           string | null;
          payment_method?: 'cash' | 'credit' | 'other';
          credit_card_id?: string | null;
          created_at?:     string;
          updated_at?:     string;
        };
        Relationships: [];
      };

      // ──────────────────────────────────────────
      // サブスク
      // ──────────────────────────────────────────
      subscriptions: {
        Row: {
          id:           string;
          user_id:      string;
          service_name: string;
          amount:       number;
          renewal_day:  number;
          memo:         string | null;
          is_active:    boolean;
          created_at:   string;
        };
        Insert: {
          id?:          string;
          user_id:      string;
          service_name: string;
          amount:       number;
          renewal_day:  number;
          memo?:        string | null;
          is_active?:   boolean;
          created_at?:  string;
        };
        Update: {
          id?:          string;
          user_id?:     string;
          service_name?: string;
          amount?:      number;
          renewal_day?: number;
          memo?:        string | null;
          is_active?:   boolean;
          created_at?:  string;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          user_id:      string;
          display_name: string | null;
          created_at:   string;
          updated_at:   string;
        };
        Insert: {
          user_id:       string;
          display_name?: string | null;
          created_at?:   string;
          updated_at?:   string;
        };
        Update: {
          user_id?:      string;
          display_name?: string | null;
          updated_at?:   string;
        };
        Relationships: [];
      };
    };

    Views:          { [_ in never]: never };
    Functions:      { [_ in never]: never };
    Enums:          { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};
