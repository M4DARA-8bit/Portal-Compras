/* =============================================================================
   auth.js — Portal de Compras
   =============================================================================
   Camada fina sobre auth-local.js, mantendo a mesma assinatura que o app.js
   já usava. O login agora é por USUÁRIO + SENHA da coleção `usuarios`.
============================================================================= */

import {
  authReady,
  loginComUsuario,
  logoutLocal,
  restaurarSessao,
  sessaoRestanteMs,
  vigiarSessao
} from './auth-local.js';

export async function initializeAuthPersistence() {
  await authReady;
}

/** Autentica e devolve o perfil já normalizado. */
export async function login(usuario, senha) {
  return loginComUsuario(usuario, senha);
}

export async function logout() {
  await logoutLocal();
}

export function getSessionRemainingMs() {
  return sessaoRestanteMs();
}

export function startSessionWatch(onTick, onExpired) {
  vigiarSessao(onTick, onExpired);
}

/**
 * Não existe mais `onAuthStateChanged`: a sessão local é lida do
 * sessionStorage. A função continua existindo para o app.js não mudar de forma.
 */
export function watchAuth(callback) {
  const perfil = restaurarSessao();
  callback(perfil);
  return () => {};
}
