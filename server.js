const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

let webpush = null;
try {
  webpush = require('web-push');
} catch (_) {}

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = Number(process.env.PORT) || 10000;
const DATA_FILE = path.join(__dirname, 'data.json');

const SUPABASE_URL = String(
  process.env.SUPABASE_URL || ''
).trim().replace(/\/+$/, '');

const SUPABASE_KEY = String(
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
).trim();

app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true }));

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Content-Type, Authorization, X-Session-Token'
  );
  res.setHeader(
    'Access-Control-Allow-Methods',
    'GET,POST,PUT,PATCH,DELETE,OPTIONS'
  );

  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }

  next();
});

app.use(express.static(path.join(__dirname, 'public')));

function emptyDB() {
  return {
    users: [],
    contacts: {},
    messages: {},
    pushSubscriptions: {},
    settings: {}
  };
}

function normalizeDB(value) {
  const d = value && typeof value === 'object' ? value : {};

  if (!Array.isArray(d.users)) d.users = [];
  if (!d.contacts || typeof d.contacts !== 'object') {
    d.contacts = {};
  }
  if (!d.messages || typeof d.messages !== 'object') {
    d.messages = {};
  }
  if (
    !d.pushSubscriptions ||
    typeof d.pushSubscriptions !== 'object'
  ) {
    d.pushSubscriptions = {};
  }
  if (!d.settings || typeof d.settings !== 'object') {
    d.settings = {};
  }

  return d;
}

let db = emptyDB();

/* =========================================================
   ARQUIVO LOCAL
========================================================= */

function readLocal() {
  try {
    if (!fs.existsSync(DATA_FILE)) {
      return emptyDB();
    }

    const raw = fs.readFileSync(DATA_FILE, 'utf8');

    if (!raw.trim()) {
      return emptyDB();
    }

    return normalizeDB(JSON.parse(raw));
  } catch (error) {
    console.error(
      'Falha ao ler data.json:',
      error.message
    );

    return emptyDB();
  }
}

function writeLocal() {
  try {
    fs.writeFileSync(
      DATA_FILE,
      JSON.stringify(db, null, 2),
      'utf8'
    );

    return true;
  } catch (error) {
    console.error(
      'Falha ao salvar data.json:',
      error.message
    );

    return false;
  }
}

/* =========================================================
   SUPABASE
========================================================= */

function supabaseConfigured() {
  return Boolean(SUPABASE_URL && SUPABASE_KEY);
}

function supabaseHeaders(extra = {}) {
  return {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
    'Content-Type': 'application/json',
    ...extra
  };
}

