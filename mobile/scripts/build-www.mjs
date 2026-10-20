// Gera mobile/www/ a partir da app web (pasta acima) para o Capacitor.
// A app web continua a ser a fonte única: aqui só se copiam ficheiros e se fazem ajustes para a versão nativa.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const here = path.dirname(fileURLToPath(import.meta.url));
const MOBILE = path.resolve(here, "..");
const WEB = path.resolve(MOBILE, "..");
const OUT = path.join(MOBILE, "www");
const ACCOUNT_URL = process.env.QF_ACCOUNT_URL || "https://quantofica-conta.quantoficapt.workers.dev";

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
fs.cpSync(path.join(WEB, "icons"), path.join(OUT, "icons"), { recursive: true });
fs.copyFileSync(path.join(WEB, "manifest.webmanifest"), path.join(OUT, "manifest.webmanifest"));

let html = fs.readFileSync(path.join(WEB, "index.html"), "utf8");
const must = (re, what) => { if (!re.test(html)) throw new Error("Não encontrei no index.html: " + what); };

// 1. Sem service worker (no WebView os ficheiros já vêm da própria app)
must(/<script>\s*if\("serviceWorker" in navigator\)\{[\s\S]*?<\/script>/, "registo do service worker");
html = html.replace(/<script>\s*if\("serviceWorker" in navigator\)\{[\s\S]*?<\/script>/, "");

// 2. Contas: entrar com o e-mail sempre ligado na app nativa
must(/const QF_ACCOUNT_URL="[^"]*";/, "QF_ACCOUNT_URL");
html = html.replace(/const QF_ACCOUNT_URL="[^"]*";/, `const QF_ACCOUNT_URL=${JSON.stringify(ACCOUNT_URL)};`);

// 3. Ponte nativa e estilos próprios
must(/<\/head>/, "</head>"); must(/<\/body>/, "</body>");
html = html.replace("</head>", '<link rel="stylesheet" href="native.css">\n</head>');
html = html.replace(/<\/body>(?![\s\S]*<\/body>)/, '<script src="native.js"></script>\n</body>');

fs.writeFileSync(path.join(OUT, "index.html"), html);
fs.copyFileSync(path.join(MOBILE, "src", "native.css"), path.join(OUT, "native.css"));
await build({ entryPoints: [path.join(MOBILE, "src", "native.js")], bundle: true, format: "iife", target: ["safari15", "chrome100"],
  minify: true, outfile: path.join(OUT, "native.js"), logLevel: "warning" });
console.log("www/ pronto (contas: " + ACCOUNT_URL + ")");
