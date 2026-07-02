import type {
  ImageProviderDeliveryMode,
  ImageProviderFieldMapping,
  ImageProviderFieldOverrides,
  ImageProviderPollingConfig,
  ImageProviderType,
} from '@ai-image-codexu/shared';
import { Column, Entity } from 'typeorm';

@Entity('image_model_config', { schema: 'ai_image_codexu' })
export class ImageModelConfigEntity {
  @Column({ type: 'varchar', length: 64, primary: true, name: 'id' })
  id: string;

  @Column({ type: 'varchar', length: 120, name: 'name' })
  name: string;

  @Column({
    type: 'varchar',
    length: 40,
    name: 'provider_type',
    default: 'openai-compatible',
  })
  providerType: ImageProviderType;

  @Column({
    type: 'varchar',
    length: 24,
    name: 'delivery_mode',
    default: 'sync',
  })
  deliveryMode: ImageProviderDeliveryMode;

  @Column({ type: 'varchar', length: 500, name: 'base_url', default: '' })
  baseUrl: string;

  @Column({
    type: 'varchar',
    length: 160,
    name: 'generation_path',
    nullable: true,
  })
  generationPath: string | null;

  @Column({
    type: 'varchar',
    length: 160,
    name: 'edit_path',
    nullable: true,
  })
  editPath: string | null;

  @Column({
    type: 'varchar',
    length: 80,
    name: 'api_key_masked',
    nullable: true,
  })
  apiKeyMasked: string | null;

  @Column({
    type: 'varchar',
    length: 1024,
    name: 'api_key_encrypted',
    nullable: true,
  })
  apiKeyEncrypted: string | null;

  @Column({
    type: 'varchar',
    length: 160,
    name: 'model_name',
    default: '',
  })
  modelName: string;

  @Column({ type: 'simple-json', name: 'field_mapping', nullable: true })
  fieldMapping: ImageProviderFieldMapping | null;

  @Column({ type: 'simple-json', name: 'field_overrides', nullable: true })
  fieldOverrides: ImageProviderFieldOverrides | null;

  @Column({ type: 'simple-json', name: 'polling_config', nullable: true })
  pollingConfig: ImageProviderPollingConfig | null;

  @Column({ type: 'boolean', name: 'enabled', default: true })
  enabled: boolean;

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
