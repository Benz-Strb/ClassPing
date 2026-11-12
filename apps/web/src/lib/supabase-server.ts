import 'server-only';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { connection } from 'next/server';

export async function createServerSupabase() {
  await connection();
  const store = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { cookies: {
      getAll: () => store.getAll(),
      setAll(values) {
        try {
          for (const { name, value, options } of values) store.set(name, value, options);
        } catch {
          // Server Components อ่าน cookie เท่านั้น; proxy รับหน้าที่ refresh
        }
      },
    } },
  );
}
