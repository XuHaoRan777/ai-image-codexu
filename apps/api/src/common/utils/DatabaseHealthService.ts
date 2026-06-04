import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { Cron } from '@nestjs/schedule';

/**
 * 数据库健康检查服务（增强版）
 * 定期检查数据库连接状态，并在连接断开时尝试重连
 */
@Injectable()
export class DatabaseHealthService {
  private readonly logger = new Logger(DatabaseHealthService.name);
  private failureCount = 0; // 连续失败次数
  private readonly MAX_FAILURES = 3; // 连续失败阈值
  private isReconnecting = false; // 防止并发重连

  constructor(@InjectDataSource() private dataSource: DataSource) {}

  /**
   * 每 5 分钟执行一次健康检查
   * 检查数据库连接状态并记录连接池信息
   */
  @Cron('0 */5 * * * *')
  async checkDatabaseHealth() {
    try {
      // 检查数据库连接是否正常
      const startTime = Date.now();
      await this.dataSource.query('SELECT 1');
      const responseTime = Date.now() - startTime;

      // 重置失败计数
      if (this.failureCount > 0) {
        this.logger.log(
          `Database connection recovered after ${this.failureCount} failures`,
        );
        this.failureCount = 0;
      }

      // 记录健康状态和响应时间
      this.logger.debug(
        `Database health check OK (response time: ${responseTime}ms, isInitialized=${this.dataSource.isInitialized})`,
      );
    } catch (error) {
      this.failureCount++;
      this.logger.error(
        `Database health check failed (${this.failureCount}/${this.MAX_FAILURES}):`,
        error,
      );

      // 如果连续失败超过阈值，尝试重新连接
      if (this.failureCount >= this.MAX_FAILURES) {
        await this.attemptReconnect();
      }
    }
  }

  /**
   * 每 2 分钟执行一次心跳检测（保持连接活跃）
   * 防止长时间空闲连接被 MySQL 服务器断开
   * 🔥 优化：心跳失败时也计入失败计数，触发自动重连
   */
  @Cron('0 */2 * * * *')
  async keepAlive() {
    try {
      await this.dataSource.query('SELECT 1');

      // 心跳成功，重置失败计数
      if (this.failureCount > 0) {
        this.logger.log(
          `Database heartbeat recovered after ${this.failureCount} failures`,
        );
        this.failureCount = 0;
      }

      this.logger.debug('Database heartbeat OK');
    } catch (error) {
      this.failureCount++;
      this.logger.error(
        `Database heartbeat failed (${this.failureCount}/${this.MAX_FAILURES}):`,
        error,
      );

      // 🔥 心跳失败也触发重连机制
      if (this.failureCount >= this.MAX_FAILURES) {
        await this.attemptReconnect();
      }
    }
  }

  /**
   * 尝试重新连接到数据库
   * 🔥 优化：防止并发重连，添加更智能的重连策略
   */
  private async attemptReconnect() {
    // 防止并发重连
    if (this.isReconnecting) {
      this.logger.warn('Reconnection already in progress, skipping...');
      return;
    }

    this.isReconnecting = true;
    this.logger.warn('Attempting to reconnect to database...');

    try {
      // 检查数据源是否已初始化
      if (!this.dataSource.isInitialized) {
        await this.dataSource.initialize();
        this.logger.log('Database reconnected successfully');
        this.failureCount = 0;
      } else {
        // 🔥 先尝试简单查询，可能只是临时网络问题
        try {
          await this.dataSource.query('SELECT 1');
          this.logger.log(
            'Database connection recovered without reinitialization',
          );
          this.failureCount = 0;
          return;
        } catch {
          // 查询仍然失败，需要重新初始化
          this.logger.warn(
            'DataSource is initialized but queries fail, destroying and reinitializing...',
          );
          await this.dataSource.destroy();
          await this.dataSource.initialize();
          this.logger.log('Database reinitialized successfully');
          this.failureCount = 0;
        }
      }
    } catch (reconnectError) {
      this.logger.error('Failed to reconnect to database:', reconnectError);
      // 保持失败计数，下次定时任务会再次尝试
    } finally {
      this.isReconnecting = false;
    }
  }

  /**
   * 手动触发健康检查（供其他服务调用）
   * @returns 健康状态
   */
  async manualHealthCheck(): Promise<{
    healthy: boolean;
    responseTime?: number;
    error?: string;
  }> {
    try {
      const startTime = Date.now();
      await this.dataSource.query('SELECT 1');
      const responseTime = Date.now() - startTime;

      return { healthy: true, responseTime };
    } catch (error) {
      return {
        healthy: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}
