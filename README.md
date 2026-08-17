# Neemias Prime — Sistema de Agendamento

Sistema real de agendamento da Barbearia Neemias Prime, preparado para Vercel e Supabase.

## O que já funciona

- Cadastro, confirmação de e-mail, login e logout de clientes.
- Recuperação de senha completa, com envio de link e tela para cadastrar a nova senha.
- Entrada opcional com Google, caso o provedor seja ativado no Supabase.
- Perfis separados de cliente e administrador.
- Catálogo com os 15 serviços e os 4 profissionais informados.
- Preços reais e durações configuráveis pelo administrador.
- Cálculo de horários disponíveis conforme duração, expediente, folgas e agenda do profissional.
- Proteção no banco contra dois atendimentos simultâneos do mesmo profissional.
- Agendamento com identificação automática de pagamento no local ou cobertura pelo plano.
- Cancelamento livre e reagendamento conforme disponibilidade.
- Registro de falta somente depois de 15 minutos de atraso.
- Bloqueio automático do cliente por 24 horas após falta.
- Área exclusiva de agendamentos com próximos horários, histórico, valores, cancelamento e reagendamento.
- Painel operacional do administrador.
- Ativação/desativação de profissionais e serviços.
- Vínculo de cliente aos planos da barbearia.
- Segurança por Row Level Security: clientes não enxergam dados de outros clientes.
- Landing page editorial e responsiva inspirada nas referências fornecidas, com hero exclusivo da Neemias Prime, faixas animadas, serviços, equipe, clube e chamadas de agendamento.

## 1. Criar o Supabase

1. Crie um projeto em <https://database.new>.
2. Abra **SQL Editor → New query**.
3. Cole todo o conteúdo de `supabase/migrations/20260813_neemias_prime_core.sql` e execute.
4. Em **Authentication → URL Configuration**, informe:
   - Site URL local: `http://localhost:3000`
   - Redirect URL local: `http://localhost:3000/auth/callback`
   - Quando houver domínio na Vercel, adicione `https://SEU-DOMINIO.vercel.app/auth/callback`.
5. Em **Project Settings → API**, copie a Project URL e a Publishable Key.

### Login com Google (opcional)

O botão já está integrado. Para ativá-lo, abra **Authentication → Providers → Google** no Supabase, configure o Client ID e o Client Secret do Google Cloud e copie para o Google a callback informada pelo próprio Supabase. Se preferir usar somente e-mail e senha, o restante do sistema funciona normalmente.

## 2. Configurar no computador

Requer Node.js 22 ou superior.

```bash
npm install
cp .env.example .env.local
npm run dev
```

No Windows, copie `.env.example`, renomeie a cópia para `.env.local` e preencha:

```env
NEXT_PUBLIC_SUPABASE_URL=https://SEU-PROJETO.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_SUA_CHAVE
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

Abra <http://localhost:3000>.

## 3. Definir o primeiro administrador

1. Crie uma conta normalmente pela tela **Criar conta**.
2. Confirme o e-mail.
3. No SQL Editor, substitua o e-mail e execute:

```sql
update public.profiles
set role = 'admin'
where id = (select id from auth.users where email = 'EMAIL_DO_ADMIN');
```

Ao entrar novamente, aparecerá o acesso à Administração.

## 4. Publicar na Vercel

1. Envie esta pasta para um repositório no GitHub.
2. Na Vercel, clique em **Add New → Project** e importe o repositório.
3. Cadastre as três variáveis do `.env.example` em **Settings → Environment Variables**.
4. Em `NEXT_PUBLIC_SITE_URL`, use a URL da Vercel, sem barra no final.
5. Faça o deploy e inclua a URL de callback da Vercel no Supabase. Essa mesma callback atende confirmação de cadastro e recuperação de senha.

Não coloque a `service_role` key no navegador nem em variável `NEXT_PUBLIC_*`. Este projeto não precisa dela.

## Regras cadastradas

- Domingo e segunda: fechado.
- Terça a sexta: 09h–20h.
- Sábado: 09h–19h.
- Cancelamento: permitido enquanto o atendimento estiver agendado ou confirmado.
- Atraso: a falta pode ser registrada depois de 15 minutos.
- Não comparecimento: bloqueio de novas reservas por 24 horas.
- Agenda do cliente: os próximos 7 dias aparecem como seleção rápida, com domingo e segunda identificados como fechados.
- Grade de horários: intervalos de 30 minutos. Uma reserva às 10h30 torna o próximo início possível às 11h, ou mais tarde quando o serviço durar mais de 30 minutos.

Se você já executou a migração principal anteriormente, execute também `supabase/migrations/20260813_booking_30min_slots.sql` no SQL Editor para ativar a nova grade de horários. Em um projeto Supabase novo, basta executar a migração principal, pois ela já contém essa regra.

Para ativar o botão de reagendamento em um banco que já estava configurado, execute também `supabase/migrations/20260813_reschedule_appointments.sql`. A função valida cliente, profissional, expediente, folgas, bloqueio e conflito de agenda antes de trocar o horário.

Se o painel administrativo mostrar `new row violates row-level security policy for table "memberships"` ao vincular um plano, execute `supabase/migrations/20260817_fix_membership_admin_rls.sql`. A correção cria uma operação administrativa protegida e não apaga clientes, planos ou históricos.

Se o banco mostrar o erro `payment_mode is of type payment_mode but expression is of type text`, execute `supabase/migrations/20260813_fix_payment_mode_cast.sql`. Essa correção recria somente a função de agendamento e não apaga horários ou clientes.

## Planos cadastrados

- Corte ilimitado — terça e quinta: R$ 79,90.
- Corte ilimitado — terça a sábado: R$ 99,90.
- Barba ilimitada: R$ 99,90.
- Corte + barba ilimitados: R$ 149,90.

O benefício é aplicado automaticamente quando o serviço e o dia estão cobertos. A cobrança/gestão financeira dos planos continua no sistema externo da barbearia; o administrador apenas vincula o cliente ao plano correspondente.

## Durações iniciais

Como a barbearia informou valores, mas ainda não informou as durações, foram cadastradas durações operacionais iniciais. O administrador pode corrigi-las na tela **Serviços** sem alterar código. Confirme essas durações com a equipe antes de abrir o agendamento ao público.

## Verificação do projeto

```bash
npm run typecheck
npm run lint
npm run build
```

O pacote entregue concluiu `typecheck`, `lint` e o build de produção do Next.js.
