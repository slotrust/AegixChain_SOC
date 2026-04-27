import { initializeApp, getApps } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

// Mock config so Vite doesn't crash if the user deleted the config file
const firebaseConfig = {
  apiKey: "dummy-api-key",
  authDomain: "dummy.firebaseapp.com",
  projectId: "dummy-project",
  storageBucket: "dummy.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456:web:123456",
  firestoreDatabaseId: "(default)"
};

let app, auth, googleProvider, db;

try {
  app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
  auth = getAuth(app);
  googleProvider = new GoogleAuthProvider();
  db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
} catch (error) {
  console.warn("Firebase initialization skipped because it is not configured properly.", error);
}

export { app, auth, googleProvider, db };
