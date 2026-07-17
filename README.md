# Portal de Compras — versão final integrada

Portal central de autenticação, perfil e permissões para os sistemas de Compras.

## Endereço

- Portal: `https://portal-compras-flax.vercel.app`

## Sistemas integrados

- Fornecedores: `/fornecedores/`
- Comparativo de Preços: `/comparativo/`
- Gestão de Contratos: `/contratos/`

O `vercel.json` usa reescritas externas para disponibilizar os três sistemas dentro do domínio do Portal. Dessa forma, ao entrar pelo Portal, o usuário mantém a mesma sessão do Firebase e não precisa fazer login novamente. Quando um sistema é acessado diretamente pelo domínio próprio, ele exige autenticação.

## Autenticação e sessão

- Firebase Authentication com e-mail e senha.
- Persistência limitada à sessão do navegador.
- Expiração operacional após duas horas.
- Logout compartilhado quando o sistema é usado pelo domínio do Portal.

## Controle de acessos

A administração fica somente no Portal. Os outros sistemas apenas consultam o perfil central salvo em:

```text
usuariosUid/{UID_DO_USUARIO}
```

Somente a conta que possuir `administradorPortal: true` verá e utilizará a aba **Controle de acessos**. A interface não permite transformar outro usuário em administrador do Portal.

> Como o e-mail/UID do proprietário não foi informado nos arquivos, nenhuma conta foi hardcoded. Defina `administradorPortal: true` exclusivamente no documento da sua conta pelo Firebase Console.

Exemplo do seu perfil:

```javascript
{
  nomeCompleto: "Felipe",
  email: "seu.email@abilitytecnologia.com.br",
  cargo: "Administrador do Portal",
  departamento: "Compras",
  ativo: true,
  administradorPortal: true,
  sistemas: {
    fornecedores: { acessar: true, funcao: "administrador" },
    comparativo: { acessar: true, funcao: "administrador" },
    contratos: { acessar: true, funcao: "administrador" }
  }
}
```

Para os demais usuários, mantenha `administradorPortal: false` ou remova esse campo.

## Funções disponíveis por sistema

- `sem_acesso`
- `visualizador`
- `editor`
- `aprovador`
- `administrador`

Cada usuário pode visualizar, em **Minha conta**, o próprio e-mail, cargo, departamento, função e permissões. O botão **Solicitar mais acesso** abre o WhatsApp corporativo `+55 11 94173-0621` com uma mensagem preenchida.

## Domínios Firebase autorizados

Cadastre os quatro domínios em **Firebase Console → Authentication → Settings → Authorized domains**:

```text
portal-compras-flax.vercel.app
painel-fornecedores-ability.vercel.app
comparativo-mu.vercel.app
ambiente-teste-contrato.vercel.app
```

## Publicação

1. Publique ou atualize primeiro os três sistemas individuais.
2. Publique o Portal por último, pois suas reescritas apontam para os domínios individuais.
3. Mantenha todos os arquivos do Portal na raiz do repositório.
4. Preserve o arquivo `vercel.json`.
5. Configure seu documento em `usuariosUid` como administrador do Portal.
6. Teste o acesso pelo Portal e depois o acesso direto a cada sistema.

## Firestore

`firestore.rules.exemplo.txt` é um modelo de integração. Compare e mescle com as regras atuais antes de publicar. Não substitua regras de produção sem validar as coleções já usadas pelo Painel de Fornecedores.
