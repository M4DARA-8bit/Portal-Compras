export const PORTAL_CONFIG = {
  sessionDurationMs: 2 * 60 * 60 * 1000,
  corporateWhatsApp: "5511941730621",

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
