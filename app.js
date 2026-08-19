import { auth, db } from './firebase.js';
import { PORTAL_CONFIG } from './config.js';
import { initializeAuthPersistence, login, logout, watchAuth, startSessionWatch, getSessionRemainingMs } from './auth.js';
import { garantirEmailCorporativo, alterarEmailCorporativo, salvarPerfilSessao, normalizarPerfil, abrirSistema, iniciarSplashDeEntrada, encerrarSplash, marcarTransicao, alterarCredenciais, logoutLocal, slugUsername, SENHA_MINIMA } from './auth-local.js';

// Se a pessoa voltou de um dos sistemas, mostra a tela de carregamento na hora.
iniciarSplashDeEntrada({ titulo: 'Portal de Compras', icone: '◧' });
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  serverTimestamp,
  query,
  orderBy,
  limit
} from "https://www.gstatic.com/firebasejs/12.12.1/firebase-firestore.js";

const $ = id => document.getElementById(id);
const SYSTEM_KEYS = Object.keys(PORTAL_CONFIG.systems);
const ROLE_ORDER = ['sem_acesso','solicitante','visualizador','editor','aprovador','executor','administrador'];
let currentUser = null;
let currentProfile = null;
let usersCache = [];
let toastTimer = null;
let modoModalUsuario = 'editar'; // 'editar' | 'criar'

