const { attachUser, requireAuth, requireRole } = require('../middleware');
const { logAdminAction } = require('./auth');

const SUBJECTS = [
  'Matematik', 'Türkçe', 'Fen Bilimleri', 'Fizik', 'Kimya', 'Biyoloji',
  'İngilizce', 'Almanca', 'Tarih', 'Coğrafya', 'Felsefe', 'Din Kültürü',
  'Sosyal Bilgiler', 'Okul Öncesi', 'Kodlama', 'Bilişim Teknolojileri',
  'Web Tasarım', 'Robotik', 'Scratch', 'Python', 'JavaScript', 'Grafik Tasarım',
  'Müzik', 'Resim', 'Satranç', 'Diğer',
];

const GRADE_LEVELS = [
  'Okul Öncesi', '1. Sınıf', '2. Sınıf', '3. Sınıf', '4. Sınıf',
  '5. Sınıf', '6. Sınıf', '7. Sınıf', '8. Sınıf', '9. Sınıf',
  '10. Sınıf', '11. Sınıf', '12. Sınıf', 'Üniversite', 'Yetişkin',
];

function register(router, db) {
  router.get('/api/catalog', (req, res) => {
    res.json({ subjects: SUBJECTS, gradeLevels: GRADE_LEVELS });
  });

  router.get('/api/teachers', (req, res) => {
    const rows = db.prepare(`
      SELECT tp.*, u.email, u.full_name, u.teacher_status, r.name AS role
      FROM teacher_profiles tp
      JOIN users u ON u.id = tp.user_id
      JOIN roles r ON r.id = u.role_id
      WHERE u.is_active = 1 AND u.is_blocked = 0 AND u.role_id = (SELECT id FROM roles WHERE name = 'TEACHER')
      ORDER BY tp.updated_at DESC
    `).all();

    res.json({ teachers: rows });
  });

  router.get('/api/teachers/me/profile', attachUser(db), requireAuth, requireRole('TEACHER'), (req, res) => {
    let profile = db.prepare(`
      SELECT tp.*, u.email, u.full_name, u.teacher_status
      FROM teacher_profiles tp
      JOIN users u ON u.id = tp.user_id
      WHERE tp.user_id = ?
    `).get(req.user.id);

    if (!profile) {
      const now = new Date().toISOString();
      const result = db.prepare(`
        INSERT INTO teacher_profiles (user_id, full_name, subject, bio, education, experience, is_online, is_in_person, hourly_price, city, photo_url, rating, reviews_count, created_at, updated_at)
        VALUES (?, ?, 'Genel', '', '', '', 1, 1, 0, '', '', 0, 0, ?, ?)
      `).run(req.user.id, req.user.full_name, now, now);

      profile = db.prepare(`
        SELECT tp.*, u.email, u.full_name, u.teacher_status
        FROM teacher_profiles tp
        JOIN users u ON u.id = tp.user_id
        WHERE tp.id = ?
      `).get(result.lastInsertRowid);
    }

    res.json({ profile });
  });

  router.get('/api/teachers/me/documents', attachUser(db), requireAuth, requireRole('TEACHER'), (req, res) => {
    const documents = db.prepare('SELECT * FROM teacher_documents WHERE teacher_id = ? ORDER BY created_at DESC').all(req.user.id);
    res.json({ documents });
  });

  router.post('/api/teachers/me/documents', attachUser(db), requireAuth, requireRole('TEACHER'), (req, res) => {
    const documentType = String(req.body?.documentType || '').trim().slice(0, 80);
    const fileUrl = String(req.body?.fileUrl || '').trim();
    if (!documentType || !fileUrl.startsWith('/uploads/')) return res.status(400).json({ error: 'Belge türü ve güvenli yükleme yolu gerekli.' });
    const result = db.prepare(`
      INSERT INTO teacher_documents (teacher_id, document_type, file_url, status, created_at)
      VALUES (?, ?, ?, 'pending', ?)
    `).run(req.user.id, documentType, fileUrl, new Date().toISOString());
    res.status(201).json({ document: db.prepare('SELECT * FROM teacher_documents WHERE id = ?').get(result.lastInsertRowid) });
  });

  router.get('/api/teachers/:id/profile', (req, res) => {
    const profile = db.prepare(`
      SELECT tp.*, u.email, u.full_name, u.teacher_status
      FROM teacher_profiles tp
      JOIN users u ON u.id = tp.user_id
      WHERE tp.user_id = ?
    `).get(Number(req.params.id));

    if (!profile) return res.status(404).json({ error: 'Öğretmen profili bulunamadı.' });
    res.json({ profile });
  });

  router.put('/api/teachers/me/profile', attachUser(db), requireAuth, requireRole('TEACHER'), (req, res) => {
    const { subject, bio, education, experience, isOnline, isInPerson, hourlyPrice, city, photoUrl, payoutIban } = req.body || {};

    const payload = {
      subject: String(subject || '').trim() || 'Genel',
      bio: String(bio || '').trim(),
      education: String(education || '').trim(),
      experience: String(experience || '').trim(),
      is_online: isOnline === false ? 0 : 1,
      is_in_person: isInPerson === true ? 1 : 0,
      hourly_price: Number(hourlyPrice || 0),
      city: String(city || '').trim(),
      photo_url: String(photoUrl || '').trim(),
      payout_iban: String(payoutIban || '').replace(/\s+/g, '').toUpperCase(),
      updated_at: new Date().toISOString(),
    };

    if (payload.payout_iban && !/^TR\d{24}$/.test(payload.payout_iban)) {
      return res.status(400).json({ error: 'Geçerli bir Türkiye IBAN bilgisi girin (TR ile başlayan 26 karakter).' });
    }

    if (payload.photo_url && !/^https?:\/\//i.test(payload.photo_url) && !payload.photo_url.startsWith('/uploads/')) {
      return res.status(400).json({ error: 'Fotoğraf sadece güvenli URL veya cihazdan yüklenmiş /uploads/ dosya yolu olabilir.' });
    }

    const exists = db.prepare('SELECT id FROM teacher_profiles WHERE user_id = ?').get(req.user.id);
    if (exists) {
      db.prepare(`
        UPDATE teacher_profiles
        SET subject = ?, bio = ?, education = ?, experience = ?, is_online = ?, is_in_person = ?, hourly_price = ?, city = ?, photo_url = ?, payout_iban = ?, updated_at = ?
        WHERE user_id = ?
      `).run(payload.subject, payload.bio, payload.education, payload.experience, payload.is_online, payload.is_in_person, payload.hourly_price, payload.city, payload.photo_url, payload.payout_iban, payload.updated_at, req.user.id);
    } else {
      db.prepare(`
        INSERT INTO teacher_profiles (user_id, full_name, subject, bio, education, experience, is_online, is_in_person, hourly_price, city, photo_url, payout_iban, rating, reviews_count, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?)
      `).run(req.user.id, req.user.full_name, payload.subject, payload.bio, payload.education, payload.experience, payload.is_online, payload.is_in_person, payload.hourly_price, payload.city, payload.photo_url, payload.payout_iban, new Date().toISOString(), payload.updated_at);
    }

    const profile = db.prepare(`
      SELECT tp.*, u.email, u.full_name, u.teacher_status
      FROM teacher_profiles tp
      JOIN users u ON u.id = tp.user_id
      WHERE tp.user_id = ?
    `).get(req.user.id);

    logAdminAction(db, {
      actorUserId: req.user.id,
      action: 'TEACHER_PROFILE_UPDATED',
      targetType: 'teacher',
      targetId: req.user.id,
      detail: `${req.user.email} öğretmen profili güncelledi.`,
      ip: req.socket.remoteAddress,
    });

    res.json({ profile, message: 'Profil güncellendi.' });
  });

  router.get('/api/courses', (req, res) => {
    const { subject, grade, mode, maxPrice, q } = req.query;
    let sql = `
      SELECT c.*, u.full_name AS teacher_name, tp.subject AS teacher_subject, tp.hourly_price AS teacher_price, tp.city, tp.rating, tp.reviews_count
      FROM courses c
      JOIN users u ON u.id = c.teacher_id
      LEFT JOIN teacher_profiles tp ON tp.user_id = c.teacher_id
      WHERE c.is_active = 1
    `;
    const params = [];

    if (subject) { sql += ' AND c.subject = ?'; params.push(subject); }
    if (grade) { sql += ' AND c.grade_levels LIKE ?'; params.push(`%${grade}%`); }
    if (mode) { sql += ' AND c.mode = ?'; params.push(mode); }
    if (maxPrice) { sql += ' AND c.price <= ?'; params.push(Number(maxPrice)); }
    if (q) {
      sql += ' AND (c.title LIKE ? OR c.description LIKE ? OR u.full_name LIKE ?)';
      const search = `%${q}%`;
      params.push(search, search, search);
    }

    sql += ' ORDER BY c.created_at DESC';
    res.json({ courses: db.prepare(sql).all(...params) });
  });

  router.get('/api/teachers/me/availability', attachUser(db), requireAuth, requireRole('TEACHER'), (req, res) => {
    const rows = db.prepare(`
      SELECT * FROM teacher_availability WHERE teacher_id = ? ORDER BY day_of_week, start_time ASC
    `).all(req.user.id);
    res.json({ blocks: rows });
  });

  router.post('/api/teachers/me/availability', attachUser(db), requireAuth, requireRole('TEACHER'), (req, res) => {
    const { day, start, duration, color, title } = req.body || {};
    if (!day || !start) return res.status(400).json({ error: 'Gün ve saat gerekli.' });

    const result = db.prepare(`
      INSERT INTO teacher_availability (teacher_id, day_of_week, start_time, duration_min, color, title, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(req.user.id, String(day), String(start), Number(duration || 60), String(color || '#3b82f6'), String(title || 'Ders').trim().slice(0, 120), new Date().toISOString(), new Date().toISOString());

    const block = db.prepare('SELECT * FROM teacher_availability WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json({ block, message: 'Program bloğu eklendi.' });
  });

  router.delete('/api/teachers/me/availability/:id', attachUser(db), requireAuth, requireRole('TEACHER'), (req, res) => {
    const result = db.prepare('DELETE FROM teacher_availability WHERE id = ? AND teacher_id = ?').run(Number(req.params.id), req.user.id);
    if (!result.changes) return res.status(404).json({ error: 'Program bloğu bulunamadı.' });
    res.json({ message: 'Program bloğu silindi.' });
  });

  router.get('/api/teachers/me/courses', attachUser(db), requireAuth, requireRole('TEACHER'), (req, res) => {
    const courses = db.prepare(`
      SELECT * FROM courses WHERE teacher_id = ? ORDER BY created_at DESC
    `).all(req.user.id);
    res.json({ courses });
  });

  router.post('/api/teachers/me/courses', attachUser(db), requireAuth, requireRole('TEACHER'), (req, res) => {
    const { title, subject, description, price, durationMinutes, mode, location, availabilityDays, availabilityHours, imageUrl, gradeLevels } = req.body || {};

    if (!title || !subject || !description || !price) {
      return res.status(400).json({ error: 'Ders adı, branş, açıklama ve fiyat gerekli.' });
    }

    const info = db.prepare(`
      INSERT INTO courses (teacher_id, title, subject, description, price, duration_minutes, mode, location, availability_days, availability_hours, image_url, grade_levels, is_active, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
    `).run(
      req.user.id,
      String(title).trim(),
      String(subject).trim(),
      String(description).trim(),
      Number(price),
      Number(durationMinutes || 60),
      String(mode || 'online'),
      String(location || '').trim(),
      String(availabilityDays || '').trim(),
      String(availabilityHours || '').trim(),
      String(imageUrl || '').trim(),
      Array.isArray(gradeLevels) ? gradeLevels.join(', ') : String(gradeLevels || '').trim(),
      new Date().toISOString(),
      new Date().toISOString()
    );

    logAdminAction(db, {
      actorUserId: req.user.id,
      action: 'COURSE_CREATED',
      targetType: 'course',
      targetId: info.lastInsertRowid,
      detail: `${req.user.email} yeni ders ilanı oluşturdu: ${title}.`,
      ip: req.socket.remoteAddress,
    });

    res.status(201).json({ course: db.prepare('SELECT * FROM courses WHERE id = ?').get(info.lastInsertRowid) });
  });

  router.patch('/api/teachers/me/courses/:id', attachUser(db), requireAuth, requireRole('TEACHER'), (req, res) => {
    const course = db.prepare('SELECT * FROM courses WHERE id = ? AND teacher_id = ?').get(Number(req.params.id), req.user.id);
    if (!course) return res.status(404).json({ error: 'Ders bulunamadı.' });

    const { title, subject, description, price, durationMinutes, mode, location, availabilityDays, availabilityHours, imageUrl, gradeLevels, isActive } = req.body || {};

    db.prepare(`
      UPDATE courses
      SET title = COALESCE(?, title),
          subject = COALESCE(?, subject),
          description = COALESCE(?, description),
          price = COALESCE(?, price),
          duration_minutes = COALESCE(?, duration_minutes),
          mode = COALESCE(?, mode),
          location = COALESCE(?, location),
          availability_days = COALESCE(?, availability_days),
          availability_hours = COALESCE(?, availability_hours),
          image_url = COALESCE(?, image_url),
          grade_levels = COALESCE(?, grade_levels),
          is_active = COALESCE(?, is_active),
          updated_at = ?
      WHERE id = ? AND teacher_id = ?
    `).run(
      title ? String(title).trim() : null,
      subject ? String(subject).trim() : null,
      description ? String(description).trim() : null,
      price !== undefined ? Number(price) : null,
      durationMinutes !== undefined ? Number(durationMinutes) : null,
      mode ? String(mode).trim() : null,
      location !== undefined ? String(location).trim() : null,
      availabilityDays !== undefined ? String(availabilityDays).trim() : null,
      availabilityHours !== undefined ? String(availabilityHours).trim() : null,
      imageUrl !== undefined ? String(imageUrl).trim() : null,
      gradeLevels !== undefined ? (Array.isArray(gradeLevels) ? gradeLevels.join(', ') : String(gradeLevels).trim()) : null,
      isActive !== undefined ? (isActive ? 1 : 0) : null,
      new Date().toISOString(),
      Number(req.params.id),
      req.user.id
    );

    const updated = db.prepare('SELECT * FROM courses WHERE id = ?').get(Number(req.params.id));
    res.json({ course: updated, message: 'Ders güncellendi.' });
  });

  router.delete('/api/teachers/me/courses/:id', attachUser(db), requireAuth, requireRole('TEACHER'), (req, res) => {
    const course = db.prepare('SELECT * FROM courses WHERE id = ? AND teacher_id = ?').get(Number(req.params.id), req.user.id);
    if (!course) return res.status(404).json({ error: 'Ders bulunamadı.' });

    db.prepare('DELETE FROM courses WHERE id = ? AND teacher_id = ?').run(Number(req.params.id), req.user.id);
    res.json({ message: 'Ders silindi.' });
  });
}

module.exports = { register };
