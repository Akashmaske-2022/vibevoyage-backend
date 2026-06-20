const { z } = require('zod');
const prisma = require('../models/prismaClient');
const { createError } = require('../middleware/errorHandler');
const logger = require('../utils/logger');

const createSessionSchema = z.object({
  title: z.string().max(100).optional(),
});

const createMessageSchema = z.object({
  content: z.string().min(1, 'Message cannot be empty').max(500, 'Message too long (max 500 chars)'),
});

// ─── Session Controllers ───────────────────────────────────────────────────

/**
 * POST /api/chat/sessions
 */
async function createSession(req, res, next) {
  try {
    const { title } = createSessionSchema.parse(req.body);

    const session = await prisma.chatSession.create({
      data: {
        userId: req.user.id,
        title: title || 'New Chat',
      },
      select: { id: true, title: true, createdAt: true, updatedAt: true },
    });

    logger.info({ userId: req.user.id, sessionId: session.id }, 'Chat session created');
    return res.status(201).json({ sessionId: session.id, title: session.title, createdAt: session.createdAt });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/chat/sessions
 */
async function getSessions(req, res, next) {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 10, 50);
    const offset = parseInt(req.query.offset) || 0;

    const sessions = await prisma.chatSession.findMany({
      where: { userId: req.user.id, isDeleted: false },
      orderBy: { updatedAt: 'desc' },
      take: limit,
      skip: offset,
      select: {
        id: true,
        title: true,
        contextSummary: true,
        createdAt: true,
        updatedAt: true,
        _count: { select: { messages: true } },
        messages: {
          orderBy: { timestamp: 'desc' },
          take: 1,
          select: { content: true, role: true, timestamp: true },
        },
      },
    });

    const formatted = sessions.map((s) => ({
      sessionId: s.id,
      title: s.title,
      moodSummary: s.contextSummary,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
      messageCount: s._count.messages,
      lastMessage: s.messages[0] || null,
    }));

    return res.status(200).json({ sessions: formatted, total: formatted.length });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/chat/sessions/:sessionId
 */
async function getSession(req, res, next) {
  try {
    const session = await _getOwnedSession(req.params.sessionId, req.user.id);
    return res.status(200).json({ session });
  } catch (error) {
    next(error);
  }
}

/**
 * DELETE /api/chat/sessions/:sessionId
 */
async function deleteSession(req, res, next) {
  try {
    await _getOwnedSession(req.params.sessionId, req.user.id);

    await prisma.chatSession.update({
      where: { id: req.params.sessionId },
      data: { isDeleted: true },
    });

    return res.status(200).json({ message: 'Session deleted' });
  } catch (error) {
    next(error);
  }
}

// ─── Message Controllers ───────────────────────────────────────────────────

/**
 * GET /api/chat/sessions/:sessionId/messages
 */
async function getMessages(req, res, next) {
  try {
    await _getOwnedSession(req.params.sessionId, req.user.id);

    const limit = Math.min(parseInt(req.query.limit) || 50, 100);
    const offset = parseInt(req.query.offset) || 0;

    const messages = await prisma.chatMessage.findMany({
      where: { sessionId: req.params.sessionId },
      orderBy: { timestamp: 'asc' },
      take: limit,
      skip: offset,
      select: { id: true, role: true, content: true, extractedData: true, timestamp: true },
    });

    return res.status(200).json({ messages, total: messages.length });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/chat/sessions/:sessionId/messages
 */
async function createMessage(req, res, next) {
  try {
    await _getOwnedSession(req.params.sessionId, req.user.id);

    const { content } = createMessageSchema.parse(req.body);

    const message = await prisma.chatMessage.create({
      data: {
        sessionId: req.params.sessionId,
        role: 'USER',
        content,
      },
      select: { id: true, role: true, content: true, timestamp: true },
    });

    // Update session's updatedAt
    await prisma.chatSession.update({
      where: { id: req.params.sessionId },
      data: { updatedAt: new Date() },
    });

    return res.status(201).json(message);
  } catch (error) {
    next(error);
  }
}

// ─── Private Helpers ───────────────────────────────────────────────────────

async function _getOwnedSession(sessionId, userId) {
  const session = await prisma.chatSession.findFirst({
    where: { id: sessionId, userId, isDeleted: false },
  });

  if (!session) {
    throw createError('Chat session not found', 404, 'SESSION_NOT_FOUND');
  }

  return session;
}

module.exports = { createSession, getSessions, getSession, deleteSession, getMessages, createMessage };
