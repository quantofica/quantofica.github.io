# QuantoFica — app para iPhone e Android

Esta pasta transforma a app web (o `index.html` da pasta acima) numa app nativa com o **Capacitor**.
A app web continua a ser a única fonte: quando a muda, basta voltar a sincronizar e gerar uma versão nova.

## O que a versão nativa faz de diferente
- **Exportar PDF, Excel, cópia da carteira e QR:** abre a folha de partilha do iPhone ou do Android (Guardar em Ficheiros, Mail, WhatsApp…).
- **Links externos** (site, WhatsApp, e-mail, telefone) abrem no navegador ou na app do sistema.
- **Entrar com o e-mail** está sempre ligado, para quem comprou no site usar o plano na app.
- **Os botões "Comprar" ficam escondidos.** As compras dentro da app (App Store e Google Play) entram numa fase seguinte, com o RevenueCat.
- Botão "voltar" do Android fecha diálogos e menus antes de sair; barra de estado acompanha o tema claro/escuro.
- Só iPhone (sem iPad) e só na vertical; idioma português.
- Identificador da app: `pt.com.quantofica.app`.

## Preparar o Mac (uma vez)
1. **Xcode** — App Store (gratuito). Abra-o uma vez para aceitar a licença e instalar os componentes.
2. **Android Studio** — developer.android.com/studio. Na primeira abertura, aceite a instalação do SDK.
3. **Node.js 22 LTS** — nodejs.org (instalador para macOS).
4. No Terminal:
   ```
   git clone https://github.com/quantofica/quantofica.github.io.git
   cd quantofica.github.io/mobile
   npm install
   npm run sync
   ```

## Experimentar no iPhone
1. `npm run ios` — abre o Xcode.
2. Em **App → Signing & Capabilities**, em **Team**, escolha a sua conta Apple (até a conta de programador estar aprovada, a conta pessoal serve para instalar no seu próprio iPhone).
3. Ligue o iPhone por cabo, escolha-o no topo do Xcode e carregue em **▶ (Run)**. Na primeira vez, no iPhone: Definições → Geral → VPN e gestão de dispositivos → confie no programador. Ative também o **Modo de programador** se o iPhone o pedir.

## Experimentar no Android
1. `npm run android` — abre o Android Studio.
2. Escolha um emulador (Device Manager) ou um telemóvel com a depuração USB ativa, e carregue em **▶ Run**.

## Enviar para teste (TestFlight e Google Play)
**iPhone**
1. Em appstoreconnect.apple.com → **Apps → +**, crie a app: nome "QuantoFica", idioma principal Português (Portugal), Bundle ID `pt.com.quantofica.app`, SKU `quantofica-ios`.
2. No Xcode, escolha **Any iOS Device (arm64)** e faça **Product → Archive**. No Organizer: **Distribute App → App Store Connect → Upload**.
3. Ao fim de alguns minutos a versão aparece no **TestFlight**. Adicione-se como testador interno.

**Android**
1. No Android Studio: **Build → Generate Signed App Bundle or APK → Android App Bundle**. Crie uma **chave de assinatura (keystore)** nova.
   **Guarde o ficheiro `.jks` e as palavras-passe em lugar seguro (e com cópia).** Sem eles não consegue publicar atualizações. Nunca os ponha no GitHub.
2. Em play.google.com/console → **Criar app**, depois **Testes → Teste fechado**, carregue o `.aab` e adicione os 12 testadores (os e-mails Gmail deles).

## Atualizar a app depois de mudar o site
```
git pull
cd mobile
npm run sync
```
Antes de enviar uma versão nova às lojas, aumente o número da versão:
- iPhone: no Xcode, **App → General → Version** (ex.: 1.0.1) e **Build** (1, 2, 3…).
- Android: em `android/app/build.gradle`, `versionCode` (+1) e `versionName`.

## Ícones e ecrã inicial
Os originais estão em `assets/` (gerados a partir de `assets-src/icon.svg`). Para os voltar a gerar: `npm run assets`.
