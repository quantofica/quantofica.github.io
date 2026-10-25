# QuantoFica — simulador fiscal imobiliário PT·BR (app instalável)

## Conteúdo
- `index.html` — a aplicação completa
- `manifest.webmanifest` — nome, ícones e cores da app
- `sw.js` — permite usar a app sem internet
- `icons/` — ícones da app
- `.nojekyll` — necessário no GitHub Pages

## Publicar no GitHub Pages (gratuito, cerca de 5 minutos)
1. Crie uma conta em github.com, se ainda não tiver.
2. Crie um repositório novo, por exemplo `simulador-pt`, público.
3. Em **Add file → Upload files**, arraste todos os ficheiros desta pasta, incluindo a pasta `icons` e o ficheiro `.nojekyll`. Clique **Commit changes**.
4. Vá a **Settings → Pages**. Em **Source**, escolha **Deploy from a branch**, branch `main`, pasta `/ (root)`, e clique **Save**.
5. Em um ou dois minutos o endereço fica disponível: `https://<o-seu-utilizador>.github.io/simulador-pt/`

Alternativa ainda mais rápida: arraste a pasta inteira para app.netlify.com/drop.

## Instalar no telemóvel
- **iPhone (Safari):** abra o endereço, toque em **Partilhar** e depois **Adicionar ao ecrã principal**.
- **Android (Chrome):** abra o endereço e toque em **Instalar app** (ou menu ⋮ → **Adicionar ao ecrã principal**).

A app abre em ecrã inteiro, com ícone próprio, e funciona sem internet depois da primeira abertura.

## Atualizar
1. Substitua o `index.html` no repositório pela nova versão.
2. Em `sw.js`, altere a linha `const VERSION = "..."` (por exemplo, para a data do dia).
3. Os telemóveis recebem a versão nova na abertura seguinte com internet.

## Notas
- As simulações ficam guardadas só no dispositivo de cada pessoa. Os contactos do ecrã "Experimente grátis" e da compra são enviados para a folha Google (ver ponto 9 dos termos).
- As taxas e escalões são os de 2026. Reveja-os todos os anos após o Orçamento do Estado.
- Se tornar o repositório público, qualquer pessoa com o endereço pode usar a app.
