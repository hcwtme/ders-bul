// db.js — Ders Bul veritabanı katmanı
// Node.js'in yerleşik (built-in) node:sqlite modülünü kullanır.
// Harici paket gerekmez (better-sqlite3, prisma vb. YOK).

const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');
const fs = require('node:fs');

const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const DB_PATH = process.env.DB_PATH || path.join(DATA_DIR, 'dersbul.db');
const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA foreign_keys = ON;');

function ensureTable(name, ddl) {
  try {
    db.exec(ddl);
  } catch (error) {
    const message = String(error.message || '');
    if (!message.includes('duplicate') && !message.includes('already exists')) {
      throw error;
    }
  }
}

function ensureColumn(tableName, columnName, definition) {
  const columns = db.prepare(`PRAGMA table_info(${tableName})`).all();
  if (!columns.some((column) => column.name === columnName)) {
    db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition};`);
  }
}

function migrateSchema() {
  ensureTable('roles', `CREATE TABLE IF NOT EXISTS roles (
    id    INTEGER PRIMARY KEY AUTOINCREMENT,
    name  TEXT UNIQUE NOT NULL
  );`);

  ensureTable('permissions', `CREATE TABLE IF NOT EXISTS permissions (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    key         TEXT UNIQUE NOT NULL,
    description TEXT NOT NULL
  );`);

  ensureTable('role_permissions', `CREATE TABLE IF NOT EXISTS role_permissions (
    role_id       INTEGER NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    permission_id INTEGER NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
    PRIMARY KEY (role_id, permission_id)
  );`);

  ensureTable('user_permissions', `CREATE TABLE IF NOT EXISTS user_permissions (
    user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    permission_id INTEGER NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
    allowed       INTEGER NOT NULL DEFAULT 1,
    PRIMARY KEY (user_id, permission_id)
  );`);

  ensureTable('users', `CREATE TABLE IF NOT EXISTS users (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    email          TEXT UNIQUE NOT NULL,
    password_hash  TEXT NOT NULL,
    password_salt  TEXT NOT NULL,
    full_name      TEXT NOT NULL,
    role_id        INTEGER NOT NULL REFERENCES roles(id),
    is_active      INTEGER NOT NULL DEFAULT 1,
    is_blocked     INTEGER NOT NULL DEFAULT 0,
    teacher_status TEXT,
    created_at     TEXT NOT NULL,
    updated_at     TEXT NOT NULL
  );`);

  ensureTable('teacher_profiles', `CREATE TABLE IF NOT EXISTS teacher_profiles (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id        INTEGER UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    full_name      TEXT NOT NULL,
    subject        TEXT NOT NULL DEFAULT 'Genel',
    bio            TEXT,
    education      TEXT,
    experience     TEXT,
    is_online      INTEGER NOT NULL DEFAULT 1,
    is_in_person   INTEGER NOT NULL DEFAULT 1,
    hourly_price   REAL NOT NULL DEFAULT 0,
    city           TEXT,
    photo_url      TEXT,
    rating         REAL NOT NULL DEFAULT 0,
    reviews_count  INTEGER NOT NULL DEFAULT 0,
    created_at     TEXT NOT NULL,
    updated_at     TEXT NOT NULL
  );`);

  ensureTable('courses', `CREATE TABLE IF NOT EXISTS courses (
    id                 INTEGER PRIMARY KEY AUTOINCREMENT,
    teacher_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title              TEXT NOT NULL,
    subject            TEXT NOT NULL,
    description        TEXT NOT NULL,
    price              REAL NOT NULL DEFAULT 0,
    duration_minutes   INTEGER NOT NULL DEFAULT 60,
    mode               TEXT NOT NULL DEFAULT 'online',
    location           TEXT,
    availability_days  TEXT,
    availability_hours TEXT,
    image_url          TEXT,
    is_active          INTEGER NOT NULL DEFAULT 1,
    created_at         TEXT NOT NULL,
    updated_at         TEXT NOT NULL,
    grade_levels       TEXT NOT NULL DEFAULT ''
  );`);

  ensureTable('teacher_availability', `CREATE TABLE IF NOT EXISTS teacher_availability (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    teacher_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    day_of_week    TEXT NOT NULL,
    start_time     TEXT NOT NULL,
    duration_min   INTEGER NOT NULL DEFAULT 60,
    color          TEXT NOT NULL DEFAULT '#3b82f6',
    created_at     TEXT NOT NULL,
    updated_at     TEXT NOT NULL
  );`);

  ensureTable('sessions', `CREATE TABLE IF NOT EXISTS sessions (
    token       TEXT PRIMARY KEY,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    ip          TEXT,
    created_at  TEXT NOT NULL,
    expires_at  TEXT NOT NULL
  );`);

  ensureTable('admin_logs', `CREATE TABLE IF NOT EXISTS admin_logs (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    actor_user_id  INTEGER REFERENCES users(id),
    action         TEXT NOT NULL,
    target_type    TEXT,
    target_id      INTEGER,
    detail         TEXT,
    ip             TEXT,
    created_at     TEXT NOT NULL
  );`);

  ensureTable('applications', `CREATE TABLE IF NOT EXISTS applications (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    teacher_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    course_id   INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    note        TEXT,
    status      TEXT NOT NULL DEFAULT 'pending',
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL
  );`);

  ensureTable('messages', `CREATE TABLE IF NOT EXISTS messages (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    sender_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    receiver_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    course_id   INTEGER REFERENCES courses(id) ON DELETE CASCADE,
    text        TEXT NOT NULL,
    is_read     INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT NOT NULL
  );`);

  ensureTable('favorites', `CREATE TABLE IF NOT EXISTS favorites (
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    course_id   INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    teacher_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at  TEXT NOT NULL,
    PRIMARY KEY (user_id, course_id)
  );`);

  ensureTable('reviews', `CREATE TABLE IF NOT EXISTS reviews (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    course_id   INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    student_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    teacher_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    rating      INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
    comment     TEXT,
    created_at  TEXT NOT NULL
  );`);

  ensureTable('complaints', `CREATE TABLE IF NOT EXISTS complaints (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    target_type TEXT,
    target_id   INTEGER,
    reason      TEXT NOT NULL,
    detail      TEXT,
    status      TEXT NOT NULL DEFAULT 'open',
    created_at  TEXT NOT NULL
  );`);

  ensureColumn('courses', 'grade_levels', "TEXT NOT NULL DEFAULT ''");
  ensureColumn('favorites', 'teacher_id', 'INTEGER');

  try {
    db.exec('CREATE INDEX IF NOT EXISTS idx_users_role ON users(role_id);');
    db.exec('CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);');
    db.exec('CREATE INDEX IF NOT EXISTS idx_admin_logs_actor ON admin_logs(actor_user_id);');
    db.exec('CREATE INDEX IF NOT EXISTS idx_applications_teacher ON applications(teacher_id);');
    db.exec('CREATE INDEX IF NOT EXISTS idx_applications_student ON applications(student_id);');
    db.exec('CREATE INDEX IF NOT EXISTS idx_messages_user ON messages(sender_id, receiver_id);');
    db.exec('CREATE INDEX IF NOT EXISTS idx_favorites_user ON favorites(user_id);');
    db.exec('CREATE INDEX IF NOT EXISTS idx_reviews_teacher ON reviews(teacher_id);');
    db.exec('CREATE INDEX IF NOT EXISTS idx_complaints_user ON complaints(user_id);');
  } catch (error) {
    const message = String(error.message || '');
    if (!message.includes('duplicate')) throw error;
  }
}

migrateSchema();

// ---------------------------------------------------------------------------
// SEED — roller, izinler ve ilk Super Admin (yalnızca tablolar boşsa çalışır)
// ---------------------------------------------------------------------------
const ROLES = ['SUPER_ADMIN', 'ADMIN', 'ADMIN_HELPER', 'TEACHER', 'STUDENT'];

const PERMISSIONS = [
  ['users.view', 'Kullanıcıları görüntüleme'],
  ['users.edit', 'Kullanıcı düzenleme / silme / engelleme'],
  ['teachers.manage', 'Öğretmenleri yönetme (onay/red dahil)'],
  ['courses.manage', 'Dersleri / ilanları yönetme'],
  ['reviews.manage', 'Yorumları yönetme'],
  ['payments.view', 'Ödemeleri görüntüleme'],
  ['commissions.manage', 'Komisyonları yönetme'],
  ['reports.view', 'Raporları görüntüleme'],
];

function seed() {
  const roleCount = db.prepare('SELECT COUNT(*) AS c FROM roles').get().c;
  if (roleCount === 0) {
    const insertRole = db.prepare('INSERT INTO roles (name) VALUES (?)');
    for (const r of ROLES) insertRole.run(r);
  }

  const permCount = db.prepare('SELECT COUNT(*) AS c FROM permissions').get().c;
  if (permCount === 0) {
    const insertPerm = db.prepare('INSERT INTO permissions (key, description) VALUES (?, ?)');
    for (const [key, desc] of PERMISSIONS) insertPerm.run(key, desc);
  }

  const adminRole = db.prepare('SELECT id FROM roles WHERE name = ?').get('ADMIN');
  const rpCount = db.prepare('SELECT COUNT(*) AS c FROM role_permissions WHERE role_id = ?').get(adminRole.id).c;
  if (rpCount === 0) {
    const allPerms = db.prepare('SELECT id FROM permissions').all();
    const insertRP = db.prepare('INSERT OR IGNORE INTO role_permissions (role_id, permission_id) VALUES (?, ?)');
    for (const p of allPerms) insertRP.run(adminRole.id, p.id);
  }

  const userCount = db.prepare('SELECT COUNT(*) AS c FROM users').get().c;
  if (userCount === 0) {
    const superAdminRole = db.prepare('SELECT id FROM roles WHERE name = ?').get('SUPER_ADMIN');
    const { hashPassword } = require('./auth');
    const now = new Date().toISOString();

    const adminEmail = process.env.SUPER_ADMIN_EMAIL;
    const adminPassword = process.env.SUPER_ADMIN_PASSWORD;
    if (!adminEmail || !adminPassword) {
      throw new Error('SUPER_ADMIN_EMAIL ve SUPER_ADMIN_PASSWORD zorunludur.');
    }
    const adminHash = hashPassword(adminPassword);
    db.prepare(`
      INSERT INTO users (email, password_hash, password_salt, full_name, role_id, is_active, is_blocked, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 1, 0, ?, ?)
    `).run(adminEmail, adminHash.hash, adminHash.salt, 'Süper Admin', superAdminRole.id, now, now);
    console.log('Super Admin hesabı oluşturuldu:', adminEmail);
  }
}

seed();

module.exports = { db };
