/* =============================================================================
   auth-local.js — LOGIN POR USUÁRIO + SENHA  (coleção `usuarios`)
   =============================================================================

   PARA QUE SERVE
   - O login deixa de pedir "e-mail corporativo" e passa a pedir apenas o
     USUÁRIO (ex.: ademir) e a SENHA já gravados na coleção `usuarios`.
   - Depois que a pessoa entra, se ela ainda não tiver um e-mail real gravado,
     o sistema abre uma janela pedindo o e-mail corporativo e grava direto no
     Firestore, no próprio documento dela.

   COMO A AUTENTICAÇÃO FUNCIONA (duas camadas, nesta ordem)
   1) Tenta o Firebase Authentication usando o e-mail interno
      `<usuario>@fornecedores-cp.local` + a senha digitada.
      -> Se as contas existirem no Firebase Auth, este caminho é usado e as
         regras do Firestore continuam protegidas por `request.auth`.
   2) Se o Firebase Auth recusar (conta ainda não criada lá), cai para a
      validação local: lê `usuarios/{usuario}` e compara o campo `senha`.
      -> Funciona hoje, sem migrar nada, mas exige regra de leitura aberta
         na coleção `usuarios`. Veja o aviso de segurança no RELATÓRIO.

   O caminho 1 é o alvo. Rode `ferramentas/migrar-usuarios-para-auth.js` para
   criar as contas no Firebase Auth: a partir daí este mesmo arquivo passa a
   usar o caminho seguro sozinho, sem nenhuma outra alteração de código.

   ONDE MEXER
   - Domínio interno de login .................. LOGIN_DOMAIN
   - Duração da sessão ......................... SESSION_DURATION_MS
   - Domínios de e-mail aceitos ................ DOMINIOS_CORPORATIVOS
   - Obrigar domínio corporativo ............... EXIGIR_DOMINIO_CORPORATIVO
   - Permissão por cargo em cada sistema ....... SISTEMAS_POR_ROLE
============================================================================= */

import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/12.12.1/firebase-app.js";
import {
  getAuth,
  signInWithEmailAndPassword,
  updatePassword,
  signOut,
  setPersistence,
  browserSessionPersistence
} from "https://www.gstatic.com/firebasejs/12.12.1/firebase-auth.js";
import {
  getFirestore,
  doc,
  getDoc,
  updateDoc,
  collection,
  query,
  where,
  limit,
  getDocs,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.12.1/firebase-firestore.js";

/* ─── 01. CONFIGURAÇÃO ─────────────────────────────────────────────────────── */

export const FIREBASE_CONFIG = {
  apiKey: "AIzaSyCLCFRt-o5fKNbR1leUxbBbB6RljT_4_8w",
  authDomain: "fornecedores-cp.firebaseapp.com",
  projectId: "fornecedores-cp",
  storageBucket: "fornecedores-cp.firebasestorage.app",
  messagingSenderId: "282005256935",
  appId: "1:282005256935:web:df3e33036142fc434dc042",
  measurementId: "G-06DS7T6QGR"
};

export const LOGIN_DOMAIN = 'fornecedores-cp.local';
export const COLLECTION_USERS = 'usuarios';
export const COLLECTION_USERS_UID = 'usuariosUid';

export const SESSION_KEY = 'ability_portal_session_started_at';
export const PROFILE_KEY = 'ability_portal_local_profile';
export const SESSION_DURATION_MS = 2 * 60 * 60 * 1000;

export const DOMINIOS_CORPORATIVOS = ['abilitytecnologia.com.br'];
export const EXIGIR_DOMINIO_CORPORATIVO = false; // true = só aceita os domínios acima

const app = getApps().find(item => item.name === '[DEFAULT]') || initializeApp(FIREBASE_CONFIG);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const authReady = setPersistence(auth, browserSessionPersistence).catch(() => {});

/* ─── 02. PERFIS E PERMISSÕES ──────────────────────────────────────────────── */

const ROLE_PROFILES = {
  compras:     { role: 'Compras',     label: 'Compras',     full: true },
  rh:          { role: 'RH',          label: 'RH',          approval: 'plexRh' },
  sesmt:       { role: 'SESMT',       label: 'SESMT',       approval: 'plexSesmt' },
  juridico:    { role: 'Juridico',    label: 'Jurídico',    approval: 'plexJuridico' },
  diretoria:   { role: 'Diretoria',   label: 'Diretoria',   approval: 'plexDiretoria' },
  solicitante: { role: 'Solicitante', label: 'Solicitante', viewOnly: true }
};

// Permissão padrão em cada sistema conforme o cargo gravado em `usuarios.role`.
// Se o documento tiver um mapa `sistemas`, ele tem prioridade sobre esta tabela.
// IMPORTANTE: esta tabela precisa ficar igual à do módulo Tarefas (mesmo
// arquivo, mesma constante) — se ajustar aqui, ajuste lá também.
const SISTEMAS_POR_ROLE = {
  Compras:     { fornecedores: 'administrador', comparativo: 'administrador', contratos: 'administrador', tarefas: 'executor' },
  RH:          { fornecedores: 'aprovador',     comparativo: 'visualizador',  contratos: 'visualizador',  tarefas: 'solicitante' },
  SESMT:       { fornecedores: 'aprovador',     comparativo: 'visualizador',  contratos: 'visualizador',  tarefas: 'solicitante' },
  Juridico:    { fornecedores: 'aprovador',     comparativo: 'visualizador',  contratos: 'aprovador',     tarefas: 'solicitante' },
  Diretoria:   { fornecedores: 'aprovador',     comparativo: 'aprovador',     contratos: 'aprovador',     tarefas: 'solicitante' },
  Solicitante: { fornecedores: 'visualizador',  comparativo: 'visualizador',  contratos: 'visualizador',  tarefas: 'solicitante' }
};

const SEM_ACESSO = 'sem_acesso';

/* ─── 03. UTILITÁRIOS ──────────────────────────────────────────────────────── */

export const slugUsername = valor => String(valor || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .trim()
  .replace(/[^a-z0-9._-]/g, '');

export const usernameToEmail = usuario => `${slugUsername(usuario)}@${LOGIN_DOMAIN}`;

export const ehEmailValido = valor => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(valor || '').trim());

export const ehEmailInterno = valor =>
  String(valor || '').trim().toLowerCase().endsWith(`@${LOGIN_DOMAIN}`);

export const ehEmailCorporativo = valor => {
  const email = String(valor || '').trim().toLowerCase();
  if (!ehEmailValido(email) || ehEmailInterno(email)) return false;
  if (!EXIGIR_DOMINIO_CORPORATIVO) return true;
  return DOMINIOS_CORPORATIVOS.some(dominio => email.endsWith(`@${dominio.toLowerCase()}`));
};

const erro = (codigo, mensagem) => Object.assign(new Error(mensagem), { code: codigo });

const dataBr = () => new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });

