import { initializeApp, getApp, getApps } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

// Initialize Firebase App safely
let app: any;
try {
  app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
} catch (error) {
  console.error("Firebase App initialization failed:", error);
}

// Initialize Firestore safely with named database support
let db: any;
try {
  if (app) {
    const dbId = firebaseConfig.firestoreDatabaseId;
    if (dbId) {
      db = getFirestore(app, dbId);
    } else {
      db = getFirestore(app);
    }
  }
} catch (error) {
  console.error("Firestore initialization failed:", error);
}

// Initialize Auth safely
let auth: any;
try {
  if (app) {
    auth = getAuth(app);
  }
} catch (error) {
  console.error("Firebase Auth initialization failed:", error);
}

export { app, db, auth };

