// routes/courses.js — Öğretmen ders ilanları (madde 9)
// Öğretmen yalnızca kendi ilanını düzenleyebilir/kaldırabilir. Fiyat KURUŞ
// cinsinden INTEGER olarak saklanır (madde 22 — float kullanma).

const { attachUser, requireAuth, requirePermission } = require('../middleware');

const VALID_MODES = ['online', 'yuz_yuze', 'online_ve_yuz_yuze'];

function register(router, db) {
  // --- Herkese açık ilan listesi (temel filtresiz — Modül 3'te genişleyecek) --
  router.get('/api/courses', (req, res) => {
    const rows = db.prepare(`
      SELECT c.*, u.full_name AS teacher_name, s.name AS subject_name
      FROM courses c
      JOIN users u ON u.id = c.teacher_id
      JOIN subjects s ON s.id = c.subject_id
      WHERE c.is_active = 1 AND u.teacher_status = 'approved' AND u.is_active = 1 AND u.is_blocked = 0
      ORDER BY c.created_at DESC
      LIMIT 100
    `).all();
    res.json({ courses: rows.map(toPublicCourse) });
  });

  router.get('/api/courses/:id', (req, res) => {
    const row = db.prepare(`
      SELECT c.*, u.full_name AS teacher_name, s.name AS subject_name
      FROM courses c JOIN users u ON u.id = c.teacher_id JOIN subjects s ON s.id = c.subject_id
      WHERE c.id = ?
    `).get(req.params.id);
    if (!row) return res.status(404).json({ error: 'İlan bulunamadı.' });
    res.json({ course: toPublicCourse(row) });
  });

  // --- Öğretmenin kendi ilanları --------------------------------------------
  router.get('/api/courses/me/list', attachUser(db), requireAuth, requireTeacher, (req, res) => {
    const rows = db.prepare(`
      SELECT c.*, s.name AS subject_name FROM courses c JOIN subjects s ON s.id = c.subject_id
      WHERE c.teacher_id = ? ORDER BY c.created_at DESC
    `).all(req.user.id);
    res.json({ courses: rows.map(toPublicCourse) });
  });

  router.post('/api/courses', attachUser(db), requireAuth, requireTeacher, requireApprovedTeacher, (req, res) => {
    const parsed = parseAndValidate(db, req.body);
    if (parsed.error) return res.status(400).json({ error: parsed.error });
    const now = new Date().toISOString();

    const info = db.prepare(`
      INSERT INTO courses (teacher_id, subject_id, title, description, price_kurus, duration_minutes,
        mode, location, available_days, available_hours, cover_image_url, is_active, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
    `).run(
      req.user.id, parsed.subjectId, parsed.title, parsed.description, parsed.priceKurus, parsed.durationMinutes,
      parsed.mode, parsed.location, JSON.stringify(parsed.availableDays), JSON.stringify(parsed.availableHours),
      parsed.coverImageUrl, now, now
    );

    res.status(201).json({ course: toPublicCourse(getCourseRow(db, info.lastInsertRowid)) });
  });

  router.patch('/api/courses/:id', attachUser(db), requireAuth, (req, res) => {
    const course = getCourseRow(db, req.params.id);
    if (!course) return res.status(404).json({ error: 'İlan bulunamadı.' });
    if (!canManageCourse(req.user, course)) return res.status(403).json({ error: 'Bu ilanı düzenleme yetkiniz yok.' });

    // Mevcut kaydı (snake_case, DB şekli) parseAndValidate'in beklediği
    // camelCase şekle çevirip body ile birleştiriyoruz. Bunu yapmazsak,
    // istekte gönderilmeyen alanlar (örn. availableDays, coverImageUrl)
    // yanlışlıkla sıfırlanır.
    const current = {
      title: course.title,
      description: course.description,
      subjectId: course.subject_id,
      price: course.price_kurus / 100,
      durationMinutes: course.duration_minutes,
      mode: course.mode,
      location: course.location,
      availableDays: safeJsonArray(course.available_days),
      availableHours: safeJsonArray(course.available_hours),
      coverImageUrl: course.cover_image_url,
    };
    const parsed = parseAndValidate(db, { ...current, ...req.body }, true);
    if (parsed.error) return res.status(400).json({ error: parsed.error });
    const now = new Date().toISOString();

    db.prepare(`
      UPDATE courses SET subject_id = ?, title = ?, description = ?, price_kurus = ?, duration_minutes = ?,
        mode = ?, location = ?, available_days = ?, available_hours = ?, cover_image_url = ?, updated_at = ?
      WHERE id = ?
    `).run(
      parsed.subjectId, parsed.title, parsed.description, parsed.priceKurus, parsed.durationMinutes,
      parsed.mode, parsed.location, JSON.stringify(parsed.availableDays), JSON.stringify(parsed.availableHours),
      parsed.coverImageUrl, now, course.id
    );

    res.json({ course: toPublicCourse(getCourseRow(db, course.id)) });
  });

  router.patch('/api/courses/:id/active', attachUser(db), requireAuth, (req, res) => {
    const course = getCourseRow(db, req.params.id);
    if (!course) return res.status(404).json({ error: 'İlan bulunamadı.' });
    if (!canManageCourse(req.user, course)) return res.status(403).json({ error: 'Bu ilanı düzenleme yetkiniz yok.' });
    const { isActive } = req.body || {};
    db.prepare('UPDATE courses SET is_active = ?, updated_at = ? WHERE id = ?')
      .run(isActive ? 1 : 0, new Date().toISOString(), course.id);
    res.json({ course: toPublicCourse(getCourseRow(db, course.id)) });
  });

  router.delete('/api/courses/:id', attachUser(db), requireAuth, (req, res) => {
    const course = getCourseRow(db, req.params.id);
    if (!course) return res.status(404).json({ error: 'İlan bulunamadı.' });
    if (!canManageCourse(req.user, course)) return res.status(403).json({ error: 'Bu ilanı silme yetkiniz yok.' });
    db.prepare('DELETE FROM courses WHERE id = ?').run(course.id);
    res.json({ message: 'İlan kaldırıldı.' });
  });

  // --- Admin: tüm ilanları yönetme ('courses.manage' izni) ------------------
  router.get('/api/admin/courses', attachUser(db), requireAuth, requirePermission(db, 'courses.manage'), (req, res) => {
    const rows = db.prepare(`
      SELECT c.*, u.full_name AS teacher_name, s.name AS subject_name
      FROM courses c JOIN users u ON u.id = c.teacher_id JOIN subjects s ON s.id = c.subject_id
      ORDER BY c.created_at DESC
    `).all();
    res.json({ courses: rows.map(toPublicCourse) });
  });

  router.patch('/api/admin/courses/:id/active', attachUser(db), requireAuth, requirePermission(db, 'courses.manage'), (req, res) => {
    const course = getCourseRow(db, req.params.id);
    if (!course) return res.status(404).json({ error: 'İlan bulunamadı.' });
    const { isActive } = req.body || {};
    db.prepare('UPDATE courses SET is_active = ?, updated_at = ? WHERE id = ?')
      .run(isActive ? 1 : 0, new Date().toISOString(), course.id);
    res.json({ course: toPublicCourse(getCourseRow(db, course.id)) });
  });

  router.delete('/api/admin/courses/:id', attachUser(db), requireAuth, requirePermission(db, 'courses.manage'), (req, res) => {
    const course = getCourseRow(db, req.params.id);
    if (!course) return res.status(404).json({ error: 'İlan bulunamadı.' });
    db.prepare('DELETE FROM courses WHERE id = ?').run(course.id);
    res.json({ message: 'İlan kaldırıldı.' });
  });

  // --- Belirli bir öğretmenin ilanları (public) -----------------------------
  router.get('/api/teachers/:id/courses', (req, res) => {
    const rows = db.prepare(`
      SELECT c.*, s.name AS subject_name FROM courses c JOIN subjects s ON s.id = c.subject_id
      WHERE c.teacher_id = ? AND c.is_active = 1 ORDER BY c.created_at DESC
    `).all(req.params.id);
    res.json({ courses: rows.map(toPublicCourse) });
  });
}

