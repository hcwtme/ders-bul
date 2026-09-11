// backend/routes/reviews.js — Yorum ve puanlama sistemi
const { attachUser, requireAuth } = require('../middleware');
const { createNotification } = require('./notifications');

function register(router, db) {
  // Ders için yorum yazma
  router.post('/api/courses/:courseId/reviews', attachUser(db), requireAuth, (req, res) => {
    const { rating, comment } = req.body || {};
    const courseId = Number(req.params.courseId);
    
    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({ error: 'Puanlama 1-5 arasında olmalı.' });
    }
    
    const course = db.prepare('SELECT * FROM courses WHERE id = ?').get(courseId);
    if (!course) return res.status(404).json({ error: 'Ders bulunamadı.' });
    
    // Öğrenci yalnızca kendi başvurusu için yorum yazabilir
    const application = db.prepare(`
      SELECT * FROM applications 
      WHERE course_id = ? AND student_id = ? AND status IN ('completed', 'accepted')
    `).get(courseId, req.user.id);
    
    if (!application) {
      return res.status(403).json({ error: 'Bu ders için yorum yazma yetkiniz yok.' });
    }
    
    const now = new Date().toISOString();
    const result = db.prepare(`
      INSERT INTO reviews (course_id, student_id, teacher_id, rating, comment, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(courseId, req.user.id, course.teacher_id, rating, String(comment || '').trim(), now);
    
    // Öğretmene bildirim gönder
    createNotification(
      db,
      course.teacher_id,
      'new_review',
      'Yeni puan ve yorum',
      `${req.user.full_name} öğrenci ${rating} yıldız verdi.`,
      result.lastInsertRowid
    );
    
    // Öğretmen ortalamasını güncelle
    updateTeacherRating(db, course.teacher_id);
    
    res.status(201).json({ message: 'Yorum gönderildi.' });
  });

  // Ders için yorumları getir
  router.get('/api/courses/:courseId/reviews', (req, res) => {
    const courseId = Number(req.params.courseId);
    const rows = db.prepare(`
      SELECT r.*, u.full_name as student_name, u.id as student_id
      FROM reviews r
      JOIN users u ON u.id = r.student_id
      WHERE r.course_id = ?
      ORDER BY r.created_at DESC
    `).all(courseId);
    
    res.json({ reviews: rows });
  });

  // Öğretmen değerlendirmelerini getir
  router.get('/api/teachers/:teacherId/reviews', (req, res) => {
    const teacherId = Number(req.params.teacherId);
    const rows = db.prepare(`
      SELECT r.*, u.full_name as student_name, c.title as course_title
      FROM reviews r
      JOIN users u ON u.id = r.student_id
      JOIN courses c ON c.id = r.course_id
      WHERE r.teacher_id = ?
      ORDER BY r.created_at DESC
      LIMIT 20
    `).all(teacherId);
    
    const stats = db.prepare(`
      SELECT 
        COUNT(*) as total_reviews,
        AVG(rating) as avg_rating,
        MIN(rating) as min_rating,
        MAX(rating) as max_rating
      FROM reviews
      WHERE teacher_id = ?
    `).get(teacherId);
    
    res.json({ reviews: rows, stats });
  });
}

function updateTeacherRating(db, teacherId) {
  const stats = db.prepare(`
    SELECT COUNT(*) as count, AVG(rating) as avg_rating
    FROM reviews
    WHERE teacher_id = ?
  `).get(teacherId);
  
  const avgRating = stats.avg_rating ? parseFloat(stats.avg_rating).toFixed(2) : 0;
  
  db.prepare(`
    UPDATE teacher_profiles
    SET rating = ?, reviews_count = ?
    WHERE user_id = ?
  `).run(avgRating, stats.count, teacherId);
}

module.exports = { register, updateTeacherRating };
