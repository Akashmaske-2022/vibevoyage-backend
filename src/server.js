const app = require('./app');
const logger = require('./utils/logger');

const PORT = parseInt(process.env.PORT) || 5000;

const server = app.listen(PORT, () => {
  logger.info(`🚀 VibeVoyage API running on port ${PORT} [${process.env.NODE_ENV || 'development'}]`);
});

// ─── Graceful Shutdown ────────────────────────────────────────────────────

async function shutdown(signal) {
  logger.info({ signal }, 'Received shutdown signal — closing server gracefully');

  server.close(async () => {
    logger.info('HTTP server closed');

    // Close Prisma connection pool
    try {
      const prisma = require('./models/prismaClient');
      await prisma.$disconnect();
      logger.info('Database connection closed');
    } catch (err) {
      logger.error({ err }, 'Error closing database connection');
    }

    logger.info('Shutdown complete');
    process.exit(0);
  });

  // Force exit after 10 seconds
  setTimeout(() => {
    logger.error('Graceful shutdown timeout — forcing exit');
    process.exit(1);
  }, 10_000);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  logger.error({ reason, promise }, 'Unhandled Promise Rejection');
});

process.on('uncaughtException', (error) => {
  logger.error({ error }, 'Uncaught Exception — shutting down');
  process.exit(1);
});

module.exports = server;
