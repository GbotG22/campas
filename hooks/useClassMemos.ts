import { useCallback, useEffect, useState } from 'react';

import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/auth.store';
import type { Database } from '@/types/database';

type ClassMemo = Database['public']['Tables']['class_memos']['Row'];

export function useClassMemo(slotId: string) {
  const { user } = useAuthStore();
  const [memo,      setMemo]      = useState<ClassMemo | null>(null);
  const [content,   setContent]   = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving,  setIsSaving]  = useState(false);

  const fetch = useCallback(async () => {
    if (!user || !slotId) return;
    setIsLoading(true);
    try {
      const { data } = await supabase
        .from('class_memos')
        .select('*')
        .eq('slot_id', slotId)
        .eq('user_id', user.id)
        .maybeSingle();
      if (data) { setMemo(data); setContent(data.content); }
    } catch { /* ignore */ }
    setIsLoading(false);
  }, [user, slotId]);

  useEffect(() => { fetch(); }, [fetch]);

  /** メモを保存（upsert） */
  const save = async (newContent: string) => {
    if (!user) return;
    setIsSaving(true);
    const { data, error } = await supabase
      .from('class_memos')
      .upsert(
        { slot_id: slotId, user_id: user.id, content: newContent },
        { onConflict: 'slot_id' },
      )
      .select()
      .single();
    if (!error && data) { setMemo(data); setContent(data.content); }
    setIsSaving(false);
    return error;
  };

  return { memo, content, setContent, isLoading, isSaving, save };
}
