// backend/routes/favorites.js — Favoriler sistemi
const { attachUser, requireAuth } = require('../middleware');

function register(router, db) {
  // Favori ekle
  router.post('/api/favorites/:courseId', attachUser(db), requireAuth, (req, res) => {
    const courseId = Number(req.params.courseId);
    const course = db.prepare('SELECT * FROM courses WHERE id = ?').get(courseId);
    
    if (!course) return res.status(404).json({ error: 'Ders bulunamadı.' });
    
    const exists = db.prepare(`
      SELECT id FROM favorites WHERE user_id = ? AND course_id = ?
    `).get(req.user.id, courseId);
    
    if (exists) {
      // Zaten favoride varsa, çıkar
      db.prepare('DELETE FROM favorites WHERE user_id = ? AND course_id = ?')
        .run(req.user.id, courseId);
      return res.json({ message: 'Favoriden çıkarıldı.', isFavorite: false });
    } else {
      // Favorilere ekle
      const now = new Date().toISOString();
      db.prepare(`
        INSERT INTO favorites (user_id, course_id, created_at)
        VALUES (?, ?, ?)
      `).run(req.user.id, courseId, now);
      res.json({ message: 'Favorilere eklendi.', isFavorite: true });
    }
  });

  // Favori dersleri getir
  router.get('/api/favorites', attachUser(db), requireAuth, (req, res) => {
    const courses = db.prepare(`
      SELECT c.*, u.full_name as teacher_name, tp.rating
      FROM favorites f
      JOIN courses c ON c.id = f.course_id
      JOIN users u ON u.id = c.teacher_id
      LEFT JOIN teacher_profiles tp ON tp.user_id = u.id
      WHERE f.user_id = ?
      ORDER BY f.created_at DESC
    `).all(req.user.id);
    
    res.json({ favorites: courses });
  });

  // Favorilerin sayısını kontrol et
  router.get('/api/favorites/count', attachUser(db), requireAuth, (req, res) => {
    const count = db.prepare(`
      SELECT COUNT(*) as count FROM favorites WHERE user_id = ?
    `).get(req.user.id).count;
    
    res.json({ count });
  });

  // Favori olup olmadığını kontrol et
  router.get('/api/favorites/check/:courseId', attachUser(db), requireAuth, (req, res) => {
    const courseId = Number(req.params.courseId);
    const exists = db.prepare(`
      SELECT id FROM favorites WHERE user_id = ? AND course_id = ?
    `).get(req.user.id, courseId);
    
    res.json({ isFavorite: !!exists });
  });
}

module.exports = { register };
