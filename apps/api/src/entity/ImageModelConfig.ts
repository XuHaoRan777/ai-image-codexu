import type { ImageModelType } from '@ai-image-codexu/shared';
import { Column, Entity } from 'typeorm';

@Entity('image_model_config', { schema: 'ai_image_codexu' })
export class ImageModelConfigEntity {
  @Column({ type: 'varchar', length: 64, primary: true, name: 'id' })
  id: string;

  @Column({ type: 'varchar', length: 120, name: 'name' })
  name: string;

  @Column({ type: 'varchar', length: 40, name: 'model_type' })
  modelType: ImageModelType;

  @Column({ type: 'varchar', length: 500, name: 'base_url' })
  baseUrl: string;

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
    name: 'model_name_override',
    nullable: true,
  })
  modelNameOverride: string | null;

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