function normalizarSistemas(dados = {}, role = 'Solicitante') {
  const padrao = SISTEMAS_POR_ROLE[role] || SISTEMAS_POR_ROLE.Solicitante;
  const origem = dados.sistemas || dados.acessos || null;
  const chaves = new Set([...Object.keys(padrao), ...Object.keys(origem || {})]);
  const saida = {};

  for (const chave of chaves) {
    const entrada = origem ? origem[chave] : undefined;
    if (entrada === undefined || entrada === null) {
      saida[chave] = padrao[chave] || SEM_ACESSO;
    } else if (typeof entrada === 'string') {
      saida[chave] = entrada;
    } else if (typeof entrada === 'boolean') {
      saida[chave] = entrada ? 'visualizador' : SEM_ACESSO;
    } else if (entrada.acessar === false || entrada.ativo === false) {
      saida[chave] = SEM_ACESSO;
    } else {
      saida[chave] = entrada.funcao || entrada.role || 'visualizador';
    }
  }
  return saida;
}

/**
 * Converte o documento cru da coleção `usuarios` no perfil usado pelos sistemas.
 * Mantém os campos antigos (role/label/full/viewOnly/approval) e adiciona o
 * mapa `sistemas` usado pelo Portal, Comparativo e Contratos.
 */
export function normalizarPerfil(id, dados = {}) {
  const usuario = slugUsername(dados.user || dados.usuario || id);
  const chaveRole = slugUsername(dados.role || dados.label || 'solicitante');
  const base = ROLE_PROFILES[chaveRole] || ROLE_PROFILES.solicitante;
  const emailSalvo = String(dados.email || '').trim();
  const corporativo = ehEmailCorporativo(emailSalvo) ? emailSalvo : '';
  const role = base.role;

  return {
    id,
    user: usuario,
    uid: dados.uid || `local-${usuario}`,
    nome: dados.nome || dados.nomeCompleto || base.label || usuario,
    nomeCompleto: dados.nomeCompleto || dados.nome || base.label || usuario,
    email: corporativo || emailSalvo,
    emailCorporativo: corporativo,
    emailLogin: usernameToEmail(usuario),
    cargo: dados.cargo || base.label,
    departamento: dados.departamento || 'Compras',
    role,
    label: dados.label || base.label,
    full: dados.full !== undefined ? !!dados.full : !!base.full,
    viewOnly: dados.viewOnly !== undefined ? !!dados.viewOnly : !!base.viewOnly,
    approval: dados.approval ?? base.approval ?? null,
    ativo: dados.ativo !== false,
    administradorPortal: dados.administradorPortal === true,
    portalAdmin: dados.administradorPortal === true,
    observacao: dados.observacao || '',
    sistemas: normalizarSistemas(dados, role),
    localAuth: true,
    firebaseAuth: false
  };
}

export function papelNoSistema(perfil, chave) {
  if (!perfil || perfil.ativo === false) return SEM_ACESSO;
  return perfil.sistemas?.[chave] || SEM_ACESSO;
}

export const podeAcessar = (perfil, chave) => papelNoSistema(perfil, chave) !== SEM_ACESSO;

export const podeEditar = (perfil, chave) =>
  ['editor', 'aprovador', 'administrador'].includes(papelNoSistema(perfil, chave));

