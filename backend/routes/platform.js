const { attachUser, requireAuth, requireRole } = require('../middleware');

function register(router, db) {
  const auth = [attachUser(db), requireAuth];

  router.get('/api/platform/favorites', ...auth, (req, res) => {
    const rows = db.prepare(`
      SELECT f.*, c.title, c.subject, c.price, u.full_name AS teacher_name
      FROM favorites f
      JOIN courses c ON c.id = f.course_id
      JOIN users u ON u.id = c.teacher_id
      WHERE f.user_id = ?
      ORDER BY f.created_at DESC
    `).all(req.user.id);
    res.json({ favorites: rows });
  });

  router.post('/api/platform/favorites/:courseId', ...auth, (req, res) => {
    const courseId = Number(req.params.courseId);
    const course = db.prepare('SELECT id, teacher_id FROM courses WHERE id = ?').get(courseId);
    if (!course) return res.status(404).json({ error: 'Ders bulunamadı.' });

    const existing = db.prepare('SELECT 1 FROM favorites WHERE user_id = ? AND course_id = ?').get(req.user.id, courseId);
    if (existing) {
      db.prepare('DELETE FROM favorites WHERE user_id = ? AND course_id = ?').run(req.user.id, courseId);
      return res.json({ favorited: false, message: 'Favoriden kaldırıldı.' });
    }

    db.prepare(`
      INSERT INTO favorites (user_id, course_id, teacher_id, created_at)
      VALUES (?, ?, ?, ?)
    `).run(req.user.id, courseId, course.teacher_id, new Date().toISOString());

    res.status(201).json({ favorited: true, message: 'Favorilere eklendi.' });
  });

  router.delete('/api/platform/favorites/:courseId', ...auth, (req, res) => {
    const courseId = Number(req.params.courseId);
    const deleted = db.prepare('DELETE FROM favorites WHERE user_id = ? AND course_id = ?').run(req.user.id, courseId);
    if (!deleted.changes) return res.status(404).json({ error: 'Favori bulunamadı.' });
    res.json({ message: 'Favori kaldırıldı.' });
  });

  router.get('/api/platform/applications', ...auth, (req, res) => {
    if (req.user.role === 'TEACHER') {
      const rows = db.prepare(`
        SELECT a.*, c.title AS course_title, c.subject, s.full_name AS student_name, s.email AS student_email
        FROM applications a
        JOIN courses c ON c.id = a.course_id
        JOIN users s ON s.id = a.student_id
        WHERE a.teacher_id = ?
        ORDER BY a.created_at DESC
      `).all(req.user.id);
      return res.json({ applications: rows });
    }

    const rows = db.prepare(`
      SELECT a.*, c.title AS course_title, c.subject, u.full_name AS teacher_name
      FROM applications a
      JOIN courses c ON c.id = a.course_id
      JOIN users u ON u.id = a.teacher_id
      WHERE a.student_id = ?
      ORDER BY a.created_at DESC
    `).all(req.user.id);
    res.json({ applications: rows });
  });

  router.post('/api/platform/applications', ...auth, (req, res) => {
    const { courseId, note } = req.body || {};
    if (!courseId) return res.status(400).json({ error: 'Ders seçimi gerekli.' });
    if (req.user.role !== 'STUDENT') return res.status(403).json({ error: 'Yalnızca öğrenciler ders başvurusu yapabilir.' });

    const course = db.prepare('SELECT * FROM courses WHERE id = ?').get(Number(courseId));
    if (!course) return res.status(404).json({ error: 'Ders bulunamadı.' });
    if (course.teacher_id === req.user.id) return res.status(400).json({ error: 'Kendi ilanınıza başvuru yapamazsınız.' });

    const existing = db.prepare('SELECT * FROM applications WHERE student_id = ? AND course_id = ?').get(req.user.id, Number(courseId));
    if (existing) {
      return res.status(409).json({ error: 'Bu ders için zaten başvurunuz var.' });
    }

    const result = db.prepare(`
      INSERT INTO applications (student_id, teacher_id, course_id, note, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'pending', ?, ?)
    `).run(req.user.id, course.teacher_id, Number(courseId), String(note || '').trim(), new Date().toISOString(), new Date().toISOString());

    const application = db.prepare('SELECT * FROM applications WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json({ application, message: 'Başvurunuz alındı.' });
  });

  router.patch('/api/platform/applications/:id/status', ...auth, (req, res) => {
    const appId = Number(req.params.id);
    const { status } = req.body || {};
    const allowed = ['pending', 'accepted', 'rejected'];
    if (!allowed.includes(status)) return res.status(400).json({ error: 'Geçersiz başvuru durumu.' });

    const current = db.prepare('SELECT * FROM applications WHERE id = ?').get(appId);
    if (!current) return res.status(404).json({ error: 'Başvuru bulunamadı.' });

    if (req.user.role === 'TEACHER' && current.teacher_id !== req.user.id) {
      return res.status(403).json({ error: 'Bu başvuruyu değiştirme yetkiniz yok.' });
    }
    if (req.user.role !== 'TEACHER' && req.user.role !== 'ADMIN' && req.user.role !== 'SUPER_ADMIN' && req.user.role !== 'ADMIN_HELPER') {
      return res.status(403).json({ error: 'Bu başvuruyu güncelleyemezsiniz.' });
    }

    db.prepare('UPDATE applications SET status = ?, updated_at = ? WHERE id = ?').run(status, new Date().toISOString(), appId);
    const updated = db.prepare('SELECT * FROM applications WHERE id = ?').get(appId);
    res.json({ application: updated, message: 'Başvuru durumu güncellendi.' });
  });

  router.get('/api/platform/messages', ...auth, (req, res) => {
    const { courseId } = req.query;
    let sql = `
      SELECT m.*, s.full_name AS sender_name, r.full_name AS receiver_name
      FROM messages m
      JOIN users s ON s.id = m.sender_id
      JOIN users r ON r.id = m.receiver_id
      WHERE (m.sender_id = ? OR m.receiver_id = ?)
    `;
    const params = [req.user.id, req.user.id];
    if (courseId) {
      sql += ' AND m.course_id = ?';
      params.push(Number(courseId));
    }
    sql += ' ORDER BY m.created_at ASC';

    res.json({ messages: db.prepare(sql).all(...params) });
  });

  router.post('/api/platform/messages', ...auth, (req, res) => {
    const { receiverId, courseId, text } = req.body || {};
    if (!receiverId || !text || !String(text).trim()) return res.status(400).json({ error: 'Alıcı ve mesaj metni gerekli.' });

    const receiver = db.prepare('SELECT id FROM users WHERE id = ?').get(Number(receiverId));
    if (!receiver) return res.status(404).json({ error: 'Alıcı bulunamadı.' });

    const result = db.prepare(`
      INSERT INTO messages (sender_id, receiver_id, course_id, text, created_at, is_read)
      VALUES (?, ?, ?, ?, ?, 0)
    `).run(req.user.id, Number(receiverId), courseId ? Number(courseId) : null, String(text).trim(), new Date().toISOString());

    const message = db.prepare('SELECT * FROM messages WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json({ message });
  });

  router.get('/api/platform/reviews', ...auth, (req, res) => {
    const rows = db.prepare(`
      SELECT r.*, s.full_name AS student_name, u.full_name AS teacher_name
      FROM reviews r
      JOIN users s ON s.id = r.student_id
      JOIN users u ON u.id = r.teacher_id
      WHERE r.teacher_id = ? OR r.student_id = ?
      ORDER BY r.created_at DESC
    `).all(req.user.id, req.user.id);
    res.json({ reviews: rows });
  });

  router.post('/api/platform/reviews', ...auth, (req, res) => {
    const { courseId, teacherId, rating, comment } = req.body || {};
    if (!courseId || !teacherId || !rating) return res.status(400).json({ error: 'Ders, öğretmen ve puan gerekli.' });
    const value = Number(rating);
    if (value < 1 || value > 5) return res.status(400).json({ error: 'Puan 1 ile 5 arasında olmalı.' });

    const application = db.prepare('SELECT * FROM applications WHERE course_id = ? AND student_id = ? AND teacher_id = ? AND status = ?').get(Number(courseId), req.user.id, Number(teacherId), 'accepted');
    if (!application) return res.status(400).json({ error: 'Onaylı ders başvurusu olmalı.' });

    const result = db.prepare(`
      INSERT INTO reviews (course_id, student_id, teacher_id, rating, comment, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(Number(courseId), req.user.id, Number(teacherId), value, String(comment || '').trim(), new Date().toISOString());

    const review = db.prepare('SELECT * FROM reviews WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json({ review, message: 'Yorum kaydedildi.' });
  });

  router.get('/api/platform/complaints', ...auth, (req, res) => {
    if (req.user.role === 'SUPER_ADMIN' || req.user.role === 'ADMIN' || req.user.role === 'ADMIN_HELPER') {
      const rows = db.prepare(`
        SELECT c.*, u.full_name AS user_name, u.email
        FROM complaints c
        JOIN users u ON u.id = c.user_id
        ORDER BY c.created_at DESC
      `).all();
      return res.json({ complaints: rows });
    }

    const rows = db.prepare(`
      SELECT * FROM complaints WHERE user_id = ? ORDER BY created_at DESC
    `).all(req.user.id);
    res.json({ complaints: rows });
  });

  router.post('/api/platform/complaints', ...auth, (req, res) => {
    const { reason, detail, targetType, targetId } = req.body || {};
    if (!reason || !String(reason).trim()) return res.status(400).json({ error: 'Şikayet nedeni gerekli.' });

    const result = db.prepare(`
      INSERT INTO complaints (user_id, target_type, target_id, reason, detail, status, created_at)
      VALUES (?, ?, ?, ?, ?, 'open', ?)
    `).run(req.user.id, targetType || null, targetId ? Number(targetId) : null, String(reason).trim(), String(detail || '').trim(), new Date().toISOString());

    const complaint = db.prepare('SELECT * FROM complaints WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json({ complaint, message: 'Şikayet kaydedildi.' });
  });
}

module.exports = { register };
