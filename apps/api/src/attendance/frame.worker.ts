import { Inject, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Worker } from 'bullmq';
import { APP_CONFIG, type AppConfig } from '../config/config.js';
import { FRAMES_QUEUE_NAME, type FrameJob } from './frame-queue.js';
import { FrameProcessor } from './frame.processor.js';

// ทำทีละภาพ จึงไม่มีสองงานเขียนผลของคนเดียวกันพร้อมกัน
// start() เรียกจาก main.ts ที่เดียว
@Injectable()
export class FrameWorker implements OnModuleDestroy {
  private readonly logger = new Logger(FrameWorker.name);
  private worker?: Worker<FrameJob>;

  constructor(
    private readonly processor: FrameProcessor,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  start() {
    this.worker = new Worker<FrameJob>(
      FRAMES_QUEUE_NAME,
      (job) => this.processor.process(job.data),
      {
        connection: {
          host: this.config.redisHost,
          port: this.config.redisPort,
          maxRetriesPerRequest: null,
        },
        concurrency: 1,
      },
    );
    this.worker.on('failed', (job, error) => {
      this.logger.warn(`ตรวจภาพ ${job?.id ?? ''} ไม่สำเร็จ: ${error.message}`);
    });
    // Redis ล่มให้ log ไว้ ไม่ทำให้ API ล้ม
    this.worker.on('error', (error) => this.logger.warn(`Redis: ${error.message}`));
  }

  async onModuleDestroy() {
    await this.worker?.close();
  }
}