export const rotuloDoPapel = papel => ({
  sem_acesso: 'Sem acesso',
  solicitante: 'Solicitante',
  visualizador: 'Visualizador',
  editor: 'Editor',
  executor: 'Executor',
  aprovador: 'Aprovador',
  administrador: 'Administrador'
}[papel] || 'Sem acesso');

/* ─── 04. SESSÃO ───────────────────────────────────────────────────────────── */

let vigiaSessaoTimer = null;

export function salvarPerfilSessao(perfil) {
  try { sessionStorage.setItem(PROFILE_KEY, JSON.stringify(perfil)); } catch {}
}

export function getPerfilSessao() {
  try { return JSON.parse(sessionStorage.getItem(PROFILE_KEY) || 'null'); } catch { return null; }
}

export function sessaoRestanteMs() {
  const inicio = Number(sessionStorage.getItem(SESSION_KEY) || 0);
  return inicio ? Math.max(0, SESSION_DURATION_MS - (Date.now() - inicio)) : 0;
}

function iniciarSessao(perfil) {
  sessionStorage.setItem(SESSION_KEY, String(Date.now()));
  salvarPerfilSessao(perfil);
}

export async function logoutLocal() {
  clearInterval(vigiaSessaoTimer);
  vigiaSessaoTimer = null;
  sessionStorage.removeItem(SESSION_KEY);
  sessionStorage.removeItem(PROFILE_KEY);
  await signOut(auth).catch(() => {});
}

/** Devolve o perfil da sessão atual, ou null se não houver sessão válida. */
export function restaurarSessao() {
  const perfil = getPerfilSessao();
  if (!perfil) return null;
  if (sessaoRestanteMs() <= 0) {
    sessionStorage.removeItem(SESSION_KEY);
    sessionStorage.removeItem(PROFILE_KEY);
    return null;
  }
  return perfil;
}

export function vigiarSessao(aoAtualizar, aoExpirar) {
  clearInterval(vigiaSessaoTimer);
  const conferir = async () => {
    const restante = sessaoRestanteMs();
    aoAtualizar?.(restante);
    if (restante > 0) return;
    clearInterval(vigiaSessaoTimer);
    vigiaSessaoTimer = null;
    await logoutLocal();
    aoExpirar?.();
  };
  conferir();
  vigiaSessaoTimer = setInterval(conferir, 1000);
}

/* ─── 05. LOGIN ────────────────────────────────────────────────────────────── */

async function buscarRegistroUsuario(usuario, contaFirebase) {
  const candidatos = [
    [COLLECTION_USERS, usuario],
    [COLLECTION_USERS_UID, contaFirebase?.uid],
    [COLLECTION_USERS, contaFirebase?.uid]
  ];

  let bloqueadoPorRegra = false;

  for (const [colecao, id] of candidatos) {
    if (!id) continue;
    try {
      const snap = await getDoc(doc(db, colecao, id));
      if (snap.exists()) return { id: snap.id, colecao, data: snap.data(), achadoPorId: colecao === COLLECTION_USERS && id === usuario };
    } catch (err) {
      if (err?.code === 'permission-denied') bloqueadoPorRegra = true;
      console.warn(`Falha ao consultar ${colecao}/${id}`, err);
    }
  }

  // Último recurso: procura pelo campo `user` (documento com id diferente do usuário).
  try {
    const busca = await getDocs(query(
      collection(db, COLLECTION_USERS),
      where('user', '==', usuario),
      limit(1)
    ));
    if (!busca.empty) {
      const achado = busca.docs[0];
      return { id: achado.id, colecao: COLLECTION_USERS, data: achado.data(), achadoPorId: false };
    }
  } catch (err) {
    if (err?.code === 'permission-denied') bloqueadoPorRegra = true;
    console.warn('Falha ao procurar o usuário pelo campo user', err);
  }

  if (bloqueadoPorRegra) {
    throw erro(
      'regras-firestore',
      'O banco recusou a leitura da coleção usuarios. Publique as regras do arquivo firestore.rules.'
    );
  }
  return null;
}

/**
 * Autentica pelo nome de usuário. Aceita também o e-mail interno completo
 * (ademir@fornecedores-cp.local), usando só a parte antes do @.
 */
