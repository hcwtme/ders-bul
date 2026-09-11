// backend/routes/analytics.js — Analitik ve istatistikler
const { attachUser, requireAuth, requireRole } = require('../middleware');

function register(router, db) {
  // Admin dashboard istatistikleri
  router.get('/api/admin/analytics/dashboard', attachUser(db), requireAuth, requireRole('SUPER_ADMIN', 'ADMIN'), (req, res) => {
    const stats = {
      users: {
        total: db.prepare('SELECT COUNT(*) as count FROM users').get().count,
        students: db.prepare('SELECT COUNT(*) as count FROM users WHERE role_id IN (SELECT id FROM roles WHERE name = "STUDENT")').get().count,
        teachers: db.prepare('SELECT COUNT(*) as count FROM users WHERE role_id IN (SELECT id FROM roles WHERE name = "TEACHER")').get().count,
        admins: db.prepare('SELECT COUNT(*) as count FROM users WHERE role_id IN (SELECT id FROM roles WHERE name IN ("SUPER_ADMIN", "ADMIN", "ADMIN_HELPER"))').get().count,
        active: db.prepare('SELECT COUNT(*) as count FROM users WHERE is_active = 1').get().count,
        blocked: db.prepare('SELECT COUNT(*) as count FROM users WHERE is_blocked = 1').get().count
      },
      courses: {
        total: db.prepare('SELECT COUNT(*) as count FROM courses').get().count,
        active: db.prepare('SELECT COUNT(*) as count FROM courses WHERE is_active = 1').get().count,
        byMode: db.prepare(`
          SELECT mode, COUNT(*) as count FROM courses GROUP BY mode
        `).all()
      },
      applications: {
        total: db.prepare('SELECT COUNT(*) as count FROM applications').get().count,
        pending: db.prepare('SELECT COUNT(*) as count FROM applications WHERE status = "pending"').get().count,
        accepted: db.prepare('SELECT COUNT(*) as count FROM applications WHERE status = "accepted"').get().count,
        completed: db.prepare('SELECT COUNT(*) as count FROM applications WHERE status = "completed"').get().count
      },
      revenue: {
        total: db.prepare('SELECT SUM(amount) as total FROM payments WHERE status = "completed"').get().total || 0,
        thisMonth: db.prepare(`
          SELECT SUM(amount) as total FROM payments 
          WHERE status = 'completed' AND created_at >= datetime('now', 'start of month')
        `).get().total || 0,
        pendingPayments: db.prepare('SELECT SUM(amount) as total FROM payments WHERE status = "pending"').get().total || 0
      },
      ratings: {
        avgTeacherRating: db.prepare('SELECT AVG(rating) as avg FROM teacher_profiles WHERE rating > 0').get().avg || 0,
        avgCourseRating: db.prepare('SELECT AVG(rating) as avg FROM reviews').get().avg || 0,
        totalReviews: db.prepare('SELECT COUNT(*) as count FROM reviews').get().count
      }
    };
    
    res.json(stats);
  });

  // Öğretmen kişisel istatistikleri
  router.get('/api/teacher/analytics', attachUser(db), requireAuth, requireRole('TEACHER'), (req, res) => {
    const teacherId = req.user.id;
    
    const stats = {
      courses: {
        total: db.prepare('SELECT COUNT(*) as count FROM courses WHERE teacher_id = ?').get(teacherId).count,
        active: db.prepare('SELECT COUNT(*) as count FROM courses WHERE teacher_id = ? AND is_active = 1').get(teacherId).count
      },
      applications: {
        total: db.prepare('SELECT COUNT(*) as count FROM applications WHERE teacher_id = ?').get(teacherId).count,
        pending: db.prepare('SELECT COUNT(*) as count FROM applications WHERE teacher_id = ? AND status = "pending"').get(teacherId).count,
        completed: db.prepare('SELECT COUNT(*) as count FROM applications WHERE teacher_id = ? AND status = "completed"').get(teacherId).count
      },
      earnings: {
        total: db.prepare(`
          SELECT SUM(teacher_amount) as total FROM payments WHERE teacher_id = ? AND status = 'completed'
        `).get(teacherId).total || 0,
        pending: db.prepare(`
          SELECT SUM(teacher_amount) as total FROM payments WHERE teacher_id = ? AND status IN ('pending', 'awaiting_transfer')
        `).get(teacherId).total || 0,
        thisMonth: db.prepare(`
          SELECT SUM(teacher_amount) as total FROM payments 
          WHERE teacher_id = ? AND status = 'completed' 
          AND created_at >= datetime('now', 'start of month')
        `).get(teacherId).total || 0
      },
      rating: {
        avgRating: db.prepare('SELECT rating FROM teacher_profiles WHERE user_id = ?').get(teacherId).rating || 0,
        reviewCount: db.prepare('SELECT COUNT(*) as count FROM reviews WHERE teacher_id = ?').get(teacherId).count,
        topReviews: db.prepare(`
          SELECT r.*, u.full_name as student_name
          FROM reviews r
          JOIN users u ON u.id = r.student_id
          WHERE r.teacher_id = ?
          ORDER BY r.rating DESC, r.created_at DESC
          LIMIT 5
        `).all(teacherId)
      }
    };
    
    res.json(stats);
  });

  // Grafik verileri - Son 30 gün başvuru trendi
  router.get('/api/analytics/applications-trend', attachUser(db), requireAuth, requireRole('SUPER_ADMIN', 'ADMIN'), (req, res) => {
    const data = db.prepare(`
      SELECT 
        DATE(created_at) as date,
        COUNT(*) as count,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed
      FROM applications
      WHERE created_at >= datetime('now', '-30 days')
      GROUP BY DATE(created_at)
      ORDER BY date
    `).all();
    
    res.json({ data });
  });

  // Grafik verileri - Ders türü dağılımı
  router.get('/api/analytics/courses-by-subject', attachUser(db), requireAuth, requireRole('SUPER_ADMIN', 'ADMIN'), (req, res) => {
    const data = db.prepare(`
      SELECT subject, COUNT(*) as count, SUM(CASE WHEN is_active = 1 THEN 1 ELSE 0 END) as active
      FROM courses
      GROUP BY subject
      ORDER BY count DESC
    `).all();
    
    res.json({ data });
  });

  // Grafik verileri - Öğretmen performansı
  router.get('/api/analytics/teacher-performance', attachUser(db), requireAuth, requireRole('SUPER_ADMIN', 'ADMIN'), (req, res) => {
    const data = db.prepare(`
      SELECT 
        u.full_name,
        COUNT(DISTINCT c.id) as course_count,
        COUNT(DISTINCT a.id) as application_count,
        COUNT(DISTINCT CASE WHEN a.status = 'completed' THEN a.id END) as completed,
        tp.rating,
        tp.reviews_count
      FROM users u
      LEFT JOIN courses c ON c.teacher_id = u.id
      LEFT JOIN applications a ON a.teacher_id = u.id
      LEFT JOIN teacher_profiles tp ON tp.user_id = u.id
      WHERE u.role_id IN (SELECT id FROM roles WHERE name = 'TEACHER')
      GROUP BY u.id
      ORDER BY application_count DESC
      LIMIT 20
    `).all();
    
    res.json({ data });
  });
}

module.exports = { register };
