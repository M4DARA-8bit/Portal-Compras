# Ability Suite — Portal Corporativo

Portal central para autenticação, visualização de perfil e administração das permissões dos sistemas internos.

## Funções entregues

- Login por Firebase Authentication.
- Sessão local com expiração automática após duas horas.
- Tela inicial com os sistemas permitidos para o usuário.
- Perfil individual com nome, e-mail, cargo, departamento e permissões.
- Solicitação de acesso por WhatsApp com mensagem preenchida automaticamente.
- Controle de acessos exclusivo para administradores do portal.
- Função independente em cada sistema: sem acesso, visualizador, editor, aprovador ou administrador.
- Registro de alterações na coleção `logsAcesso`.

## Arquivos

Todos os arquivos ficam na raiz do repositório:

```text
index.html
style.css
firebase.js
config.js
auth.js
app.js
firestore.rules.exemplo.txt
vercel.json
README.md
```

## Configuração obrigatória

### 1. Número corporativo do WhatsApp

Abra `config.js` e preencha:

```javascript
corporateWhatsApp: "5511999999999"
```

Use apenas números, incluindo DDI 55 e DDD.

### 2. Endereços dos sistemas

Ainda em `config.js`, substitua as URLs de exemplo pelas URLs publicadas no Vercel:

```javascript
url: "https://seu-projeto.vercel.app"
```

### 3. Administrador inicial

No Firestore, crie ou ajuste o documento:

```text
usuariosUid/{UID_DO_ADMIN}
```

Exemplo:

```javascript
{
  nomeCompleto: "Nome do administrador",
  email: "admin@empresa.com",
  cargo: "Administrador",
  departamento: "Suprimentos",
  ativo: true,
  administradorPortal: true,
  sistemas: {
    fornecedores: { acessar: true, funcao: "administrador" },
    comparativo: { acessar: true, funcao: "administrador" },
    contratos: { acessar: true, funcao: "administrador" }
  }
}
```

O UID é encontrado em **Firebase Console > Authentication > Users**.

## Estrutura das permissões

```javascript
sistemas: {
  fornecedores: {
    acessar: true,
    funcao: "editor"
  },
  comparativo: {
    acessar: true,
    funcao: "visualizador"
  },
  contratos: {
    acessar: false,
    funcao: "sem_acesso"
  }
}
```

## Regras Firestore

O arquivo `firestore.rules.exemplo.txt` é apenas uma referência. Não publique essas regras sem comparar com as regras atuais do projeto, pois o Painel de Fornecedores e o Comparativo já usam outras coleções.

## Publicação

1. Crie um repositório no GitHub.
2. Envie todos os arquivos para a raiz.
3. Importe o repositório no Vercel.
4. Não é necessário comando de build.
5. Adicione o domínio do Vercel em **Firebase Authentication > Settings > Authorized domains**.
6. Configure o documento do administrador no Firestore.
7. Teste login, permissões, URLs e WhatsApp.

## Segurança

A interface esconde funções não permitidas, mas a segurança real deve ser aplicada pelas regras do Firestore. Cada sistema também deve consultar `usuariosUid/{uid}` antes de liberar ações de edição, aprovação ou administração.
