# QuantoFica — serviço de contas

Este serviço substitui o envio manual de chaves. Depois de ligado:

- **Logo após o pagamento**, a página de agradecimento ativa o plano sozinha, sem e-mail.
- **Noutro dispositivo** (ou na app instalada no ecrã principal do iPhone, que tem armazenamento separado do Safari), o cliente toca no ícone da chave, escreve o e-mail da compra e introduz o código de 6 dígitos que recebe.
- **O plano Agência renova-se sozinho** enquanto a subscrição estiver paga. Se for cancelada ou o plano Cliente for reembolsado, a app volta à demonstração na atualização seguinte (no máximo 3 dias, ou de imediato em "Atualizar plano").
- **As chaves antigas continuam a funcionar.** O gerador de chaves continua útil para ofertas e casos especiais.

Não há base de dados: o Stripe é a fonte de verdade. O serviço corre no plano gratuito da Cloudflare (100 000 pedidos por dia).

Enquanto `QF_ACCOUNT_URL` estiver vazio no `index.html`, a app funciona exatamente como antes, só com chaves.

---

## O que precisa de fazer (cerca de 30 minutos)

### 1. Domínio para enviar e-mails (recomendado)
Os códigos de entrada saem por e-mail. Para não caírem no spam, o ideal é enviá-los de um domínio seu, por exemplo `quantofica.pt` (cerca de 15 €/ano num registador como o PTisp ou o Dominios.pt). O domínio também serve mais tarde para as lojas de apps.

Sem domínio, use o Brevo com o endereço `quantoficapt@gmail.com` como remetente verificado. Funciona, mas mais e-mails vão para o spam.

### 2. Serviço de e-mail
- **Com domínio:** crie conta em resend.com (gratuito até 3 000 e-mails/mês), adicione o domínio e copie os registos DNS que o Resend indica para o seu registador. Crie uma chave de API.
- **Sem domínio:** crie conta em brevo.com, verifique `quantoficapt@gmail.com` como remetente e crie uma chave de API (SMTP & API → API Keys). No `wrangler.toml`, mude `EMAIL_PROVIDER` para `"brevo"` e `EMAIL_FROM` para `"QuantoFica <quantoficapt@gmail.com>"`.

### 3. Chave restrita do Stripe
No painel do Stripe: Programadores → Chaves de API → **Criar chave restrita**. Dê apenas permissão de **Leitura** a: Checkout Sessions, Subscriptions, Customers, PaymentIntents e Charges. Tudo o resto fica "Nenhum". Comece com uma chave do **modo de teste** para experimentar.

### 4. Ligações de pagamento
Em cada Payment Link (Cliente e Agência), em "Depois do pagamento", acrescente ao endereço de redirecionamento:

```
&session_id={CHECKOUT_SESSION_ID}
```

Fica assim: `https://quantofica.github.io/obrigado.html?plano=cliente&session_id={CHECKOUT_SESSION_ID}`. O Stripe substitui `{CHECKOUT_SESSION_ID}` sozinho. Faça-o nos links de teste e nos de produção.

### 5. Cloudflare
1. Crie conta gratuita em cloudflare.com.
2. No computador, com o Node.js instalado, abra um terminal nesta pasta `servidor` e corra:
   ```
   npx wrangler login
   npx wrangler secret put STRIPE_SECRET_KEY
   npx wrangler secret put QF_PRIVATE_JWK
   npx wrangler secret put SESSION_SECRET
   npx wrangler secret put EMAIL_API_KEY
   npx wrangler deploy
   ```
   - `QF_PRIVATE_JWK`: a chave privada que está no seu `gerador-chaves.html` (o texto JSON com `"d"`). Tem de ser a mesma, para as chaves já emitidas continuarem válidas.
   - `SESSION_SECRET`: um texto aleatório longo, por exemplo o resultado de `openssl rand -base64 48`.
3. O `deploy` mostra um endereço do tipo `https://quantofica-conta.<a-sua-conta>.workers.dev`. Abra `…/health` no navegador: deve aparecer `{"ok":true}`.

### 6. Ligar a app
- `index.html`: em `const QF_ACCOUNT_URL="";` coloque o endereço do passo 5.
- `obrigado.html`: em `const ACCOUNT_URL="";` coloque o mesmo endereço.
- `sw.js`: altere `VERSION` para a data do dia.

### 7. Testar e passar a produção
Faça uma compra de teste com o cartão `4242 4242 4242 4242`. A página de agradecimento deve dizer "Plano Cliente ativo neste navegador". Depois, noutro navegador, entre com o e-mail da compra.

Quando estiver tudo bem, troque a chave pela de produção: `npx wrangler secret put STRIPE_SECRET_KEY` com a chave restrita de produção.

---

Se preferir, envie-me o endereço do serviço e eu faço o passo 6 e confirmo o percurso completo.
