import { db } from './firebase.js';
import {
  restaurarSessao,
  vigiarSessao,
  logoutLocal,
  iniciarSplashDeEntrada,
  encerrarSplash,
  podeAcessar,
  podeEditar,
  COLLECTION_USERS
} from './auth-local.js';
import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  getDocs,
  serverTimestamp,
  query,
  orderBy
} from "https://www.gstatic.com/firebasejs/12.12.1/firebase-firestore.js";

const $ = id => document.getElementById(id);
const CHAVE_SISTEMA = 'tarefas';
const COLLECTION_TAREFAS = 'tarefas';

// URL real do Portal. Quando o Tarefas é aberto direto por este domínio (sem
// passar pelo Portal), não existe sessão — e mandar para "/" aqui reabriria
// esta mesma página, travando em loop. Por isso o redirecionamento de saída
// sempre aponta para o Portal, nunca para uma rota relativa.
const PORTAL_URL = 'https://portal-compras-flax.vercel.app/';
const irParaPortal = () => window.location.assign(PORTAL_URL);

const PRIORIDADE_LABEL = { baixa: 'Baixa', media: 'Média', alta: 'Alta', urgente: 'Urgente' };
const STATUS_LABEL = { nao_iniciada: 'Não iniciada', em_andamento: 'Em andamento', concluida: 'Concluída' };
const PRIORIDADE_ORDEM = ['urgente', 'alta', 'media', 'baixa'];

let perfil = null;
let podeEditarTarefas = false;
let tarefas = [];
let usuarios = [];
let etapasEmEdicao = [];
let sistemasEmEdicao = [];
let tarefaSelecionadaId = null;
let toastTimer = null;
let pararEscuta = null;

/* ─── Utilidades ─────────────────────────────────────────────────────────── */

