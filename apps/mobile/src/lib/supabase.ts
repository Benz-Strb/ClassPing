import 'react-native-url-polyfill/auto';
import './web-crypto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

// ใช้แค่ login และถือ session ข้อมูลอื่นดึงผ่าน API ของเรา (apiFetch)
export const supabase = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL!,
  process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  {
    auth: {
      storage: AsyncStorage,
      flowType: 'pkce',
      autoRefreshToken: true,
      persistSession: true,
      // บนมือถือไม่มี URL ให้อ่าน หน้า login แลก code เอง
      detectSessionInUrl: false,
    },
  },
);
