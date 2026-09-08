// routes/availability.js — Öğretmen haftalık müsaitlik takvimi (madde 11)
// Her blok tekrar eden bir haftalık dilim (gün + başlangıç/bitiş dakikası).
// KURAL: aynı öğretmenin aynı gün içindeki blokları asla çakışamaz. Bu kural
// yalnızca arayüzde değil, burada — sunucuda — zorunlu kılınıyor; frontend
// bunu atlatmaya çalışsa bile sunucu 409 ile reddeder (madde 24).

const { attachUser, requireAuth } = require('../middleware');

const DAY_MIN = 1;
const DAY_MAX = 7;
const MIN_BLOCK_MINUTES = 15;   // en küçük "lego blok" boyutu
const GRID_STEP = 15;           // tüm blokların hizalanması gereken adım (dakika)

function register(router, db) {
  // ÖNEMLİ: '/api/teachers/me/availability' rotası, aşağıdaki genel
  // '/api/teachers/:id/availability' rotasından ÖNCE tanımlanmalı. Router,
  // eşleşmeleri tanım sırasına göre kontrol ediyor; aksi halde "me" değeri
  // ':id' olarak yakalanır ve yanlış (public) handler'a düşer.

  // --- Öğretmenin kendi takvimi ---------------------------------------------
  router.get('/api/teachers/me/availability', attachUser(db), requireAuth, requireTeacher, (req, res) => {
    res.json({ blocks: listBlocks(db, req.user.id) });
  });

  router.post('/api/teachers/me/availability', attachUser(db), requireAuth, requireTeacher, (req, res) => {
    const parsed = validateBlock(req.body);
    if (parsed.error) return res.status(400).json({ error: parsed.error });

    if (hasOverlap(db, req.user.id, parsed.dayOfWeek, parsed.startMinutes, parsed.endMinutes)) {
      return res.status(409).json({ error: 'Bu zaman dilimi mevcut bir müsaitlik bloğuyla çakışıyor.' });
    }

    const now = new Date().toISOString();
    const info = db.prepare(`
      INSERT INTO availability (teacher_id, day_of_week, start_minutes, end_minutes, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(req.user.id, parsed.dayOfWeek, parsed.startMinutes, parsed.endMinutes, now, now);

    res.status(201).json({ block: getBlock(db, info.lastInsertRowid) });
  });

  // Taşıma (gün/saat değiştirme) VE yeniden boyutlandırma aynı uçtan yönetilir —
  // "lego blok"u sürükleyip bırakma veya kenarından uzatma, ikisi de bu isteği gönderir.
  router.patch('/api/teachers/me/availability/:id', attachUser(db), requireAuth, requireTeacher, (req, res) => {
    const block = getOwnedBlock(db, req.params.id, req.user.id);
    if (!block) return res.status(404).json({ error: 'Blok bulunamadı.' });

    const parsed = validateBlock(req.body);
    if (parsed.error) return res.status(400).json({ error: parsed.error });

    if (hasOverlap(db, req.user.id, parsed.dayOfWeek, parsed.startMinutes, parsed.endMinutes, block.id)) {
      return res.status(409).json({ error: 'Bu zaman dilimi mevcut bir müsaitlik bloğuyla çakışıyor.' });
    }

    db.prepare(`
      UPDATE availability SET day_of_week = ?, start_minutes = ?, end_minutes = ?, updated_at = ? WHERE id = ?
    `).run(parsed.dayOfWeek, parsed.startMinutes, parsed.endMinutes, new Date().toISOString(), block.id);

    res.json({ block: getBlock(db, block.id) });
  });

  router.delete('/api/teachers/me/availability/:id', attachUser(db), requireAuth, requireTeacher, (req, res) => {
    const block = getOwnedBlock(db, req.params.id, req.user.id);
    if (!block) return res.status(404).json({ error: 'Blok bulunamadı.' });
    db.prepare('DELETE FROM availability WHERE id = ?').run(block.id);
    res.json({ message: 'Blok kaldırıldı.' });
  });

  // --- Herkese açık: bir öğretmenin müsaitlik takvimini görüntüleme --------
  router.get('/api/teachers/:id/availability', (req, res) => {
    const teacher = db.prepare(`
      SELECT u.id FROM users u JOIN roles r ON r.id = u.role_id
      WHERE u.id = ? AND r.name = 'TEACHER' AND u.teacher_status = 'approved'
    `).get(req.params.id);
    if (!teacher) return res.status(404).json({ error: 'Öğretmen bulunamadı.' });
    res.json({ blocks: listBlocks(db, teacher.id) });
  });
}

function requireTeacher(req, res, next) {
  if (req.user.role !== 'TEACHER') return res.status(403).json({ error: 'Bu işlem yalnızca öğretmenler içindir.' });
  next();
}

function validateBlock(body) {
  const dayOfWeek = Number(body.dayOfWeek);
  const startMinutes = Number(body.startMinutes);
  const endMinutes = Number(body.endMinutes);

  if (!Number.isInteger(dayOfWeek) || dayOfWeek < DAY_MIN || dayOfWeek > DAY_MAX) {
    return { error: 'Geçersiz gün.' };
  }
  if (!Number.isInteger(startMinutes) || !Number.isInteger(endMinutes)) {
    return { error: 'Başlangıç ve bitiş saatleri gerekli.' };
  }
  if (startMinutes < 0 || endMinutes > 24 * 60 || startMinutes >= endMinutes) {
    return { error: 'Geçersiz zaman aralığı.' };
  }
  if (startMinutes % GRID_STEP !== 0 || endMinutes % GRID_STEP !== 0) {
    return { error: `Saatler ${GRID_STEP} dakikalık dilimlere hizalanmalı.` };
  }
  if (endMinutes - startMinutes < MIN_BLOCK_MINUTES) {
    return { error: `Bir blok en az ${MIN_BLOCK_MINUTES} dakika olmalı.` };
  }

  return { dayOfWeek, startMinutes, endMinutes };
}

function hasOverlap(db, teacherId, dayOfWeek, startMinutes, endMinutes, excludeId = null) {
  const row = db.prepare(`
    SELECT COUNT(*) AS c FROM availability
    WHERE teacher_id = ? AND day_of_week = ? AND id != ?
      AND start_minutes < ? AND end_minutes > ?
  `).get(teacherId, dayOfWeek, excludeId || -1, endMinutes, startMinutes);
  return row.c > 0;
}

function listBlocks(db, teacherId) {
  return db.prepare(`
    SELECT * FROM availability WHERE teacher_id = ? ORDER BY day_of_week, start_minutes
  `).all(teacherId).map(toPublicBlock);
}

function getBlock(db, id) {
  return toPublicBlock(db.prepare('SELECT * FROM availability WHERE id = ?').get(id));
}

function getOwnedBlock(db, id, teacherId) {
  return db.prepare('SELECT * FROM availability WHERE id = ? AND teacher_id = ?').get(id, teacherId);
}

function toPublicBlock(row) {
  if (!row) return null;
  return {
    id: row.id,
    dayOfWeek: row.day_of_week,
    startMinutes: row.start_minutes,
    endMinutes: row.end_minutes,
  };
}

module.exports = { register };
