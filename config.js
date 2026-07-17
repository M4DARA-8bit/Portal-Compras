export const PORTAL_CONFIG = {
  sessionDurationMs: 2 * 60 * 60 * 1000,

  // Preencha somente com números: DDI + DDD + número.
  // Exemplo fictício: 5511999999999
  corporateWhatsApp: "",

  systems: {
    fornecedores: {
      name: "Gestão de Fornecedores",
      description: "Cadastro, documentação, acompanhamento e cotações de fornecedores.",
      icon: "◫",
      url: "https://SEU-PAINEL-FORNECEDORES.vercel.app"
    },
    comparativo: {
      name: "Comparativo de Preços",
      description: "Propostas, custos, tributos, ranking e decisão de compra.",
      icon: "▥",
      url: "https://SEU-COMPARATIVO.vercel.app"
    },
    contratos: {
      name: "Gestão de Contratos",
      description: "Contratos, vigências, pagamentos, aprovações e histórico.",
      icon: "▤",
      url: "https://SEU-GESTOR-CONTRATOS.vercel.app"
    }
  },

  roles: {
    sem_acesso: "Sem acesso",
    visualizador: "Visualizador",
    editor: "Editor",
    aprovador: "Aprovador",
    administrador: "Administrador"
  }
};
