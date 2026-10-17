import { Global, Module } from '@nestjs/common';
import { createClient } from '@supabase/supabase-js';
import { APP_CONFIG, AppConfig, loadConfig } from '../config/config.js';

export const SUPABASE_ADMIN = Symbol('SUPABASE_ADMIN');

// client ฝั่งเซิร์ฟเวอร์ใช้ service key ข้าม RLS ได้ ห้ามส่ง key นี้ไปหน้าเว็บ/แอป
@Global()
@Module({
  providers: [
    { provide: APP_CONFIG, useFactory: () => loadConfig(process.env) },
    {
      provide: SUPABASE_ADMIN,
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) =>
        createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
          auth: { persistSession: false, autoRefreshToken: false },
        }),
    },
  ],
  exports: [APP_CONFIG, SUPABASE_ADMIN],
})
export class SupabaseModule {}
