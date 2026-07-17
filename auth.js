import { auth } from './firebase.js';
import { PORTAL_CONFIG } from './config.js';
import {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  setPersistence,
  browserSessionPersistence
} from "https://www.gstatic.com/firebasejs/12.12.1/firebase-auth.js";

const SESSION_KEY = 'ability_portal_session_started_at';
let expiryTimer = null;

export async function initializeAuthPersistence() {
  await setPersistence(auth, browserSessionPersistence);
}

export async function login(email, password) {
  sessionStorage.setItem(SESSION_KEY, String(Date.now()));
  try {
    const credential = await signInWithEmailAndPassword(auth, email, password);
    return credential.user;
  } catch (error) {
    sessionStorage.removeItem(SESSION_KEY);
    throw error;
  }
}

export async function logout() {
  sessionStorage.removeItem(SESSION_KEY);
  if (expiryTimer) clearInterval(expiryTimer);
  await signOut(auth);
}

export function getSessionRemainingMs() {
  const startedAt = Number(sessionStorage.getItem(SESSION_KEY));
  if (!startedAt) return 0;
  return Math.max(0, PORTAL_CONFIG.sessionDurationMs - (Date.now() - startedAt));
}

export function startSessionWatch(onTick, onExpired) {
  if (expiryTimer) clearInterval(expiryTimer);
  const check = async () => {
    const remaining = getSessionRemainingMs();
    onTick?.(remaining);
    if (remaining <= 0) {
      clearInterval(expiryTimer);
      await logout();
      onExpired?.();
    }
  };
  check();
  expiryTimer = setInterval(check, 1000);
}

export function watchAuth(callback) {
  return onAuthStateChanged(auth, callback);
}
