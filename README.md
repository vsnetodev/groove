# GROOVE — aplicativo revisado

Plataforma de eventos e ingressos com React 19, TypeScript, TanStack Start, Supabase e gateways Stripe/Mercado Pago.

## Começar no Windows

1. Instale Node.js 22.12+ (linha 22) ou Node.js 24 LTS.
2. Abra esta pasta, que contém `package.json`, no terminal.
3. Copie `.env.example` para `.env` e preencha as configurações do seu Supabase.
4. Execute os comandos abaixo. O sufixo `.cmd` evita o bloqueio de `npm.ps1` no PowerShell.

```powershell
npm.cmd ci
npm.cmd run check:env
npm.cmd run check
npm.cmd run dev
```

Abra o endereço informado no terminal. `INSTALAR-E-VALIDAR.cmd` instala, testa e compila com duplo clique. Esse arquivo não configura o banco ou publica o site.

## Compilar

```powershell
# Cloudflare Workers, mantendo o destino original
npm.cmd run build

# Servidor Node.js
npm.cmd run build:node
npm.cmd start
```

Cada build substitui `.output`. Configure as variáveis `VITE_*` ANTES do build; elas são incorporadas no JavaScript público. Configure as variáveis privadas também no ambiente do servidor hospedado. Não use hospedagem exclusivamente estática: o app possui autenticação, funções de servidor e webhooks.

## Enviar ao GitHub

Esta pasta inteira é a raiz do repositório. Não envie `node_modules`, `.output`, `.wrangler` ou `.env`. O `.gitignore` está preparado. Git/GitHub Desktop é o caminho mais simples para manter o projeto atualizado.

Para envio pelo navegador, o ZIP de entrega inclui `UPLOAD-NAVEGADOR/PARTE-XX` com até 80 arquivos por parte. Abra cada parte e arraste seu CONTEÚDO para a raiz do repositório, confirmando cada envio. Não crie uma pasta `PARTE-XX` no GitHub. Mostre itens ocultos no Windows. Envie todas as partes antes de conectar o deploy.

Após alterações futuras, execute `PREPARAR-UPLOAD-GITHUB.cmd` ou `npm.cmd run prepare:github`. O programa cria novas partes em `upload-github`, sem dependências nem credenciais.

O workflow `.github/workflows/ci.yml` instala com `npm ci`, verifica tipos, executa testes, lint, build e auditoria. Compilar não configura automaticamente o Supabase ou os gateways.

## Banco e pagamentos

Leia [docs/CONFIGURACAO.md](docs/CONFIGURACAO.md) antes de disponibilizar vendas. As novas migrações `20261002*` são obrigatórias para este código. Nenhuma migração foi aplicada ao seu banco real nesta revisão.

## Organização

| Diretório                   | Responsabilidade                                                      |
| --------------------------- | --------------------------------------------------------------------- |
| `src/routes`                | Páginas, layouts e endpoints HTTP; convenções do TanStack preservadas |
| `src/components`            | Componentes de interface e formulários                                |
| `src/hooks`                 | Sessão, permissões e dados da interface                               |
| `src/lib/*.functions.ts`    | Entradas de servidor, autenticação e validação                        |
| `src/lib/validation`        | Regras de entrada reutilizáveis                                       |
| `src/server/payments`       | Serviços privados, gateways, assinaturas e confirmação de pagamento   |
| `src/integrations/supabase` | Clientes público/privado, middleware e tipos do banco                 |
| `supabase/migrations`       | Histórico SQL ordenado; correções novas são migrações adicionais      |
| `tests`                     | Testes de segurança e transações em PostgreSQL/PGlite                 |
| `scripts`                   | Verificação de configuração e preparação de upload                    |
| `docs`                      | Configuração, revisão e limitações verificadas                        |

`src/routeTree.gen.ts` é gerado pelo TanStack. Não o edite manualmente. O histórico original de migrações foi preservado.
