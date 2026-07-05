import type {
  AspectRatio,
  ImageJobStatus,
  ImageProviderType,
  ImageResolution,
} from '@ai-image-codexu/shared';
import { Column, Entity } from 'typeorm';

@Entity('image_job', { schema: 'ai_image_codexu' })
export class ImageJobEntity {
  @Column({ type: 'varchar', length: 64, primary: true, name: 'id' })
  id: string;

  @Column({ type: 'varchar', length: 64, name: 'config_id' })
  configId: string;

  @Column({ type: 'varchar', length: 120, name: 'config_name' })
  configName: string;

  @Column({ type: 'varchar', length: 40, name: 'provider_type' })
  providerType: ImageProviderType;

  @Column({ type: 'varchar', length: 160, name: 'model_name' })
  modelName: string;

  @Column({ type: 'text', name: 'prompt' })
  prompt: string;

  @Column({ type: 'varchar', length: 64, name: 'aspect_ratio' })
  aspectRatio: AspectRatio;

  @Column({ type: 'varchar', length: 64, name: 'resolution' })
  resolution: ImageResolution;

  @Column({ type: 'int', name: 'quantity' })
  quantity: number;

  @Column({ type: 'varchar', length: 32, name: 'status' })
  status: ImageJobStatus;

  @Column({
    type: 'varchar',
    length: 500,
    name: 'image_url',
    nullable: true,
  })
  imageUrl: string | null;

  @Column({ type: 'simple-json', name: 'image_urls', nullable: true })
  imageUrls: string[] | null;

  @Column({ type: 'int', name: 'token_usage', nullable: true })
  tokenUsage: number | null;

  @Column({ type: 'int', name: 'input_token_usage', nullable: true })
  inputTokenUsage: number | null;

  @Column({ type: 'int', name: 'output_token_usage', nullable: true })
  outputTokenUsage: number | null;

  @Column({ type: 'text', name: 'error_message', nullable: true })
  errorMessage: string | null;

  @Column({
    type: 'datetime',
    name: 'created_at',
    default: () => 'CURRENT_TIMESTAMP',
  })
  createdAt: Date;

  @Column({
    type: 'datetime',
    name: 'updated_at',
    default: () => 'CURRENT_TIMESTAMP',
  })
  updatedAt: Date;
}
