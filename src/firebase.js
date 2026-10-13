import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { getFunctions } from 'firebase/functions';

// Paste your own values here: Firebase console → Project settings → General →
// Your apps → Web app → "SDK setup and configuration" → Config.
// These values identify your project and are safe to publish; access is
// controlled by firestore.rules and storage.rules, not by hiding this object.
export const firebaseConfig = {
  apiKey: 'YOUR_API_KEY',
  authDomain: 'YOUR_PROJECT_ID.firebaseapp.com',
  projectId: 'YOUR_PROJECT_ID',
  storageBucket: 'YOUR_PROJECT_ID.firebasestorage.app',
  messagingSenderId: 'YOUR_SENDER_ID',
  appId: 'YOUR_APP_ID',
};

// Must match the region of the aiScoreExpert function in functions/index.js
export const FUNCTIONS_REGION = 'europe-west1';

const app = initializeApp(firebaseConfig);

export const db = getFirestore(app);
export const storage = getStorage(app);
export const functions = getFunctions(app, FUNCTIONS_REGION);
