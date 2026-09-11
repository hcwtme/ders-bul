// backend/routes/search.js — Gelişmiş arama ve filtreleme
const { attachUser, requireAuth } = require('../middleware');

function register(router, db) {
  // Gelişmiş ders arama
  router.get('/api/search/courses', (req, res) => {
    const { q, subject, grade, mode, minPrice, maxPrice, rating, sort } = req.query;
    
    let sql = `
      SELECT c.*, u.full_name as teacher_name, tp.rating, tp.reviews_count,
        tp.city, tp.is_online, tp.is_in_person
      FROM courses c
      JOIN users u ON u.id = c.teacher_id
      LEFT JOIN teacher_profiles tp ON tp.user_id = c.teacher_id
      WHERE c.is_active = 1 AND u.is_active = 1 AND u.is_blocked = 0
    `;
    
    const params = [];
    
    if (q) {
      sql += ` AND (c.title ILIKE ? OR c.description ILIKE ? OR u.full_name ILIKE ?)`;
      const search = `%${q}%`;
      params.push(search, search, search);
    }
    
    if (subject) {
      sql += ` AND c.subject ILIKE ?`;
      params.push(`%${subject}%`);
    }
    
    if (grade) {
      sql += ` AND c.grade_levels ILIKE ?`;
      params.push(`%${grade}%`);
    }
    
    if (mode) {
      sql += ` AND c.mode = ?`;
      params.push(mode);
    }
    
    if (minPrice) {
      sql += ` AND c.price >= ?`;
      params.push(Number(minPrice));
    }
    
    if (maxPrice) {
      sql += ` AND c.price <= ?`;
      params.push(Number(maxPrice));
    }
    
    if (rating) {
      sql += ` AND tp.rating >= ?`;
      params.push(Number(rating));
    }
    
    // Sıralama
    const sortMap = {
      'newest': 'c.created_at DESC',
      'price_asc': 'c.price ASC',
      'price_desc': 'c.price DESC',
      'rating': 'tp.rating DESC',
      'popular': 'tp.reviews_count DESC'
    };
    
    sql += ` ORDER BY ${sortMap[sort] || 'c.created_at DESC'}`;
    sql += ` LIMIT 50`;
    
    const courses = db.prepare(sql).all(...params);
    res.json({ courses, total: courses.length });
  });

  // Öğretmen arama
  router.get('/api/search/teachers', (req, res) => {
    const { q, subject, city, minRating, sort } = req.query;
    
    let sql = `
      SELECT tp.*, u.full_name, u.email, u.teacher_status,
        COUNT(DISTINCT c.id) as course_count
      FROM teacher_profiles tp
      JOIN users u ON u.id = tp.user_id
      LEFT JOIN courses c ON c.teacher_id = u.id
      WHERE u.is_active = 1 AND u.is_blocked = 0 AND u.teacher_status = 'approved'
    `;
    
    const params = [];
    
    if (q) {
      sql += ` AND (u.full_name ILIKE ? OR tp.bio ILIKE ? OR tp.subject ILIKE ?)`;
      const search = `%${q}%`;
      params.push(search, search, search);
    }
    
    if (subject) {
      sql += ` AND tp.subject ILIKE ?`;
      params.push(`%${subject}%`);
    }
    
    if (city) {
      sql += ` AND tp.city ILIKE ?`;
      params.push(`%${city}%`);
    }
    
    if (minRating) {
      sql += ` AND tp.rating >= ?`;
      params.push(Number(minRating));
    }
    
    sql += ` GROUP BY tp.id`;
    
    const sortMap = {
      'rating': 'tp.rating DESC',
      'newest': 'tp.created_at DESC',
      'reviews': 'tp.reviews_count DESC',
      'price_asc': 'tp.hourly_price ASC'
    };
    
    sql += ` ORDER BY ${sortMap[sort] || 'tp.rating DESC'}`;
    sql += ` LIMIT 50`;
    
    const teachers = db.prepare(sql).all(...params);
    res.json({ teachers, total: teachers.length });
  });

  // Popüler dersler
  router.get('/api/trending/courses', (req, res) => {
    const courses = db.prepare(`
      SELECT c.*, u.full_name as teacher_name, tp.rating,
        COUNT(a.id) as application_count
      FROM courses c
      JOIN users u ON u.id = c.teacher_id
      LEFT JOIN teacher_profiles tp ON tp.user_id = c.teacher_id
      LEFT JOIN applications a ON a.course_id = c.id
      WHERE c.is_active = 1 AND c.created_at > datetime('now', '-30 days')
      GROUP BY c.id
      ORDER BY application_count DESC, tp.rating DESC
      LIMIT 20
    `).all();
    
    res.json({ courses });
  });

  // En yüksek puanlanmış öğretmenler
  router.get('/api/top-rated/teachers', (req, res) => {
    const teachers = db.prepare(`
      SELECT tp.*, u.full_name, u.email,
        COUNT(DISTINCT r.id) as review_count
      FROM teacher_profiles tp
      JOIN users u ON u.id = tp.user_id
      LEFT JOIN reviews r ON r.teacher_id = u.id
      WHERE u.is_active = 1 AND u.teacher_status = 'approved' AND tp.rating >= 4
      GROUP BY tp.id
      ORDER BY tp.rating DESC, tp.reviews_count DESC
      LIMIT 20
    `).all();
    
    res.json({ teachers });
  });
}

module.exports = { register };
