const { Router } = require('express');
const itineraryController = require('../controllers/itineraryController');
const { authenticate } = require('../middleware/auth');

const router = Router();

router.use(authenticate);

router.get('/', itineraryController.getItineraries);
router.get('/:itineraryId', itineraryController.getItinerary);
router.put('/:itineraryId', itineraryController.updateItinerary);
router.delete('/:itineraryId', itineraryController.deleteItinerary);
router.post('/:itineraryId/export', itineraryController.exportItinerary);

module.exports = router;
