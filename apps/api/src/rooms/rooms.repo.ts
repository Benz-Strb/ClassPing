import { Inject, Injectable } from '@nestjs/common';
import type { SupabaseClient } from '@supabase/supabase-js';
import { dbError } from '../common/db-error.js';
import { SUPABASE_ADMIN } from '../supabase/supabase.module.js';

export interface Room {
  id: string;
  name: string;
}

// ห้องเรียนจัดการโดยแอดมิน (ตอนนี้ใส่ด้วย npm run db:seed:rooms) อาจารย์แค่เลือก
@Injectable()
export class RoomsRepo {
  constructor(@Inject(SUPABASE_ADMIN) private readonly db: SupabaseClient) {}

  async list(): Promise<Room[]> {
    const { data, error } = await this.db.from('rooms').select('id, name').order('name');
    if (error) throw dbError();
    return data as Room[];
  }

  async findById(id: string): Promise<Room | null> {
    const { data, error } = await this.db
      .from('rooms')
      .select('id, name')
      .eq('id', id)
      .maybeSingle();
    if (error) throw dbError();
    return data as Room | null;
  }
}
