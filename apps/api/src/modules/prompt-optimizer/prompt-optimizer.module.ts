import { Module } from '@nestjs/common';
import { PromptOptimizerController } from './prompt-optimizer.controller';
import { PromptOptimizerService } from './prompt-optimizer.service';

@Module({
  controllers: [PromptOptimizerController],
  providers: [PromptOptimizerService],
  exports: [PromptOptimizerService],
})
export class PromptOptimizerModule {}
