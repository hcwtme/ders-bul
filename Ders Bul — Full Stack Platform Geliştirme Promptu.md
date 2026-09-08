# DERS BUL — ONLINE / YÜZ YÜZE ÖZEL DERS PLATFORMU

Modern, güvenli, mobil uyumlu ve profesyonel bir özel ders platformu geliştir.

## 1. PROJE ADI

Platformun adı: **Ders Bul**

Ana renk/tema: **Mavi**

Tasarım modern, sade, güven veren ve kullanımı kolay olmalı. Responsive olmalı; telefon, tablet ve bilgisayarda düzgün çalışmalı.

---

# 2. PLATFORMUN AMACI

Ders Bul; öğretmenlerin kendilerini tanıtabildiği, ders ilanları oluşturabildiği, fiyat ve müsaitliklerini belirleyebildiği; öğrencilerin ise öğretmenleri arayıp karşılaştırabildiği, ders seçip rezervasyon yapabildiği ve öğretmenlerle mesajlaşabildiği bir özel ders platformudur.

Dersler:

- Online
- Yüz yüze

olarak verilebilmeli.

---

# 3. KULLANICI ROLLERİ

Sistemde aşağıdaki roller bulunmalı:

### SUPER ADMIN
Sistemdeki her şeye tam erişimi vardır.

### ADMIN
Super Admin tarafından verilen yetkiler dahilinde sistemi yönetir.

### ADMIN HELPER
Super Admin tarafından belirlenen sınırlı yetkilere sahiptir.

### TEACHER
Ders verir, ilan oluşturur ve öğrencilerle iletişim kurar.

### STUDENT
Öğretmen arar, ders satın alır/rezervasyon yapar ve öğretmenleri değerlendirir.

Role-Based Access Control (RBAC) kullanılmalı.

---

# 4. SUPER ADMIN PANELİ

Çok kapsamlı bir Super Admin paneli oluştur.

Super Admin aşağıdakilerin tamamını yönetebilmeli:

## Kullanıcı yönetimi

- Öğrenci ekleme
- Öğretmen ekleme
- Admin ekleme
- Admin Helper ekleme
- Kullanıcı silme
- Kullanıcı engelleme
- Kullanıcı aktif/pasif yapma
- Kullanıcı bilgilerini düzenleme
- Şifre sıfırlama
- Kullanıcının rolünü değiştirme
- Öğretmen hesabını onaylama/reddetme

## Yetki sistemi

Admin Helper için ayrı ayrı izinler belirlenebilmeli.

Örneğin:

- Kullanıcıları görüntüleme
- Kullanıcı düzenleme
- Öğretmenleri yönetme
- Dersleri yönetme
- Yorumları yönetme
- Ödemeleri görüntüleme
- Komisyonları yönetme
- Raporları görüntüleme

gibi izinler açılıp kapatılabilmeli.

Super Admin tüm yetkilere sahip olmalı.

---

# 5. KOMİSYON SİSTEMİ

Platform öğretmenlerden komisyon alacak.

Varsayılan komisyon:

**%15**

Ancak Super Admin bunu değiştirebilmeli.

Örneğin:

Genel komisyon:
15%

Öğretmene özel komisyon:
- Öğretmen A → %10
- Öğretmen B → %15
- Öğretmen C → %20

Öğretmene özel komisyon tanımlanmışsa genel komisyon yerine o kullanılmalı.

Örneğin ders fiyatı:

500 TL

Komisyon:

%15

Platform geliri:

75 TL

Öğretmene aktarılacak:

425 TL

Tüm hesaplamalar otomatik yapılmalı.

Komisyon geçmişi tutulmalı.

---

# 6. ÖDEME SİSTEMİ

İlk sürümde online kart ödeme sistemi kullanma.

Ödeme yöntemi:

**Havale / EFT**

Ödeme yapılacak banka hesabı Super Admin panelinden değiştirilebilir olmalı.

