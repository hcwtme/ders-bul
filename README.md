# Ders Bul

Online/yüz yüze özel ders platformu. Bu teslimat **Modül 1: Auth + Roller (RBAC)**
kapsamındadır; tüm proje modül modül, sırayla geliştirilecek (bkz. "Yol Haritası").

## Neden bu teknoloji seçimleri?

Bu ortamda internet erişimi olmadan geliştirildiği için `npm install` ile
üçüncü parti paket (Express, Prisma, bcrypt, jsonwebtoken, React build zinciri vb.)
kurulamıyor. Bunun yerine tamamen **Node.js'in yerleşik modülleriyle** gerçek,
çalışan bir backend yazıldı:

- **Veritabanı:** `node:sqlite` (Node 22+ ile gelen yerleşik SQLite) — gerçek,
  ilişkisel, dosya tabanlı bir SQL veritabanı. Deneysel bir API olduğu için
  konsolda bir uyarı göreceksin, işlevi etkilemiyor.
- **HTTP sunucusu:** `node:http` üzerine yazılmış minimal bir router
  (`backend/router.js`) — Express'in yaptığı `method + path + :param` eşleştirmesini
  yapıyor, JSON body parse ediyor.
- **Şifreleme:** `node:crypto` ile `scrypt` (bcrypt'e eşdeğer, yerleşik).
- **Oturum yönetimi:** JWT yerine veritabanında saklanan opak session token'ları
  (Bearer token). Bu, sunucu tarafında anında iptal edilebilir oturumlar sağlıyor
  (şifre sıfırlandığında tüm oturumlar düşürülüyor gibi).
- **Frontend:** React — build aracı (Vite/webpack) kurulamadığı için React ve
  Babel, tarayıcıda CDN üzerinden yükleniyor ve JSX anlık derleniyor
  (`frontend/index.html` + `frontend/app.js`). Bu, geliştirme/MVP için tamamen
  işlevsel; production'a taşırken aşağıdaki "Production'a Geçiş" bölümüne bak.

Bu kararlar geçicidir: kendi bilgisayarında (internetin varken) çalıştırdığında
istersen backend'i Express/Prisma/Postgres'e, frontend'i Vite+React'e taşımak
tamamen mümkün — mimari (route'lar, tablolar, RBAC mantığı) doğrudan taşınabilir.

## Kurulum ve Çalıştırma

```bash
cd ders-bul
cp .env.example .env     # istersen SUPER_ADMIN_EMAIL / PASSWORD değiştir
node backend/server.js
```

Tarayıcıda: **http://localhost:4000**

İlk çalıştırmada otomatik bir Super Admin hesabı oluşturulur, bilgiler konsola
yazdırılır (varsayılan: `admin@dersbul.com` / `DegistirilecekSifre123!`).
**Giriş yaptıktan sonra şifreyi mutlaka değiştir** (şifre sıfırlama uç noktası
üzerinden; ayrılmış bir "profilim" ekranı sonraki modülde eklenecek).

Node.js **v20 veya üzeri** gerekir (`node:sqlite` için v22.5+ önerilir; bu ortamda
v22.22 ile test edildi).

## Neler test edildi

Backend, uçtan uca curl ile test edildi ve şunlar doğrulandı:
- Kayıt (öğrenci/öğretmen), giriş, yanlış şifrede 401
- Öğretmen kaydı `pending` durumunda başlıyor, Super Admin onaylayınca `approved` oluyor
- Token olmadan admin uçlarına erişim → 401; öğrenci hesabıyla erişim → 403
- Admin Yardımcısı, kendisine izin verilmeden admin uçlarına erişemiyor (403);
  Super Admin `users.view` iznini açtıktan sonra erişebiliyor (200)
- Her kritik işlem `admin_logs` tablosuna gerçek zamanlı yazılıyor

## Modül 1 kapsamı (bu teslimat)

- `users`, `roles`, `permissions`, `role_permissions`, `user_permissions`,
  `sessions`, `admin_logs` tabloları
- Kayıt / Giriş / Oturum bilgisi / Çıkış
- 5 rol: SUPER_ADMIN, ADMIN, ADMIN_HELPER, TEACHER, STUDENT
- Super Admin: kullanıcı oluşturma/silme/engelleme/aktif-pasif/rol değiştirme/şifre sıfırlama
- Öğretmen hesabı onaylama/reddetme
- Admin Yardımcısı için tek tek açılıp kapatılabilen izinler
- Tüm kritik işlemler admin log tablosuna yazılıyor
- React tabanlı basit giriş/kayıt ekranı + Super Admin kullanıcı yönetim paneli

## Yol Haritası (sıradaki modüller)

Kullanıcı ile birlikte modül modül, sırayla ilerlenecek:

1. ~~Auth + Roller (RBAC)~~ ✅ (bu teslimat)
2. Öğretmen profili + ders ilanları (`subjects`, `courses`)
3. Arama / filtreleme + öğrenci tarafı
4. Takvim + rezervasyon (`availability`, `bookings`)
5. Komisyon sistemi (`commissions`) + Havale/EFT ödeme akışı (`payments`, `payment_accounts`, `transactions`)
6. Mesajlaşma (`conversations`, `messages`)
7. Yorum/puanlama (`reviews`) + Bildirimler (`notifications`) + Favoriler (`favorites`)
8. Super Admin dashboard (grafikler) + Site Ayarları

## Production'a Geçiş İçin Notlar

Bu proje gerçek kullanıcılara açılmadan önce:
- `node:sqlite` yerine PostgreSQL/MySQL + bağlantı havuzu kullanılması,
- React'in CDN+Babel yerine gerçek bir build zinciriyle (Vite) derlenmesi,
- Rate limiter'ın Redis gibi paylaşımlı bir store'a taşınması (şu an tek process
  belleğinde tutuluyor, yatay ölçeklenmiyor),
- HTTPS/reverse proxy (nginx) arkasına alınması,
- `.env` içindeki `SUPER_ADMIN_PASSWORD`'ün ilk girişten hemen sonra değiştirilmesi

önerilir.
