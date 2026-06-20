const { Router } = require('express');
const chatController = require('../controllers/chatController');
const { authenticate } = require('../middleware/auth');

const router = Router();

// All chat routes require authentication
router.use(authenticate);

// Sessions
router.post('/sessions', chatController.createSession);
router.get('/sessions', chatController.getSessions);
router.get('/sessions/:sessionId', chatController.getSession);
router.delete('/sessions/:sessionId', chatController.deleteSession);

// Messages
router.get('/sessions/:sessionId/messages', chatController.getMessages);
router.post('/sessions/:sessionId/messages', chatController.createMessage);

module.exports = router;
