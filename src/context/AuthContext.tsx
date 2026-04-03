"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
} from "react";
import {
  User,
  onAuthStateChanged,
  signOut as firebaseSignOut,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  GoogleAuthProvider,
  signInWithPopup,
} from "firebase/auth";
import { auth } from "@/lib/firebase";

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  gmailAccessToken: string | null;
  signUpWithEmail: (email: string, password: string) => Promise<void>;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  connectGmail: () => Promise<string | null>;
  signOut: () => Promise<void>;
}

const GMAIL_TOKEN_KEY = "everest_gmail_token";

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [gmailAccessToken, setGmailAccessToken] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      setLoading(false);
      // Restore token from session storage if user is still signed in
      if (firebaseUser) {
        const stored = sessionStorage.getItem(GMAIL_TOKEN_KEY);
        if (stored) setGmailAccessToken(stored);
      } else {
        sessionStorage.removeItem(GMAIL_TOKEN_KEY);
        setGmailAccessToken(null);
      }
    });
    return unsubscribe;
  }, []);

  async function signUpWithEmail(email: string, password: string) {
    await createUserWithEmailAndPassword(auth, email, password);
  }

  async function signInWithEmail(email: string, password: string) {
    await signInWithEmailAndPassword(auth, email, password);
  }

  async function signInWithGoogle() {
    const provider = new GoogleAuthProvider();
    // Request Gmail read-only access for contract import
    provider.addScope("https://www.googleapis.com/auth/gmail.readonly");
    const result = await signInWithPopup(auth, provider);
    // Extract the OAuth access token for Gmail API calls
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (credential?.accessToken) {
      setGmailAccessToken(credential.accessToken);
      sessionStorage.setItem(GMAIL_TOKEN_KEY, credential.accessToken);
    }
  }

  /** Get a Gmail access token WITHOUT changing the signed-in Firebase user.
   *  Uses Google Identity Services (GIS) token flow — completely bypasses Firebase auth. */
  async function connectGmail(): Promise<string | null> {
    // Dynamically load the GIS script if not already present
    if (!document.querySelector('script[src="https://accounts.google.com/gsi/client"]')) {
      await new Promise<void>((resolve, reject) => {
        const script = document.createElement("script");
        script.src = "https://accounts.google.com/gsi/client";
        script.onload = () => resolve();
        script.onerror = () => reject(new Error("Failed to load Google Identity Services"));
        document.head.appendChild(script);
      });
    }

    // Wait for google.accounts to be available
    const g = (window as unknown as { google: { accounts: { oauth2: {
      initTokenClient: (config: {
        client_id: string;
        scope: string;
        hint?: string;
        callback: (resp: { access_token?: string; error?: string }) => void;
      }) => { requestAccessToken: () => void };
    } } } }).google;

    return new Promise((resolve) => {
      const client = g.accounts.oauth2.initTokenClient({
        client_id: process.env.NEXT_PUBLIC_GOOGLE_OAUTH_CLIENT_ID || "",
        scope: "https://www.googleapis.com/auth/gmail.readonly",
        hint: user?.email || undefined,
        callback: (response) => {
          if (response.access_token) {
            setGmailAccessToken(response.access_token);
            sessionStorage.setItem(GMAIL_TOKEN_KEY, response.access_token);
            resolve(response.access_token);
          } else {
            console.error("Gmail token error:", response.error);
            resolve(null);
          }
        },
      });
      client.requestAccessToken();
    });
  }

  async function signOut() {
    sessionStorage.removeItem(GMAIL_TOKEN_KEY);
    setGmailAccessToken(null);
    await firebaseSignOut(auth);
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        gmailAccessToken,
        signUpWithEmail,
        signInWithEmail,
        signInWithGoogle,
        connectGmail,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
