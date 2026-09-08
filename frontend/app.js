const { useState, useEffect, useCallback } = React;

const API_BASE = ''; // backend aynı origin'den servis ediyor

function useAuth() {
  const [token, setToken] = useState(localStorage.getItem('db_token'));
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadMe = useCallback(async (t) => {
    if (!t) { setUser(null); setLoading(false); return; }
    try {
      const res = await fetch(`${API_BASE}/api/auth/me`, { headers: { Authorization: `Bearer ${t}` } });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setUser(data.user);
    } catch {
      localStorage.removeItem('db_token');
      setToken(null);
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadMe(token); }, [token, loadMe]);

  const login = (t, u) => { localStorage.setItem('db_token', t); setToken(t); setUser(u); };
  const logout = async () => {
    if (token) await fetch(`${API_BASE}/api/auth/logout`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } }).catch(() => {});
    localStorage.removeItem('db_token'); setToken(null); setUser(null);
  };

  return { token, user, loading, login, logout };
}

async function apiCall(token, method, path, body) {
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Bir hata oluştu.');
  return data;
}

function useCatalog() {
  const [catalog, setCatalog] = useState({ subjects: [], gradeLevels: [] });

  useEffect(() => {
    apiCall(null, 'GET', '/api/catalog').then(setCatalog).catch(() => {});
  }, []);

  return catalog;
}