function showToast(message, type = '') {
  const toast = $('toast');
  toast.textContent = message;
  toast.className = `toast show ${type}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.className = 'toast', 3500);
}

function initials(name = '') {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join('').toUpperCase() || 'U';
}

function normalizePermissions(profile = {}) {
  const source = profile.sistemas || profile.systems || {};
  return Object.fromEntries(SYSTEM_KEYS.map(key => {
    const entry = source[key];
    if (typeof entry === 'string') return [key, entry];
    if (entry?.funcao) return [key, entry.acessar === false ? 'sem_acesso' : entry.funcao];
    if (entry?.role) return [key, entry.enabled === false ? 'sem_acesso' : entry.role];
    return [key, 'sem_acesso'];
  }));
}

function normalizeProfile(raw = {}, user = {}) {
  const base = normalizarPerfil(raw.id || user.uid || '', raw);
  return {
    ...base,
    uid: user.uid || base.uid,
    cargo: raw.cargo || raw.jobTitle || base.cargo || 'Não informado',
    departamento: raw.departamento || raw.department || base.departamento || 'Não informado',
    sistemas: raw.sistemas || raw.systems ? normalizePermissions(raw) : base.sistemas
  };
}

function formatTime(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = String(Math.floor(total / 3600)).padStart(2, '0');
  const m = String(Math.floor((total % 3600) / 60)).padStart(2, '0');
  const s = String(total % 60).padStart(2, '0');
  return `${h}:${m}:${s}`;
}

function roleLabel(role) {
  return PORTAL_CONFIG.roles[role] || PORTAL_CONFIG.roles.sem_acesso;
}

function permissionDescription(role) {
  const descriptions = {
    sem_acesso: 'O sistema não está liberado para esta conta.',
    solicitante: 'Só pode criar solicitações e acompanhar as próprias — não gerencia as demais.',
    visualizador: 'Pode consultar dados, sem realizar alterações.',
    editor: 'Pode visualizar e editar informações operacionais.',
    aprovador: 'Pode visualizar, editar e realizar aprovações.',
    administrador: 'Possui acesso total às funções do sistema.'
  };
  return descriptions[role] || descriptions.sem_acesso;
}

function dominantRole(profile) {
  const roles = Object.values(profile.sistemas || {}).filter(role => role !== 'sem_acesso');
  if (!roles.length) return 'Sem acesso';
  return roleLabel(roles.sort((a, b) => ROLE_ORDER.indexOf(b) - ROLE_ORDER.indexOf(a))[0]);
}

function renderProfile() {
  const p = currentProfile;
  const avatar = initials(p.nomeCompleto);
  ['sidebarAvatar','topAvatar','profileAvatar'].forEach(id => $(id).textContent = avatar);
  $('sidebarName').textContent = p.nomeCompleto;
  $('sidebarRole').textContent = p.cargo;
  $('welcomeName').textContent = p.nomeCompleto.split(' ')[0];
  $('heroDepartment').textContent = p.departamento;
  $('heroJob').textContent = p.cargo;
  $('mainRole').textContent = dominantRole(p);
  $('accountStatus').textContent = p.ativo ? 'Ativa' : 'Inativa';
  $('profileName').textContent = p.nomeCompleto;
  $('profileEmail').textContent = p.email;
  $('accountName').textContent = p.nomeCompleto;
  $('accountEmail').textContent = p.email;
  $('accountUser').textContent = p.user || '—';
  $('accountJob').textContent = p.cargo;
  $('accountDepartment').textContent = p.departamento;
  $('accountActive').textContent = p.ativo ? 'Ativa' : 'Inativa';
  $('adminNav').classList.toggle('hidden', !p.administradorPortal);

  renderSystems();
  renderMyPermissions();
}

function renderSystems() {
  const grid = $('systemsGrid');
  const allowed = SYSTEM_KEYS.filter(key => currentProfile.sistemas[key] !== 'sem_acesso');
  $('systemsCount').textContent = allowed.length;
  $('systemsTotal').textContent = SYSTEM_KEYS.length;
  $('noSystems').classList.toggle('hidden', allowed.length > 0);
  grid.innerHTML = allowed.map(key => {
    const system = PORTAL_CONFIG.systems[key];
    const role = currentProfile.sistemas[key];
    return `<article class="system-card">
      <div class="system-icon">${system.icon}</div>
      <h3>${system.name}</h3>
      <p>${system.description}</p>
      <div class="system-footer">
        <span class="role-badge">${roleLabel(role)}</span>
        <button class="system-link" data-system="${key}">Acessar →</button>
      </div>
    </article>`;
  }).join('');

  grid.querySelectorAll('[data-system]').forEach(button => button.addEventListener('click', () => {
    entrarNoSistema(button.dataset.system);
  }));
}

/**
 * Abre um sistema a partir do Portal, com tela de carregamento e sem exigir
 * login de novo. A sessão viaja pelo sessionStorage, que é compartilhado porque
 * as reescritas do vercel.json servem tudo pelo domínio do Portal.
 */
async function entrarNoSistema(chave) {
  const system = PORTAL_CONFIG.systems[chave];
  if (!system) return;
  const urlValida = valor => !!valor && !valor.includes('SEU-');
  if (!urlValida(system.url) && !urlValida(system.directUrl)) {
    showToast(`Configure a URL de ${system.name} no arquivo config.js.`, 'error');
    return;
  }
  if (currentProfile?.sistemas?.[chave] === 'sem_acesso') {
    showToast(`Seu perfil não tem acesso a ${system.name}.`, 'error');
    return;
  }

  await abrirSistema({
    chave,
    nome: system.name,
    icone: system.icon,
    url: system.url,
    urlDireta: system.directUrl,
    hostsDoPortal: PORTAL_CONFIG.portalHosts || []
  });
}

function renderMyPermissions() {
  $('myPermissions').innerHTML = SYSTEM_KEYS.map(key => {
    const system = PORTAL_CONFIG.systems[key];
    const role = currentProfile.sistemas[key];
    return `<div class="permission-row">
      <div><strong>${system.name}</strong><span>${permissionDescription(role)}</span></div>
      <span class="role-badge">${roleLabel(role)}</span>
    </div>`;
  }).join('');
}

/* ─── Alterar usuário e senha ────────────────────────────────────────────── */

function openCredentialsModal() {
  ['credCurrentPassword','credNewPassword','credConfirmPassword'].forEach(id => $(id).value = '');
  $('credNewUser').value = currentProfile?.user || '';
  $('credStatus').textContent = '';
  $('credentialsModal').classList.remove('hidden');
  setTimeout(() => $('credCurrentPassword').focus(), 60);
}

function closeCredentialsModal() {
  $('credentialsModal').classList.add('hidden');
}

async function saveCredentials(event) {
  event.preventDefault();
  const botao = $('saveCredentialsButton');
  botao.disabled = true;
  $('credStatus').textContent = 'Salvando...';

  try {
    const resultado = await alterarCredenciais(currentProfile, {
      senhaAtual: $('credCurrentPassword').value,
      novoUsuario: $('credNewUser').value,
      novaSenha: $('credNewPassword').value,
      confirmarSenha: $('credConfirmPassword').value
    });

    currentProfile = resultado.perfil;
    currentUser = resultado.perfil;
    renderProfile();
    closeCredentialsModal();

    if (resultado.avisoFirebase) {
      showToast('Usuário alterado. Peça ao administrador para atualizar a conta no Firebase.', 'error');
    } else if (resultado.trocouUsuario && resultado.trocouSenha) {
      showToast('Usuário e senha alterados. Use os novos dados no próximo acesso.', 'success');
    } else if (resultado.trocouUsuario) {
      showToast('Usuário alterado. O antigo não funciona mais.', 'success');
    } else {
      showToast('Senha alterada com sucesso.', 'success');
    }
  } catch (error) {
    console.error(error);
    $('credStatus').textContent = error?.message || 'Não foi possível salvar as alterações.';
  } finally {
    botao.disabled = false;
  }
}

function showPage(page) {
  document.querySelectorAll('.page').forEach(el => el.classList.toggle('active', el.id === `page-${page}`));
  document.querySelectorAll('.nav-item').forEach(el => el.classList.toggle('active', el.dataset.page === page));
  const titles = { inicio: 'Início', 'minha-conta': 'Minha conta', acessos: 'Controle de acessos' };
  $('pageTitle').textContent = titles[page] || 'Portal';
  document.querySelector('.sidebar').classList.remove('open');
  if (page === 'acessos') {
    if (!currentProfile?.administradorPortal) { showPage('inicio'); return; }
    loadUsers();
  }
}

async function loadUsers() {
  if (!currentProfile?.administradorPortal) return;
  $('usersList').innerHTML = '<div class="empty-state"><p>Carregando usuários...</p></div>';
  try {
    const snapshot = await getDocs(collection(db, 'usuarios'));
    let docs = snapshot.docs;
    let colecao = 'usuarios';
    if (!docs.length) {
      const alternativa = await getDocs(collection(db, 'usuariosUid'));
      docs = alternativa.docs;
      colecao = 'usuariosUid';
    }
    usersCache = docs.map(item => ({
      ...normalizeProfile({ id: item.id, ...item.data() }, { uid: item.id, email: item.data().email }),
      colecao
    }));
    usersCache.sort((a, b) => a.nomeCompleto.localeCompare(b.nomeCompleto, 'pt-BR'));
    renderUsers();
  } catch (error) {
    console.error(error);
    $('usersList').innerHTML = '<div class="empty-state"><h3>Não foi possível carregar os usuários</h3><p>Verifique as regras do Firestore para a coleção usuarios.</p></div>';
    showToast('Falha ao carregar usuários.', 'error');
  }
}

function renderUsers() {
  const search = $('userSearch').value.trim().toLowerCase();
  const status = $('statusFilter').value;
  const filtered = usersCache.filter(user => {
    const text = `${user.nomeCompleto} ${user.email} ${user.cargo} ${user.departamento}`.toLowerCase();
    const searchMatch = !search || text.includes(search);
    const statusMatch = status === 'all' || (status === 'active' ? user.ativo : !user.ativo);
    return searchMatch && statusMatch;
  });
  $('usersTotal').textContent = `${filtered.length} usuário${filtered.length === 1 ? '' : 's'}`;
  $('usersList').innerHTML = filtered.map(user => `
    <article class="user-row">
      <div class="user-identity"><div class="avatar">${initials(user.nomeCompleto)}</div><div><strong>${user.nomeCompleto}</strong><span>${user.email || 'E-mail não informado'}</span></div></div>
      <div class="user-meta"><strong>${user.cargo}</strong><span>${user.departamento}</span></div>
      <div><span class="status-pill ${user.ativo ? 'active' : 'inactive'}">${user.ativo ? 'Ativo' : 'Inativo'}</span></div>
      <button class="edit-user-button" data-user-id="${user.id}">Configurar</button>
    </article>`).join('') || '<div class="empty-state"><h3>Nenhum usuário encontrado</h3><p>Ajuste os filtros de pesquisa.</p></div>';

  $('usersList').querySelectorAll('[data-user-id]').forEach(button => button.addEventListener('click', () => openUserModal(button.dataset.userId)));
}

/** Lista de funções válidas pra cada sistema — Tarefas é diferente dos outros três. */
function rolesParaSistema(chave) {
  return chave === 'tarefas'
    ? ['sem_acesso', 'solicitante', 'executor', 'administrador']
    : ['sem_acesso', 'visualizador', 'editor', 'aprovador', 'administrador'];
}

function preencherEditorPermissoes(sistemasAtuais, ownerLocked) {
  $('permissionsEditor').innerHTML = SYSTEM_KEYS.map(key => {
    const selectedRole = ownerLocked ? 'administrador' : (sistemasAtuais[key] || 'sem_acesso');
    const rolesDoSistema = rolesParaSistema(key);
    return `<div class="permission-editor-row">
      <div><strong>${PORTAL_CONFIG.systems[key].name}</strong>${ownerLocked ? '<span>Acesso total protegido</span>' : ''}</div>
      <select data-permission-key="${key}" ${ownerLocked ? 'disabled' : ''}>
        ${rolesDoSistema.map(role => `<option value="${role}" ${selectedRole === role ? 'selected' : ''}>${roleLabel(role)}</option>`).join('')}
      </select>
    </div>`;
  }).join('');

  const selectTarefas = document.querySelector('[data-permission-key="tarefas"]');
  if (selectTarefas) {
    selectTarefas.addEventListener('change', atualizarVisibilidadeAreasGerenciadas);
    atualizarVisibilidadeAreasGerenciadas();
  }
}

/** O bloco de "áreas que administra" só faz sentido quando o papel em Tarefas é Administrador. */
function atualizarVisibilidadeAreasGerenciadas() {
  const selectTarefas = document.querySelector('[data-permission-key="tarefas"]');
  const ehAdminDeTarefas = selectTarefas?.value === 'administrador';
  $('areasGerenciadasWrap').classList.toggle('hidden', !ehAdminDeTarefas);
}

function preencherAreasGerenciadas(areasAtuais) {
  const areas = Array.isArray(areasAtuais) ? areasAtuais : [];
  $('areaCompras').checked = areas.includes('compras');
  $('areaAlmox').checked = areas.includes('almox');
  $('areaInfra').checked = areas.includes('infra');
}

function lerAreasGerenciadasDoFormulario() {
  return ['areaCompras', 'areaAlmox', 'areaInfra']
    .filter(id => $(id).checked)
    .map(id => $(id).value);
}

function openUserModal(id) {
  const user = usersCache.find(item => item.id === id);
  if (!user) return;
  modoModalUsuario = 'editar';
  $('editUserId').value = user.id;
  $('editName').value = user.nomeCompleto;
  $('editEmail').value = user.email;
  $('editEmail').readOnly = true;
  $('editJob').value = user.cargo === 'Não informado' ? '' : user.cargo;
  $('editDepartment').value = user.departamento === 'Não informado' ? '' : user.departamento;
  $('editActive').value = String(user.ativo);
  $('editActive').disabled = user.administradorPortal;
  $('modalUserTitle').textContent = user.nomeCompleto;
  $('novoUsuarioCampos').classList.add('hidden');
  const ownerLocked = user.administradorPortal;
  preencherEditorPermissoes(user.sistemas, ownerLocked);
  preencherAreasGerenciadas(user.areasGerenciadas);
  $('userModal').classList.remove('hidden');
}

/** Abre o mesmo modal em branco, pra cadastrar alguém que ainda não existe. */
function openNewUserModal() {
  if (!currentProfile?.administradorPortal) return;
  modoModalUsuario = 'criar';
  $('editUserId').value = '';
  $('editName').value = '';
  $('editEmail').value = '';
  $('editEmail').readOnly = false;
  $('editJob').value = '';
  $('editDepartment').value = '';
  $('editActive').value = 'true';
  $('editActive').disabled = false;
  $('novoUsuarioUsuario').value = '';
  $('novoUsuarioSenha').value = '';
  $('novoUsuarioCargoBase').value = 'Solicitante';
  $('modalUserTitle').textContent = 'Novo usuário';
  $('novoUsuarioCampos').classList.remove('hidden');
  preencherEditorPermissoes({}, false);
  preencherAreasGerenciadas([]);
  $('userModal').classList.remove('hidden');
  setTimeout(() => $('editName').focus(), 60);
}

function closeUserModal() {
  $('userModal').classList.add('hidden');
}

function lerPermissoesDoFormulario() {
  const sistemas = {};
  document.querySelectorAll('[data-permission-key]').forEach(select => {
    sistemas[select.dataset.permissionKey] = select.value;
  });
  return sistemas;
}

async function saveUser(event) {
  event.preventDefault();
  if (!currentProfile?.administradorPortal) { showToast('Ação não autorizada.', 'error'); return; }

  if (modoModalUsuario === 'criar') {
    await criarUsuario(lerPermissoesDoFormulario());
  } else {
    await salvarEdicaoUsuario(lerPermissoesDoFormulario());
  }
}

async function criarUsuario(papeisEscolhidos) {
  const nome = $('editName').value.trim();
  if (!nome) { showToast('Informe o nome completo.', 'error'); return; }

  const usuarioSlug = slugUsername($('novoUsuarioUsuario').value);
  if (usuarioSlug.length < 3) { showToast('O usuário de login precisa ter ao menos 3 caracteres.', 'error'); return; }

  const senha = $('novoUsuarioSenha').value;
  if (senha.length < SENHA_MINIMA) { showToast(`A senha precisa ter ao menos ${SENHA_MINIMA} caracteres.`, 'error'); return; }

  const roleBase = $('novoUsuarioCargoBase').value;
  const sistemas = Object.fromEntries(Object.entries(papeisEscolhidos).map(([chave, role]) => [chave, { acessar: role !== 'sem_acesso', funcao: role }]));

  $('saveUserButton').disabled = true;
  try {
    const jaExiste = await getDoc(doc(db, 'usuarios', usuarioSlug));
    if (jaExiste.exists()) {
      showToast('Já existe um usuário com esse login. Escolha outro.', 'error');
      return;
    }

    const payload = {
      nome,
      nomeCompleto: nome,
      user: usuarioSlug,
      senha,
      email: $('editEmail').value.trim(),
      cargo: $('editJob').value.trim(),
      departamento: $('editDepartment').value.trim() || roleBase,
      role: roleBase,
      label: roleBase,
      ativo: $('editActive').value === 'true',
      administradorPortal: false,
      observacao: '',
      sistemas,
      areasGerenciadas: lerAreasGerenciadasDoFormulario(),
      criadoEmIso: new Date().toISOString(),
      criadoEmBr: new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }),
      criadoEm: serverTimestamp(),
      criadoPor: currentUser.uid,
      criadoPorEmail: currentUser.email
    };

    await setDoc(doc(db, 'usuarios', usuarioSlug), payload);
    await setDoc(doc(db, 'logsAcesso', `${Date.now()}_${usuarioSlug}`), {
      usuarioAlteradoUid: usuarioSlug,
      usuarioAlteradoEmail: payload.email,
      administradorUid: currentUser.uid,
      administradorEmail: currentUser.email,
      alteracoes: { criacao: true, ...payload, senha: '••••••' },
      criadoEm: serverTimestamp()
    });

    closeUserModal();
    showToast(`Usuário "${usuarioSlug}" criado com sucesso.`, 'success');
    await loadUsers();
  } catch (error) {
    console.error(error);
    showToast('Não foi possível criar o usuário. Confira as regras do Firestore.', 'error');
  } finally {
    $('saveUserButton').disabled = false;
  }
}

async function salvarEdicaoUsuario(papeisEscolhidos) {
  const id = $('editUserId').value;
  const existing = usersCache.find(item => item.id === id);
  if (!existing) return;
  const sistemas = {};
  Object.entries(papeisEscolhidos).forEach(([chave, valor]) => {
    const role = existing.administradorPortal ? 'administrador' : valor;
    sistemas[chave] = { acessar: role !== 'sem_acesso', funcao: role };
  });

  const payload = {
    nomeCompleto: $('editName').value.trim(),
    email: $('editEmail').value.trim(),
    cargo: $('editJob').value.trim(),
    departamento: $('editDepartment').value.trim(),
    ativo: existing.administradorPortal ? true : $('editActive').value === 'true',
    sistemas,
    areasGerenciadas: lerAreasGerenciadasDoFormulario(),
    atualizadoEm: serverTimestamp(),
    atualizadoPor: currentUser.uid,
    atualizadoPorEmail: currentUser.email
  };

  $('saveUserButton').disabled = true;
  try {
    await setDoc(doc(db, existing.colecao || 'usuarios', id), payload, { merge: true });
    await setDoc(doc(db, 'logsAcesso', `${Date.now()}_${id}`), {
      usuarioAlteradoUid: id,
      usuarioAlteradoEmail: payload.email,
      administradorUid: currentUser.uid,
      administradorEmail: currentUser.email,
      alteracoes: payload,
      criadoEm: serverTimestamp()
    });
    closeUserModal();
    showToast('Permissões atualizadas com sucesso.', 'success');
    await loadUsers();
  } catch (error) {
    console.error(error);
    showToast('Não foi possível salvar as permissões.', 'error');
  } finally {
    $('saveUserButton').disabled = false;
  }
}

function requestAccess() {
  const number = PORTAL_CONFIG.corporateWhatsApp.replace(/\D/g, '');
  if (!number) {
    showToast('Configure o número corporativo no arquivo config.js.', 'error');
    return;
  }
  const permissions = SYSTEM_KEYS.map(key => `- ${PORTAL_CONFIG.systems[key].name}: ${roleLabel(currentProfile.sistemas[key])}`).join('\n');
  const message = `Olá! Gostaria de solicitar uma alteração de acesso no Portal Corporativo.\n\nNome: ${currentProfile.nomeCompleto}\nE-mail: ${currentProfile.email}\nCargo: ${currentProfile.cargo}\nDepartamento: ${currentProfile.departamento}\n\nAcessos atuais:\n${permissions}\n\nSistema solicitado:\nFunção solicitada:\nMotivo:`;
  window.open(`https://wa.me/${number}?text=${encodeURIComponent(message)}`, '_blank', 'noopener,noreferrer');
}