async function supabaseRequest(urlOrPath, options = {}) {
  if (!supabaseConfigured()) {
    throw new Error(
      'Supabase não configurado.'
    );
  }

  let url;

  if (/^https?:\/\//i.test(String(urlOrPath))) {
    url = String(urlOrPath);
  } else {
    url = new URL(
      `/rest/v1/${String(urlOrPath).replace(/^\/+/, '')}`,
      `${SUPABASE_URL}/`
    ).toString();
  }

  const response = await fetch(url, {
    method: options.method || 'GET',
    headers: supabaseHeaders(options.headers || {}),
    body: options.body
  });

  const text = await response.text();

  let data = null;

  try {
    data = text ? JSON.parse(text) : null;
  } catch (_) {
    data = text;
  }

  if (!response.ok) {
    const error = new Error(
      `Supabase ${response.status}: ${
        typeof data === 'string'
          ? data
          : JSON.stringify(data)
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
      ok: false,
      found: false,
      error: new Error(
        'Supabase não configurado.'
      )
    };
  }

  const url = new URL(
    '/rest/v1/linka_state',
    `${SUPABASE_URL}/`
  );

  url.searchParams.set('id', 'eq.1');
  url.searchParams.set(
    'select',
    'id,data,updated_at'
  );
  url.searchParams.set('limit', '1');

  try {
    const rows = await supabaseRequest(
      url.toString()
    );

    if (
      !Array.isArray(rows) ||
      rows.length === 0
    ) {
      return {
        ok: true,
        found: false,
        data: null
      };
    }

    return {
      ok: true,
      found: true,
      data: normalizeDB(rows[0].data)
    };
  } catch (error) {
    return {
      ok: false,
      found: false,
      error
    };
  }
}

async function pushRemote() {
  const url = new URL(
    '/rest/v1/linka_state',
    `${SUPABASE_URL}/`
  );

  url.searchParams.set(
    'on_conflict',
    'id'
  );

  await supabaseRequest(
    url.toString(),
    {
      method: 'POST',

      headers: {
        Prefer:
          'resolution=merge-duplicates,return=minimal'
      },

      body: JSON.stringify([
        {
          id: 1,
          data: db,
          updated_at:
            new Date().toISOString()
        }
      ])
    }
  );
}

let remoteAvailable = false;
let saveTimer = null;
let saveRunning = false;

function schedulePersist() {
  writeLocal();

  clearTimeout(saveTimer);

  saveTimer = setTimeout(
    () => persistRemote(),
    500
  );
}

async function persistRemote() {
  if (
    !remoteAvailable ||
    saveRunning
  ) {
    return;
  }

  saveRunning = true;

  try {
    await pushRemote();
  } catch (error) {
    console.error(
      'Falha ao salvar no Supabase:',
      error.message
    );

    remoteAvailable = false;
  } finally {
    saveRunning = false;
  }
}

/* =========================================================
   UTILITÁRIOS
========================================================= */

function makeId() {
  return crypto.randomUUID();
}

function clean(value, max = 5000) {
  return String(
    value == null ? '' : value
  ).trim().slice(0, max);
}

function username(value) {
  return clean(value, 60).toLowerCase();
}

function hashPassword(
  password,
  salt = crypto.randomBytes(16).toString('hex')
) {
  const hash = crypto
    .pbkdf2Sync(
      String(password),
      salt,
      120000,
      64,
      'sha512'
    )
    .toString('hex');

  return `${salt}:${hash}`;
}

function verifyPassword(
  password,
  stored
) {
  const parts = String(
    stored || ''
  ).split(':');

  if (
    parts.length !== 2
  ) {
    return false;
  }

  const salt = parts[0];
  const expected = parts[1];

  const actual = crypto
    .pbkdf2Sync(
      String(password),
      salt,
      120000,
      64,
      'sha512'
    )
    .toString('hex');

  return actual === expected;
}

function publicUser(user) {
  if (!user) {
    return null;
  }

  return {
    id: user.id,
    username: user.username,
    name:
      user.name ||
      user.username,
    avatar:
      user.avatar || '',
    status:
      user.status || '',
    createdAt:
      user.createdAt || null
  };
}

/* =========================================================
   SESSÕES
========================================================= */

const sessions = new Map();
const sockets = new Map();

function tokenFromReq(req) {
  const authorization =
    String(
      req.headers.authorization || ''
    );

  if (
    /^Bearer /i.test(
      authorization
    )
  ) {
    return authorization
      .slice(7)
      .trim();
  }

  return clean(
    req.headers['x-session-token'],
    500
  );
}

function currentUser(req) {
  const token =
    tokenFromReq(req);

  const userId =
    sessions.get(token);

  if (!userId) {
    return null;
  }

  return (
    db.users.find(
      user =>
        user.id === userId
    ) || null
  );
}

function auth(
  req,
  res,
  next
) {
  const user =
    currentUser(req);

  if (!user) {
    return res.status(401).json({
      ok: false,
      error:
        'Não autenticado.'
    });
  }

  req.user = user;

  next();
}

/* =========================================================
   STATUS
========================================================= */

app.get(
  '/api/ping',
  (req, res) => {
    res.json({
      ok: true,
      online: true,
      time:
        new Date().toISOString()
    });
  }
);

app.get(
  '/api/health',
  (req, res) => {
    res.json({
      ok: true,
      supabaseConfigured:
        supabaseConfigured(),
      supabaseConnected:
        remoteAvailable
    });
  }
);

/* =========================================================
   REGISTRO
========================================================= */

app.post(
  '/api/register',
  (req, res) => {
    const uname =
      username(
        req.body.username
      );

    const password =
      String(
        req.body.password || ''
      );

    const name =
      clean(
        req.body.name ||
          uname,
        80
      );

    if (uname.length < 3) {
      return res.status(400).json({
        ok: false,
        error:
          'O usuário precisa ter pelo menos 3 caracteres.'
      });
    }

    if (password.length < 4) {
      return res.status(400).json({
        ok: false,
        error:
          'A senha precisa ter pelo menos 4 caracteres.'
      });
    }

    const exists =
      db.users.some(
        user =>
          username(
            user.username
          ) === uname
      );

    if (exists) {
      return res.status(409).json({
        ok: false,
        error:
          'Esse usuário já existe.'
      });
    }

    const user = {
      id: makeId(),
      username: uname,
      name,
      password:
        hashPassword(password),
      avatar: '',
      status: '',
      createdAt:
        new Date().toISOString()
    };

    db.users.push(user);

    db.contacts[user.id] =
      [];

    db.pushSubscriptions[
      user.id
    ] = [];

    schedulePersist();

    const token =
      makeId();

    sessions.set(
      token,
      user.id
    );

    res.json({
      ok: true,
      token,
      user:
        publicUser(user)
    });
  }
);

/* =========================================================
   LOGIN
========================================================= */

app.post(
  '/api/login',
  (req, res) => {
    const uname =
      username(
        req.body.username
      );

    const user =
      db.users.find(
        item =>
          username(
            item.username
          ) === uname
      );

    if (
      !user ||
      !verifyPassword(
        req.body.password,
        user.password
      )
    ) {
      return res.status(401).json({
        ok: false,
        error:
          'Usuário ou senha incorretos.'
      });
    }

    const token =
      makeId();

    sessions.set(
      token,
      user.id
    );

    res.json({
      ok: true,
      token,
      user:
        publicUser(user)
    });
  }
);

/* =========================================================
   LOGOUT / ME
========================================================= */

app.post(
  '/api/logout',
  auth,
  (req, res) => {
    sessions.delete(
      tokenFromReq(req)
    );

    res.json({
      ok: true
    });
  }
);

app.get(
  '/api/me',
  auth,
  (req, res) => {
    res.json({
      ok: true,
      user:
        publicUser(req.user)
    });
  }
);

/* =========================================================
   PERFIL
========================================================= */

async function updateProfile(
  req,
  res
) {
  req.user.name =
    clean(
      req.body.name ||
        req.user.name,
      80
    );

  req.user.status =
    clean(
      req.body.status,
      160
    );

  if (
    req.body.avatar !==
    undefined
  ) {
    req.user.avatar =
      clean(
        req.body.avatar,
        500000
      );
  }

  schedulePersist();

  res.json({
    ok: true,
    user:
      publicUser(req.user)
  });
}

app.put(
  '/api/profile',
  auth,
  updateProfile
);

app.post(
  '/api/profile',
  auth,
  updateProfile
);

/* =========================================================
   BUSCA DE USUÁRIOS
========================================================= */

function searchUsers(
  req,
  res
) {
  const q =
    clean(
      req.query.q,
      100
    ).toLowerCase();

  const users =
    db.users
      .filter(
        user =>
          user.id !==
          req.user.id
      )
      .filter(user => {
        if (!q) {
          return true;
        }

        return (
          username(
            user.username
          ).includes(q) ||
          String(
            user.name || ''
          )
            .toLowerCase()
            .includes(q)
        );
      })
      .slice(0, 50)
      .map(publicUser);

  res.json({
    ok: true,
    users
  });
}

app.get(
  '/api/users/search',
  auth,
  searchUsers
);

app.get(
  '/api/search',
  auth,
  searchUsers
);

/* =========================================================
   CONTATOS
========================================================= */

function contactIds(
  userId
) {
  if (
    !Array.isArray(
      db.contacts[userId]
    )
  ) {
    db.contacts[userId] =
      [];
  }

  return db.contacts[userId];
}

app.get(
  '/api/contacts',
  auth,
  (req, res) => {
    const contacts =
      contactIds(
        req.user.id
      )
        .map(id =>
          db.users.find(
            user =>
              user.id === id
          )
        )
        .filter(Boolean)
        .map(publicUser);

    res.json({
      ok: true,
      contacts
    });
  }
);

app.post(
  '/api/contacts',
  auth,
  (req, res) => {
    const id =
      clean(
        req.body.userId ||
          req.body.contactId,
        100
      );

    const user =
      db.users.find(
        item =>
          item.id === id
      );

    if (!user) {
      return res.status(404).json({
        ok: false,
        error:
          'Usuário não encontrado.'
      });
    }

    if (
      user.id ===
      req.user.id
    ) {
      return res.status(400).json({
        ok: false,
        error:
          'Você não pode adicionar você mesmo.'
      });
    }

    const list =
      contactIds(
        req.user.id
      );

    if (
      !list.includes(id)
    ) {
      list.push(id);
    }

    schedulePersist();

    res.json({
      ok: true,
      contact:
        publicUser(user)
    });
  }
);

app.delete(
  '/api/contacts/:id',
  auth,
  (req, res) => {
    db.contacts[
      req.user.id
    ] = contactIds(
      req.user.id
    ).filter(
      id =>
        id !==
        req.params.id
    );

    schedulePersist();

    res.json({
      ok: true
    });
  }
);

/* =========================================================
   MENSAGENS
========================================================= */

function conversationKey(
  a,
  b
) {
  return [a, b]
    .sort()
    .join('__');
}

function conversation(
  a,
  b
) {
  const key =
    conversationKey(
      a,
      b
    );

  if (
    !Array.isArray(
      db.messages[key]
    )
  ) {
    db.messages[key] =
      [];
  }

  return db.messages[key];
}

function getOtherId(req) {
  return clean(
    req.params.userId ||
      req.query.userId ||
      req.query.to ||
      req.query.contactId,
    100
  );
}

app.get(
  '/api/messages/:userId',
  auth,
  (req, res) => {
    res.json({
      ok: true,
      messages:
        conversation(
          req.user.id,
          getOtherId(req)
        )
    });
  }
);

app.get(
  '/api/messages',
  auth,
  (req, res) => {
    res.json({
      ok: true,
      messages:
        conversation(
          req.user.id,
          getOtherId(req)
        )
    });
  }
);

/* =========================================================
   WEBSOCKET
========================================================= */

function sendToUser(
  userId,
  data
) {
  const set =
    sockets.get(userId);

  if (!set) {
    return;
  }

  for (const ws of set) {
    if (
      ws.readyState ===
      WebSocket.OPEN
    ) {
      try {
        ws.send(
          JSON.stringify(data)
        );
      } catch (_) {}
    }
  }
}

/* =========================================================
   WEB PUSH
========================================================= */

const vapidReady =
  (() => {
    if (
      !webpush ||
      !process.env
        .VAPID_PUBLIC_KEY ||
      !process.env
        .VAPID_PRIVATE_KEY
    ) {
      return false;
    }

    try {
      webpush.setVapidDetails(
        process.env
          .VAPID_EMAIL ||
          'mailto:admin@example.com',
        process.env
          .VAPID_PUBLIC_KEY,
        process.env
          .VAPID_PRIVATE_KEY
      );

      return true;
    } catch (error) {
      console.error(
        'Falha VAPID:',
        error.message
      );

      return false;
    }
  })();

app.get(
  '/api/push/public-key',
  auth,
  (req, res) => {
    res.json({
      ok: true,
      publicKey:
        process.env
          .VAPID_PUBLIC_KEY ||
        ''
    });
  }
);

app.post(
  '/api/push/subscribe',
  auth,
  (req, res) => {
    const subscription =
      req.body.subscription ||
      req.body;

    if (
      !subscription ||
      !subscription.endpoint
    ) {
      return res.status(400).json({
        ok: false,
        error:
          'Assinatura inválida.'
      });
    }

    if (
      !Array.isArray(
        db.pushSubscriptions[
          req.user.id
        ]
      )
    ) {
      db.pushSubscriptions[
        req.user.id
      ] = [];
    }

    const list =
      db.pushSubscriptions[
        req.user.id
      ];

    const exists =
      list.some(
        item =>
          item &&
          item.endpoint ===
            subscription.endpoint
      );

    if (!exists) {
      list.push(
        subscription
      );
    }

    schedulePersist();

    res.json({
      ok: true
    });
  }
);

app.post(
  '/api/push/unsubscribe',
  auth,
  (req, res) => {
    const endpoint =
      clean(
        req.body.endpoint,
        5000
      );

    db.pushSubscriptions[
      req.user.id
    ] = (
      db.pushSubscriptions[
        req.user.id
      ] || []
    ).filter(
      item =>
        !endpoint ||
        item.endpoint !==
          endpoint
    );

    schedulePersist();

    res.json({
      ok: true
    });
  }
);

async function sendPush(
  userId,
  payload
) {
  if (
    !vapidReady ||
    !webpush
  ) {
    return;
  }

  const list =
    db.pushSubscriptions[
      userId
    ];

  if (
    !Array.isArray(list)
  ) {
    return;
  }

  const invalid =
    new Set();

  for (const subscription of list) {
    try {
      await webpush.sendNotification(
        subscription,
        JSON.stringify(payload)
      );
    } catch (error) {
      if (
        error.statusCode ===
          404 ||
        error.statusCode ===
          410
      ) {
        invalid.add(
          subscription.endpoint
        );
      }
    }
  }

  if (invalid.size) {
    db.pushSubscriptions[
      userId
    ] = list.filter(
      item =>
        !invalid.has(
          item.endpoint
        )
    );

    schedulePersist();
  }
}

/* =========================================================
   ENVIO DE MENSAGENS
========================================================= */

async function sendMessage(
  req,
  res
) {
  try {
    const to =
      clean(
        req.body.to ||
          req.body.userId ||
          req.body.receiverId ||
          req.body.contactId,
        100
      );

    const text =
      clean(
        req.body.text !==
          undefined
          ? req.body.text
          : req.body.message,
        5000
      );

    const receiver =
      db.users.find(
        user =>
          user.id === to
      );

    if (
      !receiver ||
      !text
    ) {
      return res.status(400).json({
 
