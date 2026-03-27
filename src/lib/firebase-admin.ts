import { initializeApp, getApps, cert, type ServiceAccount } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

function getAdmin() {
  if (getApps().length > 0) return getApps()[0];

  // If a service account key is provided, use it; otherwise use application default credentials
  const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;

  if (serviceAccount) {
    const parsed = JSON.parse(serviceAccount) as ServiceAccount;
    return initializeApp({ credential: cert(parsed) });
  }

  // Fallback: use project ID with default credentials (works on Vercel with env vars)
  return initializeApp({
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  });
}

const adminApp = getAdmin();
export const adminAuth = getAuth(adminApp);
