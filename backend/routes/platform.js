const { attachUser, requireAuth, requireRole, rateLimit } = require('../middleware');

function parseSlot(slot) {
  const match = String(slot || '').match(/(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})/);
  if (!match) return null;
  const start = Number(match[1]) * 60 + Number(match[2]);
  const end = Number(match[3]) * 60 + Number(match[4]);
  return end > start ? { start, end } : null;
}

function slotsOverlap(first, second) {
  return first && second && first.start < second.end && second.start < first.end;
}

function register(router, db) {
  const auth = [attachUser(db), requireAuth];

  const notify = (userId, title, body, relatedId = null) => {
    db.prepare(`
      INSERT INTO notifications (user_id, type, title, body, related_id, is_read, created_at)
      VALUES (?, 'course', ?, ?, ?, 0, ?)
    `).run(userId, title, body, relatedId, new Date().toISOString());
  };

  const adminIds = () => db.prepare(`
    SELECT u.id FROM users u JOIN roles r ON r.id = u.role_id
    WHERE r.name IN ('SUPER_ADMIN', 'ADMIN', 'ADMIN_HELPER') AND u.is_active = 1 AND u.is_blocked = 0
  `).all().map((row) => row.id);

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
        SELECT a.*, c.title AS course_title, c.subject, s.full_name AS student_name, s.email AS student_email,
          c.price, c.duration_minutes, tp.payout_iban
        FROM applications a
        JOIN courses c ON c.id = a.course_id
        JOIN users s ON s.id = a.student_id
        LEFT JOIN teacher_profiles tp ON tp.user_id = a.teacher_id
        WHERE a.teacher_id = ?
        ORDER BY a.created_at DESC
      `).all(req.user.id);
      return res.json({ applications: rows });
    }

    const rows = db.prepare(`
      SELECT a.*, c.title AS course_title, c.subject, u.full_name AS teacher_name,
        c.price, c.duration_minutes, ps.value AS admin_receive_iban, pi.value AS payment_instruction
      FROM applications a
      JOIN courses c ON c.id = a.course_id
      JOIN users u ON u.id = a.teacher_id
      LEFT JOIN platform_settings ps ON ps.key = 'admin_receive_iban'
      LEFT JOIN platform_settings pi ON pi.key = 'payment_instruction'
      WHERE a.student_id = ?
      ORDER BY a.created_at DESC
    `).all(req.user.id);
    res.json({ applications: rows });
  });

  router.post('/api/platform/applications', ...auth, (req, res) => {
    const { courseId, note, selectedSlot, selectedDay } = req.body || {};
    if (!courseId) return res.status(400).json({ error: 'Ders seçimi gerekli.' });
    if (req.user.role !== 'STUDENT') return res.status(403).json({ error: 'Yalnızca öğrenciler ders başvurusu yapabilir.' });

    const course = db.prepare('SELECT * FROM courses WHERE id = ?').get(Number(courseId));
    if (!course) return res.status(404).json({ error: 'Ders bulunamadı.' });
    if (course.teacher_id === req.user.id) return res.status(400).json({ error: 'Kendi ilanınıza başvuru yapamazsınız.' });
    if (!selectedSlot || String(selectedSlot).trim().length > 80) return res.status(400).json({ error: 'Ders saati seçmelisiniz.' });
    const day = String(selectedDay || course.availability_days || '').trim();
    const requestedSlot = parseSlot(selectedSlot);
    if (!day || !requestedSlot) return res.status(400).json({ error: 'Geçerli ders günü ve saat aralığı seçmelisiniz.' });

    const paymentSettings = db.prepare("SELECT key, value FROM platform_settings WHERE key IN ('admin_receive_iban', 'payment_instruction')").all();
    const settings = Object.fromEntries(paymentSettings.map((row) => [row.key, row.value]));
    const adminIban = settings.admin_receive_iban;
    if (!adminIban) return res.status(503).json({ error: 'Ödeme hesabı henüz admin tarafından tanımlanmadı.' });

    const existing = db.prepare('SELECT * FROM applications WHERE student_id = ? AND course_id = ?').get(req.user.id, Number(courseId));
    if (existing) {
      return res.status(409).json({ error: 'Bu ders için zaten başvurunuz var.' });
    }

    const booked = db.prepare(`
      SELECT selected_slot FROM applications
      WHERE teacher_id = ? AND selected_day = ?
        AND status IN ('awaiting_payment', 'pending', 'accepted')
        AND payment_status IN ('awaiting_transfer', 'confirmed', 'payout_sent')
    `).all(course.teacher_id, day);
    if (booked.some((row) => slotsOverlap(requestedSlot, parseSlot(row.selected_slot)))) {
      return res.status(409).json({ error: 'Bu öğretmenin seçtiğiniz saatinde başka bir ders bulunuyor.' });
    }

    const result = db.prepare(`
      INSERT INTO applications (student_id, teacher_id, course_id, note, selected_day, selected_slot, amount_cents, payment_status, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'awaiting_transfer', 'awaiting_payment', ?, ?)
    `).run(req.user.id, course.teacher_id, Number(courseId), String(note || '').trim(), day, String(selectedSlot).trim(), Math.round(Number(course.price || 0) * 100), new Date().toISOString(), new Date().toISOString());

    const application = db.prepare('SELECT * FROM applications WHERE id = ?').get(result.lastInsertRowid);
    for (const adminId of adminIds()) notify(adminId, 'Yeni ders ödeme talebi', `Ders #${course.id} için ${course.price} TL ödeme bekleniyor.`, application.id);
    res.status(201).json({
      application,
      payment: {
        amount: Number(course.price || 0),
        iban: adminIban,
        instruction: settings.payment_instruction || 'Açıklama kısmına ders başvuru numaranızı yazın.',
        reference: `DERS-${application.id}`,
        currency: 'TRY',
        status: 'awaiting_transfer',
      },
      message: 'Ders saatiniz ayrıldı. Belirtilen IBAN\'a ödeme yaptıktan sonra admin onayı beklenir.',
    });
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

    if (req.user.role === 'TEACHER' && status === 'accepted' && current.payment_status !== 'confirmed') {
      return res.status(409).json({ error: 'Admin ödemeyi doğrulamadan dersi kabul edemezsiniz.' });
    }

    const now = new Date().toISOString();
    const payoutDueAt = req.user.role === 'TEACHER' && status === 'accepted'
      ? new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() : current.payout_due_at;
    db.prepare('UPDATE applications SET status = ?, teacher_confirmed_at = CASE WHEN ? = \'accepted\' AND ? = \'TEACHER\' THEN ? ELSE teacher_confirmed_at END, payout_due_at = ?, updated_at = ? WHERE id = ?')
      .run(status, status, req.user.role, now, payoutDueAt, now, appId);
    if (status === 'accepted') notify(current.student_id, 'Ders onaylandı', 'Öğretmen ders talebinizi kabul etti.', appId);
    const updated = db.prepare('SELECT * FROM applications WHERE id = ?').get(appId);
    res.json({ application: updated, message: 'Başvuru durumu güncellendi.' });
  });

  router.patch('/api/platform/applications/:id/lifecycle', ...auth, (req, res) => {
    const application = db.prepare('SELECT * FROM applications WHERE id = ?').get(Number(req.params.id));
    if (!application) return res.status(404).json({ error: 'Başvuru bulunamadı.' });
    const action = String(req.body?.action || '');
    const isParticipant = application.student_id === req.user.id || application.teacher_id === req.user.id;
    const isAdmin = ['SUPER_ADMIN', 'ADMIN', 'ADMIN_HELPER'].includes(req.user.role);
    if (!isParticipant && !isAdmin) return res.status(403).json({ error: 'Bu ders akışını değiştirme yetkiniz yok.' });

    const now = new Date().toISOString();
    if (action === 'complete') {
      if (req.user.id !== application.teacher_id && !isAdmin) return res.status(403).json({ error: 'Dersi yalnızca öğretmen tamamlayabilir.' });
      if (application.status !== 'accepted') return res.status(409).json({ error: 'Sadece kabul edilmiş ders tamamlanabilir.' });
      db.prepare("UPDATE applications SET status = 'completed', completed_at = ?, updated_at = ? WHERE id = ?").run(now, now, application.id);
    } else if (action === 'cancel') {
      if (application.status === 'completed' || application.status === 'cancelled') return res.status(409).json({ error: 'Bu ders artık değiştirilemez.' });
      const reason = String(req.body?.reason || '').trim().slice(0, 500);
      db.prepare("UPDATE applications SET status = 'cancelled', refund_status = CASE WHEN payment_status IN ('confirmed', 'payout_sent') THEN 'requested' ELSE refund_status END, cancelled_at = ?, cancelled_by = ?, cancellation_reason = ?, updated_at = ? WHERE id = ?")
        .run(now, req.user.id, reason, now, application.id);
      notify(application.student_id, 'Ders iptal edildi', reason || 'Ders talebi iptal edildi.', application.id);
      notify(application.teacher_id, 'Ders iptal edildi', reason || 'Ders talebi iptal edildi.', application.id);
    } else if (action === 'refund') {
      if (!isAdmin) return res.status(403).json({ error: 'İade işlemini yalnızca yönetim başlatabilir.' });
      if (application.status !== 'cancelled' || application.payment_status !== 'confirmed') return res.status(409).json({ error: 'Sadece iptal edilmiş ve doğrulanmış ödemeler iade edilebilir.' });
      db.prepare("UPDATE applications SET refund_status = 'approved', payment_status = 'refund_pending', updated_at = ? WHERE id = ?").run(now, application.id);
      notify(application.student_id, 'İade bekliyor', 'İade işlemi yönetim tarafından onaylandı.', application.id);
    } else {
      return res.status(400).json({ error: 'Geçersiz ders işlemi.' });
    }
    res.json({ application: db.prepare('SELECT * FROM applications WHERE id = ?').get(application.id) });
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

    const rows = db.prepare(sql).all(...params);
    db.prepare('UPDATE messages SET is_read = 1 WHERE receiver_id = ?').run(req.user.id);
    res.json({ messages: rows });
  });

  router.post('/api/platform/messages', rateLimit({ windowMs: 60_000, max: 30, key: 'messages' }), ...auth, (req, res) => {
    const { receiverId, courseId, text } = req.body || {};
    if (!receiverId || !text || !String(text).trim()) return res.status(400).json({ error: 'Alıcı ve mesaj metni gerekli.' });
    if (String(text).trim().length > 2000) return res.status(400).json({ error: 'Mesaj en fazla 2000 karakter olabilir.' });

    const receiver = db.prepare('SELECT id FROM users WHERE id = ?').get(Number(receiverId));
    if (!receiver) return res.status(404).json({ error: 'Alıcı bulunamadı.' });
    if (Number(receiverId) === req.user.id) return res.status(400).json({ error: 'Kendinize mesaj gönderemezsiniz.' });
    const relation = courseId
      ? db.prepare(`
          SELECT 1 FROM applications
          WHERE course_id = ? AND ((student_id = ? AND teacher_id = ?) OR (student_id = ? AND teacher_id = ?))
        `).get(Number(courseId), req.user.id, Number(receiverId), Number(receiverId), req.user.id)
      : db.prepare(`
          SELECT 1 FROM applications
          WHERE (student_id = ? AND teacher_id = ?) OR (student_id = ? AND teacher_id = ?)
        `).get(req.user.id, Number(receiverId), Number(receiverId), req.user.id);
    if (!relation) return res.status(403).json({ error: 'Yalnızca başvuru yaptığınız veya başvuran kişilerle mesajlaşabilirsiniz.' });

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

  router.post('/api/platform/complaints', rateLimit({ windowMs: 60_000, max: 5, key: 'complaints' }), ...auth, (req, res) => {
    const { reason, detail, targetType, targetId } = req.body || {};
    if (!reason || !String(reason).trim()) return res.status(400).json({ error: 'Şikayet nedeni gerekli.' });
    if (String(reason).trim().length > 120 || String(detail || '').trim().length > 2000) return res.status(400).json({ error: 'Şikayet metni çok uzun.' });

    const result = db.prepare(`
      INSERT INTO complaints (user_id, target_type, target_id, reason, detail, status, created_at)
      VALUES (?, ?, ?, ?, ?, 'open', ?)
    `).run(req.user.id, targetType || null, targetId ? Number(targetId) : null, String(reason).trim(), String(detail || '').trim(), new Date().toISOString());

    const complaint = db.prepare('SELECT * FROM complaints WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json({ complaint, message: 'Şikayet kaydedildi.' });
  });

  router.patch('/api/platform/complaints/:id/status', ...auth, (req, res) => {
    if (!['SUPER_ADMIN', 'ADMIN', 'ADMIN_HELPER'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Şikayet durumunu yalnızca yönetim güncelleyebilir.' });
    }
    const status = String(req.body?.status || '');
    if (!['open', 'resolved'].includes(status)) return res.status(400).json({ error: 'Geçersiz şikayet durumu.' });
    const result = db.prepare('UPDATE complaints SET status = ? WHERE id = ?').run(status, Number(req.params.id));
    if (!result.changes) return res.status(404).json({ error: 'Şikayet bulunamadı.' });
    res.json({ complaint: db.prepare('SELECT * FROM complaints WHERE id = ?').get(Number(req.params.id)), message: 'Şikayet durumu güncellendi.' });
  });
}

module.exports = { register };
