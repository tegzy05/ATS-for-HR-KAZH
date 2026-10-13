const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { defineSecret, defineString } = require('firebase-functions/params');
const { scoreExpert, ScoringError } = require('./scoring');

// Set once with:  firebase functions:secrets:set ANTHROPIC_API_KEY
const ANTHROPIC_API_KEY = defineSecret('ANTHROPIC_API_KEY');
// Optional override at deploy time; defaults to the model below.
const ANTHROPIC_MODEL = defineString('ANTHROPIC_MODEL', { default: 'claude-sonnet-5-5' });

// Called from the browser through the Firebase SDK (src/backend.js).
// The region must match FUNCTIONS_REGION in src/firebase.js.
exports.aiScoreExpert = onCall(
  {
    region: 'europe-west1',
    secrets: [ANTHROPIC_API_KEY],
    timeoutSeconds: 60,
    // Caps how many copies run at once, which also caps how much a flood of
    // requests could cost in Anthropic usage.
    maxInstances: 5,
  },
  async (request) => {
    try {
      return await scoreExpert(request.data, {
        apiKey: ANTHROPIC_API_KEY.value(),
        model: ANTHROPIC_MODEL.value(),
      });
    } catch (err) {
      if (err instanceof ScoringError) throw new HttpsError(err.code, err.message);
      throw err;
    }
  },
);
