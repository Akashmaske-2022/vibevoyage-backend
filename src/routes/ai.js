const { Router } = require('express');
const aiController = require('../controllers/aiController');
const { authenticate } = require('../middleware/auth');

const router = Router();

router.use(authenticate);

router.post('/extract-travel-data', aiController.extractTravelData);
router.post('/generate-itinerary', aiController.generateItinerary);

module.exports = router;