Admin aşağıdaki bilgileri yönetebilmeli:

- Banka adı
- Hesap sahibi
- IBAN
- Açıklama
- Ödeme talimatı
- Aktif/pasif ödeme hesabı

IBAN değiştirildiğinde sistemde yeni IBAN kullanılmalı.

Eski ödeme kayıtları silinmemeli; hangi IBAN'a ödeme talimatı verildiği gerektiğinde görülebilmeli.

---

# 7. HAVALE / EFT ÖDEME AKIŞI

Öğrenci bir ders seçtiğinde:

1. Ders fiyatını görür.
2. Havale/EFT ödeme seçeneğini seçer.
3. Sistem güncel banka bilgilerini gösterir.
4. Öğrenci ödemeyi banka hesabına gönderir.
5. Öğrenci ödeme dekontunu sisteme yükleyebilir.
6. Ödeme "Beklemede" durumuna geçer.
7. Admin dekontu kontrol eder.
8. Admin:
   - Onayla
   - Reddet

seçeneklerinden birini kullanır.

Onaylandığında ders rezervasyonu aktif hale gelir.

Ödeme durumları:

- Bekliyor
- İnceleniyor
- Onaylandı
- Reddedildi
- İade edildi

olmalı.

---

# 8. ÖĞRETMEN PROFİLİ

Her öğretmenin detaylı profil sayfası olmalı.

Profilde:

- Profil fotoğrafı
- Ad soyad
- Branş
- Hakkında
- Eğitim bilgileri
- Deneyim
- Verdiği dersler
- Online ders
- Yüz yüze ders
- Ders fiyatı
- Müsaitlik takvimi
- Ortalama puan
- Yorumlar
- Verdiği toplam ders
- Öğrenci sayısı

gösterilmeli.

Öğretmen kendi profilini düzenleyebilmeli.

---

# 9. ÖĞRETMEN DERS İLANLARI

Öğretmen ders ilanı oluşturabilmeli.

İlan alanları:

- Ders adı
- Branş
- Açıklama
- Fiyat
- Ders süresi
- Online / yüz yüze
- Konum
- Müsait günler
- Müsait saatler
- Kapak görseli

Öğretmen ilanlarını düzenleyebilmeli veya kaldırabilmeli.

---

# 10. ÖĞRENCİ TARAFI

Öğrenci:

- Öğretmen arayabilmeli
- Ders arayabilmeli
- Branşa göre filtreleyebilmeli
- Fiyata göre filtreleyebilmeli
- Online/yüz yüze filtreleyebilmeli
- Puanına göre sıralayabilmeli
- Öğretmen profilini inceleyebilmeli
- Müsait saatleri görebilmeli
- Ders rezervasyonu oluşturabilmeli
- Öğretmenle mesajlaşabilmeli
- Ders geçmişini görebilmeli
- Favori öğretmen ekleyebilmeli

---

# 11. TAKVİM VE REZERVASYON

Öğretmen kendi müsaitlik takvimini oluşturabilmeli.

Örneğin:

Pazartesi:
17:00–18:00
19:00–20:00

Salı:
16:00–17:00

Öğrenci sadece müsait olan saatleri seçebilmeli.

Aynı zaman dilimine iki farklı öğrenci rezervasyon yapamamalı.

Rezervasyon durumları:

- Bekliyor
- Ödeme bekleniyor
- Onaylandı
- Tamamlandı
- İptal edildi

---

# 12. MESAJLAŞMA

Öğrenci ve öğretmen arasında mesajlaşma sistemi oluştur.

Özellikler:

- Gerçek zamanlı veya mümkün olduğunca hızlı mesajlaşma
- Konuşma listesi
- Okundu bilgisi
- Yeni mesaj bildirimi
- Mesaj zamanı
- Engelleme/şikayet sistemi

Admin gerektiğinde mesajlaşma sistemindeki kötüye kullanım bildirimlerini yönetebilmeli.

