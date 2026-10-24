// QuantoFica — serviço de contas (Cloudflare Worker)
//
// O que faz:
//  • POST /claim          {session_id}       → logo após o pagamento, ativa o plano sem e-mail (usa a sessão de checkout do Stripe)
//  • POST /login/start    {email}            → envia um código de 6 dígitos ao e-mail, se houver compra associada
//  • POST /login/verify   {challenge, code}  → confirma o código e devolve a licença e a sessão
//  • POST /refresh        {session}          → devolve a licença atualizada (renovação da Agência, reembolsos, cancelamentos)
//  • GET  /health                             → verificação simples
//
// A licença devolvida é a mesma chave «QF1.…» que a app já verifica (ECDSA P-256), assinada aqui com a chave privada.
// Não há base de dados: o Stripe é a fonte de verdade e os códigos de login viajam assinados (HMAC) no "challenge".
//
// Segredos (wrangler secret put …):
//   STRIPE_SECRET_KEY   chave restrita do Stripe, só leitura: Checkout Sessions, Subscriptions, PaymentIntents, Charges
//   QF_PRIVATE_JWK      a chave privada do gerador de chaves (JSON JWK, com "d")
//   SESSION_SECRET      texto aleatório longo (assina sessões e códigos)
//   EMAIL_API_KEY       chave do Resend ou do Brevo
// Variáveis (wrangler.toml → [vars]):
//   EMAIL_PROVIDER      "resend" ou "brevo"
//   EMAIL_FROM          ex.: "QuantoFica <conta@mail.quantofica.com.pt>"
//   ALLOWED_ORIGINS     ex.: "https://quantofica.github.io,capacitor://localhost,https://localhost"
//   GRACE_DAYS          dias de tolerância depois do fim do período pago da Agência (por omissão 3)

const enc = new TextEncoder(), dec = new TextDecoder();
const b64u = bytes => { let s = ""; const u = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  for (let i = 0; i < u.length; i++) s += String.fromCharCode(u[i]);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); };
const b64uDec = t => { t = t.replace(/-/g, "+").replace(/_/g, "/"); while (t.length % 4) t += "=";
  const s = atob(t), u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u; };
const normEmail = e => String(e || "").trim().toLowerCase();
const validEmail = e => /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/.test(e) && e.length <= 254;
const isoDay = ms => new Date(ms).toISOString().slice(0, 10);

const SESSION_DAYS = 400, CODE_MINUTES = 15;

/* ---------------- Assinaturas ---------------- */
let _priv = null, _hmac = null, _hmacFor = null;
async function privKey(env) {
  if (!_priv) { const jwk = JSON.parse(env.QF_PRIVATE_JWK); delete jwk.key_ops; delete jwk.ext;
    _priv = await crypto.subtle.importKey("jwk", jwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]); }
  return _priv; }
async function hmacKey(env) {
  if (!_hmac || _hmacFor !== env.SESSION_SECRET) { _hmacFor = env.SESSION_SECRET;
    _hmac = await crypto.subtle.importKey("raw", enc.encode(env.SESSION_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]); }
  return _hmac; }
async function signLicense(env, payload) {
  const body = "QF1." + b64u(enc.encode(JSON.stringify(payload)));
  const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, await privKey(env), enc.encode(body));
  return body + "." + b64u(sig); }
async function signToken(env, prefix, payload) {
  const body = prefix + "." + b64u(enc.encode(JSON.stringify(payload)));
  const sig = await crypto.subtle.sign("HMAC", await hmacKey(env), enc.encode(body));
  return body + "." + b64u(sig); }
async function readToken(env, prefix, tok) {
  const m = new RegExp("^" + prefix + "\\.([A-Za-z0-9_-]+)\\.([A-Za-z0-9_-]+)$").exec(String(tok || ""));
  if (!m) return null;
  const ok = await crypto.subtle.verify("HMAC", await hmacKey(env), b64uDec(m[2]), enc.encode(prefix + "." + m[1]));
  if (!ok) return null;
  try { return JSON.parse(dec.decode(b64uDec(m[1]))); } catch (e) { return null; } }
async function sha256(s) { return b64u(await crypto.subtle.digest("SHA-256", enc.encode(s))); }
// Hash do código de login com o segredo do servidor (HMAC): sem o SESSION_SECRET não é possível
// testar os 1 000 000 códigos possíveis fora do servidor a partir do "challenge" (que é legível pelo cliente).
async function codeMac(env, code, email, x) {
  return b64u(await crypto.subtle.sign("HMAC", await hmacKey(env), enc.encode("code|" + code + "|" + email + "|" + x))); }

