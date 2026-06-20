const { OpenAI } = require('openai');
const { withRetry } = require('../utils/backoff');
const logger = require('../utils/logger');

const FREE_TIER_DAILY_LIMIT = parseInt(process.env.FREE_TIER_DAILY_LIMIT) || 5;

// Initialize OpenAI client
let openai = null;
if (process.env.CHATGPT_API_KEY || process.env.OPENAI_API_KEY) {
  openai = new OpenAI({ apiKey: process.env.CHATGPT_API_KEY || process.env.OPENAI_API_KEY });
}

// ─── Prompts ───────────────────────────────────────────────────────────────

const EXTRACTION_SYSTEM_PROMPT = `You are a travel preference extractor. 
Analyze the conversation and extract travel preferences.
Return ONLY a valid JSON object with these exact fields:
{
  "mood": "string describing the traveler's mood/vibe (e.g. Adventurous, Relaxed, Spontaneous)",
  "budget": number (total USD budget, 0 if not mentioned),
  "destinations": ["array", "of", "destination", "suggestions"],
  "duration": number (days, 0 if not mentioned),
  "travelStyle": ["array of styles: e.g. Beach, Adventure, Cultural, Luxury, Budget, Family, Solo"],
  "dietaryRestrictions": ["any dietary needs mentioned"],
  "extractionConfidence": number (0-100, how confident you are in this extraction)
}
If a field cannot be determined, use sensible defaults. Never return markdown, only JSON.`;

const ITINERARY_SYSTEM_PROMPT = `You are a world-class travel planner. 
Create a detailed, practical travel itinerary based on the provided travel preferences.
Return ONLY a valid JSON object with this exact structure:
{
  "destination": "string (primary destination)",
  "duration": number (days),
  "budget": number (total USD),
  "highlights": ["top 3 highlights as strings"],
  "bestDates": "string describing best travel dates/season",
  "overview": "2-3 sentence trip overview",
  "days": [
    {
      "day": 1,
      "theme": "Day theme",
      "activities": [
        {
          "time": "09:00",
          "name": "Activity name",
          "description": "Brief description",
          "estimatedCost": 25,
          "category": "Sightseeing|Food|Transport|Accommodation|Activity"
        }
      ]
    }
  ],
  "costBreakdown": {
    "flights": 400,
    "accommodation": 600,
    "food": 300,
    "activities": 200,
    "transport": 100,
    "misc": 100
  },
  "packingList": {
    "clothing": ["items"],
    "documents": ["items"],
    "electronics": ["items"],
    "toiletries": ["items"],
    "misc": ["items"]
  },
  "tips": ["3-5 practical travel tips for this destination"]
}
Make it realistic, specific, and exciting. Never return markdown, only JSON.`;

// ─── Fallback data ─────────────────────────────────────────────────────────

const MOCK_EXTRACTION = {
  mood: 'Adventurous',
  budget: 1500,
  destinations: ['Bali, Indonesia', 'Costa Rica', 'Thailand'],
  duration: 7,
  travelStyle: ['Beach', 'Adventure', 'Cultural'],
  dietaryRestrictions: [],
  extractionConfidence: 72,
};

const MOCK_ITINERARY = {
  destination: 'Bali, Indonesia',
  duration: 7,
  budget: 1500,
  highlights: ['Mount Batur sunrise trek', 'Ubud rice terraces', 'Seminyak beach sunset'],
  bestDates: 'April–October (dry season), best in May–June',
  overview:
    'A perfect blend of adventure, culture, and relaxation. Bali offers stunning rice terraces, volcanic landscapes, and vibrant nightlife — all within a budget-friendly destination.',
  days: [
    {
      day: 1,
      theme: 'Arrival & Seminyak',
      activities: [
        { time: '14:00', name: 'Arrive at Ngurah Rai Airport', description: 'Land and transfer to hotel', estimatedCost: 15, category: 'Transport' },
        { time: '16:00', name: 'Check in at boutique hotel', description: 'Settle in your Seminyak accommodation', estimatedCost: 60, category: 'Accommodation' },
        { time: '18:30', name: 'Seminyak Beach sunset', description: 'Watch the famous Bali sunset with a fresh coconut', estimatedCost: 5, category: 'Activity' },
        { time: '20:00', name: 'Dinner at Potato Head Beach Club', description: 'Iconic Bali dining experience', estimatedCost: 35, category: 'Food' },
      ],
    },
    {
      day: 2,
      theme: 'Ubud Cultural Immersion',
      activities: [
        { time: '08:00', name: 'Breakfast at local warung', description: 'Try nasi goreng and fresh tropical fruits', estimatedCost: 5, category: 'Food' },
        { time: '09:30', name: 'Drive to Ubud', description: 'Scenic 1.5-hour drive through rice fields', estimatedCost: 20, category: 'Transport' },
        { time: '11:00', name: 'Tegallalang Rice Terraces', description: 'Walk through stunning UNESCO-listed rice terraces', estimatedCost: 3, category: 'Sightseeing' },
        { time: '14:00', name: 'Ubud Monkey Forest', description: 'Explore the sacred sanctuary with 700+ monkeys', estimatedCost: 8, category: 'Activity' },
        { time: '16:00', name: 'Traditional Kecak Fire Dance', description: 'Mesmerizing sunset performance at Uluwatu', estimatedCost: 15, category: 'Activity' },
      ],
    },
  ],
  costBreakdown: { flights: 450, accommodation: 420, food: 210, activities: 180, transport: 140, misc: 100 },
  packingList: {
    clothing: ['Lightweight shirts', 'Sarong (required for temple visits)', 'Comfortable walking shoes', 'Sandals', 'Light rain jacket'],
    documents: ['Passport (6+ months validity)', 'Travel insurance', 'Hotel confirmations', 'Emergency contacts'],
    electronics: ['Universal adapter (Type C/G)', 'Portable charger', 'Camera', 'Noise-canceling earbuds'],
    toiletries: ['Sunscreen SPF 50+', 'Insect repellent', 'After-sun lotion', 'Hand sanitizer', 'Prescription medications'],
    misc: ['Cash in USD (exchange locally)', 'Reusable water bottle', 'Dry bag for water activities'],
  },
  tips: [
    'Always carry small bills (IDR) for local markets and temples',
    'Book airport transfers in advance to avoid inflated taxi prices',
    'Respect temple dress codes — carry a sarong at all times',
    'Stay hydrated; only drink bottled or filtered water',
    'Download offline Google Maps for Bali before arrival',
  ],
};

