export type ServiceCategory =
  | 'video' | 'music' | 'ai' | 'cloud' | 'game' | 'design' | 'dev' | 'other';

export type ServiceIconConfig = {
  emoji: string;
  backgroundColor: string;
  category: ServiceCategory;
};

export const CATEGORY_CONFIG: Record<ServiceCategory, { label: string; color: string }> = {
  video:  { label: '動画',     color: '#EF4444' },
  music:  { label: '音楽',     color: '#10B981' },
  ai:     { label: 'AI',       color: '#F59E0B' },
  cloud:  { label: 'クラウド', color: '#3B82F6' },
  game:   { label: 'ゲーム',   color: '#8B5CF6' },
  design: { label: 'デザイン', color: '#EC4899' },
  dev:    { label: '開発',     color: '#374151' },
  other:  { label: 'その他',   color: '#9CA3AF' },
};

// キーが長い（より具体的）ものが先にマッチするよう resolveServiceIcon 内でソートする
export const SERVICE_ICON_MAP: Record<string, ServiceIconConfig> = {
  'Apple Music':  { emoji: '🎶', backgroundColor: '#FA243C', category: 'music'  },
  'Google One':   { emoji: '💾', backgroundColor: '#4285F4', category: 'cloud'  },
  'YouTube':      { emoji: '▶️', backgroundColor: '#FF0000', category: 'video'  },
  'ChatGPT':      { emoji: '🤖', backgroundColor: '#10A37F', category: 'ai'     },
  'PlayStation':  { emoji: '🕹️', backgroundColor: '#00439C', category: 'game'   },
  'Microsoft':    { emoji: '📝', backgroundColor: '#0078D4', category: 'cloud'  },
  'Nintendo':     { emoji: '🎮', backgroundColor: '#E60012', category: 'game'   },
  'Dropbox':      { emoji: '📁', backgroundColor: '#0061FF', category: 'cloud'  },
  'Netflix':      { emoji: '🎬', backgroundColor: '#E50914', category: 'video'  },
  'Spotify':      { emoji: '🎵', backgroundColor: '#1DB954', category: 'music'  },
  'Amazon':       { emoji: '📦', backgroundColor: '#FF9900', category: 'video'  },
  'Disney':       { emoji: '✨', backgroundColor: '#113CCF', category: 'video'  },
  'iCloud':       { emoji: '☁️', backgroundColor: '#147EFB', category: 'cloud'  },
  'U-NEXT':       { emoji: '🎥', backgroundColor: '#C0392B', category: 'video'  },
  'Claude':       { emoji: '💬', backgroundColor: '#D97706', category: 'ai'     },
  'GitHub':       { emoji: '🐙', backgroundColor: '#24292E', category: 'dev'    },
  'Canva':        { emoji: '🎨', backgroundColor: '#00C4CC', category: 'design' },
  'Adobe':        { emoji: '🖌️', backgroundColor: '#E8001D', category: 'design' },
  'Hulu':         { emoji: '📺', backgroundColor: '#1CE783', category: 'video'  },
};

export function resolveServiceIcon(name: string): ServiceIconConfig | null {
  const lower  = name.toLowerCase().trim();
  const sorted = Object.entries(SERVICE_ICON_MAP)
    .sort((a, b) => b[0].length - a[0].length);
  for (const [key, config] of sorted) {
    if (lower.includes(key.toLowerCase())) return config;
  }
  return null;
}

export function resolveServiceCategory(name: string): ServiceCategory {
  return resolveServiceIcon(name)?.category ?? 'other';
}
