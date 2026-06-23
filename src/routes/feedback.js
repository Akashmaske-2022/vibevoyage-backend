const { Router } = require('express');
const { authenticate } = require('../middleware/auth');
const feedbackController = require('../controllers/feedbackController');

const router = Router();

// POST /api/feedback — protected, requires valid JWT
router.post('/', authenticate, feedbackController.createFeedback);

module.exports = router;