// ─── Service Functions ─────────────────────────────────────────────────────

async function extractTravelData(conversationHistory, userId, userTier) {
  if (!openai) {
    logger.warn({ userId }, 'OpenAI API key not configured — returning mock extraction');
    return { ...MOCK_EXTRACTION, _isMock: true };
  }

  const conversationText = conversationHistory
    .map((m) => `${m.role.toUpperCase()}: ${m.content}`)
    .join('\n');

  try {
    const result = await withRetry(
      async () => {
        const response = await openai.chat.completions.create({
          model: 'gpt-4o-mini',
          messages: [
            { role: 'system', content: EXTRACTION_SYSTEM_PROMPT },
            { role: 'user', content: `Conversation:\n${conversationText}\n\nExtract and return JSON:` }
          ],
          response_format: { type: "json_object" }
        });
        const text = response.choices[0].message.content.trim();
        return JSON.parse(text);
      },
      { maxAttempts: 3, baseDelayMs: 2000 }
    );

    logger.info({ userId }, 'OpenAI extraction successful');
    return result;
  } catch (error) {
    logger.error({ error: error.message, userId }, 'OpenAI extraction failed — returning fallback');
    return { ...MOCK_EXTRACTION, _isFallback: true, _error: 'Unable to refine — using previous data' };
  }
}

async function generateItinerary(moodData, userId) {
  if (!openai) {
    logger.warn({ userId }, 'OpenAI API key not configured — returning mock itinerary');
    return { ...MOCK_ITINERARY, _isMock: true };
  }

  const moodSummary = `
Mood: ${moodData.mood}
Budget: $${moodData.budget} USD
Preferred Destinations: ${(moodData.destinations || []).join(', ')}
Duration: ${moodData.duration} days
Travel Style: ${(moodData.travelStyle || []).join(', ')}
Dietary Restrictions: ${(moodData.dietaryRestrictions || []).join(', ') || 'None'}
  `.trim();

  try {
    const result = await withRetry(
      async () => {
        const response = await openai.chat.completions.create({
          model: 'gpt-4o-mini',
          messages: [
            { role: 'system', content: ITINERARY_SYSTEM_PROMPT },
            { role: 'user', content: `Travel Preferences:\n${moodSummary}\n\nGenerate complete itinerary JSON:` }
          ],
          response_format: { type: "json_object" }
        });
        const text = response.choices[0].message.content.trim();
        return JSON.parse(text);
      },
      { maxAttempts: 3, baseDelayMs: 2000 }
    );

    logger.info({ userId }, 'OpenAI itinerary generation successful');
    return result;
  } catch (error) {
    logger.error({ error: error.message, userId }, 'OpenAI itinerary failed — returning fallback');
    return { ...MOCK_ITINERARY, _isFallback: true };
  }
}

async function checkAndUpdateAiUsage(userId, userTier) {
  const prisma = require('../models/prismaClient');
  if (userTier === 'PREMIUM') {
    return { allowed: true, remaining: Infinity, used: 0 };
  }

  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

  const usage = await prisma.aiUsageLog.upsert({
    where: { userId_date: { userId, date: today } },
    update: { callCount: { increment: 1 } },
    create: { userId, date: today, callCount: 1 },
  });

  const allowed = usage.callCount <= FREE_TIER_DAILY_LIMIT;
  return {
    allowed,
    used: usage.callCount,
    remaining: Math.max(0, FREE_TIER_DAILY_LIMIT - usage.callCount),
  };
}

module.exports = { extractTravelData, generateItinerary, checkAndUpdateAiUsage };