/* ---------------- Stripe ---------------- */
async function stripe(env, path, params) {
  const u = new URL("https://api.stripe.com/v1/" + path);
  for (const [k, v] of params || []) u.searchParams.append(k, v);
  const r = await fetch(u, { headers: { Authorization: "Bearer " + env.STRIPE_SECRET_KEY } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) { const err = new Error("stripe " + r.status + ": " + (j.error && j.error.message || "")); err.stripe = true; throw err; }
  return j; }

function planOf(s) {
  const p = (s.metadata && s.metadata.plano) || "";
  if (p === "cliente" || p === "agencia") return p;
  return s.mode === "subscription" ? "agencia" : "cliente"; }

function periodEnd(sub) {
  if (sub.current_period_end) return sub.current_period_end;
  const ends = ((sub.items && sub.items.data) || []).map(i => i.current_period_end).filter(Boolean);
  return ends.length ? Math.max(...ends) : null; }

// Avalia uma sessão de checkout concluída e devolve o direito de acesso que dá (ou null)
async function entitlementOf(env, s) {
  if (s.status !== "complete") return null;
  const plan = planOf(s), email = normEmail(s.customer_details && s.customer_details.email || s.customer_email);
  const name = (s.customer_details && (s.customer_details.business_name || s.customer_details.name)) || "";
  if (plan === "cliente") {
    if (s.payment_status !== "paid") return null;
    const pi = s.payment_intent;
    if (pi && typeof pi === "object") {
      const ch = pi.latest_charge;
      if (pi.status !== "succeeded") return null;
      if (ch && typeof ch === "object" && (ch.refunded || ch.disputed)) return null; }
    return { tier: "cliente", email, name, id: s.id.slice(-12), exp: null, created: s.created }; }
  // Agência: depende do estado da subscrição
  let sub = s.subscription; if (!sub) return null;
  if (typeof sub === "string") sub = await stripe(env, "subscriptions/" + sub, []);
  if (!["active", "trialing", "past_due"].includes(sub.status)) return null;
  const end = periodEnd(sub); if (!end) return null;
  const grace = Number(env.GRACE_DAYS || 3);
  const exp = isoDay(end * 1000 + grace * 864e5);
  if (exp < isoDay(Date.now())) return null;
  return { tier: "agencia", email, name, id: sub.id.slice(-12), exp, created: s.created }; }

// Melhor plano associado a um e-mail: Agência ativa > Cliente > nada
async function entitlementByEmail(env, email) {
  const found = [];
  async function collect(filter) {
    let after = null;
    for (let page = 0; page < 5; page++) {
      const params = [filter, ["status", "complete"], ["limit", "100"], ["expand[]", "data.payment_intent.latest_charge"]];
      if (after) params.push(["starting_after", after]);
      const list = await stripe(env, "checkout/sessions", params);
      for (const s of list.data || []) found.push(s);
      if (!list.has_more || !list.data.length) break;
      after = list.data[list.data.length - 1].id; } }
  // 1) pelo e-mail escrito no checkout (o comprar.html envia-o já em minúsculas)
  await collect(["customer_details[email]", email]);
  // 2) pelos clientes Stripe com este e-mail (apanha e-mails escritos com maiúsculas)
  try { const cs = await stripe(env, "customers/search", [["query", `email:'${email.replace(/'/g, "")}'`], ["limit", "20"]]);
    for (const c of cs.data || []) await collect(["customer", c.id]); } catch (e) { /* a pesquisa de clientes pode não estar disponível */ }
  let best = null;
  const seen = new Set();
  for (const s of found) { if (seen.has(s.id)) continue; seen.add(s.id);
    const ent = await entitlementOf(env, s).catch(() => null); if (!ent) continue;
    if (!best || rank(ent) > rank(best) || (rank(ent) === rank(best) && (ent.exp || "") > (best.exp || ""))) best = ent; }
  if (best) best.email = email;
  return best; }
const rank = e => e.tier === "agencia" ? 2 : 1;

/* ---------------- Respostas ---------------- */
async function grant(env, ent) {
  const payload = { t: ent.tier, n: String(ent.name || "").slice(0, 80), e: ent.email, id: ent.id, a: 1 };
  if (ent.exp) payload.x = ent.exp;
  const license = await signLicense(env, payload);
  const session = await signToken(env, "QS1", { e: ent.email, i: Math.floor(Date.now() / 1000) });
  return { ok: true, license, session, tier: ent.tier, exp: ent.exp || null, email: ent.email }; }

async function sendCode(env, email, code) {
  const subject = `O seu código QuantoFica: ${code}`;
  const text = `Olá,\n\nO seu código para entrar no QuantoFica é: ${code}\n\nÉ válido durante ${CODE_MINUTES} minutos. Se não pediu este código, ignore este e-mail.\n\nQuantoFica`;
  const html = `<div style="font-family:system-ui,sans-serif;max-width:480px;margin:auto;color:#18212e">
    <h2 style="color:#1a4787;margin:0 0 12px">QuantoFica</h2>
    <p>O seu código para entrar no QuantoFica é:</p>
    <p style="font-size:32px;font-weight:700;letter-spacing:6px;margin:16px 0;color:#1a4787">${code}</p>
    <p style="color:#5b6678">É válido durante ${CODE_MINUTES} minutos. Se não pediu este código, ignore este e-mail.</p></div>`;
  const prov = String(env.EMAIL_PROVIDER || "resend").toLowerCase();
  let r;
  if (prov === "brevo") {
    const m = /^(.*)<(.+)>$/.exec(env.EMAIL_FROM || ""); const sender = m ? { name: m[1].trim(), email: m[2].trim() } : { email: env.EMAIL_FROM };
    r = await fetch("https://api.brevo.com/v3/smtp/email", { method: "POST",
      headers: { "api-key": env.EMAIL_API_KEY, "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ sender, to: [{ email }], subject, textContent: text, htmlContent: html }) });
  } else {
    r = await fetch("https://api.resend.com/emails", { method: "POST",
      headers: { Authorization: "Bearer " + env.EMAIL_API_KEY, "content-type": "application/json" },
      body: JSON.stringify({ from: env.EMAIL_FROM, to: [email], subject, text, html }) }); }
  if (!r.ok) throw new Error("email " + r.status + ": " + (await r.text().catch(() => ""))); }

function randomCode() { const u = new Uint32Array(1); crypto.getRandomValues(u); return String(u[0] % 1e6).padStart(6, "0"); }

/* ---------------- Rotas ---------------- */
async function route(req, env, path, body) {
  if (path === "/claim") {
    const id = String(body.session_id || "");
    if (!/^cs_(test|live)_[A-Za-z0-9]+$/.test(id)) return [400, { ok: false, err: "bad_request" }];
    let s; try { s = await stripe(env, "checkout/sessions/" + id, [["expand[]", "payment_intent.latest_charge"]]); }
    catch (e) { if (e.stripe) return [404, { ok: false, err: "not_found" }]; throw e; }
    const ent = await entitlementOf(env, s);
    if (!ent) return [409, { ok: false, err: s.status === "complete" ? "inactive" : "not_paid" }];
    if (!ent.email) return [409, { ok: false, err: "no_email" }];
    return [200, await grant(env, ent)]; }

  if (path === "/login/start") {
    const email = normEmail(body.email);
    if (!validEmail(email)) return [400, { ok: false, err: "bad_email" }];
    // Só envia o código se houver uma compra com este e-mail; a resposta é igual nos dois casos (não revela quem é cliente)
    const ent = await entitlementByEmail(env, email);
    const code = randomCode(), x = Math.floor(Date.now() / 1000) + CODE_MINUTES * 60;
    const challenge = await signToken(env, "QC1", { e: email, h: await codeMac(env, code, email, x), x });
    if (ent) await sendCode(env, email, code);
    return [200, { ok: true, challenge }]; }

  if (path === "/login/verify") {
    const c = await readToken(env, "QC1", body.challenge), code = String(body.code || "").replace(/\D/g, "");
    if (!c || !c.e || !c.x) return [400, { ok: false, err: "bad_request" }];
    if (c.x < Date.now() / 1000) return [401, { ok: false, err: "code_expired" }];
    if (code.length !== 6 || (await codeMac(env, code, c.e, c.x)) !== c.h) return [401, { ok: false, err: "bad_code" }];
    const ent = await entitlementByEmail(env, c.e);
    if (!ent) return [404, { ok: false, err: "no_purchase" }];
    return [200, await grant(env, ent)]; }

  if (path === "/refresh") {
    const s = await readToken(env, "QS1", body.session);
    if (!s || !s.e) return [401, { ok: false, err: "bad_session" }];
    if (s.i + SESSION_DAYS * 86400 < Date.now() / 1000) return [401, { ok: false, err: "session_expired" }];
    const ent = await entitlementByEmail(env, s.e);
    if (!ent) return [200, { ok: true, license: null, tier: "demo", email: s.e }];
    return [200, await grant(env, ent)]; }

  return [404, { ok: false, err: "not_found" }]; }

function cors(env, req) {
  const origin = req.headers.get("Origin") || "";
  const allowed = String(env.ALLOWED_ORIGINS || "https://quantofica.github.io").split(",").map(s => s.trim()).filter(Boolean);
  const h = { "Access-Control-Allow-Methods": "POST, GET, OPTIONS", "Access-Control-Allow-Headers": "content-type", "Access-Control-Max-Age": "86400", Vary: "Origin" };
  if (allowed.includes(origin)) h["Access-Control-Allow-Origin"] = origin;
  return h; }

export default {
  async fetch(req, env) {
    const url = new URL(req.url), path = url.pathname.replace(/\/+$/, "") || "/", ch = cors(env, req);
    const json = (status, obj) => new Response(JSON.stringify(obj), { status, headers: { ...ch, "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: ch });
    if (req.method === "GET" && path === "/health") return json(200, { ok: true });
    if (req.method !== "POST") return json(405, { ok: false, err: "method" });
    // Limite de pedidos por IP (opcional: binding RATE_LIMITER no wrangler.toml)
    if (env.RATE_LIMITER && path.startsWith("/login")) {
      const ip = req.headers.get("CF-Connecting-IP") || "?";
      const { success } = await env.RATE_LIMITER.limit({ key: path + ":" + ip });
      if (!success) return json(429, { ok: false, err: "too_many" }); }
    let body = {}; try { body = await req.json(); } catch (e) { return json(400, { ok: false, err: "bad_json" }); }
    try { const [status, obj] = await route(req, env, path, body || {}); return json(status, obj); }
    catch (e) { console.error(e && e.stack || e); return json(502, { ok: false, err: "upstream" }); } } };