---

# 13. YORUM VE PUANLAMA

Öğrenci yalnızca tamamlanmış bir dersten sonra öğretmeni değerlendirebilmeli.

1–5 yıldız sistemi.

Ayrıca yazılı yorum bırakabilmeli.

Örneğin:

⭐⭐⭐⭐⭐

"Çok iyi anlatıyor, konuyu anlamamı sağladı."

Aynı ders için tekrar tekrar yorum yapılamamalı.

Admin yorumları silebilmeli/gizleyebilmeli.

Öğretmenin ortalama puanı otomatik hesaplanmalı.

---

# 14. BİLDİRİMLER

Bildirim sistemi oluştur.

Bildirim örnekleri:

- Yeni mesaj
- Rezervasyon oluşturuldu
- Ödeme onaylandı
- Ödeme reddedildi
- Ders yaklaşıyor
- Ders tamamlandı
- Yorum yapabilirsiniz
- Öğretmen hesabınız onaylandı

Bildirimler kullanıcı panelinde görüntülenebilmeli.

---

# 15. ANA SAYFA

Modern ve profesyonel bir ana sayfa oluştur.

Hero alanı:

**"Sana uygun öğretmeni bul."**

Alt açıklama:

"Online veya yüz yüze özel ders için öğretmenleri keşfet, karşılaştır ve dersini planla."

Arama kutusu:

**Hangi dersi öğrenmek istiyorsun?**

Örnek:

- Matematik
- Fizik
- Kimya
- İngilizce
- Türkçe
- Biyoloji
- Yazılım
- Müzik

Ana sayfada ayrıca:

- Popüler dersler
- Öne çıkan öğretmenler
- En yüksek puanlı öğretmenler
- Nasıl çalışır?
- Öğrenci yorumları
- Platform istatistikleri

bölümleri bulunmalı.

---

# 16. ÖĞRENCİ PANELİ

Öğrenci giriş yaptığında:

- Ana sayfa
- Öğretmen ara
- Favoriler
- Derslerim
- Rezervasyonlarım
- Mesajlar
- Bildirimler
- Ödeme geçmişi
- Profil ayarları

menülerini görmeli.

---

# 17. ÖĞRETMEN PANELİ

Öğretmen giriş yaptığında:

- Genel bakış
- Profilim
- Derslerim
- İlanlarım
- Takvim
- Rezervasyonlar
- Mesajlar
- Kazançlar
- Komisyonlar
- Yorumlar
- Bildirimler
- Hesap ayarları

menülerini görmeli.

---

# 18. SUPER ADMIN DASHBOARD

Dashboard'da:

- Toplam öğrenci
- Toplam öğretmen
- Toplam ders
- Tamamlanan ders
- Bekleyen rezervasyon
- Bekleyen ödeme
- Toplam işlem hacmi
- Platform komisyon geliri
- Öğretmenlere aktarılacak tutar
- Günlük/haftalık/aylık gelir
- Yeni kullanıcılar
- Son işlemler

grafiklerle gösterilmeli.

---

# 19. TASARIM

Tema:

**Mavi ağırlıklı profesyonel tasarım.**

Kullanılabilecek tasarım anlayışı:

- Beyaz arka plan
- Mavi ana renk
- Açık mavi yardımcı renkler
- Yuvarlatılmış kartlar
- Modern butonlar
- Temiz tipografi
- Responsive tasarım
- Mobil-first yaklaşım

Arayüz karmaşık olmamalı.

---

# 20. GÜVENLİK

Şifreler kesinlikle düz metin olarak saklanmamalı.

Password hashing kullanılmalı.

Ayrıca:

- Authentication
- Authorization
- RBAC
- Session/JWT güvenliği
- Input validation
- Rate limiting
- CSRF/XSS/SQL Injection koruması
- Güvenli dosya yükleme
- Admin işlem kayıtları
- Login kayıtları

