import { Inject, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Queue } from 'bullmq';
import { AppError } from '../common/app-error.js';
import { APP_CONFIG, type AppConfig } from '../config/config.js';

export const FRAMES_QUEUE_NAME = 'frames';

// ภาพหนึ่งเฟรมจากกล้องหน้าห้อง receivedAt คือเวลาที่ API รับภาพ ใช้เป็นเวลาที่เห็นหน้า
export interface FrameJob {
  sessionId: string;
  cameraId: string;
  receivedAt: string;
  image: string;
}

export interface FrameQueue {
  add(job: FrameJob): Promise<void>;
  waiting(): Promise<number>;
}

export const FRAME_QUEUE = Symbol('FRAME_QUEUE');

export function redisConnection(config: AppConfig) {
  return {
    host: config.redisHost,
    port: config.redisPort,
    maxRetriesPerRequest: null,
    // Redis ล่มให้ error ทันที ไม่ค้างรอจนกล้องส่งภาพถัดไป
    enableOfflineQueue: false,
  };
}

const unavailable = () =>
  new AppError(503, 'QUEUE_UNAVAILABLE', 'ระบบคิวภาพใช้งานไม่ได้ตอนนี้ ลองใหม่อีกครั้ง');

@Injectable()
export class BullFrameQueue implements FrameQueue, OnModuleDestroy {
  private readonly logger = new Logger(BullFrameQueue.name);
  private readonly queue: Queue<FrameJob>;

  constructor(@Inject(APP_CONFIG) config: AppConfig) {
    this.queue = new Queue<FrameJob>(FRAMES_QUEUE_NAME, {
      connection: redisConnection(config),
      // งานที่พังก็ไม่เก็บไว้ เพราะในงานมีภาพทั้งห้อง
      defaultJobOptions: { removeOnComplete: true, removeOnFail: true },
    });
    // ไม่ให้ error ของ connection ทำ API ล้ม
    this.queue.on('error', (error) => this.logger.warn(`Redis: ${error.message}`));
  }

  async add(job: FrameJob): Promise<void> {
    try {
      await this.queue.add('frame', job);
    } catch (error) {
      this.logger.warn(`เพิ่มภาพเข้าคิวไม่ได้: ${String(error)}`);
      throw unavailable();
    }
  }

  async waiting(): Promise<number> {
    try {
      return await this.queue.getWaitingCount();
    } catch (error) {
      this.logger.warn(`อ่านคิวไม่ได้: ${String(error)}`);
      throw unavailable();
    }
  }

  async onModuleDestroy() {
    await this.queue.close();
  }
}
