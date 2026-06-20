const { z } = require('zod');
const prisma = require('../models/prismaClient');
const { createError } = require('../middleware/errorHandler');
const logger = require('../utils/logger');

const updateSchema = z.object({
  title: z.string().max(100).optional(),
  notes: z.string().max(1000).optional(),
});

/**
 * GET /api/itineraries
 */
async function getItineraries(req, res, next) {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 20, 50);
    const offset = parseInt(req.query.offset) || 0;
    const { search, budgetMin, budgetMax, dateFrom, dateTo } = req.query;

    const where = {
      userId: req.user.id,
      ...(search && { destination: { contains: search, mode: 'insensitive' } }),
      ...(budgetMin && { budget: { gte: parseFloat(budgetMin) } }),
      ...(budgetMax && { budget: { lte: parseFloat(budgetMax) } }),
      ...(dateFrom && { createdAt: { gte: new Date(dateFrom) } }),
      ...(dateTo && { createdAt: { lte: new Date(dateTo) } }),
    };

    const [itineraries, total] = await prisma.$transaction([
      prisma.savedItinerary.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
        select: {
          id: true,
          title: true,
          destination: true,
          duration: true,
          budget: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      prisma.savedItinerary.count({ where }),
    ]);

    return res.status(200).json({ itineraries, total });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/itineraries/:itineraryId
 */
async function getItinerary(req, res, next) {
  try {
    const itinerary = await _getOwnedItinerary(req.params.itineraryId, req.user.id);
    return res.status(200).json({ itinerary });
  } catch (error) {
    next(error);
  }
}

/**
 * PUT /api/itineraries/:itineraryId
 */
async function updateItinerary(req, res, next) {
  try {
    await _getOwnedItinerary(req.params.itineraryId, req.user.id);

    const data = updateSchema.parse(req.body);

    const updated = await prisma.savedItinerary.update({
      where: { id: req.params.itineraryId },
      data,
      select: { id: true, title: true, updatedAt: true },
    });

    return res.status(200).json({ message: 'Itinerary updated', itinerary: updated });
  } catch (error) {
    next(error);
  }
}

/**
 * DELETE /api/itineraries/:itineraryId
 */
async function deleteItinerary(req, res, next) {
  try {
    await _getOwnedItinerary(req.params.itineraryId, req.user.id);

    await prisma.savedItinerary.delete({
      where: { id: req.params.itineraryId },
    });

    return res.status(200).json({ message: 'Itinerary deleted' });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/itineraries/:itineraryId/export
 * Returns itinerary data for download (JSON format; PDF handled client-side).
 */
async function exportItinerary(req, res, next) {
  try {
    const format = req.query.format || 'json';
    const itinerary = await _getOwnedItinerary(req.params.itineraryId, req.user.id);

    if (format === 'json') {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="vibevoyage-${itinerary.destination.replace(/[^a-z0-9]/gi, '-').toLowerCase()}.json"`
      );
      return res.status(200).json(itinerary.itineraryJson);
    }

    // For PDF: return the data and let frontend generate PDF
    return res.status(200).json({ itinerary, format });
  } catch (error) {
    next(error);
  }
}

// ─── Private Helpers ───────────────────────────────────────────────────────

async function _getOwnedItinerary(itineraryId, userId) {
  const itinerary = await prisma.savedItinerary.findFirst({
    where: { id: itineraryId, userId },
  });

  if (!itinerary) {
    throw createError('Itinerary not found', 404, 'ITINERARY_NOT_FOUND');
  }

  return itinerary;
}

module.exports = { getItineraries, getItinerary, updateItinerary, deleteItinerary, exportItinerary };