function AuthScreen({ onLogin, initialMode = 'login' }) {
  const [mode, setMode] = useState(initialMode); // login | register
  const [role, setRole] = useState('STUDENT');
  const [form, setForm] = useState({ email: '', password: '', fullName: '' });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [busy, setBusy] = useState(false);
  const [providers, setProviders] = useState({ google: false, apple: false });

  useEffect(() => {
    apiCall(null, 'GET', '/api/auth/providers').then(setProviders).catch(() => {});
  }, []);

  const startSocialLogin = async (provider) => {
    setError('');
    try {
      await apiCall(null, 'GET', `/api/auth/oauth/${provider}`);
    } catch (err) {
      setError(err.message);
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    setError(''); setSuccess(''); setBusy(true);
    try {
      if (mode === 'login') {
        const data = await apiCall(null, 'POST', '/api/auth/login', { email: form.email, password: form.password });
        onLogin(data.token, data.user);
      } else {
        const data = await apiCall(null, 'POST', '/api/auth/register', { ...form, role });
        setSuccess(data.message);
        onLogin(data.token, data.user);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-shell">
      <div className="auth-card">
        <h1>Ders <span style={{ color: 'var(--blue-500)' }}>Bul</span></h1>
        <p className="subtitle">
          {mode === 'login' ? 'Hesabına giriş yap.' : 'Sana uygun öğretmeni bulmak için hesap oluştur.'}
        </p>

        <form onSubmit={submit}>
          {mode === 'register' && (
            <>
              <label>Ad Soyad</label>
              <input value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} required />

              <label>Ben bir...</label>
              <div className="role-toggle">
                <button type="button" className={role === 'STUDENT' ? 'active' : ''} onClick={() => setRole('STUDENT')}>Öğrenciyim</button>
                <button type="button" className={role === 'TEACHER' ? 'active' : ''} onClick={() => setRole('TEACHER')}>Öğretmenim</button>
              </div>
            </>
          )}

          <label>E-posta</label>
          <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />

          <label>Şifre</label>
          <input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required minLength={8} />

          {error && <div className="error-box">{error}</div>}
          {success && <div className="success-box">{success}</div>}

          <button className="btn" disabled={busy} type="submit">
            {busy ? 'Lütfen bekleyin...' : mode === 'login' ? 'Giriş Yap' : 'Hesap Oluştur'}
          </button>
        </form>

        {mode === 'login' && (
          <>
            <div className="auth-divider"><span>veya</span></div>
            <div className="social-actions">
              <button className="social-btn google" type="button" disabled={!providers.google} onClick={() => startSocialLogin('google')}>
                <span className="social-mark">G</span> Google ile devam et
              </button>
              <button className="social-btn apple" type="button" disabled={!providers.apple} onClick={() => startSocialLogin('apple')}>
                <span className="social-mark">&#63743;</span> Apple ile devam et
              </button>
            </div>
            {(!providers.google || !providers.apple) && <p className="social-note">Google ve Apple girişi, sunucu OAuth bilgileri eklendiğinde etkinleşir.</p>}
          </>
        )}

        <div className="switch-link">
          {mode === 'login' ? (
            <>Hesabın yok mu? <a onClick={() => setMode('register')}>Kayıt ol</a></>
          ) : (
            <>Zaten hesabın var mı? <a onClick={() => setMode('login')}>Giriş yap</a></>
          )}
        </div>
      </div>
    </div>
  );
}

function Topbar({ user, onLogout }) {
  return (
    <div className="topbar">
      <div className="brand">Ders <span>Bul</span></div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span className="muted">{user.full_name} · <span className="badge">{roleLabel(user.role)}</span></span>
        <button className="btn small secondary" onClick={onLogout}>Çıkış Yap</button>
      </div>
    </div>
  );
}

function roleLabel(role) {
  return {
    SUPER_ADMIN: 'Süper Admin',
    ADMIN: 'Admin',
    ADMIN_HELPER: 'Admin Yardımcısı',
    TEACHER: 'Öğretmen',
    STUDENT: 'Öğrenci',
  }[role] || role;
}

function TeacherProfileForm({ token, user }) {
  const [form, setForm] = useState({
    subject: '',
    bio: '',
    education: '',
    experience: '',
    isOnline: true,
    isInPerson: true,
    hourlyPrice: 0,
    city: '',
    photoUrl: '',
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    async function load() {
      try {
        const data = await apiCall(token, 'GET', '/api/teachers/me/profile');
        const profile = data.profile || {};
        setForm({
          subject: profile.subject || '',
          bio: profile.bio || '',
          education: profile.education || '',
          experience: profile.experience || '',
          isOnline: profile.is_online !== 0,
          isInPerson: profile.is_in_person !== 0,
          hourlyPrice: profile.hourly_price || 0,
          city: profile.city || '',
          photoUrl: profile.photo_url || '',
        });
      } catch (e) {
        setMessage(e.message);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [token]);

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true); setMessage('');
    try {
      const data = await apiCall(token, 'PUT', '/api/teachers/me/profile', {
        ...form,
        hourlyPrice: Number(form.hourlyPrice),
        isOnline: form.isOnline,
        isInPerson: form.isInPerson,
      });
      setMessage(data.message || 'Profil kaydedildi.');
    } catch (e) {
      setMessage(e.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="card"><p className="muted">Profil yükleniyor...</p></div>;

  return (
    <div className="card">
      <h2>Öğretmen Profili</h2>
      <form onSubmit={submit}>
        <label>Branş</label>
        <input value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} />

        <label>Hakkında</label>
        <textarea rows="4" value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })} />

        <label>Eğitim bilgileri</label>
        <input value={form.education} onChange={(e) => setForm({ ...form, education: e.target.value })} />

        <label>Deneyim</label>
        <input value={form.experience} onChange={(e) => setForm({ ...form, experience: e.target.value })} />

        <label>Şehir</label>
        <input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />

        <label>Fiyat (TL / saat)</label>
        <input type="number" min="0" value={form.hourlyPrice} onChange={(e) => setForm({ ...form, hourlyPrice: e.target.value })} />

        <label>Fotoğraf URL</label>
        <input value={form.photoUrl} onChange={(e) => setForm({ ...form, photoUrl: e.target.value })} />

        <label>Verilebilen ders türleri</label>
        <div className="checkbox-row">
          <label className="check-item"><input type="checkbox" checked={form.isOnline} onChange={(e) => setForm({ ...form, isOnline: e.target.checked })} /> Online</label>
          <label className="check-item"><input type="checkbox" checked={form.isInPerson} onChange={(e) => setForm({ ...form, isInPerson: e.target.checked })} /> Yüz yüze</label>
        </div>

        {message && <div className={message.includes('başar') || message.includes('güncellendi') ? 'success-box' : 'error-box'}>{message}</div>}
        <button className="btn" type="submit" disabled={saving}>{saving ? 'Kaydediliyor...' : 'Profili Kaydet'}</button>
      </form>
    </div>
  );
}

function CourseForm({ token, onCreated }) {
  const { subjects, gradeLevels } = useCatalog();
  const [form, setForm] = useState({
    title: '', subject: '', description: '', price: 0, durationMinutes: 40, mode: 'online', location: '', day: 'Pazartesi', time: '09:00', imageUrl: '', gradeLevels: [],
  });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setMessage('');
    try {
      const endMinutes = Number(form.durationMinutes) || 40;
      const [hour, minute] = String(form.time || '09:00').split(':').map(Number);
      const endDate = new Date();
      endDate.setHours(hour, minute + endMinutes, 0, 0);
      const endTime = `${String(endDate.getHours()).padStart(2, '0')}:${String(endDate.getMinutes()).padStart(2, '0')}`;

      const payload = {
        ...form,
        price: Number(form.price) || 0,
        durationMinutes: Number(form.durationMinutes) || 40,
        availabilityDays: form.day,
        availabilityHours: `${form.time}-${endTime}`,
      };

      const data = await apiCall(token, 'POST', '/api/teachers/me/courses', payload);
      setMessage('Ders ilanı oluşturuldu.');
      setForm({ title: '', subject: '', description: '', price: 0, durationMinutes: 40, mode: 'online', location: '', day: 'Pazartesi', time: '09:00', imageUrl: '', gradeLevels: [] });
      if (onCreated) onCreated(data.course);
    } catch (e) {
      setMessage(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card">
      <h2>Ders İlanı Oluştur</h2>
      <form onSubmit={submit}>
        <label>Ders adı</label>
        <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />

        <label>Branş</label>
        <select value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} required>
          <option value="">Branş seçin</option>
          {subjects.map((subject) => <option key={subject} value={subject}>{subject}</option>)}
        </select>

        <label>Açıklama</label>
        <textarea rows="4" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} required />

        <label>Fiyat (TL)</label>
        <input type="number" min="0" value={form.price} onChange={(e) => setForm({ ...form, price: Number(e.target.value) })} required />

        <label>Uygun sınıflar</label>
        <div className="checkbox-grid">
          {gradeLevels.map((grade) => (
            <label className="check-item" key={grade}>
              <input
                type="checkbox"
                checked={form.gradeLevels.includes(grade)}
                onChange={(e) => setForm({ ...form, gradeLevels: e.target.checked ? [...form.gradeLevels, grade] : form.gradeLevels.filter((item) => item !== grade) })}
              />
              {grade}
            </label>
          ))}
        </div>

        <label>Gün</label>
        <select value={form.day} onChange={(e) => setForm({ ...form, day: e.target.value })}>
          {['Pazartesi','Salı','Çarşamba','Perşembe','Cuma','Cumartesi','Pazar'].map((day) => (
            <option key={day} value={day}>{day}</option>
          ))}
        </select>

        <label>Başlangıç saati</label>
        <select value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })}>
          {Array.from({ length: 28 }, (_, i) => {
            const totalMinutes = 8 * 60 + i * 30;
            const hours = Math.floor(totalMinutes / 60);
            const mins = totalMinutes % 60;
            return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
          }).map((slot) => <option key={slot} value={slot}>{slot}</option>)}
        </select>

        <label>Ders süresi (dk)</label>
        <select value={form.durationMinutes} onChange={(e) => setForm({ ...form, durationMinutes: Number(e.target.value) })}>
          <option value={40}>40 dk</option>
          <option value={60}>60 dk</option>
          <option value={90}>90 dk</option>
          <option value={120}>120 dk</option>
        </select>

        <label>Mod</label>
        <select value={form.mode} onChange={(e) => setForm({ ...form, mode: e.target.value })}>
          <option value="online">Online</option>
          <option value="in_person">Yüz yüze</option>
        </select>

        <label>Konum</label>
        <input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="İstanbul / Online" />

        <label>Kapak görseli URL</label>
        <input value={form.imageUrl} onChange={(e) => setForm({ ...form, imageUrl: e.target.value })} />

        {message && <div className={message.includes('oluşturuldu') ? 'success-box' : 'error-box'}>{message}</div>}
        <button className="btn" type="submit" disabled={busy}>{busy ? 'Ekleniyor...' : 'İlan Aç'}</button>
      </form>
    </div>
  );
}

