// QuantoFica — ponte nativa (só corre dentro da app iOS/Android).
// A app web fica igual; aqui substituem-se as partes que num WebView não funcionam:
//  • descarregar ficheiros (PDF, Excel, cópia de segurança, QR) → guardar e abrir a folha de partilha do sistema
//  • navigator.share com ficheiros (o WebView do Android não o tem) → Share nativo
//  • links externos (site, WhatsApp, e-mail, telefone) → navegador do sistema / app respetiva
//  • botão "voltar" do Android → fecha diálogos e menus antes de sair
import { Capacitor } from "@capacitor/core";
import { Filesystem, Directory } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";
import { Browser } from "@capacitor/browser";
import { App } from "@capacitor/app";
import { StatusBar, Style } from "@capacitor/status-bar";

const NATIVE = Capacitor.isNativePlatform();
const PLATFORM = Capacitor.getPlatform();
if (NATIVE) document.documentElement.dataset.native = PLATFORM;

const blobToBase64 = blob => new Promise((res, rej) => {
  const r = new FileReader();
  r.onload = () => res(String(r.result).split(",")[1] || "");
  r.onerror = () => rej(r.error);
  r.readAsDataURL(blob);
});
const safeName = n => String(n || "ficheiro").replace(/[\\/:*?"<>|]+/g, "-").slice(0, 120);

async function writeTemp(name, blob) {
  const data = await blobToBase64(blob);
  const r = await Filesystem.writeFile({ path: "partilhas/" + safeName(name), data, directory: Directory.Cache, recursive: true });
  return r.uri;
}
async function shareFiles(files, { title, text } = {}) {
  const uris = [];
  for (const f of files) uris.push(await writeTemp(f.name, f));
  try { await Share.share({ title: title || "QuantoFica", text: text || undefined, files: uris, dialogTitle: title || "Partilhar" }); return true; }
  catch (e) { if (/cancel/i.test(String(e && (e.message || e)))) return false; throw e; }
}

function isExternal(href) {
  if (!href) return false;
  try { const u = new URL(href, location.href); return u.origin !== location.origin; } catch (e) { return false; }
}
async function openExternal(href) {
  if (/^https?:/i.test(href)) { await Browser.open({ url: href, presentationStyle: "popover" }); return; }
  // mailto:, tel:, whatsapp:, sms: → o sistema abre a app respetiva
  location.href = href;
}

if (NATIVE) {
  // 1. Guardar ficheiros → folha de partilha (o utilizador escolhe "Guardar em Ficheiros", Mail, WhatsApp…)
  window.saveFile = async function (filename, blob) {
    try { const ok = await shareFiles([new File([blob], filename, { type: blob.type || "application/octet-stream" })], { title: filename });
      return ok ? "Ficheiro pronto: escolha onde o guardar ou com quem o partilhar." : "Exportação cancelada."; }
    catch (e) { return "Não foi possível exportar o ficheiro."; }
  };

  // 2. navigator.share com ficheiros (PDF por e-mail, WhatsApp, etc.)
  navigator.canShare = () => true;
  navigator.share = async function (data = {}) {
    const files = Array.isArray(data.files) ? data.files : [];
    if (files.length) { const ok = await shareFiles(files, data); if (!ok) { const e = new Error("cancel"); e.name = "AbortError"; throw e; } return; }
    try { await Share.share({ title: data.title, text: data.text, url: data.url }); }
    catch (e) { const er = new Error("cancel"); er.name = "AbortError"; throw er; }
  };

  // 3. Links externos
  const _openLink = window.openLink;
  window.openLink = function (href) {
    if (/^https:\/\/wa\.me\//.test(href || "")) {   // WhatsApp: tenta a app; se não houver, abre o wa.me no navegador
      const m = /^https:\/\/wa\.me\/(\d*)\??(.*)$/.exec(href); const ph = m && m[1], q = m && m[2] || "";
      const app = "whatsapp://send?" + (ph ? "phone=" + ph + "&" : "") + q;
      try { if (typeof window.qfWaCopy === "function") window.qfWaCopy(href); } catch (e) {}
      location.href = app; return;
    }
    if (isExternal(href) || /^(mailto|tel|sms|whatsapp):/i.test(href || "")) { openExternal(href); return; }
    return _openLink ? _openLink(href) : (location.href = href);
  };
  window.open = function (url) { if (url) window.openLink(String(url)); return null; };
  document.addEventListener("click", e => {
    const a = e.target.closest && e.target.closest("a[href]"); if (!a || e.defaultPrevented) return;
    const href = a.getAttribute("href");
    if (/^(mailto|tel|sms|whatsapp):/i.test(href) || (isExternal(a.href) && (a.target === "_blank" || /^https?:/i.test(href)))) {
      e.preventDefault(); window.openLink(a.href);
    }
  });

  // 4. Botão "voltar" do Android
  App.addListener("backButton", ({ canGoBack }) => {
    const dlg = [...document.querySelectorAll("dialog[open]")].pop();
    if (dlg) { dlg.dispatchEvent(new Event("cancel", { cancelable: true })); if (dlg.open) dlg.close(); return; }
    const menu = document.getElementById("share-menu");
    if (menu && !menu.hidden) { menu.hidden = true; return; }
    if (typeof window.QT !== "undefined" && window.QT && window.QT !== "dados" && typeof window.qtGo === "function") { window.qtGo("dados", true); return; }
    if (canGoBack) history.back(); else App.minimizeApp();
  });

  // 5. Barra de estado a condizer com o tema
  const setBar = () => { const dark = matchMedia("(prefers-color-scheme: dark)").matches || document.documentElement.dataset.theme === "dark";
    StatusBar.setStyle({ style: dark ? Style.Dark : Style.Light }).catch(() => {}); };
  setBar(); matchMedia("(prefers-color-scheme: dark)").addEventListener?.("change", setBar);
  new MutationObserver(setBar).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
}
