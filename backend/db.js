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
    email_verified INTEGER NOT NULL DEFAULT 0,
    email_verification_token TEXT,
    email_verification_expires_at TEXT,
    created_at     TEXT NOT NULL,
    updated_at     TEXT NOT NULL
  );`);

  ensureTable('notifications', `CREATE TABLE IF NOT EXISTS notifications (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type        TEXT NOT NULL DEFAULT 'info',
    title       TEXT NOT NULL,
    body        TEXT NOT NULL,
    related_id  INTEGER,
    is_read     INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT NOT NULL
  );`);

  ensureTable('payments', `CREATE TABLE IF NOT EXISTS payments (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    course_id   INTEGER REFERENCES courses(id) ON DELETE SET NULL,
    amount_cents INTEGER NOT NULL DEFAULT 0,
    currency    TEXT NOT NULL DEFAULT 'TRY',
    status      TEXT NOT NULL DEFAULT 'pending',
    provider    TEXT NOT NULL DEFAULT 'manual',
    note        TEXT,
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL
  );`);

  ensureTable('platform_settings', `CREATE TABLE IF NOT EXISTS platform_settings (
    key         TEXT PRIMARY KEY,
    value       TEXT NOT NULL DEFAULT '',
    updated_at  TEXT NOT NULL
  );`);

  ensureTable('email_outbox', `CREATE TABLE IF NOT EXISTS email_outbox (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER REFERENCES users(id) ON DELETE SET NULL,
    recipient   TEXT NOT NULL,
    subject     TEXT NOT NULL,
    body        TEXT NOT NULL,
    status      TEXT NOT NULL DEFAULT 'queued',
    error       TEXT,
    created_at  TEXT NOT NULL,
    sent_at     TEXT
  );`);

  ensureTable('teacher_documents', `CREATE TABLE IF NOT EXISTS teacher_documents (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    teacher_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    document_type TEXT NOT NULL,
    file_url    TEXT NOT NULL,
    status      TEXT NOT NULL DEFAULT 'pending',
    note        TEXT,
    created_at  TEXT NOT NULL,
    reviewed_at TEXT
  );`);

  ensureTable('receipts', `CREATE TABLE IF NOT EXISTS receipts (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    application_id  INTEGER UNIQUE NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
    receipt_number  TEXT UNIQUE NOT NULL,
    total_cents     INTEGER NOT NULL,
    commission_cents INTEGER NOT NULL DEFAULT 0,
    teacher_payout_cents INTEGER NOT NULL DEFAULT 0,
    created_at      TEXT NOT NULL
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
  ensureColumn('teacher_availability', 'title', "TEXT NOT NULL DEFAULT 'Ders'");
  ensureColumn('users', 'email_verified', 'INTEGER NOT NULL DEFAULT 0');
  ensureColumn('users', 'email_verification_token', 'TEXT');
  ensureColumn('users', 'email_verification_expires_at', 'TEXT');
  ensureColumn('users', 'password_reset_token', 'TEXT');
  ensureColumn('users', 'password_reset_expires_at', 'TEXT');
  ensureColumn('teacher_profiles', 'payout_iban', 'TEXT');
  ensureColumn('applications', 'selected_slot', 'TEXT');
  ensureColumn('applications', 'amount_cents', 'INTEGER NOT NULL DEFAULT 0');
  ensureColumn('applications', 'payment_status', "TEXT NOT NULL DEFAULT 'awaiting_transfer'");
  ensureColumn('applications', 'admin_confirmed_at', 'TEXT');
  ensureColumn('applications', 'teacher_confirmed_at', 'TEXT');
  ensureColumn('applications', 'payout_due_at', 'TEXT');
  ensureColumn('applications', 'payout_sent_at', 'TEXT');
  ensureColumn('applications', 'selected_day', 'TEXT');
  ensureColumn('applications', 'cancelled_at', 'TEXT');
  ensureColumn('applications', 'cancelled_by', 'INTEGER');
  ensureColumn('applications', 'cancellation_reason', 'TEXT');
  ensureColumn('applications', 'completed_at', 'TEXT');
  ensureColumn('applications', 'refund_status', "TEXT NOT NULL DEFAULT 'not_requested'");

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
    db.exec('CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, is_read, created_at);');
    db.exec('CREATE INDEX IF NOT EXISTS idx_payments_user ON payments(user_id, status);');
    db.exec('CREATE INDEX IF NOT EXISTS idx_documents_teacher ON teacher_documents(teacher_id, status);');
    db.exec('CREATE INDEX IF NOT EXISTS idx_email_outbox_status ON email_outbox(status, created_at);');
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

    // SUPER_ADMIN_EMAIL ve SUPER_ADMIN_PASSWORD ortamdan alınıyor
    // Render, GitHub Actions vb. CI/CD'den environment variables olarak ayarlanmalıdır
    const adminEmail = process.env.SUPER_ADMIN_EMAIL;
    const adminPassword = process.env.SUPER_ADMIN_PASSWORD;
    
    if (!adminEmail || !adminPassword) {
      throw new Error(
        'SUPER_ADMIN_EMAIL ve SUPER_ADMIN_PASSWORD ortam değişkenleri zorunludur.\n' +
        'Render, GitHub Actions veya .env dosyasından ayarlanmalıdır.\n' +
        'Önemli: Bu değerler asla kod içinde hard-code edilmemelidir!'
      );
    }
    
    // Şifreyi kontrol et — en az 8 karakterli olmalı
    if (adminPassword.length < 8) {
      throw new Error('SUPER_ADMIN_PASSWORD en az 8 karakter olmalıdır.');
    }

    const adminHash = hashPassword(adminPassword);
    db.prepare(`
      INSERT INTO users (email, password_hash, password_salt, full_name, role_id, is_active, is_blocked, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 1, 0, ?, ?)
    `).run(adminEmail, adminHash.hash, adminHash.salt, 'Süper Admin', superAdminRole.id, now, now);
    
    console.log('✓ Super Admin hesabı oluşturuldu:', adminEmail);
    console.log('✓ İlk giriş yaptıktan sonra admin panelinden şifresini değiştirmeyi unutmayın!');
  }
}

seed();

module.exports = { db, DB_PATH, DATA_DIR };
