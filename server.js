const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

let webpush = null;
try {
  webpush = require("web-push");
} catch (_) {}

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = process.env.PORT || 10000;

const SUPABASE_URL = String(process.env.SUPABASE_URL || "").trim().replace(/\/+$/, "");
const SUPABASE_KEY = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();

const DATA_FILE = path.join(__dirname, "data.json");

app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));

app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");

  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

app.use(express.static(path.join(__dirname, "public")));

const DEFAULT_DB = {
  users: [],
  contacts: {},
  messages: {},
  pushSubscriptions: {},
  settings: {}
};

let db = normalizeDB(DEFAULT_DB);
let remoteReady = false;
let remoteAvailable = false;

const sessions = new Map();
const sockets = new Map();

function normalizeDB(value) {
  const d = value && typeof value === "object" ? value : {};

  if (!Array.isArray(d.users)) d.users = [];
  if (!d.contacts || typeof d.contacts !== "object") d.contacts = {};
  if (!d.messages || typeof d.messages !== "object") d.messages = {};
  if (!d.pushSubscriptions || typeof d.pushSubscriptions !== "object") {
    d.pushSubscriptions = {};
  }
  if (!d.settings || typeof d.settings !== "object") d.settings = {};

  return d;
}

function readLocal() {
  try {
    if (!fs.existsSync(DATA_FILE)) {
      return normalizeDB(DEFAULT_DB);
    }

    const raw = fs.readFileSync(DATA_FILE, "utf8");
    if (!raw.trim()) return normalizeDB(DEFAULT_DB);

    return normalizeDB(JSON.parse(raw));
  } catch (err) {
    console.error("Falha ao ler data.json:", err);
    return normalizeDB(DEFAULT_DB);
  }
}

function writeLocal() {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2), "utf8");
    return true;
  } catch (err) {
    console.error("Falha ao salvar data.json:", err);
    return false;
  }
}

/*
  ============================================================
  SUPABASE
  ============================================================
*/

function supabaseConfigured() {
  return Boolean(SUPABASE_URL && SUPABASE_KEY);
}

function supabaseHeaders(extra = {}) {
  return {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
    "Content-Type": "application/json",
    ...extra
  };
}

async function supabaseRequest(pathname, options = {}) {
  if (!supabaseConfigured()) {
    throw new Error("SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY não configurados.");
  }

  /*
    IMPORTANTE:
    Não montamos a URL concatenando query strings manualmente.
    Isso evita o PGRST125 causado por URL/path inválido.
  */

  const cleanPath = String(pathname || "")
    .replace(/^\/+/, "");

  const url = new URL(`/rest/v1/${cleanPath}`, `${SUPABASE_URL}/`);

  const response = await fetch(url.toString(), {
    method: options.method || "GET",
    headers: supabaseHeaders(options.headers || {}),
    body: options.body
  });

  const text = await response.text();

  let data = null;

  if (text) {
    try {
      data = JSON.parse(text);
    } catch (_) {
      data = text;
    }
  }

  if (!response.ok) {
    const error = new Error(
      `Supabase ${response.status}: ${
        typeof data === "string" ? data : JSON.stringify(data)
      }`
    );

    error.status = response.status;
    error.supabaseData = data;

    throw error;
  }

  return data;
}

