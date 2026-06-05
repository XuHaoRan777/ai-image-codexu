import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AssistantModelConfigEntity } from '../../entity/AssistantModelConfig';
import { PromptOptimizerController } from './prompt-optimizer.controller';
import { PromptOptimizerService } from './prompt-optimizer.service';

@Module({
  imports: [TypeOrmModule.forFeature([AssistantModelConfigEntity])],
  controllers: [PromptOptimizerController],
  providers: [PromptOptimizerService],
  exports: [PromptOptimizerService],
})
export class PromptOptimizerModule {}
