import { Module } from '@nestjs/common';
import { DatabaseHealthService } from './common/utils/DatabaseHealthService';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { TypeOrmModule } from '@nestjs/typeorm';
import { typeOrmConfig } from './config';
import { ImageGenerationModule } from './modules/image-generation/image-generation.module';
import { ImageProcessingModule } from './modules/image-processing/image-processing.module';
import { PromptOptimizerModule } from './modules/prompt-optimizer/prompt-optimizer.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      envFilePath: `.env.${process.env.NODE_ENV || 'development'}`,
      isGlobal: true,
    }),
    ScheduleModule.forRoot(),
    TypeOrmModule.forRoot({
      ...typeOrmConfig,
      autoLoadEntities: true,
    }),
    ImageProcessingModule,
    ImageGenerationModule,
    PromptOptimizerModule,
  ],
  providers: [DatabaseHealthService],
})
export class AppModule {}
