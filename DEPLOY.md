# Ders Bul'u Ücretsiz Olarak İnternete Çıkarma Rehberi

## Önce önemli bir gerçek: kalıcılık (veri saklama) sorunu

Bu proje verileri **yerel bir dosyada** tutuyor: `backend/data/dersbul.db`
(SQLite veritabanı) ve `backend/uploads/` klasörü (yüklenen resimler).

Neredeyse tüm **tamamen ücretsiz** hosting platformları "ephemeral" (geçici/
kalıcı olmayan) disk kullanır: uygulaman her yeniden deploy edildiğinde veya
bazen sadece "uyuyan" uygulama tekrar uyandığında, o diskteki her şey
**sıfırlanır**. Yani kayıtlı kullanıcılar, ilanlar, yüklenen fotoğraflar silinir.

Bu, gerçek/kalıcı bir siteye ihtiyacın varsa önemli bir sınırlama. Aşağıda
hem "hızlıca göstermek için ücretsiz deploy" hem de "gerçekten kalıcı, hâlâ
ücretsiz" seçenekleri var.

---

## Seçenek 1 — En kolayı: Render.com (ücretsiz, kredi kartı istemiyor)

Demo/tanıtım için en hızlı yol. **Not:** free plan'da disk kalıcı değildir —
uygulama 15 dakika işlem görmeyince "uyur", tekrar deploy ettiğinde veritabanı
sıfırlanır. Küçük ölçekli gerçek kullanım için bile başlangıçta yeterlidir,
ciddi/kalıcı veri için Seçenek 3'e bak.

1. **GitHub'a yükle.** Bir GitHub hesabın yoksa ücretsiz oluştur
   (github.com), yeni bir repository aç (örn. `ders-bul`), proje klasörünü
   (bu zip'in içini) oraya push'la. (GitHub Desktop uygulamasıyla komut
   satırı bilmeden de yapabilirsin.)
2. **render.com**'a git, ücretsiz hesap aç (GitHub ile giriş yapabilirsin).
3. Dashboard'da **"New +" → "Web Service"** seç.
4. GitHub reponu bağla (`ders-bul`).
5. Ayarlar:
   - **Runtime:** Node
   - **Build Command:** (boş bırakabilirsin — hiç dış paket kullanmıyoruz)
   - **Start Command:** `node backend/server.js`
   - **Instance Type:** Free
6. **Environment Variables** bölümünden `.env.example` dosyasındaki
   değişkenleri ekle (özellikle `SUPER_ADMIN_EMAIL`, `SUPER_ADMIN_PASSWORD`).
   `PORT` değişkenini SEN eklemene gerek yok — Render bunu otomatik veriyor,
   sunucumuz zaten `process.env.PORT`'u kullanıyor.
7. **Create Web Service**'e tıkla. Birkaç dakika içinde
   `https://ders-bul-xxxx.onrender.com` gibi bir adres verecek — bu senin
   ücretsiz, herkese açık linkin.

---

## Seçenek 2 — Uyumayan ücretsiz alternatif: Northflank

Render'ın "uyuma" davranışını istemiyorsan Northflank'ın ücretsiz katmanı
uygulamayı uyutmuyor. Adımlar Render'a çok benzer (GitHub reposunu bağla,
başlatma komutu olarak `node backend/server.js` gir, Node 22 seç). Kalıcı
disk desteği hesap/plan bazında değişebiliyor, kurulum sırasında "persistent
volume / disk" seçeneği çıkarsa ekleyip `backend/data` ve `backend/uploads`
klasörlerine bağlamayı dene.

---

## Seçenek 3 — Gerçekten kalıcı veri istiyorsan: kendi bilgisayarını sunucu yap

Verinin **hiç sıfırlanmaması** garantisi istiyorsan en güvenilir ücretsiz yol,
kendi bilgisayarını (veya evindeki bir mini PC/Raspberry Pi'ı) sunucu yapıp
**Cloudflare Tunnel** ile internete açmak. Veri senin kendi diskinde durur,
hiçbir platform onu silmez. Tek şart: bilgisayarın açık ve internete bağlı
kalması gerekir (kapatırsan site de kapanır).

1. `cloudflared` programını ücretsiz indir (Cloudflare'ın resmi sitesi).
2. Bilgisayarında normal şekilde çalıştır: `node backend/server.js`
   (proje klasöründeyken).
3. Yeni bir terminalde: `cloudflared tunnel --url http://localhost:4000`
4. Cloudflare sana anında `https://rastgele-isim.trycloudflare.com` gibi
   **gerçek, herkese açık bir HTTPS adresi** verir — kredi kartı yok, süre
   sınırı yok.
5. (İstersen ileride kendi alan adını da ücretsiz bağlayabilirsin —
   Cloudflare'a ücretsiz hesap açıp "Tunnel"ı kalıcı bir isimle
   yapılandırarak.)

Bu yöntemin bedeli: bilgisayarın sürekli açık olmalı. Gerçek bir sunucu gibi
7/24 açık kalsın istiyorsan, düşük güç tüketen bir mini PC/Raspberry Pi bu iş
için ucuz ve pratik bir çözüm (elektrik dışında maliyeti yok).

---

## Hangi yolu seçmeliyim?

- **Sadece göstermek / test ettirmek istiyorum, veri kaybı önemli değil** →
  Seçenek 1 (Render).
- **Site sürekli açık dursun, uyumasın, ama kalıcılık şart değil** →
  Seçenek 2 (Northflank).
- **Kayıt olan kullanıcıların, yüklenen fotoğrafların gerçekten kalıcı
  olmasını istiyorum ama bütçem yok** → Seçenek 3 (kendi bilgisayarın +
  Cloudflare Tunnel).
- **Gerçek bir işletme kuracağım, profesyonel/kalıcı hosting istiyorum** →
  Bu noktada artık ücretli bir VPS (aylık ~$5-10) veya Render'ın ücretli
  "Persistent Disk" eklentisi gerekecek — ama oraya geçmeden önce ücretsiz
  seçeneklerle test edip platformu olgunlaştırmak mantıklı.
