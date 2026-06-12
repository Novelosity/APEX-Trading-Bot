import { initializeApp, getApps, cert, applicationDefault } from 'firebase-admin/app'
import { getFirestore, Firestore } from 'firebase-admin/firestore'

function initFirebase() {
  if (getApps().length > 0) return
  const sa = process.env.FIREBASE_SERVICE_ACCOUNT
  if (sa) {
    // Explicit service account JSON — used on Vercel or local dev
    initializeApp({ credential: cert(JSON.parse(sa)) })
  } else {
    // Application Default Credentials — used automatically on Firebase App Hosting / Cloud Run
    initializeApp({ credential: applicationDefault(), projectId: 'apex-trade-bot' })
  }
}

export function getDb(): Firestore {
  initFirebase()
  return getFirestore()
}