export async function loginComUsuario(entrada, senha) {
  await authReady;

  const bruto = String(entrada || '').trim();
  const usuario = slugUsername(bruto.includes('@') ? bruto.split('@')[0] : bruto);
  const senhaInformada = String(senha ?? '');

  if (!usuario) throw erro('usuario-invalido', 'Informe o seu usuário de acesso.');
  if (!senhaInformada) throw erro('senha-vazia', 'Informe a sua senha.');

  // Camada 1 — Firebase Authentication com o e-mail interno.
  let contaFirebase = null;
  try {
    const credencial = await signInWithEmailAndPassword(auth, usernameToEmail(usuario), senhaInformada);
    contaFirebase = credencial.user;
  } catch (err) {
    if (err?.code === 'auth/too-many-requests') {
      throw erro('bloqueado', 'Muitas tentativas seguidas. Aguarde alguns minutos e tente de novo.');
    }
    // Qualquer outro erro cai para a camada 2.
  }

  // Camada 2 — perfil e validação pelo Firestore.
  const registro = await buscarRegistroUsuario(usuario, contaFirebase);
  if (!registro) {
    await signOut(auth).catch(() => {});
    throw erro('usuario-nao-encontrado', 'Usuário ou senha inválidos.');
  }

  const dados = registro.data;

  // Se a pessoa trocou o nome de usuário, o id do documento continua o antigo.
  // Sem esta conferência, o usuário antigo continuaria funcionando para entrar.
  if (registro.achadoPorId && dados.user && slugUsername(dados.user) !== usuario) {
    await signOut(auth).catch(() => {});
    throw erro('usuario-nao-encontrado', 'Usuário ou senha inválidos.');
  }

  if (dados.ativo === false) {
    await signOut(auth).catch(() => {});
    throw erro('usuario-inativo', 'Seu acesso está inativo. Procure a equipe de Compras.');
  }

  if (!contaFirebase) {
    const senhaBanco = String(dados.senha ?? '');
    if (!senhaBanco) throw erro('sem-senha', 'Este usuário ainda não possui senha cadastrada.');
    if (senhaBanco !== senhaInformada) throw erro('senha-invalida', 'Usuário ou senha inválidos.');
  }

  const perfil = normalizarPerfil(registro.id, dados);
  perfil.colecao = registro.colecao;
  if (contaFirebase) {
    perfil.uid = contaFirebase.uid;
    perfil.firebaseAuth = true;
    perfil.localAuth = false;
  }

  iniciarSessao(perfil);
  return perfil;
}

/* ─── 06. E-MAIL CORPORATIVO ───────────────────────────────────────────────── */

export const precisaDefinirEmail = perfil => !perfil?.emailCorporativo;

/** Grava o e-mail informado direto no documento do usuário no Firestore. */
export async function salvarEmailCorporativo(perfil, emailBruto) {
  const email = String(emailBruto || '').trim().toLowerCase();

  if (!ehEmailValido(email)) throw erro('email-invalido', 'Digite um e-mail válido (exemplo: nome@empresa.com.br).');
  if (ehEmailInterno(email)) throw erro('email-interno', 'Este é o e-mail interno do sistema. Informe o seu e-mail corporativo real.');
  if (EXIGIR_DOMINIO_CORPORATIVO && !ehEmailCorporativo(email)) {
    throw erro('email-dominio', `Use um e-mail dos domínios: ${DOMINIOS_CORPORATIVOS.join(', ')}.`);
  }

  // Confere se o e-mail já pertence a outra pessoa (não bloqueia se a regra impedir a busca).
  try {
    const busca = await getDocs(query(collection(db, COLLECTION_USERS), where('email', '==', email), limit(2)));
    const conflito = busca.docs.find(item => item.id !== perfil.id);
    if (conflito) throw erro('email-duplicado', 'Este e-mail já está vinculado a outro usuário.');
  } catch (err) {
    if (err?.code === 'email-duplicado') throw err;
    console.warn('Não foi possível conferir e-mails duplicados', err);
  }

  await updateDoc(doc(db, perfil.colecao || COLLECTION_USERS, perfil.id), {
    email,
    emailCorporativo: email,
    emailLogin: perfil.emailLogin || usernameToEmail(perfil.user),
    emailAtualizadoEmIso: new Date().toISOString(),
    emailAtualizadoEmBr: dataBr(),
    emailAtualizadoEm: serverTimestamp(),
    atualizadoPor: perfil.user
  });

  const atualizado = { ...perfil, email, emailCorporativo: email };
  salvarPerfilSessao(atualizado);
  return atualizado;
}

/* ─── 07. JANELA DE CADASTRO DO E-MAIL ─────────────────────────────────────── */

const MODAL_CSS = `
.alc-overlay{position:fixed;inset:0;z-index:9999;display:grid;place-items:center;padding:20px;
  background:rgba(6,12,24,.78);backdrop-filter:blur(3px);font-family:Inter,Segoe UI,Arial,sans-serif}
.alc-card{width:min(460px,100%);background:#fff;color:#12203a;border-radius:20px;padding:28px;
  box-shadow:0 30px 70px rgba(4,10,22,.45);animation:alc-in .18s ease-out}
@keyframes alc-in{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
.alc-badge{width:52px;height:52px;border-radius:16px;display:grid;place-items:center;font-size:24px;
  background:linear-gradient(135deg,#2563eb,#4f46e5);color:#fff;margin-bottom:16px}
.alc-card h2{margin:0 0 8px;font-size:22px;line-height:1.25}
.alc-card p.alc-sub{margin:0 0 20px;font-size:13px;line-height:1.6;color:#64748b}
.alc-label{display:block;font-size:12px;font-weight:800;color:#42526a;margin-bottom:7px}
.alc-input{width:100%;padding:13px 14px;border-radius:12px;border:1px solid #dfe6ef;background:#fff;
  color:#12203a;font-size:15px;outline:none;box-sizing:border-box}
.alc-input:focus{border-color:#7aa2ff;box-shadow:0 0 0 4px rgba(37,99,235,.12)}
.alc-erro{min-height:18px;margin:9px 0 0;font-size:12.5px;color:#dc2626;font-weight:600}
.alc-info{margin-top:16px;padding:12px 14px;border-radius:12px;background:#f1f5ff;color:#4a5f80;
  font-size:11.5px;line-height:1.55}
.alc-acoes{display:flex;gap:10px;margin-top:20px}
.alc-btn{flex:1;border:0;border-radius:12px;padding:13px 16px;font-weight:800;font-size:14px;cursor:pointer;
  transition:.18s;font-family:inherit}
.alc-btn-primario{background:linear-gradient(135deg,#2563eb,#4f46e5);color:#fff;
  box-shadow:0 10px 24px rgba(37,99,235,.28)}
.alc-btn-primario:hover:not(:disabled){transform:translateY(-1px)}
.alc-btn-primario:disabled{opacity:.6;cursor:wait;transform:none}
.alc-btn-neutro{flex:0 0 auto;background:#eef2f8;color:#41546f}
@media(max-width:520px){.alc-card{padding:22px;border-radius:16px}.alc-acoes{flex-direction:column-reverse}}
`;

