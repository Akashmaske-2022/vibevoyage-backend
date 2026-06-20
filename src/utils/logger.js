const pino = require('pino');

/**
 * Centralized application logger using Pino.
 * - In development: pretty-prints with colors via pino-pretty
 * - In production: outputs structured JSON, sanitizes sensitive fields
 */
const transport = pino.transport({
  targets: [
    ...(process.env.NODE_ENV !== 'production' 
      ? [{ target: 'pino-pretty', options: { colorize: true, translateTime: 'SYS:standard' } }] 
      : [{ target: 'pino/file', options: { destination: 1 } }]), // 1 means stdout
    { target: 'pino/file', options: { destination: './app.log', mkdir: true } }
  ]
});

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  redact: {
    // Ensure passwords and tokens never appear in logs
    paths: ['*.password', '*.passwordHash', '*.token', '*.accessToken', '*.refreshToken', '*.authorization'],
    censor: '[REDACTED]',
  },
}, transport);

module.exports = logger;
