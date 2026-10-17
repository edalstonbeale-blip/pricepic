// Pricepic server: no dependencies, needs Node 20+.  Run: node server.js
const http = require("http"), fs = require("fs"), path = require("path"), crypto = require("crypto");
const PORT = process.env.PORT || 3000;
const KEY = process.env.ANTHROPIC_API_KEY;
const ADMIN = (process.env.ADMIN_EMAIL || "").trim().toLowerCase();
const isAdmin = (u) => !!(u && ADMIN && u.email === ADMIN);
const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5";
const FILE = path.join(__dirname, "data.json");
let db = { users: {}, sessions: {}, posts: [], messages: [], reports: [], ratings: {} };
try { db = Object.assign(db, JSON.parse(fs.readFileSync(FILE, "utf8"))); } catch (e) {}
let t; const save = () => { clearTimeout(t); t = setTimeout(() => fs.writeFile(FILE, JSON.stringify(db), () => {}), 200); };
const id = () => crypto.randomBytes(8).toString("hex");
const hash = (pw, salt) => crypto.scryptSync(pw, salt, 32).toString("hex");

const send = (res, code, obj, headers) => { res.writeHead(code, Object.assign({ "Content-Type": "application/json" }, headers)); res.end(JSON.stringify(obj)); };
const body = (req) => new Promise((ok, no) => { let b = "", n = 0; req.on("data", c => { n += c.length; if (n > 12e6) { no(new Error("Too large")); req.destroy(); } else b += c; }); req.on("end", () => { try { ok(b ? JSON.parse(b) : {}); } catch (e) { no(e); } }); });
const me = (req) => { const m = /sid=([a-f0-9]+)/.exec(req.headers.cookie || ""); const s = m && db.sessions[m[1]]; return s ? db.users[s] : null; };
const login = (res, uid) => { const sid = crypto.randomBytes(24).toString("hex"); db.sessions[sid] = uid; save(); return { "Set-Cookie": `sid=${sid}; HttpOnly; SameSite=Lax; Path=/; Max-Age=2592000` }; };
const pub = (u) => ({ id: u.id, name: u.name, admin: isAdmin(u) });
const rating = (sid) => { const r = Object.values(db.ratings[sid] || {}); return { avg: r.length ? Math.round(r.reduce((a, b) => a + b, 0) / r.length * 10) / 10 : 0, count: r.length }; };
const view = (p, u) => Object.assign({}, p, { likes: undefined, likeCount: (p.likes || []).length, liked: !!(u && (p.likes || []).includes(u.id)), following: !!(u && (u.following || []).includes(p.sellerId)), sellerRating: rating(p.sellerId) });
const clean = (s, n) => String(s || "").replace(/[<>]/g, "").trim().slice(0, n);