function garantirCss() {
  if (document.getElementById('alc-estilos')) return;
  const tag = document.createElement('style');
  tag.id = 'alc-estilos';
  tag.textContent = MODAL_CSS;
  document.head.appendChild(tag);
}

const escapar = valor => String(valor ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

/**
 * Abre a janela pedindo o e-mail corporativo e grava no Firestore.
 * Resolve com o perfil atualizado, ou com `null` se a pessoa optar por sair.
 */
export function pedirEmailCorporativo(perfil, opcoes = {}) {
  garantirCss();

  return new Promise(resolve => {
    const overlay = document.createElement('div');
    overlay.className = 'alc-overlay';
    overlay.innerHTML = `
      <div class="alc-card" role="dialog" aria-modal="true" aria-labelledby="alcTitulo">
        <div class="alc-badge">✉️</div>
        <h2 id="alcTitulo">Confirme o seu e-mail</h2>
        <p class="alc-sub">
          Olá, <strong>${escapar(perfil.nome || perfil.user)}</strong>. Para continuar, cadastre o
          e-mail corporativo que você usa no dia a dia. Ele fica gravado no seu perfil e passa a ser
          usado nas cotações e notificações.
        </p>
        <label class="alc-label" for="alcEmail">E-mail corporativo</label>
        <input class="alc-input" id="alcEmail" type="email" inputmode="email"
               autocomplete="email" placeholder="nome.sobrenome@abilitytecnologia.com.br" />
        <p class="alc-erro" id="alcErro"></p>
        <div class="alc-info">
          O seu login continua sendo <strong>${escapar(perfil.user)}</strong> com a mesma senha.
          O e-mail serve apenas para contato e não altera a forma de entrar.
        </div>
        <div class="alc-acoes">
          <button class="alc-btn alc-btn-neutro" id="alcSair" type="button">Sair</button>
          <button class="alc-btn alc-btn-primario" id="alcSalvar" type="button">Salvar e continuar</button>
        </div>
      </div>`;

    document.body.appendChild(overlay);

    const campo = overlay.querySelector('#alcEmail');
    const aviso = overlay.querySelector('#alcErro');
    const botaoSalvar = overlay.querySelector('#alcSalvar');
    const botaoSair = overlay.querySelector('#alcSair');

    setTimeout(() => campo.focus(), 60);

    const fechar = valor => { overlay.remove(); resolve(valor); };

    const salvar = async () => {
      aviso.textContent = '';
      botaoSalvar.disabled = true;
      botaoSalvar.textContent = 'Salvando...';
      try {
        const atualizado = await salvarEmailCorporativo(perfil, campo.value);
        fechar(atualizado);
      } catch (err) {
        console.error(err);
        aviso.textContent = err?.code === 'permission-denied'
          ? 'O banco recusou a gravação. Publique as regras do arquivo firestore.rules.'
          : (err?.message || 'Não foi possível salvar o e-mail. Tente novamente.');
        botaoSalvar.disabled = false;
        botaoSalvar.textContent = 'Salvar e continuar';
      }
    };

    botaoSalvar.addEventListener('click', salvar);
    campo.addEventListener('keydown', evento => { if (evento.key === 'Enter') salvar(); });
    botaoSair.addEventListener('click', async () => {
      await logoutLocal();
      opcoes.aoSair?.();
      fechar(null);
    });
  });
}

/**
 * Ponto de entrada usado pelos sistemas: devolve o perfil pronto para uso,
 * pedindo o e-mail antes se ainda não houver um cadastrado.
 */
export async function garantirEmailCorporativo(perfil, opcoes = {}) {
  if (!precisaDefinirEmail(perfil)) return perfil;
  return pedirEmailCorporativo(perfil, opcoes);
}

/** Abre a mesma janela a pedido do usuário, para trocar um e-mail já cadastrado. */
export function alterarEmailCorporativo(perfil) {
  return pedirEmailCorporativo(perfil, {});
}

/* ─── 08. ALTERAR USUÁRIO E SENHA (autoatendimento) ────────────────────────
   O id do documento NÃO muda quando a pessoa troca de usuário. O que muda é o
   campo `user`, e o login já sabe procurar por ele. Isso evita ter que criar e
   apagar documentos, o que exigiria abrir permissão de exclusão na coleção —
   um risco desnecessário enquanto o modo local estiver ativo.
   ────────────────────────────────────────────────────────────────────────── */

export const SENHA_MINIMA = 6;

/** Confere se o nome de usuário já pertence a outra pessoa. */
export async function usuarioDisponivel(novoUsuario, perfil) {
  const alvo = slugUsername(novoUsuario);
  if (!alvo) return false;

  try {
    const porId = await getDoc(doc(db, COLLECTION_USERS, alvo));
    if (porId.exists() && porId.id !== perfil.id) return false;
  } catch {}

  try {
    const busca = await getDocs(query(
      collection(db, COLLECTION_USERS),
      where('user', '==', alvo),
      limit(2)
    ));
    if (busca.docs.some(item => item.id !== perfil.id)) return false;
  } catch (err) {
    console.warn('Não foi possível conferir usuários duplicados', err);
  }
  return true;
}

/**
 * Grava novo usuário e/ou nova senha no Firestore.
 * Exige a senha atual como confirmação. Se a conta já existir no Firebase
 * Authentication, a senha é trocada lá também.
 */
export async function alterarCredenciais(perfil, { senhaAtual, novoUsuario, novaSenha, confirmarSenha } = {}) {
  const registro = await getDoc(doc(db, perfil.colecao || COLLECTION_USERS, perfil.id));
  if (!registro.exists()) throw erro('sem-registro', 'Não encontrei o seu cadastro no banco.');
  const dados = registro.data();

  // Confere a senha atual. Em contas já migradas, o campo `senha` pode não
  // existir mais; nesse caso a confirmação é feita pelo próprio Firebase.
  const senhaGravada = String(dados.senha ?? '');
  if (senhaGravada) {
    if (String(senhaAtual ?? '') !== senhaGravada) {
      throw erro('senha-atual', 'A senha atual está incorreta.');
    }
  } else if (perfil.firebaseAuth) {
    try {
      await signInWithEmailAndPassword(auth, usernameToEmail(perfil.user), String(senhaAtual ?? ''));
    } catch {
      throw erro('senha-atual', 'A senha atual está incorreta.');
    }
  }

  const alteracoes = {};
  const usuarioLimpo = slugUsername(novoUsuario);
  let usuarioFinal = perfil.user;

  if (usuarioLimpo && usuarioLimpo !== perfil.user) {
    if (usuarioLimpo.length < 3) throw erro('usuario-curto', 'O usuário precisa ter ao menos 3 caracteres.');
    if (!(await usuarioDisponivel(usuarioLimpo, perfil))) {
      throw erro('usuario-em-uso', 'Este nome de usuário já está em uso.');
    }
    alteracoes.user = usuarioLimpo;
    usuarioFinal = usuarioLimpo;
  }

  if (novaSenha) {
    const senha = String(novaSenha);
    if (senha.length < SENHA_MINIMA) {
      throw erro('senha-curta', `A nova senha precisa ter ao menos ${SENHA_MINIMA} caracteres.`);
    }
    if (senha !== String(confirmarSenha ?? '')) {
      throw erro('senha-diferente', 'A confirmação não confere com a nova senha.');
    }
    if (senha === senhaGravada) {
      throw erro('senha-igual', 'A nova senha precisa ser diferente da atual.');
    }
    alteracoes.senha = senha;
  }

  if (!Object.keys(alteracoes).length) {
    throw erro('nada-mudou', 'Nenhuma alteração foi informada.');
  }

  // Se a conta existe no Firebase Auth, a senha precisa mudar lá também,
  // senão o login passaria a divergir entre os dois lugares.
  if (alteracoes.senha && perfil.firebaseAuth && auth.currentUser) {
    try {
      await updatePassword(auth.currentUser, alteracoes.senha);
    } catch (err) {
      throw erro('firebase-senha',
        'Não consegui atualizar a senha no Firebase Authentication. Saia, entre de novo e tente outra vez.');
    }
  }

  await updateDoc(doc(db, perfil.colecao || COLLECTION_USERS, perfil.id), {
    ...alteracoes,
    credenciaisAtualizadasEmIso: new Date().toISOString(),
    credenciaisAtualizadasEmBr: dataBr(),
    credenciaisAtualizadasEm: serverTimestamp(),
    atualizadoPor: perfil.user
  });

  const atualizado = {
    ...perfil,
    user: usuarioFinal,
    emailLogin: usernameToEmail(usuarioFinal)
  };
  salvarPerfilSessao(atualizado);

  return {
    perfil: atualizado,
    trocouUsuario: !!alteracoes.user,
    trocouSenha: !!alteracoes.senha,
    avisoFirebase: !!(alteracoes.user && perfil.firebaseAuth)
  };
}

/* ─── 09. TRANSIÇÃO ENTRE SISTEMAS (entrada única pelo Portal) ──────────────
   Quando os sistemas são abertos pelo Portal, as reescritas do vercel.json
   servem tudo pelo MESMO domínio (portal-compras-flax.vercel.app/fornecedores/).
   Como o sessionStorage é por domínio, a sessão criada no Portal já vale lá
   dentro — ninguém precisa logar de novo.

   O que este bloco faz é cobrir o intervalo entre clicar no card e o sistema
   de destino terminar de montar a tela, mostrando uma tela de carregamento em
   vez de um piscar da tela de login.
   ────────────────────────────────────────────────────────────────────────── */

export const TRANSICAO_KEY = 'ability_portal_transicao';
const TRANSICAO_VALIDADE_MS = 30 * 1000;
const SPLASH_LIMITE_MS = 15 * 1000;

/** Registra que a próxima página aberta veio do Portal. */
export function marcarTransicao(dados = {}) {
  try {
    sessionStorage.setItem(TRANSICAO_KEY, JSON.stringify({ ...dados, em: Date.now() }));
  } catch {}
}

/** Lê a marca de transição, se ainda for recente. */
export function lerTransicao() {
  try {
    const bruto = sessionStorage.getItem(TRANSICAO_KEY);
    if (!bruto) return null;
    const dados = JSON.parse(bruto);
    if (!dados?.em || Date.now() - dados.em > TRANSICAO_VALIDADE_MS) {
      sessionStorage.removeItem(TRANSICAO_KEY);
      return null;
    }
    return dados;
  } catch { return null; }
}

export function limparTransicao() {
  try { sessionStorage.removeItem(TRANSICAO_KEY); } catch {}
}

const SPLASH_CSS = `
.alc-splash{position:fixed;inset:0;z-index:10000;display:flex;flex-direction:column;
  align-items:center;justify-content:center;gap:26px;padding:24px;
  background:linear-gradient(160deg,#07101f,#101c30 55%,#0b1526);color:#fff;
  font-family:Inter,Segoe UI,Arial,sans-serif;animation:alc-fade .2s ease-out}
@keyframes alc-fade{from{opacity:0}to{opacity:1}}
.alc-splash.alc-saindo{animation:alc-fade-out .28s ease-in forwards}
@keyframes alc-fade-out{to{opacity:0;visibility:hidden}}
.alc-splash-marca{width:70px;height:70px;border-radius:22px;display:grid;place-items:center;
  font-size:30px;background:linear-gradient(135deg,#3976f6,#725cf6);
  box-shadow:0 18px 40px rgba(37,99,235,.4)}
.alc-splash h2{margin:0;font-size:23px;font-weight:800;text-align:center}
.alc-splash .alc-splash-de{margin:0;font-size:12px;letter-spacing:.16em;font-weight:800;color:#78a3ff}
.alc-splash-barra{width:min(300px,80vw);height:5px;border-radius:99px;background:rgba(255,255,255,.13);overflow:hidden}
.alc-splash-barra i{display:block;height:100%;width:38%;border-radius:99px;
  background:linear-gradient(90deg,#3976f6,#8b7cff);animation:alc-desliza 1.15s ease-in-out infinite}
@keyframes alc-desliza{0%{transform:translateX(-100%)}100%{transform:translateX(340%)}}
.alc-splash-etapas{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:10px;
  width:min(300px,80vw)}
.alc-splash-etapas li{display:flex;align-items:center;gap:11px;font-size:13px;color:#7f92ad;transition:.25s}
.alc-splash-etapas li.alc-ativa{color:#e6edf8}
.alc-splash-etapas li.alc-pronta{color:#59c99a}
.alc-splash-etapas b{width:18px;height:18px;border-radius:50%;border:2px solid currentColor;
  display:grid;place-items:center;font-size:10px;font-weight:900;flex:0 0 auto}
.alc-splash-usuario{font-size:12px;color:#8ea0b9;text-align:center}
.alc-splash-erro{margin:0;font-size:13px;color:#ffb4b4;text-align:center;max-width:340px;line-height:1.55}
.alc-splash-btn{border:0;border-radius:12px;padding:11px 20px;font-weight:800;font-size:13px;cursor:pointer;
  background:rgba(255,255,255,.12);color:#fff;font-family:inherit}
`;

function garantirSplashCss() {
  if (document.getElementById('alc-estilos-splash')) return;
  const tag = document.createElement('style');
  tag.id = 'alc-estilos-splash';
  tag.textContent = SPLASH_CSS;
  document.head.appendChild(tag);
}

let splashAtual = null;

/**
 * Mostra a tela de carregamento. Devolve um controle com:
 *   .etapa(indice)  → marca as etapas anteriores como concluídas
 *   .erro(texto)    → troca por uma mensagem com botão de voltar
 *   .fechar()       → some com a tela
 */
export function mostrarSplash({ titulo = 'Abrindo sistema', origem = 'PORTAL DE COMPRAS', icone = '◫', usuario = '', etapas = [] } = {}) {
  garantirSplashCss();
  splashAtual?.fechar();

  const tela = document.createElement('div');
  tela.className = 'alc-splash';
  tela.setAttribute('role', 'status');
  tela.setAttribute('aria-live', 'polite');
  tela.innerHTML = `
    <div class="alc-splash-marca">${escapar(icone)}</div>
    <div style="text-align:center;display:grid;gap:7px">
      <p class="alc-splash-de">${escapar(origem)}</p>
      <h2>${escapar(titulo)}</h2>
    </div>
    <div class="alc-splash-barra"><i></i></div>
    <ul class="alc-splash-etapas">
      ${etapas.map((texto, i) => `<li data-etapa="${i}" class="${i === 0 ? 'alc-ativa' : ''}"><b>${i + 1}</b><span>${escapar(texto)}</span></li>`).join('')}
    </ul>
    ${usuario ? `<p class="alc-splash-usuario">Conectado como <strong>${escapar(usuario)}</strong></p>` : ''}`;

  document.body.appendChild(tela);

  // Trava de segurança: a tela nunca fica presa para sempre.
  const trava = setTimeout(() => controle.erro('O sistema está demorando mais que o esperado.'), SPLASH_LIMITE_MS);

  const controle = {
    elemento: tela,
    etapa(indice) {
      tela.querySelectorAll('[data-etapa]').forEach(item => {
        const i = Number(item.dataset.etapa);
        item.classList.toggle('alc-pronta', i < indice);
        item.classList.toggle('alc-ativa', i === indice);
        if (i < indice) { const marca = item.querySelector('b'); if (marca) marca.textContent = '✓'; }
      });
    },
    erro(mensagem) {
      clearTimeout(trava);
      tela.innerHTML = `
        <div class="alc-splash-marca">⚠️</div>
        <h2>Não foi possível abrir</h2>
        <p class="alc-splash-erro">${escapar(mensagem)}</p>
        <button class="alc-splash-btn" type="button">Voltar ao Portal</button>`;
      tela.querySelector('button')?.addEventListener('click', () => {
        window.location.assign('/');
      });
    },
    fechar() {
      clearTimeout(trava);
      tela.classList.add('alc-saindo');
      setTimeout(() => tela.remove(), 300);
      if (splashAtual === controle) splashAtual = null;
    }
  };

  splashAtual = controle;
  return controle;
}

export function encerrarSplash() {
  limparTransicao();
  splashAtual?.fechar();
}

/**
 * Chamado logo no começo de cada sistema de destino.
 * Se a página foi aberta pelo Portal e existe sessão válida, mostra a tela de
 * carregamento na hora, evitando o piscar da tela de login.
 */
export function iniciarSplashDeEntrada(configuracao = {}) {
  const transicao = lerTransicao();
  if (!transicao) return null;
  if (sessaoRestanteMs() <= 0) { limparTransicao(); return null; }

  const perfil = getPerfilSessao();
  const controle = mostrarSplash({
    titulo: transicao.nome || configuracao.titulo || 'Abrindo sistema',
    icone: transicao.icone || configuracao.icone || '◫',
    usuario: perfil?.nome || perfil?.user || '',
    etapas: ['Validando a sua sessão', 'Carregando permissões', 'Montando a tela']
  });
  controle.etapa(1);
  return controle;
}

/**
 * Usado pelo Portal ao clicar num sistema: confere a sessão, mostra a tela de
 * carregamento e navega. Mantém o mesmo domínio sempre que possível, porque é
 * isso que permite entrar sem logar de novo.
 */
export async function abrirSistema({ chave, nome, icone = '◫', url, urlDireta, hostsDoPortal = [] }) {
  const perfil = restaurarSessao();

  const mesmoDominio = hostsDoPortal.length === 0
    || hostsDoPortal.includes(window.location.hostname)
    || window.location.hostname === 'localhost';

  const destino = mesmoDominio && url ? url : (urlDireta || url);

  const controle = mostrarSplash({
    titulo: nome || 'Abrindo sistema',
    icone,
    usuario: perfil?.nome || perfil?.user || '',
    etapas: ['Validando a sua sessão', 'Conferindo as permissões', `Abrindo ${nome || 'o sistema'}`]
  });

  if (!perfil || sessaoRestanteMs() <= 0) {
    controle.erro('A sua sessão expirou. Entre novamente no Portal.');
    return false;
  }

  await new Promise(r => setTimeout(r, 260));
  controle.etapa(1);

  if (!podeAcessar(perfil, chave)) {
    controle.erro(`O seu perfil não tem acesso a ${nome || 'este sistema'}.`);
    return false;
  }

  // Renova a marca de sessão e avisa o destino de que a entrada veio do Portal.
  salvarPerfilSessao(perfil);
  marcarTransicao({ chave, nome, icone });

  await new Promise(r => setTimeout(r, 260));
  controle.etapa(2);

  if (!mesmoDominio) {
    controle.etapa(2);
    // Domínio diferente = sessionStorage diferente, então o destino vai pedir login.
    console.warn('Abrindo por domínio próprio: o sistema de destino vai pedir login.');
  }

  await new Promise(r => setTimeout(r, 320));
  window.location.assign(destino);
  return true;
}
