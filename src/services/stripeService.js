const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY || 'sk_test_placeholder');
const prisma = require('../models/prismaClient');
const { createError } = require('../middleware/errorHandler');
const logger = require('../utils/logger');

const PLANS = {
  monthly: {
    priceId: process.env.STRIPE_MONTHLY_PRICE_ID || 'price_monthly_placeholder',
    name: 'VibeVoyage Premium (Monthly)',
    amount: 999, // $9.99
  },
  annual: {
    priceId: process.env.STRIPE_ANNUAL_PRICE_ID || 'price_annual_placeholder',
    name: 'VibeVoyage Premium (Annual)',
    amount: 9900, // $99
  },
};

/**
 * Create a Stripe Checkout session for premium upgrade.
 * @param {{ plan: 'monthly'|'annual', userId: string, email: string }} params
 * @returns {{ sessionId: string, url: string }}
 */
async function createCheckoutSession({ plan, userId, email }) {
  const planDetails = PLANS[plan];
  if (!planDetails) {
    throw createError('Invalid plan selected', 400, 'INVALID_PLAN');
  }

  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';

  const session = await stripe.checkout.sessions.create({
    payment_method_types: ['card'],
    mode: 'subscription',
    customer_email: email,
    line_items: [
      {
        price: planDetails.priceId,
        quantity: 1,
      },
    ],
    success_url: `${frontendUrl}/chat?upgrade=success`,
    cancel_url: `${frontendUrl}/chat?upgrade=cancelled`,
    metadata: {
      userId,
      plan,
    },
  });

  logger.info({ userId, plan, sessionId: session.id }, 'Stripe checkout session created');

  return { sessionId: session.id, url: session.url };
}

/**
 * Handle Stripe webhook events.
 * Verifies signature, processes payment events, updates user tier.
 * @param {string} rawBody - Raw request body string
 * @param {string} signature - Stripe-Signature header value
 */
async function handleWebhook(rawBody, signature) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!webhookSecret) {
    logger.warn('STRIPE_WEBHOOK_SECRET not set — skipping signature verification in dev');
    // In production this would fail; for dev we parse directly
    const event = JSON.parse(rawBody);
    await _processWebhookEvent(event);
    return;
  }

  let event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (err) {
    throw createError(`Webhook signature verification failed: ${err.message}`, 400, 'INVALID_WEBHOOK');
  }

  await _processWebhookEvent(event);
}

async function _processWebhookEvent(event) {
  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object;
      const { userId } = session.metadata || {};

      if (userId) {
        await prisma.user.update({
          where: { id: userId },
          data: { tier: 'PREMIUM' },
        });
        logger.info({ userId, sessionId: session.id }, 'User upgraded to PREMIUM');
      }
      break;
    }

    case 'customer.subscription.deleted': {
      // Downgrade user back to FREE when subscription cancelled
      const subscription = event.data.object;
      const customerId = subscription.customer;

      // Look up user by stripe customer ID (would need stripeCustomerId field on User)
      logger.info({ customerId }, 'Subscription cancelled — would downgrade user tier');
      break;
    }

    default:
      logger.info({ type: event.type }, 'Unhandled Stripe webhook event');
  }
}

module.exports = { createCheckoutSession, handleWebhook };
