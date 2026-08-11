# Tarefas — módulo do Portal de Compras

Controle de solicitações (tipo agenda): prioridade, prazos, etapas, % concluído,
alertas de prazo/prioridade e dashboard de estatísticas. Usa o mesmo Firebase e a
mesma sessão do Portal — não pede login de novo quando aberto por lá.

## O que este módulo grava no Firestore

Coleção nova: **`tarefas`**. Cada documento:

```javascript
{
  titulo: "Enviar PPP do colaborador X",
  solicitanteId: "ademir",       // id do documento em `usuarios`, se selecionado na lista
  solicitanteNome: "Ademir Santos",
  prioridade: "alta",             // baixa | media | alta | urgente
  status: "em_andamento",         // nao_iniciada | em_andamento | concluida
  etapas: [
    { texto: "Solicitar assinatura", concluida: true },
    { texto: "Enviar ao RH", concluida: false }
  ],
  sistemas: ["DocuSign", "Painel de Fornecedores"],
  oQueFalta: "Aguardando assinatura do colaborador",
  prazoSolicitado: "2026-08-15",  // data que a pessoa pediu
  prazoInformado: "2026-08-14",   // data que você disse que entrega
  criadoEmIso, criadoEm, criadoPor,
  atualizadoEmIso, atualizadoPor
}
```

Os **solicitantes** são lidos direto da coleção `usuarios` que já existe no projeto
Firebase `fornecedores-cp` (mesma base do Painel de Fornecedores e do Comparativo).
Não é preciso cadastrar nada — o módulo só faz um `select` nessa coleção.

## Publicação

1. Deploy já publicado em: `https://tarefas-solicitadas.vercel.app` — e já referenciado
   em `config.js` e `vercel.json` na raiz do Portal.
2. Republique o Portal (raiz do repositório) para que o rewrite `/tarefas/` passe
   a valer.
3. Adicione o domínio `tarefas-solicitadas.vercel.app` em Firebase Console →
   Authentication → Settings → Authorized domains.
4. Publique a regra da coleção `tarefas` no Firestore (veja
   `firestore.rules.exemplo.txt`, já atualizado com o bloco `match /tarefas`).

> Importante: acessar `tarefas-solicitadas.vercel.app` **direto** (fora do
> Portal) sempre vai te mandar de volta para o Portal — é esperado, porque a
> sessão só existe no domínio do Portal. Entre sempre pelo card "Tarefas" lá
> dentro.

## Permissões

Reaproveita a mesma chave de sistema `tarefas` já adicionada em `auth-local.js`
(`SISTEMAS_POR_ROLE`). Por padrão:

- **Compras**: administrador (acesso total)
- **Diretoria**: visualizador (só consulta)
- **RH, SESMT, Jurídico, Solicitante**: sem acesso

Ajuste esses padrões em `SISTEMAS_POR_ROLE` (arquivo `auth-local.js`, tanto o
desta pasta quanto o da raiz do Portal — mantenha os dois iguais) ou libere por
usuário na tela **Controle de acessos** do Portal, marcando a função desejada
para "Tarefas" em cada conta.

## O que ainda vale ajustar

- Este módulo assume que a coleção `usuarios` tem os mesmos campos já usados
  pelo Portal (`nome`/`nomeCompleto`, `ativo`). Se algum usuário não tiver
  `nome`, o módulo cai para o id do documento.
- O quadro (kanban) separa "Atrasada" das demais colunas automaticamente quando
  a data de `prazoInformado` já passou e a tarefa não está concluída — não é
  um status manual, é calculado na hora de exibir.
