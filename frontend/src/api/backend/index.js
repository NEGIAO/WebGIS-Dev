/**
 * 后端 API barrel 导出
 *
 * 从各 domain 模块统一 re-export，保持原有 import 路径兼容。
 * 消费方可继续使用: import { apiAuthLogin, ... } from '@/api/backend'
 */

export { default, default as backendAPI, BACKEND_BASE_URL, handleApiError } from './client';

export * from './auth';
export * from './location';
export * from './weather';
export * from './routing';
export * from './agent';
export * from './statistics';
export * from './admin';
export * from './spatial';
export * from './runtime';
