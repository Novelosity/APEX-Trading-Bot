import { initializeApp, getApps, cert, applicationDefault } from 'firebase-admin/app'
import { getDatabase, Database } from 'firebase-admin/database'

const DATABASE_URL = 'https://apex-trade-bot-default-rtdb.asia-southeast1.firebasedatabase.app'

function initFirebase() {
  if (getApps().length > 0) return
  const sa = process.env.FIREBASE_SERVICE_ACCOUNT
  if (sa) {
    initializeApp({ credential: cert(JSON.parse(sa)), databaseURL: DATABASE_URL })
  } else {
    // Application Default Credentials — works automatically on Firebase App Hosting / Cloud Run
    initializeApp({ credential: applicationDefault(), databaseURL: DATABASE_URL })
  }
}

export function getDb(): Database {
  initFirebase()
  return getDatabase()
}