function showLogin() {
  encerrarSplash();
  $('loginScreen').classList.remove('hidden');
  $('appShell').classList.add('hidden');
}

function showApp() {
  $('loginScreen').classList.add('hidden');
  $('appShell').classList.remove('hidden');
}

async function handleAuthenticatedUser(perfil) {
  if (!perfil.ativo) {
    showToast('Sua conta está inativa. Procure o administrador.', 'error');
    await logout();
    showLogin();
    return;
  }

  // Pede o e-mail corporativo enquanto não houver um cadastrado no banco.
  const pronto = await garantirEmailCorporativo(perfil, { aoSair: showLogin });
  if (!pronto) return;

  salvarPerfilSessao(pronto);
  currentUser = pronto;
  currentProfile = pronto;
  showApp();
  renderProfile();
  showPage('inicio');
  encerrarSplash();
  startSessionWatch(
    remaining => $('sessionTimer').textContent = formatTime(remaining),
    () => { showLogin(); showToast('Sessão encerrada após 2 horas.', 'error'); }
  );
}

async function handleLogin(event) {
  event.preventDefault();
  $('loginButton').disabled = true;
  $('loginStatus').textContent = 'Validando acesso...';
  try {
    const perfil = await login($('loginEmail').value.trim(), $('loginPassword').value);
    $('loginStatus').textContent = '';
    $('loginPassword').value = '';
    await handleAuthenticatedUser(perfil);
  } catch (error) {
    console.error(error);
    $('loginStatus').textContent = error?.message || 'Não foi possível entrar. Verifique os dados.';
  } finally {
    $('loginButton').disabled = false;
  }
}

