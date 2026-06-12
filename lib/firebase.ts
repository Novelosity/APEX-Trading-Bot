import { initializeApp, getApps, cert } from 'firebase-admin/app'
import { getFirestore, Firestore } from 'firebase-admin/firestore'

function initFirebase() {
  if (getApps().length > 0) return
  const sa = process.env.FIREBASE_SERVICE_ACCOUNT
  if (!sa) throw new Error('FIREBASE_SERVICE_ACCOUNT env var is not set')
  initializeApp({ credential: cert(JSON.parse(sa)) })
}

export function getDb(): Firestore {
  initFirebase()
  return getFirestore()
}