async function loadRemote() {
  if (!supabaseConfigured()) {
    return {
      enabled: false,
      found: false,
      data: null,
      error: new Error("Supabase não configurado.")
    };
  }

  try {
    const url = new URL("/rest/v1/linka_state", `${SUPABASE_URL}/`);

    url.searchParams.set("id", "eq.1");
    url.searchParams.set("select", "id,data,updated_at");
    url.searchParams.set("limit", "1");

    const result = await supabaseRequest(
      url.pathname.replace(/^\/rest\/v1\//, "") + "?" + url.searchParams.toString()
    );

    if (!Array.isArray(result) || result.length === 0) {
      return {
        enabled: true,
        found: false,
        data: null,
        error: null
      };
    }

    return {
      enabled: true,
      found: true,
      data: normalizeDB(result[0].data),
      error: null
    };
  } catch (err) {
    return {
      enabled: true,
      found: false,
      data: null,
      error: err
    };
  }
}

async function pushRemote() {
  if (!supabaseConfigured()) {
    throw new Error("Supabase não configurado.");
  }

  const url = new URL("/rest/v1/linka_state", `${SUPABASE_URL}/`);

  url.searchParams.set("on_conflict", "id");

  await supabaseRequest(
    url.pathname.replace(/^\/rest\/v1\//, "") + "?" + url.searchParams.toString(),
    {
      method: "POST",
      headers: {
        Prefer: "resolution=merge-duplicates,return=minimal"
      },
      body: JSON.stringify([
        {
          id: 1,
          data: db,
          updated_at: new Date().toISOString()
        }
      ])
    }
  );

  return true;
}

let saveTimer = null;
let saveInProgress = false;

async function persist() {
  writeLocal();

  if (!remoteReady || !remoteAvailable) {
    return false;
  }

  if (saveInProgress) {
    return true;
  }

  saveInProgress = true;

  try {
    await pushRemote();
    return true;
  } catch (err) {
    console.error("Falha ao salvar no Supabase:", err);
    return false;
  } finally {
    saveInProgress = false;
  }
}

function schedulePersist() {
  writeLocal();

  clearTimeout(saveTimer);

  saveTimer = setTimeout(async () => {
    await persist();
  }, 300);
}

/*
  ============================================================
  SEGURANÇA / SENHAS
  ============================================================
*/

function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto
    .pbkdf2Sync(String(password), salt, 120000, 64, "sha512")
    .toString("hex");

  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  if (!stored || !String(stored).includes(":")) return false;

  const parts = String(stored).split(":");

  if (parts.length !== 2) return false;

  const salt = parts[0];
  const expected = parts[1];

  const actual = crypto
    .pbkdf2Sync(String(password), salt, 120000, 64, "sha512")
    .toString("hex");

  try {
    return crypto.timingSafeEqual(
      Buffer.from(actual, "hex"),
      Buffer.from(expected, "hex")
    );
  } catch (_) {
    return false;
  }
}

function makeId() {
  return crypto.randomUUID();
}

function cleanText(value, max = 5000) {
  return String(value ?? "").trim().slice(0, max);
}

function normalizeUsername(value) {
  return cleanText(value, 40).toLowerCase();
}

function getToken(req) {
  const auth = String(req.headers.authorization || "");

  if (auth.toLowerCase().startsWith("bearer ")) {
    return auth.slice(7).trim();
  }

  return cleanText(req.headers["x-session-token"], 300);
}

function getUserFromRequest(req) {
  const token = getToken(req);

  if (!token) return null;

  const userId = sessions.get(token);

  if (!userId) return null;

  return db.users.find(u => u.id === userId) || null;
}

function publicUser(user) {
  if (!user) return null;

  return {
    id: user.id,
    username: user.username,
    name: user.name || user.username,
    avatar: user.avatar || "",
    status: user.status || "",
    createdAt: user.createdAt || null
  };
}

function requireAuth(req, res, next) {
  const user = getUserFromRequest(req);

  if (!user) {
    return res.status(401).json({
      ok: false,
      error: "Não autenticado."
    });
  }

  req.user = user;
  next();
}

/*
  ============================================================
  USUÁRIOS
  ============================================================
*/

app.post("/api/register", async (req, res) => {
  try {
    const username = normalizeUsername(req.body.username);
    const password = String(req.body.password || "");
    const name = cleanText(req.body.name || username, 80);

    if (username.length < 3) {
      return res.status(400).json({
        ok: false,
        error: "O usuário precisa ter pelo menos 3 caracteres."
      });
    }

    if (password.length < 4) {
      return res.status(400).json({
        ok: false,
        error: "A senha precisa ter pelo menos 4 caracteres."
      });
    }

    const exists = db.users.some(
      u => normalizeUsername(u.username) === username
    );

    if (exists) {
      return res.status(409).json({
        ok: false,
        error: "Esse usuário já existe."
      });
    }

    const user = {
      id: makeId(),
      username,
      name,
      password: hashPassword(password),
      avatar: "",
      status: "",
      createdAt: new Date().toISOString()
    };

    db.users.push(user);

    if (!db.contacts[user.id]) db.contacts[user.id] = [];
    if (!db.messages[user.id]) db.messages[user.id] = [];
    if (!db.pushSubscriptions[user.id]) {
      db.pushSubscriptions[user.id] = [];
    }

    schedulePersist();

    const token = makeId();
    sessions.set(token, user.id);

    res.json({
      ok: true,
      token,
      user: publicUser(user)
    });
  } catch (err) {
    console.error("Erro no registro:", err);

    res.status(500).json({
      ok: false,
      error: "Erro interno ao criar conta."
    });
  }
});

app.post("/api/login", async (req, res) => {
  try {
    const username = normalizeUsername(req.body.username);
    const password = String(req.body.password || "");

    const user = db.users.find(
      u => normalizeUsername(u.username) === username
    );

    if (!user || !verifyPassword(password, user.password)) {
      return res.status(401).json({
        ok: false,
        error: "Usuário ou senha incorretos."
      });
    }

    const token = makeId();
    sessions.set(token, user.id);

    res.json({
      ok: true,
      token,
      user: publicUser(user)
    });
  } catch (err) {
    console.error("Erro no login:", err);

    res.status(500).json({
      ok: false,
      error: "Erro interno ao entrar."
    });
  }
});

app.post("/api/logout", requireAuth, (req, res) => {
  const token = getToken(req);

  if (token) sessions.delete(token);

  res.json({
    ok: true
  });
});

app.get("/api/me", requireAuth, (req, res) => {
  res.json({
    ok: true,
    user: publicUser(req.user)
  });
});

app.get("/api/ping", (req, res) => {
  res.json({
    ok: true,
    online: true,
    time: new Date().toISOString()
  });
});

app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    online: true,
    supabaseConfigured: supabaseConfigured(),
    supabaseConnected: remoteAvailable,
    time: new Date().toISOString()
  });
});

