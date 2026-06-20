const { z } = require('zod');
const stripeService = require('../services/stripeService');
const logger = require('../utils/logger');

const checkoutSchema = z.object({
  plan: z.enum(['monthly', 'annual']),
});

/**
 * POST /api/stripe/create-checkout-session
 */
async function createCheckoutSession(req, res, next) {
  try {
    const { plan } = checkoutSchema.parse(req.body);

    const result = await stripeService.createCheckoutSession({
      plan,
      userId: req.user.id,
      email: req.user.email,
    });

    return res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/stripe/webhook
 * Stripe sends events here; must use raw body for signature verification.
 */
async function handleWebhook(req, res, next) {
  try {
    const signature = req.headers['stripe-signature'];
    // req.body must be raw Buffer/string (configured in app.js)
    await stripeService.handleWebhook(req.body, signature);

    return res.status(200).json({ received: true });
  } catch (error) {
    logger.error({ error: error.message }, 'Stripe webhook error');
    return res.status(400).json({
      error: error.message,
      code: 'WEBHOOK_ERROR',
      statusCode: 400,
    });
  }
}

module.exports = { createCheckoutSession, handleWebhook };
