// backend/routes/chat.js — Mesajlaşma ve canlı sohbet
const { attachUser, requireAuth } = require('../middleware');

function register(router, db) {
  // Mesaj gönder
  router.post('/api/messages', attachUser(db), requireAuth, (req, res) => {
    const { receiverId, text } = req.body || {};
    const senderId = req.user.id;
    
    if (!receiverId || !text || !String(text).trim()) {
      return res.status(400).json({ error: 'Alıcı ve mesaj metni gerekli.' });
    }
    
    const receiver = db.prepare('SELECT id FROM users WHERE id = ?').get(Number(receiverId));
    if (!receiver) return res.status(404).json({ error: 'Alıcı bulunamadı.' });
    
    // Konuşma başlat veya var olanı bul
    let conversation = db.prepare(`
      SELECT id FROM conversations 
      WHERE (sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?)
    `).get(senderId, Number(receiverId), Number(receiverId), senderId);
    
    if (!conversation) {
      const now = new Date().toISOString();
      const result = db.prepare(`
        INSERT INTO conversations (sender_id, receiver_id, created_at, updated_at)
        VALUES (?, ?, ?, ?)
      `).run(senderId, Number(receiverId), now, now);
      conversation = { id: result.lastInsertRowid };
    }
    
    // Mesaj ekle
    const now = new Date().toISOString();
    const msgResult = db.prepare(`
      INSERT INTO messages (conversation_id, sender_id, receiver_id, text, is_read, created_at)
      VALUES (?, ?, ?, ?, 0, ?)
    `).run(conversation.id, senderId, Number(receiverId), String(text).trim(), now);
    
    // Konuşmayı güncelle
    db.prepare(`
      UPDATE conversations SET updated_at = ? WHERE id = ?
    `).run(now, conversation.id);
    
    res.status(201).json({ message: 'Mesaj gönderildi.' });
  });

  // Konuşmaları getir
  router.get('/api/conversations', attachUser(db), requireAuth, (req, res) => {
    const conversations = db.prepare(`
      SELECT c.*, 
        u.full_name, u.email,
        (SELECT COUNT(*) FROM messages WHERE conversation_id = c.id AND receiver_id = ? AND is_read = 0) as unread_count,
        (SELECT text FROM messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1) as last_message
      FROM conversations c
      JOIN users u ON u.id = (CASE WHEN c.sender_id = ? THEN c.receiver_id ELSE c.sender_id END)
      WHERE c.sender_id = ? OR c.receiver_id = ?
      ORDER BY c.updated_at DESC
    `).all(req.user.id, req.user.id, req.user.id, req.user.id);
    
    res.json({ conversations });
  });

  // Konuşmanın mesajlarını getir
  router.get('/api/conversations/:conversationId/messages', attachUser(db), requireAuth, (req, res) => {
    const conversationId = Number(req.params.conversationId);
    
    const conversation = db.prepare(`
      SELECT * FROM conversations WHERE id = ? AND (sender_id = ? OR receiver_id = ?)
    `).get(conversationId, req.user.id, req.user.id);
    
    if (!conversation) return res.status(403).json({ error: 'Bu konuşmaya erişim yetkiniz yok.' });
    
    // Okunmamış mesajları okundu işaretle
    db.prepare(`
      UPDATE messages SET is_read = 1 WHERE conversation_id = ? AND receiver_id = ?
    `).run(conversationId, req.user.id);
    
    const messages = db.prepare(`
      SELECT m.*, u.full_name as sender_name
      FROM messages m
      JOIN users u ON u.id = m.sender_id
      WHERE m.conversation_id = ?
      ORDER BY m.created_at ASC
      LIMIT 50
    `).all(conversationId);
    
    res.json({ messages });
  });

  // Mesajı sil
  router.delete('/api/messages/:messageId', attachUser(db), requireAuth, (req, res) => {
    const messageId = Number(req.params.messageId);
    
    const message = db.prepare(`
      SELECT * FROM messages WHERE id = ? AND sender_id = ?
    `).get(messageId, req.user.id);
    
    if (!message) return res.status(404).json({ error: 'Mesaj bulunamadı.' });
    
    // Soft delete - mesajı "silindi" olarak işaretle
    db.prepare(`
      UPDATE messages SET is_deleted = 1 WHERE id = ?
    `).run(messageId);
    
    res.json({ message: 'Mesaj silindi.' });
  });

  // Konuşmayı arşivle
  router.post('/api/conversations/:conversationId/archive', attachUser(db), requireAuth, (req, res) => {
    const conversationId = Number(req.params.conversationId);
    
    const conversation = db.prepare(`
      SELECT * FROM conversations WHERE id = ? AND (sender_id = ? OR receiver_id = ?)
    `).get(conversationId, req.user.id, req.user.id);
    
    if (!conversation) return res.status(403).json({ error: 'Bu konuşmaya erişim yetkiniz yok.' });
    
    db.prepare(`
      UPDATE conversations SET is_archived = 1 WHERE id = ?
    `).run(conversationId);
    
    res.json({ message: 'Konuşma arşivlendi.' });
  });
}

module.exports = { register };