/*
  ============================================================
  PERFIL
  ============================================================
*/

app.put("/api/profile", requireAuth, async (req, res) => {
  try {
    const name = cleanText(req.body.name, 80);
    const status = cleanText(req.body.status, 160);
    const avatar = cleanText(req.body.avatar, 500000);

    if (name) req.user.name = name;

    req.user.status = status;

    if (req.body.avatar !== undefined) {
      req.user.avatar = avatar;
    }

    schedulePersist();

    res.json({
      ok: true,
      user: publicUser(req.user)
    });
  } catch (err) {
    console.error("Erro ao atualizar perfil:", err);

    res.status(500).json({
      ok: false,
      error: "Não foi possível atualizar o perfil."
    });
  }
});

app.post("/api/profile", requireAuth, async (req, res) => {
  return app._router.handle(
    {
      ...req,
      method: "PUT",
      url: "/api/profile"
    },
    res,
    () => {}
  );
});

/*
  ============================================================
  BUSCA DE USUÁRIOS
  ============================================================
*/

app.get("/api/users/search", requireAuth, (req, res) => {
  const q = cleanText(req.query.q, 100).toLowerCase();

  if (!q) {
    return res.json({
      ok: true,
      users: []
    });
  }

  const users = db.users
    .filter(u => u.id !== req.user.id)
    .filter(u => {
      const username = String(u.username || "").toLowerCase();
      const name = String(u.name || "").toLowerCase();

      return username.includes(q) || name.includes(q);
    })
    .slice(0, 30)
    .map(publicUser);

  res.json({
    ok: true,
    users
  });
});

app.get("/api/search", requireAuth, (req, res) => {
  const q = cleanText(req.query.q, 100).toLowerCase();

  if (!q) {
    return res.json({
      ok: true,
      users: []
    });
  }

  const users = db.users
    .filter(u => u.id !== req.user.id)
    .filter(u => {
      const username = String(u.username || "").toLowerCase();
      const name = String(u.name || "").toLowerCase();

      return username.includes(q) || name.includes(q);
    })
    .slice(0, 30)
    .map(publicUser);

  res.json({
    ok: true,
    users
  });
});

/*
  ============================================================
  CONTATOS
  ============================================================
*/

function ensureContacts(userId) {
  if (!Array.isArray(db.contacts[userId])) {
    db.contacts[userId] = [];
  }

  return db.contacts[userId];
}

app.get("/api/contacts", requireAuth, (req, res) => {
  const ids = ensureContacts(req.user.id);

  const contacts = ids
    .map(id => db.users.find(u => u.id === id))
    .filter(Boolean)
    .map(publicUser);

  res.json({
    ok: true,
    contacts
  });
});

app.post("/api/contacts", requireAuth, async (req, res) => {
  const targetId = cleanText(req.body.userId || req.body.contactId, 100);

  const target = db.users.find(u => u.id === targetId);

  if (!target) {
    return res.status(404).json({
      ok: false,
      error: "Usuário não encontrado."
    });
  }

  if (target.id === req.user.id) {
    return res.status(400).json({
      ok: false,
      error: "Você não pode adicionar você mesmo."
    });
  }

  const contacts = ensureContacts(req.user.id);

  if (!contacts.includes(target.id)) {
    contacts.push(target.id);
  }

  schedulePersist();

  res.json({
    ok: true,
    contact: publicUser(target)
  });
});

app.delete("/api/contacts/:id", requireAuth, async (req, res) => {
  const contacts = ensureContacts(req.user.id);

  db.contacts[req.user.id] = contacts.filter(
    id => id !== req.params.id
  );

  schedulePersist();

  res.json({
    ok: true
  });
});

/*
  ============================================================
  MENSAGENS
  ============================================================
*/