uygulanmalı.

---

# 21. ADMIN LOG SİSTEMİ

Super Admin tarafından yapılan kritik işlemler kayıt altına alınmalı.

Örneğin:

"Admin Ahmet, Mehmet'in rolünü STUDENT → TEACHER yaptı."

ve:

"Super Admin komisyon oranını %15 → %12 değiştirdi."

Loglarda:

- Kullanıcı
- İşlem
- Tarih
- Saat
- IP gibi gerekli teknik bilgiler

tutulabilmeli.

---

# 22. VERİTABANI

Veritabanı ilişkisel ve ölçeklenebilir şekilde tasarlanmalı.

Temel tablolar:

users  
roles  
permissions  
role_permissions  
students  
teachers  
subjects  
courses  
lessons  
availability  
bookings  
conversations  
messages  
reviews  
payments  
payment_accounts  
transactions  
commissions  
notifications  
favorites  
admin_logs

Foreign key ve gerekli indexleri oluştur.

Para değerlerinde floating point kullanma; uygun decimal/numeric veri tipi kullan.

---

# 23. ADMIN TARAFINDAN SİSTEM AYARLARI

Super Admin panelinde "Site Ayarları" bölümü oluştur.

Buradan:

- Site adı
- Logo
- Favicon
- Ana renk
- İkincil renk
- Varsayılan komisyon
- Banka adı
- Hesap sahibi
- IBAN
- Ödeme açıklaması
- İletişim bilgileri
- E-posta ayarları
- Genel site ayarları

değiştirilebilmeli.

---

# 24. ÖNEMLİ

Sistemde hiçbir kritik bilgi frontend'e güvenilerek kontrol edilmemeli.

Örneğin:

- Fiyat
- Komisyon
- Kullanıcı rolü
- Ödeme durumu
- Ders durumu
- Admin yetkileri

sunucu tarafında doğrulanmalı.

Kullanıcı frontend üzerinden kendisini Admin veya Super Admin yapamamalı.

---

# 25. KOD KALİTESİ

Projeyi production'a uygun şekilde geliştir.

Kod:

- Modüler
- Okunabilir
- Güvenli
- Ölçeklenebilir
- Type-safe mümkün olduğunca
- Tekrarsız
- Hata yönetimi yapılmış

olmalı.

API endpointleri düzenli ve RESTful/uygun mimaride hazırlanmalı.

Environment değişkenleri `.env` üzerinden yönetilmeli.

Secret, şifre veya API key kodun içine hard-code edilmemeli.

---

# 26. TESLİM

Projeyi sadece görsel frontend olarak yapma.

Gerçek çalışan bir full-stack uygulama oluştur.

Şunların tamamı çalışır durumda olmalı:

- Kayıt
- Giriş
- Rol sistemi
- Öğrenci paneli
- Öğretmen paneli
- Admin paneli
- Super Admin paneli
- Ders ilanları
- Arama/filtreleme
- Takvim
- Rezervasyon
- Havale/EFT ödeme
- Dekont yükleme
- Ödeme onaylama
- Komisyon hesaplama
- Mesajlaşma
- Bildirimler
- Puanlama
- Yorumlar
- Favoriler
- Kullanıcı yönetimi
- Yetki yönetimi
- Site ayarları
- IBAN değiştirme
- Komisyon değiştirme
- Admin logları

Her özellik gerçek veritabanına bağlı çalışmalı.

Demo/mock veri kullanılıyorsa bunun yerine gerçek backend bağlantısını kur.

Önce veritabanı mimarisini ve backend API'lerini oluştur, ardından frontend panellerini bu API'lere bağla.

Sonuç olarak **Ders Bul**, gerçek kullanıcıların öğretmen bulup özel ders rezervasyonu yapabileceği, öğretmenlerin ilan verebileceği ve Super Admin'in platformun tamamını kontrol edebileceği profesyonel bir platform olmalıdır.