// backend/routes/notifications.js — Bildirim sistemi
const { attachUser, requireAuth } = require('../middleware');

function register(router, db) {
  // Bildirimleri getir
  router.get('/api/notifications', attachUser(db), requireAuth, (req, res) => {
    const rows = db.prepare(`
      SELECT * FROM notifications 
      WHERE user_id = ? 
      ORDER BY created_at DESC 
      LIMIT 50
    `).all(req.user.id);
    
    const unread = db.prepare(`
      SELECT COUNT(*) as count FROM notifications 
      WHERE user_id = ? AND is_read = 0
    `).get(req.user.id).count;
    
    res.json({ notifications: rows, unreadCount: unread });
  });

  // Bildirimi okundu işaretle
  router.patch('/api/notifications/:id/read', attachUser(db), requireAuth, (req, res) => {
    db.prepare(`
      UPDATE notifications 
      SET is_read = 1, read_at = ? 
      WHERE id = ? AND user_id = ?
    `).run(new Date().toISOString(), Number(req.params.id), req.user.id);
    
    res.json({ message: 'Bildirim okundu olarak işaretlendi.' });
  });

  // Tüm bildirimleri okundu işaretle
  router.post('/api/notifications/mark-all-read', attachUser(db), requireAuth, (req, res) => {
    db.prepare(`
      UPDATE notifications 
      SET is_read = 1, read_at = ? 
      WHERE user_id = ? AND is_read = 0
    `).run(new Date().toISOString(), req.user.id);
    
    res.json({ message: 'Tüm bildirimler okundu olarak işaretlendi.' });
  });

  // Bildirimi sil
  router.delete('/api/notifications/:id', attachUser(db), requireAuth, (req, res) => {
    const result = db.prepare(`
      DELETE FROM notifications 
      WHERE id = ? AND user_id = ?
    `).run(Number(req.params.id), req.user.id);
    
    if (!result.changes) return res.status(404).json({ error: 'Bildirim bulunamadı.' });
    res.json({ message: 'Bildirim silindi.' });
  });
}

// Bildirim oluşturma yardımcı fonksiyonu
function createNotification(db, userId, type, title, message, relatedId = null) {
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO notifications (user_id, type, title, message, related_id, is_read, created_at, read_at)
    VALUES (?, ?, ?, ?, ?, 0, ?, NULL)
  `).run(userId, type, title, message, relatedId, now);
}

module.exports = { register, createNotification };