async function bootstrap() {
  await initializeAuthPersistence();
  $('loginForm').addEventListener('submit', handleLogin);
  $('logoutButton').addEventListener('click', async () => {
    await logout();
    currentUser = null;
    currentProfile = null;
    showLogin();
  });
  $('togglePassword').addEventListener('click', () => {
    const input = $('loginPassword');
    input.type = input.type === 'password' ? 'text' : 'password';
  });
  document.querySelectorAll('.nav-item').forEach(button => button.addEventListener('click', () => showPage(button.dataset.page)));
  $('mobileMenuButton').addEventListener('click', () => document.querySelector('.sidebar').classList.toggle('open'));
  $('requestAccessButton').addEventListener('click', requestAccess);
  $('changeEmailButton')?.addEventListener('click', async () => {
    const atualizado = await alterarEmailCorporativo(currentProfile);
    if (!atualizado) return;
    currentUser = atualizado;
    currentProfile = atualizado;
    renderProfile();
    showToast('E-mail atualizado com sucesso.', 'success');
  });
  $('refreshUsersButton').addEventListener('click', loadUsers);
  $('newUserButton').addEventListener('click', openNewUserModal);
  $('userSearch').addEventListener('input', renderUsers);
  $('statusFilter').addEventListener('change', renderUsers);
  $('closeUserModal').addEventListener('click', closeUserModal);
  $('cancelUserModal').addEventListener('click', closeUserModal);
  $('userModal').addEventListener('click', event => { if (event.target === $('userModal')) closeUserModal(); });
  $('userForm').addEventListener('submit', saveUser);
  $('changeCredentialsButton').addEventListener('click', openCredentialsModal);
  $('closeCredentialsModal').addEventListener('click', closeCredentialsModal);
  $('cancelCredentialsModal').addEventListener('click', closeCredentialsModal);
  $('credentialsForm').addEventListener('submit', saveCredentials);
  $('credentialsModal').addEventListener('click', event => {
    if (event.target === $('credentialsModal')) closeCredentialsModal();
  });

  watchAuth(async perfil => {
    if (!perfil) {
      currentUser = null;
      currentProfile = null;
      showLogin();
      return;
    }
    if (!getSessionRemainingMs()) {
      await logout();
      showLogin();
      showToast('Sua sessão expirou. Entre novamente.', 'error');
      return;
    }
    await handleAuthenticatedUser(perfil);
  });
}

bootstrap().catch(error => {
  console.error(error);
  showToast('Falha ao inicializar o portal.', 'error');
});
