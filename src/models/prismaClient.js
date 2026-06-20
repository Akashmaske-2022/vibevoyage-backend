const { PrismaClient } = require('@prisma/client');

let prisma;

/**
 * Singleton Prisma client to avoid connection pool exhaustion.
 * In development, attaches to globalThis to survive hot-reloads.
 */
if (process.env.NODE_ENV === 'production') {
  prisma = new PrismaClient({
    log: ['error', 'warn'],
  });
} else {
  if (!global.__prisma) {
    global.__prisma = new PrismaClient({
      log: ['query', 'error', 'warn'],
    });
  }
  prisma = global.__prisma;
}

module.exports = prisma;