function requireTeacher(req, res, next) {
  if (req.user.role !== 'TEACHER') return res.status(403).json({ error: 'Bu işlem yalnızca öğretmenler içindir.' });
  next();
}

function requireApprovedTeacher(req, res, next) {
  if (req.user.teacher_status !== 'approved') {
    return res.status(403).json({ error: 'İlan oluşturabilmek için öğretmen hesabınızın onaylanmış olması gerekir.' });
  }
  next();
}

function canManageCourse(user, course) {
  if (user.role === 'SUPER_ADMIN') return true;
  if (user.id === course.teacher_id) return true;
  return false; // 'courses.manage' izinli adminler admin-courses uç noktasından yönetir (aşağıda)
}

function getCourseRow(db, id) {
  return db.prepare('SELECT * FROM courses WHERE id = ?').get(id);
}

function parseAndValidate(db, body, isUpdate = false) {
  const title = (body.title || '').trim();
  if (!title || title.length < 3) return { error: 'Ders adı en az 3 karakter olmalı.' };

  const subjectId = Number(body.subjectId ?? body.subject_id);
  const subject = db.prepare('SELECT id FROM subjects WHERE id = ?').get(subjectId);
  if (!subject) return { error: 'Geçerli bir branş seçin.' };

  const priceTl = Number(body.price ?? (body.priceKurus != null ? body.priceKurus / 100 : NaN));
  if (!Number.isFinite(priceTl) || priceTl <= 0) return { error: 'Geçerli bir fiyat girin.' };
  const priceKurus = Math.round(priceTl * 100);

  const durationMinutes = Number(body.durationMinutes ?? body.duration_minutes);
  if (!Number.isInteger(durationMinutes) || durationMinutes < 15 || durationMinutes > 480) {
    return { error: 'Ders süresi 15 ile 480 dakika arasında olmalı.' };
  }

  const mode = body.mode;
  if (!VALID_MODES.includes(mode)) return { error: 'Geçersiz ders türü (online / yuz_yuze / online_ve_yuz_yuze).' };
  if ((mode === 'yuz_yuze' || mode === 'online_ve_yuz_yuze') && !body.location) {
    return { error: 'Yüz yüze ders için konum belirtmelisiniz.' };
  }

  return {
    title,
    description: (body.description || '').trim() || null,
    subjectId: subject.id,
    priceKurus,
    durationMinutes,
    mode,
    location: body.location || null,
    availableDays: Array.isArray(body.availableDays) ? body.availableDays : [],
    availableHours: Array.isArray(body.availableHours) ? body.availableHours : [],
    coverImageUrl: body.coverImageUrl || null,
  };
}

function toPublicCourse(row) {
  return {
    id: row.id,
    teacherId: row.teacher_id,
    teacherName: row.teacher_name,
    subjectId: row.subject_id,
    subjectName: row.subject_name,
    title: row.title,
    description: row.description,
    price: row.price_kurus / 100,
    durationMinutes: row.duration_minutes,
    mode: row.mode,
    location: row.location,
    availableDays: safeJsonArray(row.available_days),
    availableHours: safeJsonArray(row.available_hours),
    coverImageUrl: row.cover_image_url,
    isActive: !!row.is_active,
    createdAt: row.created_at,
  };
}

function safeJsonArray(text) {
  try { const v = JSON.parse(text); return Array.isArray(v) ? v : []; } catch { return []; }
}

module.exports = { register };
