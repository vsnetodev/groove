# Configuração e atualização

## Supabase existente

Faça backup antes de alterar produção. Em um projeto que já possui todas as migrações antigas aplicadas, execute SOMENTE estas novas migrações, nesta ordem, pelo SQL Editor ou pelo seu fluxo Supabase CLI:

1. `20261002140000_payment_hardening.sql`
2. `20261002141000_inventory_confirmation.sql`
3. `20261002142000_checkin_status.sql`
4. `20261002143000_reservation_limits.sql`

Publique o código depois das migrações. Não reaplique as migrações de criação de tabelas em um banco existente. Nenhum registro real foi acessado ou modificado durante esta entrega.

## Supabase novo

Aplique todos os SQLs de `supabase/migrations` em ordem de nome, um arquivo por vez. O Supabase fornece os schemas `auth`, `storage` e a extensão pgcrypto. Confirme pgcrypto habilitado no projeto. Os testes locais validam as migrações em PostgreSQL/PGlite com schemas mínimos da plataforma; não substituem o teste no Supabase de homologação.

O cadastro público não cria administradores. Após cadastrar e confirmar sua conta, promova somente o UUID correto no SQL Editor:

```sql
-- Substitua pelo UUID da SUA conta em Authentication > Users.
INSERT INTO public.user_roles (user_id, role)
VALUES ('SEU-UUID-AQUI'::uuid, 'admin')
ON CONFLICT (user_id, role) DO NOTHING;
```

O arquivo `supabase/config.toml` agora usa o identificador local `groove-local`. Ao usar CLI, vincule explicitamente ao seu projeto correto; o identificador do ambiente antigo não está vinculado automaticamente.

## Variáveis

- `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY`: URL e chave publishable/anon públicas, necessárias antes de compilar.
- `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`: mesmo projeto, disponíveis no servidor.
- `SUPABASE_SERVICE_ROLE_KEY`: somente no servidor; nunca use prefixo `VITE_`.
- `APP_URL`: origem pública, por exemplo `https://seu-dominio.com`, sem caminho. Localmente use `http://localhost:3000` (ou a porta indicada pelo Vite).
- Stripe: `STRIPE_SECRET_KEY` e `STRIPE_WEBHOOK_SECRET`.
- Mercado Pago: `MERCADOPAGO_ACCESS_TOKEN` e `MERCADOPAGO_WEBHOOK_SECRET`.

A chave de webhook Mercado Pago é obrigatória. Integração antiga IPN/GET sem assinatura não é mais aceita. Configure Webhooks modernos de pagamento, via POST, incluindo o `data.id` da notificação na URL enviada pelo provedor. A assinatura e o ID do corpo devem corresponder ao ID recebido na query.

## Login

Login Google utiliza diretamente Supabase OAuth, permitindo hospedagem fora do Lovable. Ative o provedor Google no Supabase e configure suas credenciais OAuth, a callback URL indicada pelo Supabase, Site URL e Redirect URLs do seu domínio. Inclua `/auth` e `/reset-password` conforme os fluxos usados. Login por e-mail exige configurar confirmação e recuperação no Supabase.

## Pagamento

No painel, selecione gateway e ambiente, teste a conexão e habilite pagamentos. A configuração do painel não altera as credenciais de ambiente: use chaves de teste no sandbox e chaves live somente após homologação.

Endpoints:

- `/api/public/webhooks/stripe`
- `/api/public/webhooks/mercadopago`

Stripe: configurar `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.expired`, `checkout.session.async_payment_failed` e `charge.refunded`.

Mercado Pago: notificações modernas de pagamento (`payment`). Confirmação acontece pelo webhook assinado; a tela de sucesso faz somente leitura. Monitorar entregas que retornem HTTP 500 e reprocessar depois de corrigir a causa. Falhas não são marcadas como sucesso.

Se um pagamento chegar depois que a reserva expirou, o banco tenta obter estoque novamente. Se faltar estoque, não emite ingressos: retorna erro para intervenção e estorno pelo operador. Pedidos já cancelados/reembolsados também exigem análise se houver pagamento tardio.

**Reembolso manual existente:** o botão do painel registra reembolso e altera ingressos no banco. Ele NÃO devolve dinheiro no gateway. Efetue e confira o estorno financeiro no provedor. Reembolso parcial Stripe não invalida todos os ingressos automaticamente; sua atribuição a ingressos específicos requer tratamento operacional.

## Homologação antes de vender

Teste com contas reais de homologação: cadastro, confirmação de e-mail, recuperação, Google, acesso por perfil, compra sandbox de cada gateway usado, callback assinado, repetição da notificação, check-in e estorno. Configure limites de requisições no provedor de hospedagem para checkout, cupons e webhooks conforme sua operação. O limite de cinco pedidos pendentes por conta não substitui proteção contra abuso distribuído.

A entrega não inclui chaves, dados do banco, configuração de SMTP ou publicação em hospedagem.
