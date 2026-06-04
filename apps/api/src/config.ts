import * as dotenv from 'dotenv';
import type { TypeOrmModuleOptions } from '@nestjs/typeorm';
// 确保在读取环境变量之前加载 .env 文件
// 由于 ES6 模块的加载顺序，config.ts 可能在 main.ts 的 dotenv.config() 之前被执行

dotenv.config({ path: `.env.${process.env.NODE_ENV || 'development'}` });

// typeORM 连接数据库配置
export const typeOrmConfig: TypeOrmModuleOptions = {
  type: 'mysql',
  host: process.env.MYSQL_ADDRESS,
  port: Number(process.env.MYSQL_PORT),
  username: process.env.MYSQL_USERNAME || 'root',
  password: process.env.MYSQL_PASSWORD,
  database: 'ai_image_codexu',
  // 应用启动阶段不加载 migrations；迁移应通过单独的 TypeORM CLI/DataSource 执行。
  entities: [__dirname + '/entity/*{.ts,.js}'],
  synchronize: process.env.NODE_ENV !== 'production', // 开发环境开启，生产环境关闭
  // autoLoadEntities: true, // 自动加载模块中声明的实体
  // logging: true, // 开发环境记录SQL日志
  poolSize: 10, // 连接池最大连接数（TypeORM 配置）
  extra: {
    // MySQL2 驱动配置
    charset: 'utf8mb4', // 字符集
    // timezone: '+08:00', // 时区

    // TCP keep-alive 配置（防止连接被中间网络设备断开）
    keepAliveInitialDelay: 0, // 开始发送 keep-alive 包的延迟时间
    enableKeepAlive: true, // 启用 TCP keep-alive

    // 连接超时配置
    connectTimeout: 10000, // 建立连接的超时时间（10秒）

    // 🔥 MySQL2 连接池配置（防止连接池耗尽）
    connectionLimit: 20, // 连接池大小（与 poolSize 保持一致）
    waitForConnections: true, // 连接池耗尽时等待而不是立即失败
    queueLimit: 0, // 无限等待队列（0 表示无限制）
  },
  retryAttempts: 5, // 允许重连次数
  retryDelay: 1000, // 重试连接数据库间隔(毫秒)
};