function showToast(message, type = '') {
  const toast = $('toast');
  toast.textContent = message;
  toast.className = `toast show ${type}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.className = 'toast', 3500);
}

function hojeStr() {
  const partes = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).formatToParts(new Date());
  const mapa = Object.fromEntries(partes.map(p => [p.type, p.value]));
  return `${mapa.year}-${mapa.month}-${mapa.day}`;
}

function diasEntre(dataIso, referenciaIso) {
  const a = new Date(`${dataIso}T00:00:00`);
  const b = new Date(`${referenciaIso}T00:00:00`);
  return Math.round((a - b) / 86400000);
}

function formatarDataBr(iso) {
  if (!iso) return '—';
  const [ano, mes, dia] = iso.split('-');
  return `${dia}/${mes}/${ano}`;
}

function escapar(valor) {
  return String(valor ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function calcularPercentual(tarefa) {
  if (Array.isArray(tarefa.etapas) && tarefa.etapas.length) {
    const concluidas = tarefa.etapas.filter(e => e.concluida).length;
    return Math.round((concluidas / tarefa.etapas.length) * 100);
  }
  if (tarefa.status === 'concluida') return 100;
  if (tarefa.status === 'em_andamento') return 50;
  return 0;
}

function statusPrazo(tarefa, hoje) {
  if (!tarefa.prazoInformado || tarefa.status === 'concluida') return null;
  const diff = diasEntre(tarefa.prazoInformado, hoje);
  if (diff < 0) return 'estourado';
  if (diff <= 2) return 'perto';
  return 'ok';
}

function estaAtrasada(tarefa, hoje) {
  return statusPrazo(tarefa, hoje) === 'estourado';
}

/* ─── Carregamento de dados ──────────────────────────────────────────────── */

async function carregarUsuarios() {
  try {
    const snap = await getDocs(collection(db, COLLECTION_USERS));
    usuarios = snap.docs
      .map(d => ({ id: d.id, nome: d.data().nome || d.data().nomeCompleto || d.id, ativo: d.data().ativo !== false }))
      .filter(u => u.ativo)
      .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  } catch (err) {
    console.warn('Não foi possível carregar os usuários solicitantes.', err);
    usuarios = [];
  }
  preencherSelectSolicitantes();
}

function preencherSelectSolicitantes() {
  const select = $('taskSolicitante');
  select.innerHTML = '<option value="">Selecione ou digite abaixo</option>' +
    usuarios.map(u => `<option value="${u.id}">${escapar(u.nome)}</option>`).join('');
}

function escutarTarefas() {
  const q = query(collection(db, COLLECTION_TAREFAS), orderBy('criadoEmIso', 'desc'));
  pararEscuta = onSnapshot(q, snap => {
    tarefas = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderTudo();
  }, err => {
    console.error(err);
    showToast('Não foi possível carregar as tarefas. Confira as regras do Firestore.', 'error');
  });
}

/* ─── Render: quadro (kanban) ────────────────────────────────────────────── */

function tarefasFiltradas() {
  const termo = $('taskSearch').value.trim().toLowerCase();
  const prioridade = $('priorityFilter').value;
  const solicitante = $('requesterFilter').value;

  return tarefas.filter(t => {
    if (prioridade !== 'all' && t.prioridade !== prioridade) return false;
    if (solicitante !== 'all' && (t.solicitanteNome || '') !== solicitante) return false;
    if (termo) {
      const alvo = [t.titulo, t.solicitanteNome, ...(t.sistemas || [])].join(' ').toLowerCase();
      if (!alvo.includes(termo)) return false;
    }
    return true;
  });
}

function preencherFiltroSolicitantes() {
  const select = $('requesterFilter');
  const atual = select.value;
  const nomes = [...new Set(tarefas.map(t => t.solicitanteNome).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  select.innerHTML = '<option value="all">Todos os solicitantes</option>' +
    nomes.map(n => `<option value="${escapar(n)}">${escapar(n)}</option>`).join('');
  if (nomes.includes(atual)) select.value = atual;
}

function badgePrioridade(prioridade) {
  return `<span class="badge badge-${prioridade}">${PRIORIDADE_LABEL[prioridade] || '—'}</span>`;
}

function badgePrazo(tarefa, hoje) {
  const situacao = statusPrazo(tarefa, hoje);
  if (!situacao) return '';
  const texto = situacao === 'estourado' ? `Atrasada (${formatarDataBr(tarefa.prazoInformado)})`
    : situacao === 'perto' ? `Vence ${formatarDataBr(tarefa.prazoInformado)}`
    : `Prazo ${formatarDataBr(tarefa.prazoInformado)}`;
  return `<span class="badge badge-prazo-${situacao}">${texto}</span>`;
}

function cardTarefaHtml(tarefa, hoje) {
  const pct = calcularPercentual(tarefa);
  const atrasada = estaAtrasada(tarefa, hoje);
  return `
    <article class="task-card ${atrasada ? 'overdue' : ''}" data-task-id="${tarefa.id}">
      <div class="task-card-top">
        <h4>${escapar(tarefa.titulo)}</h4>
      </div>
      <div class="task-card-meta">
        ${badgePrioridade(tarefa.prioridade)}
        ${badgePrazo(tarefa, hoje)}
      </div>
      <div class="progress-row">
        <div class="progress-track" style="flex:1"><div class="progress-fill" style="width:${pct}%"></div></div>
        <small>${pct}%</small>
      </div>
      <div class="task-card-foot">
        <div class="task-requester">👤 <span>${escapar(tarefa.solicitanteNome || 'Sem solicitante')}</span></div>
      </div>
    </article>`;
}

function renderKanban() {
  const hoje = hojeStr();
  const grupos = { nao_iniciada: [], em_andamento: [], atrasada: [], concluida: [] };

  tarefasFiltradas().forEach(t => {
    if (t.status !== 'concluida' && estaAtrasada(t, hoje)) grupos.atrasada.push(t);
    else grupos[t.status]?.push(t);
  });

  const colunas = [
    { chave: 'nao_iniciada', titulo: 'Não iniciada' },
    { chave: 'em_andamento', titulo: 'Em andamento' },
    { chave: 'atrasada', titulo: 'Atrasada' },
    { chave: 'concluida', titulo: 'Concluída' }
  ];

  $('kanban').innerHTML = colunas.map(col => `
    <div class="kanban-col">
      <div class="kanban-col-head"><strong>${col.titulo}</strong><span>${grupos[col.chave].length}</span></div>
      <div class="kanban-cards">${grupos[col.chave].map(t => cardTarefaHtml(t, hoje)).join('') || ''}</div>
    </div>`).join('');

  $('kanban').querySelectorAll('[data-task-id]').forEach(card => {
    card.addEventListener('click', () => abrirDetalhe(card.dataset.taskId));
  });

  const total = tarefasFiltradas().length;
  $('visibleCount').textContent = `${total} tarefa${total === 1 ? '' : 's'}`;
  $('emptyState').classList.toggle('hidden', tarefas.length > 0);
  $('kanban').classList.toggle('hidden', tarefas.length === 0);
}

function renderResumo() {
  const hoje = hojeStr();
  const naoConcluidas = tarefas.filter(t => t.status !== 'concluida');
  const atrasadas = naoConcluidas.filter(t => estaAtrasada(t, hoje));
  const proximas = naoConcluidas.filter(t => statusPrazo(t, hoje) === 'perto');

  $('statTotal').textContent = tarefas.length;
  $('statAndamento').textContent = tarefas.filter(t => t.status === 'em_andamento').length;
  $('statConcluidas').textContent = tarefas.filter(t => t.status === 'concluida').length;
  $('statAtrasadas').textContent = atrasadas.length;
  $('statProximas').textContent = proximas.length;
}

/* ─── Render: dashboard ──────────────────────────────────────────────────── */

function renderDashboard() {
  const hoje = hojeStr();
  const naoConcluidas = tarefas.filter(t => t.status !== 'concluida');
  const atrasadas = naoConcluidas.filter(t => estaAtrasada(t, hoje));
  const proximas = naoConcluidas.filter(t => statusPrazo(t, hoje) === 'perto');
  const mediaPct = tarefas.length ? Math.round(tarefas.reduce((soma, t) => soma + calcularPercentual(t), 0) / tarefas.length) : 0;

  $('dashTotal').textContent = tarefas.length;
  $('dashMedia').textContent = `${mediaPct}%`;
  $('dashNaoIniciadas').textContent = tarefas.filter(t => t.status === 'nao_iniciada').length;
  $('dashAtrasadas').textContent = atrasadas.length;
  $('dashProximas').textContent = proximas.length;

  // Barra por prioridade
  const porPrioridade = PRIORIDADE_ORDEM.map(p => ({ label: PRIORIDADE_LABEL[p], valor: tarefas.filter(t => t.prioridade === p).length, tom: p === 'urgente' || p === 'alta' ? 'danger' : p === 'media' ? 'warning' : '' }));
  const maxPrioridade = Math.max(1, ...porPrioridade.map(i => i.valor));
  $('barPrioridade').innerHTML = porPrioridade.map(i => `
    <div class="bar-row">
      <span class="bar-label">${i.label}</span>
      <div class="bar-track"><div class="bar-fill ${i.tom}" style="width:${(i.valor / maxPrioridade) * 100}%"></div></div>
      <span>${i.valor}</span>
    </div>`).join('');

  // Barra por solicitante (top 6)
  const contagem = {};
  tarefas.forEach(t => { const nome = t.solicitanteNome || 'Sem solicitante'; contagem[nome] = (contagem[nome] || 0) + 1; });
  const porSolicitante = Object.entries(contagem).sort((a, b) => b[1] - a[1]).slice(0, 6);
  const maxSolicitante = Math.max(1, ...porSolicitante.map(i => i[1]));
  $('barSolicitante').innerHTML = porSolicitante.length ? porSolicitante.map(([nome, valor]) => `
    <div class="bar-row">
      <span class="bar-label" title="${escapar(nome)}">${escapar(nome)}</span>
      <div class="bar-track"><div class="bar-fill success" style="width:${(valor / maxSolicitante) * 100}%"></div></div>
      <span>${valor}</span>
    </div>`).join('') : '<p style="color:var(--muted);font-size:12px">Nenhuma tarefa cadastrada ainda.</p>';

  // Próximos prazos
  const ordenadas = naoConcluidas
    .filter(t => t.prazoInformado)
    .sort((a, b) => a.prazoInformado.localeCompare(b.prazoInformado))
    .slice(0, 8);
  $('deadlineList').innerHTML = ordenadas.length ? ordenadas.map(t => `
    <div class="deadline-row">
      <div><strong>${escapar(t.titulo)}</strong><span>${escapar(t.solicitanteNome || 'Sem solicitante')}</span></div>
      ${badgePrazo(t, hoje)}
    </div>`).join('') : '<p style="color:var(--muted);font-size:12px">Nenhum prazo em aberto.</p>';
}

function renderTudo() {
  preencherFiltroSolicitantes();
  renderResumo();
  renderKanban();
  renderDashboard();
}

/* ─── Modal: nova / editar tarefa ────────────────────────────────────────── */

function renderEtapasEditor() {
  $('taskEtapas').innerHTML = etapasEmEdicao.map((etapa, indice) => `
    <div class="etapa-row" data-indice="${indice}">
      <input type="checkbox" ${etapa.concluida ? 'checked' : ''} data-campo="concluida">
      <input type="text" placeholder="Descreva a etapa" value="${escapar(etapa.texto)}" data-campo="texto">
      <button type="button" class="etapa-remove" title="Remover etapa">✕</button>
    </div>`).join('') || '<p style="color:var(--muted);font-size:12px">Nenhuma etapa adicionada ainda.</p>';

  $('taskEtapas').querySelectorAll('.etapa-row').forEach(linha => {
    const indice = Number(linha.dataset.indice);
    linha.querySelector('[data-campo="texto"]').addEventListener('input', e => etapasEmEdicao[indice].texto = e.target.value);
    linha.querySelector('[data-campo="concluida"]').addEventListener('change', e => etapasEmEdicao[indice].concluida = e.target.checked);
    linha.querySelector('.etapa-remove').addEventListener('click', () => { etapasEmEdicao.splice(indice, 1); renderEtapasEditor(); });
  });
}

function renderSistemasChips() {
  const wrap = $('taskSistemas');
  const input = $('taskSistemasInput');
  wrap.querySelectorAll('.tag-chip').forEach(chip => chip.remove());
  sistemasEmEdicao.forEach((nome, indice) => {
    const chip = document.createElement('span');
    chip.className = 'tag-chip';
    chip.innerHTML = `${escapar(nome)} <button type="button" data-indice="${indice}">✕</button>`;
    chip.querySelector('button').addEventListener('click', () => { sistemasEmEdicao.splice(indice, 1); renderSistemasChips(); });
    wrap.insertBefore(chip, input);
  });
}

function limparFormularioTarefa() {
  $('taskForm').reset();
  $('taskId').value = '';
  etapasEmEdicao = [];
  sistemasEmEdicao = [];
  renderEtapasEditor();
  renderSistemasChips();
  $('taskFormStatus').textContent = '';
  $('deleteTaskButton').classList.add('hidden');
}

function abrirModalNovaTarefa() {
  limparFormularioTarefa();
  $('taskModalEyebrow').textContent = 'NOVA TAREFA';
  $('taskModalTitle').textContent = 'Registrar solicitação';
  $('taskModal').classList.remove('hidden');
  setTimeout(() => $('taskTitulo').focus(), 60);
}

function abrirModalEdicao(id) {
  const tarefa = tarefas.find(t => t.id === id);
  if (!tarefa) return;
  limparFormularioTarefa();
  $('taskModalEyebrow').textContent = 'EDITAR TAREFA';
  $('taskModalTitle').textContent = tarefa.titulo;
  $('taskId').value = tarefa.id;
  $('taskTitulo').value = tarefa.titulo || '';
  $('taskSolicitante').value = tarefa.solicitanteId || '';
  $('taskSolicitanteLivre').value = tarefa.solicitanteId ? '' : (tarefa.solicitanteNome || '');
  $('taskPrioridade').value = tarefa.prioridade || 'media';
  $('taskStatus').value = tarefa.status || 'nao_iniciada';
  $('taskPrazoSolicitado').value = tarefa.prazoSolicitado || '';
  $('taskPrazoInformado').value = tarefa.prazoInformado || '';
  $('taskOQueFalta').value = tarefa.oQueFalta || '';
  etapasEmEdicao = (tarefa.etapas || []).map(e => ({ ...e }));
  sistemasEmEdicao = [...(tarefa.sistemas || [])];
  renderEtapasEditor();
  renderSistemasChips();
  $('deleteTaskButton').classList.toggle('hidden', !podeEditarTarefas);
  $('taskModal').classList.remove('hidden');
}

function fecharModalTarefa() {
  $('taskModal').classList.add('hidden');
}

async function salvarTarefa(evento) {
  evento.preventDefault();
  if (!podeEditarTarefas) { showToast('Seu perfil só tem acesso de visualização.', 'error'); return; }

  const titulo = $('taskTitulo').value.trim();
  if (!titulo) { $('taskFormStatus').textContent = 'Informe o título da tarefa.'; return; }

  const idSolicitante = $('taskSolicitante').value;
  const nomeLivre = $('taskSolicitanteLivre').value.trim();
  const usuarioSelecionado = usuarios.find(u => u.id === idSolicitante);
  const solicitanteNome = nomeLivre || usuarioSelecionado?.nome || '';

  const etapasValidas = etapasEmEdicao.filter(e => e.texto && e.texto.trim()).map(e => ({ texto: e.texto.trim(), concluida: !!e.concluida }));

  const payload = {
    titulo,
    solicitanteId: nomeLivre ? '' : idSolicitante,
    solicitanteNome,
    prioridade: $('taskPrioridade').value,
    status: $('taskStatus').value,
    prazoSolicitado: $('taskPrazoSolicitado').value || '',
    prazoInformado: $('taskPrazoInformado').value || '',
    oQueFalta: $('taskOQueFalta').value.trim(),
    etapas: etapasValidas,
    sistemas: sistemasEmEdicao,
    atualizadoEmIso: new Date().toISOString(),
    atualizadoPor: perfil.user
  };

  const id = $('taskId').value;
  $('saveTaskButton').disabled = true;
  $('taskFormStatus').textContent = 'Salvando...';

  try {
    if (id) {
      await updateDoc(doc(db, COLLECTION_TAREFAS, id), payload);
    } else {
      await addDoc(collection(db, COLLECTION_TAREFAS), {
        ...payload,
        criadoEmIso: new Date().toISOString(),
        criadoEm: serverTimestamp(),
        criadoPor: perfil.user
      });
    }
    fecharModalTarefa();
    showToast('Tarefa salva com sucesso.', 'success');
  } catch (err) {
    console.error(err);
    $('taskFormStatus').textContent = 'Não foi possível salvar. Confira as regras do Firestore.';
  } finally {
    $('saveTaskButton').disabled = false;
  }
}

async function excluirTarefaAtual() {
  const id = $('taskId').value;
  if (!id) return;
  if (!confirm('Excluir esta tarefa? Essa ação não pode ser desfeita.')) return;
  try {
    await deleteDoc(doc(db, COLLECTION_TAREFAS, id));
    fecharModalTarefa();
    showToast('Tarefa excluída.', 'success');
  } catch (err) {
    console.error(err);
    showToast('Não foi possível excluir a tarefa.', 'error');
  }
}

/* ─── Modal: detalhe da tarefa ───────────────────────────────────────────── */

function abrirDetalhe(id) {
  const tarefa = tarefas.find(t => t.id === id);
  if (!tarefa) return;
  tarefaSelecionadaId = id;

  $('detailTitulo').textContent = tarefa.titulo;
  $('detailSolicitante').textContent = tarefa.solicitanteNome || '—';
  $('detailPrioridade').textContent = PRIORIDADE_LABEL[tarefa.prioridade] || '—';
  $('detailPrazoSolicitado').textContent = formatarDataBr(tarefa.prazoSolicitado);
  $('detailPrazoInformado').textContent = formatarDataBr(tarefa.prazoInformado);

  const pct = calcularPercentual(tarefa);
  $('detailProgressFill').style.width = `${pct}%`;
  $('detailProgressLabel').textContent = `${pct}%`;

  $('detailEtapas').innerHTML = (tarefa.etapas || []).map((etapa, indice) => `
    <label class="detail-etapa ${etapa.concluida ? 'concluida' : ''}">
      <input type="checkbox" ${etapa.concluida ? 'checked' : ''} data-indice="${indice}" ${podeEditarTarefas ? '' : 'disabled'}>
      <span>${escapar(etapa.texto)}</span>
    </label>`).join('') || '<p style="color:var(--muted);font-size:12px">Nenhuma etapa cadastrada.</p>';

  $('detailEtapas').querySelectorAll('input[type="checkbox"]').forEach(input => {
    input.addEventListener('change', async e => {
      const indice = Number(e.target.dataset.indice);
      const etapas = (tarefa.etapas || []).map((etapa, i) => i === indice ? { ...etapa, concluida: e.target.checked } : etapa);
      try {
        await updateDoc(doc(db, COLLECTION_TAREFAS, id), { etapas, atualizadoEmIso: new Date().toISOString(), atualizadoPor: perfil.user });
      } catch (err) {
        console.error(err);
        showToast('Não foi possível atualizar a etapa.', 'error');
      }
    });
  });

  $('detailOQueFalta').textContent = tarefa.oQueFalta || '—';
  $('detailOQueFaltaWrap').classList.toggle('hidden', !tarefa.oQueFalta);
  $('editTaskFromDetail').classList.toggle('hidden', !podeEditarTarefas);
  $('detailModal').classList.remove('hidden');
}

function fecharDetalhe() {
  $('detailModal').classList.add('hidden');
  tarefaSelecionadaId = null;
}

/* ─── Etapas / sistemas: eventos de criação ──────────────────────────────── */

function configurarEditorEtapasSistemas() {
  $('addEtapaButton').addEventListener('click', () => {
    etapasEmEdicao.push({ texto: '', concluida: false });
    renderEtapasEditor();
  });

  $('taskSistemasInput').addEventListener('keydown', e => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const valor = e.target.value.trim();
    if (!valor) return;
    if (!sistemasEmEdicao.includes(valor)) sistemasEmEdicao.push(valor);
    e.target.value = '';
    renderSistemasChips();
  });
}

/* ─── Navegação e sessão ─────────────────────────────────────────────────── */

function showPage(pagina) {
  if (pagina === 'voltar') { irParaPortal(); return; }
  document.querySelectorAll('.nav-item').forEach(b => b.classList.toggle('active', b.dataset.page === pagina));
  document.querySelectorAll('.page').forEach(p => p.classList.toggle('active', p.id === `page-${pagina}`));
  $('pageTitle').textContent = pagina === 'dashboard' ? 'Dashboard' : 'Quadro de solicitações';
  document.querySelector('.sidebar').classList.remove('open');
}

function initials(nome = '') {
  return nome.split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0]).join('').toUpperCase() || 'U';
}

function renderPerfil() {
  $('sidebarAvatar').textContent = initials(perfil.nomeCompleto || perfil.nome);
  $('sidebarName').textContent = perfil.nomeCompleto || perfil.nome;
  $('sidebarRole').textContent = perfil.cargo || perfil.label || 'Colaborador';
  $('newTaskButton').classList.toggle('hidden', !podeEditarTarefas);
}

async function iniciar() {
  const controleSplash = iniciarSplashDeEntrada({ titulo: 'Tarefas', icone: '◨' });

  perfil = restaurarSessao();
  if (!perfil) { irParaPortal(); return; }
  if (!podeAcessar(perfil, CHAVE_SISTEMA)) {
    showToast('Seu perfil não tem acesso ao módulo de Tarefas.', 'error');
    setTimeout(irParaPortal, 1200);
    return;
  }

  podeEditarTarefas = podeEditar(perfil, CHAVE_SISTEMA);
  $('appShell').classList.remove('hidden');
  renderPerfil();

  document.querySelectorAll('.nav-item').forEach(botao => botao.addEventListener('click', () => showPage(botao.dataset.page)));
  $('mobileMenuButton').addEventListener('click', () => document.querySelector('.sidebar').classList.toggle('open'));
  $('logoutButton').addEventListener('click', async () => { await logoutLocal(); irParaPortal(); });

  $('newTaskButton').addEventListener('click', abrirModalNovaTarefa);
  $('closeTaskModal').addEventListener('click', fecharModalTarefa);
  $('cancelTaskModal').addEventListener('click', fecharModalTarefa);
  $('taskModal').addEventListener('click', e => { if (e.target === $('taskModal')) fecharModalTarefa(); });
  $('taskForm').addEventListener('submit', salvarTarefa);
  $('deleteTaskButton').addEventListener('click', excluirTarefaAtual);
  configurarEditorEtapasSistemas();

  $('closeDetailModal').addEventListener('click', fecharDetalhe);
  $('closeDetailModalButton').addEventListener('click', fecharDetalhe);
  $('detailModal').addEventListener('click', e => { if (e.target === $('detailModal')) fecharDetalhe(); });
  $('editTaskFromDetail').addEventListener('click', () => { const id = tarefaSelecionadaId; fecharDetalhe(); abrirModalEdicao(id); });

  $('taskSearch').addEventListener('input', renderKanban);
  $('priorityFilter').addEventListener('change', renderKanban);
  $('requesterFilter').addEventListener('change', renderKanban);

  await carregarUsuarios();
  escutarTarefas();

  vigiarSessao(
    () => {},
    () => { pararEscuta?.(); irParaPortal(); }
  );

  encerrarSplash();
}

iniciar().catch(err => {
  console.error(err);
  showToast('Falha ao carregar o módulo de Tarefas.', 'error');
});
