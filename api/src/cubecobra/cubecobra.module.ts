import { Module } from '@nestjs/common';
import { CubeCobraClient, FetchCubeCobraClient } from './cubecobra-client.js';

@Module({
  providers: [{ provide: CubeCobraClient, useClass: FetchCubeCobraClient }],
  exports: [CubeCobraClient],
})
export class CubeCobraModule {}
