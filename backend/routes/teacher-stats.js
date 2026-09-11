// backend/routes/teacher-stats.js — Öğretmen istatistikleri ve rapor
const { attachUser, requireAuth, requireRole } = require('../middleware');

function register(router, db) {
  // Öğretmen istatistikleri
  router.get('/api/teacher/dashboard-stats', attachUser(db), requireAuth, requireRole('TEACHER'), (req, res) => {
    const teacherId = req.user.id;
    
    // Bu ayın başvuruları
    const thisMonthApplications = db.prepare(`
      SELECT COUNT(*) as count FROM applications
      WHERE teacher_id = ? AND created_at >= datetime('now', 'start of month')
    `).get(teacherId).count;
    
    // Beklemede olan başvurular
    const pendingApplications = db.prepare(`
      SELECT COUNT(*) as count FROM applications
      WHERE teacher_id = ? AND status = 'pending'
    `).get(teacherId).count;
    
    // Tamamlanan ders sayısı
    const completedLessons = db.prepare(`
      SELECT COUNT(*) as count FROM applications
      WHERE teacher_id = ? AND status = 'completed'
    `).get(teacherId).count;
    
    // Toplam kazanç
    const totalEarnings = db.prepare(`
      SELECT SUM(amount * (1 - (commission_rate / 100))) as total FROM payments
      WHERE teacher_id = ? AND status = 'completed'
    `).get(teacherId).total || 0;
    
    // Bu ayın kazancı
    const thisMonthEarnings = db.prepare(`
      SELECT SUM(amount * (1 - (commission_rate / 100))) as total FROM payments
      WHERE teacher_id = ? AND status = 'completed'
      AND created_at >= datetime('now', 'start of month')
    `).get(teacherId).total || 0;
    
    // Ortalama puan
    const rating = db.prepare(`
      SELECT rating, reviews_count FROM teacher_profiles WHERE user_id = ?
    `).get(teacherId);
    
    // Haftalık dağılım
    const weeklyApplications = db.prepare(`
      SELECT 
        CASE 
          WHEN strftime('%w', created_at) = '0' THEN 'Pazar'
          WHEN strftime('%w', created_at) = '1' THEN 'Pazartesi'
          WHEN strftime('%w', created_at) = '2' THEN 'Salı'
          WHEN strftime('%w', created_at) = '3' THEN 'Çarşamba'
          WHEN strftime('%w', created_at) = '4' THEN 'Perşembe'
          WHEN strftime('%w', created_at) = '5' THEN 'Cuma'
          ELSE 'Cumartesi'
        END as day,
        COUNT(*) as count
      FROM applications
      WHERE teacher_id = ? AND created_at >= datetime('now', '-30 days')
      GROUP BY strftime('%w', created_at)
    `).all(teacherId);
    
    res.json({
      thisMonthApplications,
      pendingApplications,
      completedLessons,
      totalEarnings: parseFloat(totalEarnings).toFixed(2),
      thisMonthEarnings: parseFloat(thisMonthEarnings).toFixed(2),
      rating: rating?.rating || 0,
      reviewCount: rating?.reviews_count || 0,
      weeklyApplications
    });
  });

  // Öğretmen aylık raporu
  router.get('/api/teacher/monthly-report', attachUser(db), requireAuth, requireRole('TEACHER'), (req, res) => {
    const { month, year } = req.query;
    const teacherId = req.user.id;
    
    const now = new Date();
    const y = year ? Number(year) : now.getFullYear();
    const m = month ? String(Number(month)).padStart(2, '0') : String(now.getMonth() + 1).padStart(2, '0');
    
    const startDate = `${y}-${m}-01`;
    const endDate = `${y}-${m}-31`;
    
    const applications = db.prepare(`
      SELECT a.*, c.title, c.subject, u.full_name as student_name
      FROM applications a
      JOIN courses c ON c.id = a.course_id
      JOIN users u ON u.id = a.student_id
      WHERE a.teacher_id = ? 
      AND DATE(a.created_at) BETWEEN ? AND ?
      ORDER BY a.created_at DESC
    `).all(teacherId, startDate, endDate);
    
    const summary = db.prepare(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END) as rejected
      FROM applications
      WHERE teacher_id = ?
      AND DATE(created_at) BETWEEN ? AND ?
    `).get(teacherId, startDate, endDate);
    
    const earnings = db.prepare(`
      SELECT 
        COUNT(*) as total_transactions,
        SUM(amount) as total_amount,
        SUM(amount * (1 - (commission_rate / 100))) as teacher_share
      FROM payments
      WHERE teacher_id = ?
      AND DATE(created_at) BETWEEN ? AND ?
      AND status = 'completed'
    `).get(teacherId, startDate, endDate);
    
    res.json({
      month: m,
      year: y,
      applications,
      summary,
      earnings: {
        totalTransactions: earnings.total_transactions || 0,
        totalAmount: earnings.total_amount || 0,
        teacherShare: earnings.teacher_share || 0
      }
    });
  });

  // Öğretmen performans grafiği
  router.get('/api/teacher/performance-chart', attachUser(db), requireAuth, requireRole('TEACHER'), (req, res) => {
    const teacherId = req.user.id;
    
    const data = db.prepare(`
      SELECT 
        DATE(created_at) as date,
        COUNT(*) as applications,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
        SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END) as rejected
      FROM applications
      WHERE teacher_id = ?
      AND created_at >= datetime('now', '-90 days')
      GROUP BY DATE(created_at)
      ORDER BY date
    `).all(teacherId);
    
    res.json({ data });
  });
}

module.exports = { register };
