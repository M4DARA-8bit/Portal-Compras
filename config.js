export const PORTAL_CONFIG = {
  sessionDurationMs: 2 * 60 * 60 * 1000,
  corporateWhatsApp: "5511941730621",

  // Domínios em que as reescritas do vercel.json funcionam. Estando em um
  // deles, os sistemas abrem por /fornecedores/, /comparativo/ e /contratos/,
  // ou seja, no MESMO domínio — e é isso que dispensa novo login.
  // Fora daqui, o Portal cai para o domínio próprio de cada sistema.
  portalHosts: ["portal-compras-flax.vercel.app"],

  systems: {
    fornecedores: {
      name: "Gestão de Fornecedores",
      description: "Cadastro, documentação, acompanhamento e cotações de fornecedores.",
      icon: "◫",
      url: "/fornecedores/",
      directUrl: "https://painel-fornecedores-ability.vercel.app"
    },
    comparativo: {
      name: "Comparativo de Preços",
      description: "Propostas, custos, tributos, ranking e decisão de compra.",
      icon: "▥",
      url: "/comparativo/",
      directUrl: "https://comparativo-mu.vercel.app"
    },
    contratos: {
      name: "Gestão de Contratos",
      description: "Contratos, vigências, pagamentos, aprovações e histórico.",
      icon: "▤",
      url: "/contratos/",
      directUrl: "https://ambiente-teste-contrato.vercel.app"
    },
    tarefas: {
      name: "Tarefas",
      description: "Controle de solicitações, prazos, etapas e prioridades.",
      icon: "◨",
      url: "/tarefas/",
      directUrl: "https://tarefas-solicitadas.vercel.app"
    }
  },

  roles: {
    sem_acesso: "Sem acesso",
    solicitante: "Solicitante",
    visualizador: "Visualizador",
    editor: "Editor",
    executor: "Executor",
    aprovador: "Aprovador",
    administrador: "Administrador"
  }
};
