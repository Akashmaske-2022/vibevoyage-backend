const { Router } = require('express');
const express = require('express');
const stripeController = require('../controllers/stripeController');
const { authenticate } = require('../middleware/auth');

const router = Router();

// Stripe webhook MUST receive raw body for signature verification
router.post('/webhook', express.raw({ type: 'application/json' }), stripeController.handleWebhook);

// Checkout session requires auth
router.post('/create-checkout-session', authenticate, stripeController.createCheckoutSession);

module.exports = router;
