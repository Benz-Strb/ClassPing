import { Global, Module } from '@nestjs/common';
import { FaceClient } from './face.client.js';

@Global()
@Module({
  providers: [FaceClient],
  exports: [FaceClient],
})
export class FaceModule {}
