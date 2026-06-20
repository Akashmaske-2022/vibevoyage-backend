const { z } = require('zod');
const prisma = require('../models/prismaClient');
const aiService = require('../services/aiService');
const { createError } = require('../middleware/errorHandler');
const logger = require('../utils/logger');

const extractSchema = z.object({
  sessionId: z.string().uuid('Invalid session ID'),
  conversationHistory: z.array(
    z.object({
      role: z.enum(['USER', 'ASSISTANT', 'user', 'assistant', 'model']),
      content: z.string(),
    })
  ).min(1, 'Conversation history cannot be empty'),
});

const generateSchema = z.object({
  sessionId: z.string().uuid('Invalid session ID'),
  moodData: z.object({
    mood: z.string(),
    budget: z.number().nonnegative(),
    destinations: z.array(z.string()),
    duration: z.number().nonnegative(),
    travelStyle: z.array(z.string()),
    dietaryRestrictions: z.array(z.string()).optional(),
  }),
});

/**
 * POST /api/ai/extract-travel-data
 * Extracts mood/preferences from conversation history via Gemini.
 */
async function extractTravelData(req, res, next) {
  try {
    const { sessionId, conversationHistory } = extractSchema.parse(req.body);

    // Verify session ownership
    const session = await prisma.chatSession.findFirst({
      where: { id: sessionId, userId: req.user.id, isDeleted: false },
    });
    if (!session) {
      throw createError('Session not found', 404, 'SESSION_NOT_FOUND');
    }

    // Rate limiting: check free tier
    const usageCheck = await aiService.checkAndUpdateAiUsage(req.user.id, req.user.tier);
    if (!usageCheck.allowed) {
      return res.status(429).json({
        error: `Daily AI limit reached (${usageCheck.used}/${5} calls). Upgrade to Premium for unlimited access.`,
        code: 'RATE_LIMIT_EXCEEDED',
        statusCode: 429,
        upgradeRequired: true,
      });
    }

    // Run extraction
    const extracted = await aiService.extractTravelData(
      conversationHistory,
      req.user.id,
      req.user.tier
    );

    // Cache extraction result in session
    await prisma.chatSession.update({
      where: { id: sessionId },
      data: {
        contextSummary: extracted,
        title: extracted.destinations?.length
          ? `${extracted.mood} · ${extracted.destinations[0].split(',')[0]}`
          : session.title,
      },
    });

    // Save as assistant message in the session
    await prisma.chatMessage.create({
      data: {
        sessionId,
        role: 'ASSISTANT',
        content: `I've analyzed your travel vibe! I'm detecting: **${extracted.mood}** energy with a **$${extracted.budget}** budget for **${extracted.duration} days**.`,
        extractedData: extracted,
      },
    });

    logger.info({ userId: req.user.id, sessionId, remaining: usageCheck.remaining }, 'Travel data extracted');

    return res.status(200).json({
      extracted,
      remaining: usageCheck.remaining,
      isMock: extracted._isMock || false,
      isFallback: extracted._isFallback || false,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/ai/generate-itinerary
 * Generates a full itinerary based on mood data via Gemini.
 */
async function generateItinerary(req, res, next) {
  try {
    const { sessionId, moodData } = generateSchema.parse(req.body);

    // Verify session ownership
    const session = await prisma.chatSession.findFirst({
      where: { id: sessionId, userId: req.user.id, isDeleted: false },
    });
    if (!session) {
      throw createError('Session not found', 404, 'SESSION_NOT_FOUND');
    }

    // Generate itinerary
    const itinerary = await aiService.generateItinerary(moodData, req.user.id);

    // Auto-save to database
    const saved = await prisma.savedItinerary.create({
      data: {
        userId: req.user.id,
        sessionId,
        title: `${itinerary.destination} · ${itinerary.duration}d`,
        destination: itinerary.destination,
        duration: itinerary.duration,
        budget: itinerary.budget || moodData.budget,
        itineraryJson: itinerary,
      },
      select: { id: true, title: true, destination: true, createdAt: true },
    });

    logger.info({ userId: req.user.id, itineraryId: saved.id }, 'Itinerary generated and saved');

    return res.status(201).json({
      itineraryId: saved.id,
      title: saved.title,
      destination: itinerary.destination,
      duration: itinerary.duration,
      budget: itinerary.budget,
      itinerary,
      generatedAt: saved.createdAt,
    });
  } catch (error) {
    next(error);
  }
}

module.exports = { extractTravelData, generateItinerary };
