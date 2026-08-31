/**
 * Shared Prisma client singleton.
 * Import this from any module that needs database access instead of
 * creating a new PrismaClient() directly. This ensures a single
 * connection pool for the entire process.
 *
 * Usage:
 *   import { prisma } from './db.js';
 */
import { PrismaClient } from '@prisma/client';

declare global {
  // Prevent multiple instances during hot-reload in development.
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

function createPrismaClient(): PrismaClient {
  const client = new PrismaClient({
    log: process.env.NODE_ENV === 'development'
      ? ['error', 'warn']
      : ['error'],
  });
  return client;
}

// Use existing global instance in development (avoids "too many connections"
// warnings from hot-reload creating new PrismaClients), create fresh in tests.
const env = process.env.NODE_ENV ?? 'development';
export const prisma: PrismaClient =
  env === 'test' || !globalThis.__prisma
    ? createPrismaClient()
    : (globalThis.__prisma ?? createPrismaClient());

if (env !== 'test') {
  globalThis.__prisma = prisma;
}
