export const PORTAL_CONFIG = {
  sessionDurationMs: 30 * 24 * 60 * 60 * 1000,
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
  },

  // Lista de fotos que aparecem em "Minha conta" pra pessoa escolher como
  // avatar. Pode ser qualquer link direto de imagem (termina em
  // .png/.jpg/.webp/.svg, não a página onde a imagem aparece — no Google
  // Imagens: botão direito na foto → "Copiar endereço da imagem").
  //
  // Por enquanto são todas do DiceBear (dicebear.com) — de graça, licença
  // CC0/livre, sem precisar dar crédito. Cada "seed" no fim da URL gera uma
  // versão diferente daquele estilo; troque o texto depois de "seed=" pra
  // gerar outras variações, ou adicione mais linhas copiando o padrão.
  avataresDisponiveis: [
    // Critters — criaturinhas fofas com chifre/orelha/antena
    "https://api.dicebear.com/10.x/critters/svg?seed=Compras1",
    "https://api.dicebear.com/10.x/critters/svg?seed=Compras2",
    "https://api.dicebear.com/10.x/critters/svg?seed=Compras3",

    // Bottts — robôs engraçados
    "https://api.dicebear.com/10.x/bottts/svg?seed=Compras1",
    "https://api.dicebear.com/10.x/bottts/svg?seed=Compras2",
    "https://api.dicebear.com/10.x/bottts/svg?seed=Compras3",

    // Fun Emoji — carinhas de emoji
    "https://api.dicebear.com/10.x/fun-emoji/svg?seed=Compras1",
    "https://api.dicebear.com/10.x/fun-emoji/svg?seed=Compras2",
    "https://api.dicebear.com/10.x/fun-emoji/svg?seed=Compras3",

    // Croodles — rabiscados à mão, bem informais
    "https://api.dicebear.com/10.x/croodles/svg?seed=Compras1",
    "https://api.dicebear.com/10.x/croodles/svg?seed=Compras2",
    "https://api.dicebear.com/10.x/croodles/svg?seed=Compras3",

    // Big Smile — carinhas sorrindo bem largo
    "https://api.dicebear.com/10.x/big-smile/svg?seed=Compras1",
    "https://api.dicebear.com/10.x/big-smile/svg?seed=Compras2",
    "https://api.dicebear.com/10.x/big-smile/svg?seed=Compras3",

    // Pixel Art — personagens em pixel, estilo jogo antigo
    "https://api.dicebear.com/10.x/pixel-art/svg?seed=Compras1",
    "https://api.dicebear.com/10.x/pixel-art/svg?seed=Compras2",
    "https://api.dicebear.com/10.x/pixel-art/svg?seed=Compras3",

    // Notionists — pessoas ilustradas, estilo bem moderno
    "https://api.dicebear.com/10.x/notionists/svg?seed=Compras1",
    "https://api.dicebear.com/10.x/notionists/svg?seed=Compras2",
    "https://api.dicebear.com/10.x/notionists/svg?seed=Compras3",

    // Thumbs — ANIMADO (o olho e a expressão se mexem sozinhos)
    "https://api.dicebear.com/10.x/thumbs/svg?seed=Compras1",
    "https://api.dicebear.com/10.x/thumbs/svg?seed=Compras2",
    "https://api.dicebear.com/10.x/thumbs/svg?seed=Compras3",

    // Voxel Art — personagens em voxel, estilo jogo 3D, ANIMADO
    "https://api.dicebear.com/10.x/voxel-art/svg?seed=Compras1&tags=animation",
    "https://api.dicebear.com/10.x/voxel-art/svg?seed=Compras2&tags=animation",
    "https://api.dicebear.com/10.x/voxel-art/svg?seed=Compras3&tags=animation",
    "https://api.dicebear.com/10.x/voxel-art/svg?seed=Compras4&tags=animation",
    "https://api.dicebear.com/10.x/voxel-art/svg?seed=Compras5&tags=animation",
    "https://api.dicebear.com/10.x/voxel-art/svg?seed=Compras6&tags=animation",

    // Voxel Bot — robôs em voxel, estilo jogo 3D, ANIMADO
    "https://api.dicebear.com/10.x/voxel-bot/svg?seed=Compras1&tags=animation",
    "https://api.dicebear.com/10.x/voxel-bot/svg?seed=Compras2&tags=animation",
    "https://api.dicebear.com/10.x/voxel-bot/svg?seed=Compras3&tags=animation",
    "https://api.dicebear.com/10.x/voxel-bot/svg?seed=Compras4&tags=animation",
    "https://api.dicebear.com/10.x/voxel-bot/svg?seed=Compras5&tags=animation",
    "https://api.dicebear.com/10.x/voxel-bot/svg?seed=Compras6&tags=animation"
  ]
};