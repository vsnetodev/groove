# Revisão técnica — 02/10/2026

## Corrigido

- Remoção de dependências e saídas geradas do pacote de código: mais de 35 mil entradas excluídas da distribuição.
- Serviços de pagamentos isolados em `src/server/payments`, mantendo páginas e convenções do TanStack.
- Uma única estratégia de instalação npm/package-lock; arquivos de Bun removidos para evitar instalações divergentes.
- Atualização compatível de nanoid/PostCSS; removida substituição de brace-expansion que quebrava o ESLint.
- Eventos de pagamento: transação única para mutação e registro de recebimento; duplicatas serializadas; erros permitem nova tentativa.
- Validação de valor, moeda e sessão; estoque recuperado com bloqueios para pagamentos após expiração.
- Escritas de pedidos, itens e ingressos revogadas para clientes do navegador; execução privilegiada restrita ao service_role.
- Check-in por UUID passa a recusar ingressos reembolsados, como o fluxo por token já fazia.
- Troca de papel de usuário atômica e autenticada; exclusão de usuário interrompida se a consulta de pedidos falhar, sem remover perfil antes da exclusão Auth.
- Autenticação privilegiada consulta `getUser`, evitando confiar apenas em claims locais de sessões já desativadas.
- Checkout exige sessão válida, rejeita lotes duplicados, ordena bloqueios e limita cinco reservas pendentes por conta.
- Checkout respeita configuração de pagamentos habilitada; URLs de retorno dependem de `APP_URL` canônico.
- Webhooks com limite de corpo, validação do JSON, timeout de chamadas externas e Mercado Pago com assinatura obrigatória.
- Consulta pública de pedido não reconcilia pagamentos e mascara o e-mail. Polling limitado, com estados de erro e encerramento.
- Falha de uma tentativa de pagamento não encerra indiscriminadamente a preferência/sessão que pode ser tentada novamente.
- Chave Supabase privilegiada bloqueada no cliente; fallback de ambiente não referencia `process` inexistente no navegador.
- Tratamento de carrinho inválido, respostas de autenticação, cancelamento de efeitos React e dependências de hooks.
- Login Google via Supabase; headers `nosniff`, `no-referrer` e `private, no-store` em respostas dinâmicas.
- CI, testes, configuração documentada e preparação de partes com até 80 arquivos.

## Arquivos visuais ausentes no RAR

Os quatro JSONs de imagem apontavam para `/__l5e/assets-v1/...`, mas os PNGs correspondentes não estavam no arquivo recebido. Essas URLs dependiam do ambiente Lovable. O app usa agora `src/assets/logo.png`, a imagem Casa Groove já presente no projeto, e ícones vetoriais locais para as decorações de disco/caixas. As referências antigas foram preservadas em `docs/original-asset-references` para restaurar a arte exata quando os PNGs estiverem disponíveis. As fotos locais originais foram mantidas.

## Escopo e limitações

A revisão preserva a estrutura de páginas e funções de negócio existentes. Não é uma certificação de segurança completa. Supabase Auth/Storage HTTP, SMTP, callbacks OAuth e gateways reais requerem homologação com credenciais. Não houve acesso ao banco real, publicação ou commit em repositório remoto.

Recharts 2 e tsconfck permanecem com aviso de descontinuação: a atualização principal de Recharts exige migração do componente de gráficos e não foi misturada às correções funcionais. A auditoria registra vulnerabilidades conhecidas na data da execução; não garante ausência de falhas futuras.

Os testes PGlite usam PostgreSQL real com schemas mínimos do Supabase. Validam migrações e transações, mas não simulam integralmente os serviços hospedados nem carga concorrente de múltiplas instâncias. Os bloqueios de banco foram mantidos como mecanismo de concorrência.

Os logs e resultados da execução estão em `VALIDACAO.txt` na raiz do pacote de entrega.

## Referências consultadas

- https://docs.stripe.com/webhooks
- https://www.mercadopago.com.br/developers/en/docs/links-and-debts/additional-content/your-integrations/notifications/webhooks