function TeacherCoursesList({ token }) {
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const data = await apiCall(token, 'GET', '/api/teachers/me/courses');
      setCourses(data.courses || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const remove = async (id) => {
    if (!confirm('İlan silinsin mi?')) return;
    try {
      await apiCall(token, 'DELETE', `/api/teachers/me/courses/${id}`);
      await load();
    } catch (e) {
      setError(e.message);
    }
  };

  if (loading) return <div className="card"><p className="muted">İlanlar yükleniyor...</p></div>;

  return (
    <div className="card">
      <h2>İlanlarım</h2>
      {error && <div className="error-box">{error}</div>}
      {courses.length === 0 ? <p className="muted">Henüz ilanınız yok.</p> : (
        <table>
          <thead><tr><th>Başlık</th><th>Branş</th><th>Fiyat</th><th>Mod</th><th>İşlem</th></tr></thead>
          <tbody>
            {courses.map((course) => (
              <tr key={course.id}>
                <td>{course.title}</td>
                <td>{course.subject}</td>
                <td>{course.price} TL</td>
                <td>{course.mode === 'online' ? 'Online' : 'Yüz yüze'}</td>
                <td><button className="btn small danger" onClick={() => remove(course.id)}>Sil</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function TeacherDashboard({ user, token }) {
  const [refreshKey, setRefreshKey] = useState(0);

  return (
    <div className="container">
      <div className="card">
        <h2>Hoş geldin, {user.full_name.split(' ')[0]} 👋</h2>
        <p className="muted">
          Öğretmen hesabın: <span className={`badge ${user.teacher_status}`}>{ { pending: 'Onay Bekliyor', approved: 'Onaylandı', rejected: 'Reddedildi' }[user.teacher_status] || user.teacher_status }</span>
        </p>
      </div>

      <TeacherScheduleBuilder token={token} userId={user.id} />
      <TeacherProfileForm token={token} user={user} />
      <CourseForm token={token} onCreated={() => setRefreshKey((k) => k + 1)} />
      <TeacherApplicationsList token={token} />
      <TeacherCoursesList key={refreshKey} token={token} />
    </div>
  );
}

function TeacherApplicationsList({ token }) {
  const [applications, setApplications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiCall(token, 'GET', '/api/platform/applications');
      setApplications(data.applications || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const setStatus = async (id, status) => {
    try {
      await apiCall(token, 'PATCH', `/api/platform/applications/${id}/status`, { status });
      await load();
    } catch (err) {
      setError(err.message);
    }
  };

  if (loading) return <div className="card"><p className="muted">Başvurular yükleniyor...</p></div>;

  return (
    <div className="card">
      <h2>Öğrenci başvuruları</h2>
      {error && <div className="error-box">{error}</div>}
      {applications.length === 0 ? <p className="muted">Henüz başvuru gelmedi.</p> : (
        <div className="stack-list">
          {applications.map((application) => (
            <div className="list-item" key={application.id}>
              <div>
                <strong>{application.course_title}</strong>
                <div className="muted">Öğrenci: {application.student_name} · {application.status}</div>
                {application.note && <p>{application.note}</p>}
              </div>
              <div className="row-actions">
                <button className="btn small" type="button" onClick={() => setStatus(application.id, 'accepted')}>Kabul Et</button>
                <button className="btn small danger" type="button" onClick={() => setStatus(application.id, 'rejected')}>Reddet</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function StudentDashboard({ user, token }) {
  const { subjects, gradeLevels } = useCatalog();
  const [filters, setFilters] = useState({ q: '', subject: '', grade: '', mode: '', maxPrice: '' });
  const [courses, setCourses] = useState([]);
  const [favorites, setFavorites] = useState([]);
  const [applications, setApplications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadCourses = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const query = new URLSearchParams(Object.entries(filters).filter(([, value]) => value));
      const data = await apiCall(null, 'GET', `/api/courses?${query.toString()}`);
      setCourses(data.courses || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  const loadFavorites = useCallback(async () => {
    if (!token) return;
    try {
      const data = await apiCall(token, 'GET', '/api/platform/favorites');
      setFavorites(data.favorites || []);
    } catch (err) {
      setError(err.message);
    }
  }, [token]);

  const loadApplications = useCallback(async () => {
    if (!token) return;
    try {
      const data = await apiCall(token, 'GET', '/api/platform/applications');
      setApplications(data.applications || []);
    } catch (err) {
      setError(err.message);
    }
  }, [token]);

  useEffect(() => { loadCourses(); }, [loadCourses]);
  useEffect(() => { loadFavorites(); loadApplications(); }, [loadFavorites, loadApplications]);

  const isFavorite = (courseId) => favorites.some((favorite) => favorite.course_id === courseId);
  const hasApplied = (courseId) => applications.some((app) => app.course_id === courseId);

  const toggleFavorite = async (courseId) => {
    if (!token) return;
    try {
      await apiCall(token, 'POST', `/api/platform/favorites/${courseId}`);
      await loadFavorites();
    } catch (err) {
      setError(err.message);
    }
  };

  const applyCourse = async (courseId) => {
    if (!token) return;
    try {
      await apiCall(token, 'POST', '/api/platform/applications', { courseId });
      await loadApplications();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="container">
      <div className="card student-welcome">
        <span className="eyebrow">Ders keşfet</span>
        <h2>Hoş geldin, {user.full_name.split(' ')[0]}.</h2>
        <p className="muted">Branşını ve sınıf seviyeni seçerek sana uygun ilanları bul.</p>
      </div>

      <div className="card search-panel">
        <div className="search-panel-head">
          <div>
            <h2>Öğretmen ve ders ara</h2>
            <p className="muted">Sonuçlar seçtiğin filtrelere göre güncellenir.</p>
          </div>
          <button className="btn small secondary" type="button" onClick={() => setFilters({ q: '', subject: '', grade: '', mode: '', maxPrice: '' })}>Temizle</button>
        </div>
        <div className="search-filters">
          <input placeholder="Ders, öğretmen veya konu ara" value={filters.q} onChange={(e) => setFilters({ ...filters, q: e.target.value })} />
          <select value={filters.subject} onChange={(e) => setFilters({ ...filters, subject: e.target.value })}>
            <option value="">Tüm branşlar</option>
            {subjects.map((subject) => <option key={subject} value={subject}>{subject}</option>)}
          </select>
          <select value={filters.grade} onChange={(e) => setFilters({ ...filters, grade: e.target.value })}>
            <option value="">Tüm sınıflar</option>
            {gradeLevels.map((grade) => <option key={grade} value={grade}>{grade}</option>)}
          </select>
          <select value={filters.mode} onChange={(e) => setFilters({ ...filters, mode: e.target.value })}>
            <option value="">Online veya yüz yüze</option>
            <option value="online">Online</option>
            <option value="in_person">Yüz yüze</option>
          </select>
          <input type="number" min="0" placeholder="En fazla TL" value={filters.maxPrice} onChange={(e) => setFilters({ ...filters, maxPrice: e.target.value })} />
        </div>
      </div>

      <div className="section-row results-heading">
        <h2>Ders ilanları</h2>
        <span className="muted">{loading ? 'Aranıyor...' : `${courses.length} ilan bulundu`}</span>
      </div>
      {error && <div className="error-box">{error}</div>}
      {!loading && !courses.length && <div className="card empty-state"><h3>Uygun ilan bulunamadı</h3><p className="muted">Filtreleri değiştirerek tekrar deneyebilirsin.</p></div>}
      <div className="course-results">
        {courses.map((course) => (
          <article className="course-result" key={course.id}>
            <div className="course-result-top">
              <span className="badge">{course.subject}</span>
              <strong>{course.price} TL</strong>
            </div>
            <h3>{course.title}</h3>
            <p>{course.description}</p>
            <div className="course-meta"><span>Öğretmen: {course.teacher_name}</span><span>{course.mode === 'online' ? 'Online' : 'Yüz yüze'}</span></div>
            <div className="course-meta"><span>Sınıflar: {course.grade_levels || 'Belirtilmemiş'}</span><span>{course.availability_days || 'Gün belirtilmemiş'}</span></div>
            <div className="row-actions" style={{ marginTop: 14 }}>
              <button className="btn small secondary" type="button" onClick={() => toggleFavorite(course.id)}>
                {isFavorite(course.id) ? 'Favoriden Çıkar' : 'Favorilere Ekle'}
              </button>
              <button className="btn small" type="button" onClick={() => applyCourse(course.id)} disabled={hasApplied(course.id)}>
                {hasApplied(course.id) ? 'Başvuruldu' : 'Başvur'}
              </button>
            </div>
          </article>
        ))}
      </div>

      <div className="card">
        <h2>Başvurularım</h2>
        {applications.length === 0 ? <p className="muted">Henüz başvuru yapmadın.</p> : (
          <div className="stack-list">
            {applications.map((application) => (
              <div className="list-item" key={application.id}>
                <div>
                  <strong>{application.course_title}</strong>
                  <div className="muted">Durum: {application.status}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function StudentOrTeacherDashboard({ user, token }) {
  return user.role === 'TEACHER' ? <TeacherDashboard user={user} token={token} /> : <StudentDashboard user={user} token={token} />;
}

function AdminDashboard({ token, user }) {
  const [tab, setTab] = useState('overview');
  return (
    <div className="container">
      <AdminOverview token={token} onNavigate={setTab} />
      <div className="tabs">
        <button className={tab === 'overview' ? 'active' : ''} onClick={() => setTab('overview')}>Özet</button>
        <button className={tab === 'users' ? 'active' : ''} onClick={() => setTab('users')}>Kullanıcılar</button>
        {user.role === 'SUPER_ADMIN' && (
          <button className={tab === 'create' ? 'active' : ''} onClick={() => setTab('create')}>Kullanıcı Oluştur</button>
        )}
        {user.role === 'SUPER_ADMIN' && (
          <button className={tab === 'permissions' ? 'active' : ''} onClick={() => setTab('permissions')}>Admin Yardımcısı İzinleri</button>
        )}
        <button className={tab === 'logs' ? 'active' : ''} onClick={() => setTab('logs')}>Admin Logları</button>
        <button className={tab === 'complaints' ? 'active' : ''} onClick={() => setTab('complaints')}>Şikayetler</button>
      </div>
      {tab === 'overview' && <div className="card admin-help"><h2>Bugün ne yapmak istersin?</h2><p className="muted">Onay bekleyen öğretmenleri kontrol et, sonra kullanıcıları ve ilanları gözden geçir.</p></div>}
      {tab === 'users' && <UsersTable token={token} currentUser={user} />}
      {tab === 'create' && <CreateUserForm token={token} />}
      {tab === 'permissions' && <PermissionsPanel token={token} />}
      {tab === 'logs' && <LogsPanel token={token} />}
      {tab === 'complaints' && <ComplaintsPanel token={token} />}
    </div>
  );
}

function AdminOverview({ token, onNavigate }) {
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    apiCall(token, 'GET', '/api/admin/summary').then(setSummary).catch((err) => setError(err.message));
  }, [token]);

  if (error) return <div className="error-box">{error}</div>;
  if (!summary) return <div className="card"><p className="muted">Özet yükleniyor...</p></div>;

  const cards = [
    ['Öğrenciler', summary.students],
    ['Öğretmenler', summary.teachers],
    ['Onay bekleyen öğretmen', summary.pendingTeachers],
    ['Aktif ders ilanı', summary.activeCourses],
  ];
  return (
    <section className="admin-overview">
      <div className="admin-overview-head"><div><span className="eyebrow">Yönetim merkezi</span><h1>Bugünün özeti</h1><p className="muted">Sitenin önemli durumlarını tek bakışta gör.</p></div><button className="btn small secondary" type="button" onClick={() => onNavigate('users')}>Kullanıcıları aç</button></div>
      <div className="admin-stat-grid">{cards.map(([label, value]) => <button className="admin-stat" key={label} type="button" onClick={() => onNavigate('users')}><span>{label}</span><strong>{value}</strong><small>Detayları gör</small></button>)}</div>
    </section>
  );
}

function UsersTable({ token, currentUser }) {
  const [users, setUsers] = useState([]);
  const [q, setQ] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const data = await apiCall(token, 'GET', `/api/admin/users${q ? `?q=${encodeURIComponent(q)}` : ''}`);
      setUsers(data.users);
    } catch (err) { setError(err.message); }
  }, [token, q]);

  useEffect(() => { load(); }, [load]);

  const act = async (fn) => {
    setError('');
    try { await fn(); await load(); } catch (err) { setError(err.message); }
  };

  const changeRole = (u) => {
    const order = ['SUPER_ADMIN', 'ADMIN', 'ADMIN_HELPER', 'TEACHER', 'STUDENT'];
    const nextRole = order[(order.indexOf(u.role) + 1) % order.length];
    act(() => apiCall(token, 'PATCH', `/api/admin/users/${u.id}/role`, { role: nextRole }));
  };
  const resetPassword = (u) => {
    const newPassword = `DersBul-${u.id}-${Date.now().toString().slice(-6)}`;
    act(() => apiCall(token, 'POST', `/api/admin/users/${u.id}/reset-password`, { newPassword }));
  };
  const remove = (u) => {
    act(() => apiCall(token, 'DELETE', `/api/admin/users/${u.id}`));
  };

  return (
    <div className="card">
      <h2>Kullanıcılar</h2>
      <input placeholder="İsim veya e-posta ile ara..." value={q} onChange={(e) => setQ(e.target.value)} style={{ marginBottom: 14 }} />
      {error && <div className="error-box">{error}</div>}
      <table>
        <thead>
          <tr><th>Ad Soyad</th><th>E-posta</th><th>Rol</th><th>Durum</th><th>İşlemler</th></tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id}>
              <td>{u.full_name}</td>
              <td>{u.email}</td>
              <td><span className="badge">{roleLabel(u.role)}</span></td>
              <td>
                {!u.is_active && <span className="badge blocked">Pasif</span>}{' '}
                {!!u.is_blocked && <span className="badge blocked">Engelli</span>}{' '}
                {u.role === 'TEACHER' && <span className={`badge ${u.teacher_status}`}>{u.teacher_status}</span>}
                {u.is_active && !u.is_blocked && u.role !== 'TEACHER' && <span className="badge approved">Aktif</span>}
              </td>
              <td>
                <div className="row-actions">
                  {u.role === 'TEACHER' && u.teacher_status !== 'approved' && (
                    <button className="btn small" onClick={() => act(() => apiCall(token, 'PATCH', `/api/admin/teachers/${u.id}/approve`))}>Onayla</button>
                  )}
                  {u.role === 'TEACHER' && u.teacher_status !== 'rejected' && (
                    <button className="btn small danger" onClick={() => act(() => apiCall(token, 'PATCH', `/api/admin/teachers/${u.id}/reject`))}>Reddet</button>
                  )}
                  <button className="btn small secondary" onClick={() => act(() => apiCall(token, 'PATCH', `/api/admin/users/${u.id}/active`, { isActive: !u.is_active }))}>
                    {u.is_active ? 'Pasif Yap' : 'Aktif Yap'}
                  </button>
                  <button className="btn small secondary" onClick={() => act(() => apiCall(token, 'PATCH', `/api/admin/users/${u.id}/block`, { isBlocked: !u.is_blocked }))}>
                    {u.is_blocked ? 'Engeli Kaldır' : 'Engelle'}
                  </button>
                  {currentUser.role === 'SUPER_ADMIN' && (
                    <>
                      <button className="btn small secondary" onClick={() => changeRole(u)}>Rol Değiştir</button>
                      <button className="btn small secondary" onClick={() => resetPassword(u)}>Şifre Sıfırla</button>
                      <button className="btn small danger" onClick={() => remove(u)}>Sil</button>
                    </>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CreateUserForm({ token }) {
  const [form, setForm] = useState({ email: '', password: '', fullName: '', role: 'ADMIN' });
  const [error, setError] = useState(''); const [success, setSuccess] = useState('');

  const submit = async (e) => {
    e.preventDefault(); setError(''); setSuccess('');
    try {
      await apiCall(token, 'POST', '/api/admin/users', form);
      setSuccess('Kullanıcı oluşturuldu.');
      setForm({ email: '', password: '', fullName: '', role: 'ADMIN' });
    } catch (err) { setError(err.message); }
  };

  return (
    <div className="card">
      <h2>Yeni Kullanıcı Oluştur</h2>
      <form onSubmit={submit}>
        <label>Rol</label>
        <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
          <option value="ADMIN">Admin</option>
          <option value="ADMIN_HELPER">Admin Yardımcısı</option>
          <option value="TEACHER">Öğretmen</option>
          <option value="STUDENT">Öğrenci</option>
        </select>
        <label>Ad Soyad</label>
        <input value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} required />
        <label>E-posta</label>
        <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
        <label>Şifre</label>
        <input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required minLength={8} />
        {error && <div className="error-box">{error}</div>}
        {success && <div className="success-box">{success}</div>}
        <button className="btn" type="submit">Oluştur</button>
      </form>
    </div>
  );
}

function PermissionsPanel({ token }) {
  const [users, setUsers] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [perms, setPerms] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    apiCall(token, 'GET', '/api/admin/users?role=ADMIN_HELPER').then((d) => setUsers(d.users)).catch((e) => setError(e.message));
  }, [token]);

  const loadPerms = useCallback(async (id) => {
    if (!id) { setPerms([]); return; }
    try {
      const d = await apiCall(token, 'GET', `/api/admin/users/${id}/permissions`);
      setPerms(d.permissions);
    } catch (err) { setError(err.message); }
  }, [token]);

  useEffect(() => { loadPerms(selectedId); }, [selectedId, loadPerms]);

  const toggle = async (key, allowed) => {
    try {
      await apiCall(token, 'PATCH', `/api/admin/users/${selectedId}/permissions`, { key, allowed });
      loadPerms(selectedId);
    } catch (err) { setError(err.message); }
  };

  return (
    <div className="card">
      <h2>Admin Yardımcısı İzinleri</h2>
      <p className="muted">Bir Admin Yardımcısı seç, ardından hangi işlemleri yapabileceğini tek tek aç/kapat.</p>
      <label>Admin Yardımcısı</label>
      <select value={selectedId} onChange={(e) => setSelectedId(e.target.value)}>
        <option value="">Seçin...</option>
        {users.map((u) => <option key={u.id} value={u.id}>{u.full_name} ({u.email})</option>)}
      </select>
      {error && <div className="error-box">{error}</div>}
      {selectedId && (
        <table style={{ marginTop: 18 }}>
          <thead><tr><th>İzin</th><th>Açıklama</th><th>Durum</th></tr></thead>
          <tbody>
            {perms.map((p) => (
              <tr key={p.key}>
                <td>{p.key}</td>
                <td>{p.description}</td>
                <td>
                  <button className={`btn small ${p.allowed ? '' : 'secondary'}`} onClick={() => toggle(p.key, !p.allowed)}>
                    {p.allowed ? 'Açık — Kapat' : 'Kapalı — Aç'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function LogsPanel({ token }) {
  const [logs, setLogs] = useState([]);
  const [error, setError] = useState('');
  useEffect(() => {
    apiCall(token, 'GET', '/api/admin/logs').then((d) => setLogs(d.logs)).catch((e) => setError(e.message));
  }, [token]);

  return (
    <div className="card">
      <h2>Admin İşlem Kayıtları</h2>
      {error && <div className="error-box">{error}</div>}
      <table>
        <thead><tr><th>Tarih</th><th>Kullanıcı</th><th>İşlem</th><th>Detay</th></tr></thead>
        <tbody>
          {logs.map((l) => (
            <tr key={l.id}>
              <td className="muted">{new Date(l.created_at).toLocaleString('tr-TR')}</td>
              <td>{l.actor_email || '—'}</td>
              <td><span className="badge">{l.action}</span></td>
              <td>{l.detail}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ComplaintsPanel({ token }) {
  const [complaints, setComplaints] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    apiCall(token, 'GET', '/api/platform/complaints')
      .then((data) => setComplaints(data.complaints || []))
      .catch((err) => setError(err.message));
  }, [token]);

  return (
    <div className="card">
      <h2>Şikayetler</h2>
      {error && <div className="error-box">{error}</div>}
      {complaints.length === 0 ? <p className="muted">Şikayet bulunmuyor.</p> : (
        <div className="stack-list">
          {complaints.map((item) => (
            <div className="list-item" key={item.id}>
              <div>
                <strong>{item.reason}</strong>
                <div className="muted">{item.user_name || item.email || 'Kullanıcı'} · {item.status}</div>
                {item.detail && <p>{item.detail}</p>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function LandingPage({ login }) {
  const [showAuth, setShowAuth] = useState(false);
  const [siteSettings, setSiteSettings] = useState({ whatsappNumber: '', whatsappLabel: 'WhatsApp iletişim hattı' });
  const [room, setRoom] = useState(() => localStorage.getItem('dersbul_room') || '');

  useEffect(() => {
    apiCall(null, 'GET', '/api/site-settings').then(setSiteSettings).catch(() => {});
  }, []);

  const changeRoom = (event) => {
    const nextRoom = event.target.value;
    setRoom(nextRoom);
    localStorage.setItem('dersbul_room', nextRoom);
  };

  if (showAuth) {
    return (
      <div className="auth-page">
        <header className="landing-header">
          <button className="brand brand-button" type="button" onClick={() => setShowAuth(false)}>Ders <span>Bul</span></button>
          <button className="btn small secondary" type="button" onClick={() => setShowAuth(false)}>Ana sayfa</button>
        </header>
        <main className="auth-page-main">
          <div className="auth-page-copy">
            <span className="eyebrow">Ders Bul hesabı</span>
            <h1>Ders planına kaldığın yerden devam et.</h1>
            <p>Öğrenci olarak dersleri keşfet veya öğretmen olarak ilanlarını ve haftalık programını yönet.</p>
          </div>
          <AuthScreen onLogin={login} initialMode="login" />
        </main>
      </div>
    );
  }

  return (
    <div className="landing-shell">
      <header className="landing-header">
        <div className="brand">Ders <span>Bul</span></div>
        <nav className="landing-nav">
          <button className="btn small secondary" type="button" onClick={() => setShowAuth(true)}>Giriş Yap</button>
        </nav>
      </header>

      <main className="landing-main">
        <section className="hero-section simple">
          <div className="hero-copy">
            <span className="eyebrow">Özel ders yönetimi</span>
            <h1>Haftalık ders planını tek ekranda hazırla.</h1>
            <p>
              Öğretmenler ders saatlerini kolayca seçer, haftalık program oluşturur ve ilanlarını net şekilde yayınlar.
            </p>
            <div className="hero-actions">
              <button className="btn" type="button" onClick={() => setShowAuth(true)}>Hemen başla</button>
            </div>
          </div>

          <div className="simple-preview">
            <div className="preview-card">
              <div className="preview-header">Program</div>
              <div className="preview-row"><span>Pazartesi</span><strong>09:00</strong></div>
              <div className="preview-row"><span>Çarşamba</span><strong>11:00</strong></div>
              <div className="preview-row"><span>Cuma</span><strong>15:30</strong></div>
            </div>
          </div>
        </section>

        <section className="landing-tools" aria-label="Hızlı seçimler">
          <div className="room-picker">
            <div>
              <span className="eyebrow">Ders odası</span>
              <h2>Hangi odaya geçmek istersin?</h2>
              <p className="muted">Şimdilik boş bırakabilirsin; seçtiğin oda bu cihazda hatırlanır.</p>
            </div>
            <select value={room} onChange={changeRoom} aria-label="Ders odası seç">
              <option value="">Oda seçin</option>
              <option value="matematik">Matematik odası</option>
              <option value="fen">Fen ve bilim odası</option>
              <option value="dil">Dil odası</option>
              <option value="kodlama">Kodlama ve bilişim odası</option>
              <option value="sanat">Sanat ve hobi odası</option>
            </select>
          </div>
          <div className="whatsapp-contact">
            <span className="whatsapp-icon">WA</span>
            <div><strong>{siteSettings.whatsappLabel}</strong><span>{siteSettings.whatsappNumber ? 'Soruların için doğrudan yazabilirsin.' : 'İletişim numarası yakında eklenecek.'}</span></div>
            {siteSettings.whatsappNumber ? <a href={`https://wa.me/${siteSettings.whatsappNumber.replace(/\D/g, '')}`} target="_blank" rel="noreferrer">WhatsApp’a git</a> : <span className="contact-pending">Yakında</span>}
          </div>
        </section>

        <section className="content-section alt-bg">
          <div className="section-head">
            <span className="eyebrow">Tek akış, iki taraf</span>
            <h2>Aradığın dersi bul, bildiğini paylaş.</h2>
          </div>
          <div className="feature-grid">
            <article className="feature-card large"><span className="feature-icon">⌕</span><h3>Öğrenci için keşif</h3><p>Branş, sınıf ve ders türüne göre ilanları filtrele; sana uygun öğretmenleri tek ekranda karşılaştır.</p></article>
            <article className="feature-card large"><span className="feature-icon">▦</span><h3>Öğretmen için düzen</h3><p>Uygun olduğun günleri haftalık programına ekle, ders süresini belirle ve ilanını net bilgilerle yayınla.</p></article>
            <article className="feature-card large"><span className="feature-icon">✓</span><h3>Net ve kontrollü</h3><p>Çakışan saatler engellenir; sınıf, branş, fiyat ve online seçenekleri baştan belirli olur.</p></article>
          </div>
        </section>

        <section className="content-section landing-steps">
          <div className="section-head"><span className="eyebrow">Nasıl çalışır?</span><h2>Üç adımda hazır.</h2></div>
          <div className="steps-grid">
            <div className="step-item"><strong>01</strong><h3>Hesap oluştur</h3><p>Öğrenci veya öğretmen olarak rolünü seç.</p></div>
            <div className="step-item"><strong>02</strong><h3>Bilgilerini düzenle</h3><p>Branşını, sınıf seviyelerini ve ders saatlerini belirle.</p></div>
            <div className="step-item"><strong>03</strong><h3>Harekete geç</h3><p>Ders ara ya da ilanını öğrencilerle buluştur.</p></div>
          </div>
        </section>
      </main>
    </div>
  );
}

function TeacherScheduleBuilder({ token, userId }) {
  const days = ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar'];
  const slotStartHour = 8;
  const slotMinutes = 30;
  const slotHeight = 36;
  const timeSlots = Array.from({ length: 28 }, (_, i) => {
    const totalMinutes = slotStartHour * 60 + i * slotMinutes;
    const hours = Math.floor(totalMinutes / 60);
    const mins = totalMinutes % 60;
    return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
  });

  const [blocks, setBlocks] = useState(() => {
    try {
      const saved = localStorage.getItem(`dersbul_schedule_${userId}`) || localStorage.getItem('dersbul_schedule');
      const parsed = saved ? JSON.parse(saved) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });

  const [draft, setDraft] = useState({ day: 'Pazartesi', start: '09:00', duration: 40, color: '#3b82f6' });
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');

  useEffect(() => {
    async function loadAvailability() {
      if (!token) return;
      try {
        const data = await apiCall(token, 'GET', '/api/teachers/me/availability');
        const nextBlocks = (data.blocks || []).map((block) => ({
          id: block.id,
          day: block.day_of_week,
          start: block.start_time,
          duration: Number(block.duration_min || 60),
          color: block.color || '#3b82f6',
        }));
        setBlocks(nextBlocks);
        localStorage.setItem(`dersbul_schedule_${userId}`, JSON.stringify(nextBlocks));
      } catch {
        const saved = localStorage.getItem(`dersbul_schedule_${userId}`) || localStorage.getItem('dersbul_schedule');
        try {
          const parsed = saved ? JSON.parse(saved) : [];
          if (Array.isArray(parsed)) setBlocks(parsed);
        } catch {}
      } finally {
        setLoading(false);
      }
    }

    loadAvailability();
  }, [token, userId]);

  useEffect(() => {
    localStorage.setItem(`dersbul_schedule_${userId}`, JSON.stringify(blocks));
  }, [blocks, userId]);

  const toMinutes = (time) => {
    const [hour, minute] = String(time || '09:00').split(':').map(Number);
    return hour * 60 + (minute || 0);
  };

  const addBlock = async () => {
    const duration = Number(draft.duration) || 40;
    const start = toMinutes(draft.start);
    const end = start + duration;
    const conflict = blocks.find((block) => {
      if (block.day !== draft.day) return false;
      const blockStart = toMinutes(block.start);
      const blockEnd = blockStart + Number(block.duration || 0);
      return start < blockEnd && end > blockStart;
    });
    if (conflict) {
      setMessage(`${draft.day} günü ${draft.start} saatinde mevcut dersle çakışıyor.`);
      return;
    }
    setMessage('');
    const clean = {
      id: Date.now(),
      day: draft.day,
      start: draft.start,
      duration,
      color: draft.color || '#3b82f6',
    };

    if (token) {
      try {
        const data = await apiCall(token, 'POST', '/api/teachers/me/availability', {
          day: clean.day,
          start: clean.start,
          duration: clean.duration,
          color: clean.color,
        });
        if (data.block) {
          clean.id = data.block.id;
        }
      } catch (err) {
        setMessage(err.message);
        return;
      }
    }

    setBlocks((prev) => [...prev, clean]);
    window.setTimeout(() => {
      document.querySelector(`[data-schedule-block="${clean.id}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
    }, 0);
  };

  const removeBlock = async (id) => {
    if (token) {
      try {
        await apiCall(token, 'DELETE', `/api/teachers/me/availability/${id}`);
      } catch (err) {
        setMessage(err.message);
        return;
      }
    }
    setBlocks((prev) => prev.filter((item) => item.id !== id));
  };

  const getPosition = (start) => {
    const startMinutes = toMinutes(start);
    const relative = startMinutes - slotStartHour * 60;
    return Math.max(0, (relative / slotMinutes) * slotHeight + 8);
  };

  const getHeight = (duration) => {
    return Math.max(42, (Number(duration) / slotMinutes) * slotHeight - 4);
  };

  return (
    <div className="card schedule-card">
      <div className="section-row">
        <h2>Haftalık ders programı</h2>
        <span className="muted">İstediğin günü ve saati seç, blok oluşsun.</span>
      </div>

      {message && <div className="error-box schedule-message">{message}</div>}
      {loading && <div className="muted" style={{ marginBottom: 12 }}>Program yükleniyor...</div>}

      <div className="schedule-builder">
        <div className="schedule-form">
          <label>Gün</label>
          <select value={draft.day} onChange={(e) => setDraft({ ...draft, day: e.target.value })}>
            {days.map((day) => <option key={day} value={day}>{day}</option>)}
          </select>

          <label>Başlangıç saati</label>
          <select value={draft.start} onChange={(e) => setDraft({ ...draft, start: e.target.value })}>
            {timeSlots.map((slot) => <option key={slot} value={slot}>{slot}</option>)}
          </select>

          <label>Ders süresi</label>
          <select value={draft.duration} onChange={(e) => setDraft({ ...draft, duration: Number(e.target.value) })}>
            <option value={40}>40 dk</option>
            <option value={60}>60 dk</option>
            <option value={90}>90 dk</option>
            <option value={120}>120 dk</option>
          </select>

          <label>Renk</label>
          <input type="color" value={draft.color} onChange={(e) => setDraft({ ...draft, color: e.target.value })} />

          <button className="btn" type="button" onClick={addBlock}>Blok Ekle</button>
        </div>

        <div className="schedule-grid-wrap">
          <div className="schedule-grid-header">
            <div className="time-cell empty">Saat</div>
            {days.map((day) => <div key={day} className="day-header">{day}</div>)}
          </div>

          <div className="schedule-grid-body">
            <div className="time-rail">
              {timeSlots.map((slot) => <div key={slot} className="time-cell">{slot}</div>)}
            </div>

            {days.map((day) => {
              const dayBlocks = blocks.filter((block) => block.day === day);
              return (
                <div key={day} className="day-column">
                  {timeSlots.map((slot) => <div key={`${day}-${slot}`} className="slot-cell" />)}
                  {dayBlocks.map((block) => (
                    <button
                      key={block.id}
                      className="schedule-block"
                      data-schedule-block={block.id}
                      type="button"
                      onClick={() => removeBlock(block.id)}
                      title="Silmek için tıkla"
                      style={{
                        top: `${getPosition(block.start)}px`,
                        height: `${getHeight(block.duration)}px`,
                        background: block.color,
                      }}
                    >
                      <span>{day}</span>
                      <strong>{block.start}</strong>
                      <small>{block.duration} dk</small>
                    </button>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function App() {
  const { token, user, loading, login, logout } = useAuth();

  if (loading) return <div className="container"><p className="muted">Yükleniyor...</p></div>;
  if (!token || !user) return <LandingPage login={login} />;

  const isAdminLike = ['SUPER_ADMIN', 'ADMIN', 'ADMIN_HELPER'].includes(user.role);

  return (
    <>
      <Topbar user={user} onLogout={logout} />
      {isAdminLike ? <AdminDashboard token={token} user={user} /> : <StudentOrTeacherDashboard user={user} token={token} />}
    </>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