async function scan(images, note) {
  if (!KEY) throw new Error("Set ANTHROPIC_API_KEY to turn on scanning.");
  const content = images.slice(0, 3).map(d => { const m = /^data:(image\/\w+);base64,(.+)$/.exec(d); if (!m) throw new Error("Bad image"); return { type: "image", source: { type: "base64", media_type: m[1], data: m[2] } }; });
  content.push({ type: "text", text: "You are a resale pricing expert. Identify the item and estimate its typical used resale value on eBay in USD. User note: " + JSON.stringify(note || "none") + ". Reply with ONLY a JSON object (no markdown) with keys: name, brand, category, condition (New, Like new, Good, Fair or Poor), low, high (numbers), confidence (low, medium or high), reasoning (1-2 sentences), ebay_title (max 80 chars), ebay_description (3-6 short honest lines). If you cannot identify it, name it 'Unknown item'." });
  const r = await fetch("https://api.anthropic.com/v1/messages", { method: "POST", headers: { "x-api-key": KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" }, body: JSON.stringify({ model: MODEL, max_tokens: 1000, messages: [{ role: "user", content }] }) });
  const j = await r.json(); if (!r.ok) throw new Error((j.error && j.error.message) || "Scan failed");
  const txt = j.content.map(c => c.text || "").join("").replace(/```json|```/g, "").trim();
  return JSON.parse(txt);
}

const routes = {
  "POST /api/signup": async (req, res) => {
    const b = await body(req), name = clean(b.name, 30), email = clean(b.email, 80).toLowerCase(), pw = String(b.password || "");
    if (!name || !/^\S+@\S+\.\S+$/.test(email) || pw.length < 8) return send(res, 400, { error: "Enter a name, a valid email and a password of 8+ characters." });
    if (Object.values(db.users).some(u => u.email === email)) return send(res, 400, { error: "That email already has an account." });
    const u = { id: id(), name, email, salt: id(), at: Date.now() }; u.hash = hash(pw, u.salt); db.users[u.id] = u;
    send(res, 200, pub(u), login(res, u.id));
  },
  "POST /api/login": async (req, res) => {
    const b = await body(req), u = Object.values(db.users).find(x => x.email === clean(b.email, 80).toLowerCase());
    if (!u || hash(String(b.password || ""), u.salt) !== u.hash) return send(res, 400, { error: "Wrong email or password." });
    send(res, 200, pub(u), login(res, u.id));
  },
  "POST /api/logout": async (req, res) => { const m = /sid=([a-f0-9]+)/.exec(req.headers.cookie || ""); if (m) delete db.sessions[m[1]]; save(); send(res, 200, {}, { "Set-Cookie": "sid=; Max-Age=0; Path=/" }); },
  "GET /api/me": async (req, res) => { const u = me(req); send(res, 200, u ? pub(u) : null); },
  "POST /api/scan": async (req, res) => { if (!me(req)) return send(res, 401, { error: "Log in first." }); const b = await body(req); send(res, 200, await scan(b.images || [], clean(b.note, 300))); },
  "POST /api/posts": async (req, res) => {
    const u = me(req); if (!u) return send(res, 401, { error: "Log in first." });
    const b = await body(req); if (!b.name || !b.photo) return send(res, 400, { error: "Missing item details." });
    const p = { id: id(), sellerId: u.id, seller: u.name, name: clean(b.name, 100), title: clean(b.title, 80), desc: clean(b.desc, 1500), price: Math.max(0, Number(b.price) || 0), condition: clean(b.condition, 20), photo: String(b.photo).slice(0, 400000), at: Date.now() };
    db.posts.unshift(p); save(); send(res, 200, p);
  },
  "GET /api/posts": async (req, res, url) => {
    const u = me(req), before = Number(url.searchParams.get("before")) || Infinity, q = (url.searchParams.get("q") || "").toLowerCase(), fol = url.searchParams.get("following") === "1";
    const list = db.posts.filter(p => p.at < before && (!q || (p.name + " " + p.title).toLowerCase().includes(q)) && (!fol || (u && (u.following || []).includes(p.sellerId)))).slice(0, 8);
    send(res, 200, { posts: list.map(p => view(p, u)), next: list.length === 8 ? list[list.length - 1].at : null });
  },
  "POST /api/posts/delete": async (req, res) => { const u = me(req); if (!u) return send(res, 401, {}); const b = await body(req); db.posts = db.posts.filter(p => !(p.id === b.id && (p.sellerId === u.id || isAdmin(u)))); if (isAdmin(u)) db.reports = db.reports.filter(r => r.postId !== b.id); save(); send(res, 200, {}); },
  "POST /api/like": async (req, res) => { const u = me(req); if (!u) return send(res, 401, {}); const b = await body(req), p = db.posts.find(x => x.id === b.id); if (!p) return send(res, 404, {}); p.likes = p.likes || []; const i = p.likes.indexOf(u.id); i < 0 ? p.likes.push(u.id) : p.likes.splice(i, 1); save(); send(res, 200, view(p, u)); },
  "POST /api/follow": async (req, res) => { const u = me(req); if (!u) return send(res, 401, {}); const b = await body(req); if (!db.users[b.id] || b.id === u.id) return send(res, 400, { error: "Can't follow that seller." }); u.following = u.following || []; const i = u.following.indexOf(b.id); i < 0 ? u.following.push(b.id) : u.following.splice(i, 1); save(); send(res, 200, { following: i < 0 }); },
  "POST /api/rate": async (req, res) => {
    const u = me(req); if (!u) return send(res, 401, {}); const b = await body(req), n = Math.round(Number(b.stars));
    if (!db.users[b.id] || b.id === u.id || !(n >= 1 && n <= 5)) return send(res, 400, { error: "Can't rate that." });
    if (!db.messages.some(m => (m.from === u.id && m.to === b.id) || (m.from === b.id && m.to === u.id))) return send(res, 400, { error: "Message the seller before rating them." });
    (db.ratings[b.id] = db.ratings[b.id] || {})[u.id] = n; save(); send(res, 200, rating(b.id));
  },
  "GET /api/admin/reports": async (req, res) => {
    const u = me(req); if (!isAdmin(u)) return send(res, 403, { error: "Admins only." });
    const by = {}; db.reports.forEach(r => { (by[r.postId] = by[r.postId] || new Set()).add(r.by); });
    const out = Object.keys(by).map(id => { const p = db.posts.find(x => x.id === id); return p && { id, count: by[id].size, name: p.title || p.name, seller: p.seller, price: p.price, photo: p.photo }; }).filter(Boolean).sort((a, b) => b.count - a.count);
    send(res, 200, out);
  },
  "POST /api/admin/dismiss": async (req, res) => { const u = me(req); if (!isAdmin(u)) return send(res, 403, { error: "Admins only." }); const b = await body(req); db.reports = db.reports.filter(r => r.postId !== b.id); save(); send(res, 200, {}); },
  "POST /api/report": async (req, res) => { const u = me(req); if (!u) return send(res, 401, {}); const b = await body(req); db.reports.push({ postId: clean(b.postId, 40), by: u.id, at: Date.now() }); save(); send(res, 200, {}); },
  "POST /api/messages": async (req, res) => {
    const u = me(req); if (!u) return send(res, 401, { error: "Log in first." });
    const b = await body(req), p = db.posts.find(x => x.id === b.postId), text = clean(b.text, 1000);
    if (!p || !text) return send(res, 400, { error: "Write a message first." });
    const to = u.id === p.sellerId ? b.to : p.sellerId; if (!db.users[to] || to === u.id) return send(res, 400, { error: "Can't send that." });
    const m = { id: id(), postId: p.id, item: p.name, from: u.id, to, text, at: Date.now() }; db.messages.push(m); save(); send(res, 200, m);
  },
  "GET /api/inbox": async (req, res) => {
    const u = me(req); if (!u) return send(res, 401, {}); const th = {};
    db.messages.filter(m => m.from === u.id || m.to === u.id).forEach(m => { const o = m.from === u.id ? m.to : m.from, k = m.postId + "|" + o; if (!th[k] || th[k].at < m.at) th[k] = { postId: m.postId, item: m.item, other: o, otherName: db.users[o] ? db.users[o].name : "Someone", last: m.text, at: m.at }; });
    send(res, 200, Object.values(th).sort((a, b) => b.at - a.at));
  },
  "GET /api/thread": async (req, res, url) => {
    const u = me(req); if (!u) return send(res, 401, {}); const pid = url.searchParams.get("postId"), o = url.searchParams.get("other");
    send(res, 200, db.messages.filter(m => m.postId === pid && ((m.from === u.id && m.to === o) || (m.from === o && m.to === u.id))).map(m => ({ mine: m.from === u.id, text: m.text, at: m.at })));
  },
};

http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://x"), r = routes[req.method + " " + url.pathname];
  try {
    if (r) return await r(req, res, url);
    const f = path.join(__dirname, "public", url.pathname === "/" ? "index.html" : path.normalize(url.pathname).replace(/^(\.\.[/\\])+/, ""));
    if (!f.startsWith(path.join(__dirname, "public")) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end("Not found"); }
    res.writeHead(200, { "Content-Type": { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".webmanifest": "application/manifest+json", ".json": "application/json" }[path.extname(f)] || "application/octet-stream" }); fs.createReadStream(f).pipe(res);
  } catch (e) { send(res, 500, { error: e.message || "Server error" }); }
}).listen(PORT, () => console.log("Pricepic running at http://localhost:" + PORT + (KEY ? "" : "  (scanning is off: set ANTHROPIC_API_KEY)")));