function conversationKey(a, b) {
  return [a, b].sort().join("__");
}

function ensureConversation(a, b) {
  const key = conversationKey(a, b);

  if (!Array.isArray(db.messages[key])) {
    db.messages[key] = [];
  }

  return {
    key,
    list: db.messages[key]
  };
}

app.get("/api/messages/:userId", requireAuth, (req, res) => {
  const otherId = cleanText(req.params.userId, 100);

  const other = db.users.find(u => u.id === otherId);

  if (!other) {
    return res.status(404).json({
      ok: false,
      error: "Usuário não encontrado."
    });
  }

  const conversation = ensureConversation(req.user.id, otherId);

  res.json({
    ok: true,
    messages: conversation.list
  });
});

app.get("/api/messages", requireAuth, (req, res) => {
  const otherId = cleanText(
    req.query.userId || req.query.to || req.query.contactId,
    100
  );

  if (!otherId) {
    return res.status(400).json({
      ok: false,
      error: "Usuário da conversa não informado."
    });
  }

  const conversation = ensureConversation(req.user.id, otherId);

  res.json({
    ok: true,
    messages: conversation.list
  });
});

async function sendMessage(req, res) {
  try {
    const to = cleanText(
      req.body.to ||
      req.body.userId ||
      req.body.receiverId ||
      req.body.contactId,
      100
    );

    const text = cleanText(
      req.body.text !== undefined
        ? req.body.text
        : req.body.message,
      5000
    );

    if (!to || !text) {
      return res.status(400).json({
        ok: false,
        error: "Destinatário e mensagem são obrigatórios."
      });
    }

    const receiver = db.users.find(u => u.id === to);

    if (!receiver) {
      return res.status(404).json({
        ok: false,
        error: "Destinatário não encontrado."
      });
    }

    const conversation = ensureConversation(req.user.id, receiver.id);

    const message = {
      id: makeId(),
      from: req.user.id,
      to: receiver.id,
      text,
      createdAt: new Date().toISOString()
    };

    conversation.list.push(message);

    schedulePersist();

    sendToUser(receiver.id, {
      type: "message",
      message
    });

    await pushUser(receiver.id, {
      title: req.user.name || req.user.username,
      body: text,
      data: {
        type: "message",
        from: req.user.id
      }
    });

    res.json({
      ok: true,
      message
    });
  } catch (err) {
    console.error("Erro ao enviar mensagem:", err);

    res.status(500).json({
      ok: false,
      error: "Não foi possível enviar a mensagem."
    });
  }
}

app.post("/api/messages", requireAuth, sendMessage);
app.post("/api/message", requireAuth, sendMessage);

/*
  ============================================================
  WEBSOCKET
  ============================================================
*/

function sendSocket(socket, data) {
  try {
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(data));
    }
  } catch (err) {
    console.error("Erro ao enviar WebSocket:", err);
  }
}

function sendToUser(userId, data) {
  const userSockets = sockets.get(userId);

  if (!userSockets) return;

  for (const socket of userSockets) {
    sendSocket(socket, data);
  }
}

function addSocket(userId, socket) {
  if (!sockets.has(userId)) {
    sockets.set(userId, new Set());
  }

  sockets.get(userId).add(socket);
}

function removeSocket(userId, socket) {
  const set = sockets.get(userId);

  if (!set) return;

  set.delete(socket);

  if (set.size === 0) {
    sockets.delete(userId);
  }
}

wss.on("connection", (socket, req) => {
  let userId = null;

  try {
    const requestUrl = new URL(
      req.url || "/",
      `http://${req.headers.host || "localhost"}`
    );

    const token = requestUrl.searchParams.get("token");

    if (token) {
      userId = sessions.get(token) || null;
    }
  } catch (_) {}

  if (!userId) {
    sendSocket(socket, {
      type: "error",
      error: "Não autenticado."
    });

    socket.close();
    return;
  }

  addSocket(userId, socket);

  sendSocket(socket, {
    type: "connected",
    ok: true
  });

  socket.on("message", raw => {
    try {
      const data = JSON.parse(String(raw));

      if (data.type === "ping") {
        sendSocket(socket, {
          type: "pong",
          time: Date.now()
        });
      }
    } catch (_) {}
  });

  socket.on("close", () => {
    removeSocket(userId, socket);
  });

  socket.on("error", () => {
    removeSocket(userId, socket);
  });
});

/*
  ============================================================
  WEB PUSH
  ============================================================
*/

function setupWebPush() {
  if (!webpush) return false;

  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const email = process.env.VAPID_EMAIL || "mailto:admin@example.com";

  if (!publicKey || !privateKey) return false;

  try {
    web
