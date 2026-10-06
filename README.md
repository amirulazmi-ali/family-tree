# Salasilah Keluarga V0.2

Aplikasi salasilah responsif menggunakan React, Vite, TypeScript dan Supabase. Ahli log masuk dengan e-mel/kata laluan melalui jemputan admin, boleh mengemas kini profil sendiri, dan admin boleh mengurus data keluarga. Hosting frontend statik pada Cloudflare Pages.

## Keperluan

- Node.js 20.19+ atau 22.12+
- Projek Supabase
- Wrangler CLI hanya jika deploy melalui terminal

## 1. Sediakan Supabase

1. Buka **SQL Editor** projek Supabase dan jalankan semua kandungan [`supabase/schema.sql`](supabase/schema.sql). SQL ini menaik taraf jadual V0.1 jika ada, dan seed keluarga Mat Isa → Mat Deah, Tok Awang, Tok Sa'bah.
2. Dalam **Authentication → Providers → Email**, aktifkan Email. Kekalkan pengesahan e-mel aktif untuk jemputan.
3. Buat akaun admin pertama secara manual di **Authentication → Users → Add user**. Catat UUID pengguna itu.
4. Jadikan akaun tadi admin untuk keluarga seed di SQL Editor:

```sql
insert into public.family_admins (family_id, user_id)
values ('10000000-0000-4000-8000-000000000001', 'PASTE-AUTH-USER-UUID-HERE')
on conflict do nothing;
```

5. Deploy fungsi jemputan (Langkah 4). Log masuk sebagai admin pertama, pilih ahli dan isi e-mel pada borang **Jemput ahli**. Penerima buka pautan Supabase, kemudian app meminta mereka tetapkan kata laluan. Fungsi menghubungkan `family_members.user_id` kepada `auth.users.id`; alamat e-mel tidak boleh mendaftar akaun secara bebas.

### RLS dan kawalan akses

`families`, `family_members` dan `family_relationships` mempunyai RLS. Bacaan salasilah dibuka untuk paparan keluarga. Ahli yang terhubung boleh mengubah profil mereka sendiri sahaja; trigger SQL menghalang pertukaran `id`, `family_id` dan `user_id`. `family_admins` mengawal pengurusan menyeluruh dan hanya boleh dibaca oleh pemilik rekod. Tambah admin lain dengan SQL sahaja selepas mengesahkan identiti.

## 2. Jalankan secara lokal

```sh
npm install
cp .env.example .env.local
npm run dev
```

PowerShell: `Copy-Item .env.example .env.local`. Isikan `.env.local` menggunakan **Project URL** dan **publishable key** Supabase:

```ini
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

Publishable key memang digunakan oleh browser; ia bukan kunci admin. Jangan masukkan `service_role`, `sb_secret_...` atau apa-apa secret ke `VITE_` variable, Git, atau frontend.

Tanpa konfigurasi Supabase, app memaparkan data contoh sahaja dan login/edit tidak tersedia.

## 3. Build dan semak

```sh
npm run build
npm run preview
```

Build statik berada dalam `dist/`.

## 4. Deploy Supabase Edge Function jemputan

Secret diperlukan di server Supabase sahaja. Jangan kongsi atau masukkan nilainya ke projek frontend.

Dengan Supabase CLI tersambung kepada project ref:

```sh
supabase login
supabase link --project-ref YOUR_PROJECT_REF
supabase functions deploy invite-member --no-verify-jwt
supabase secrets set INVITE_REDIRECT_URL=https://YOUR-PAGES-DOMAIN.pages.dev
```

Fungsi mengesahkan JWT pemanggil melalui Auth, menyemak keahlian admin dalam `family_admins`, kemudian menggunakan secret API server daripada `SUPABASE_SECRET_KEYS` (atau legacy `SUPABASE_SERVICE_ROLE_KEY`) yang disediakan runtime. `--no-verify-jwt` digunakan kerana fungsi sendiri mengesahkan sesi dan memulangkan ralat JSON konsisten. Nilai secret tidak perlu diset manual, dipaparkan atau dihantar ke browser.

## 5. Cloudflare Pages percuma

1. Push folder projek ini ke repository Git (jangan sertakan `.env.local`, `node_modules`, atau `dist`).
2. Cloudflare Dashboard → **Workers & Pages → Create → Pages → Connect to Git**.
3. Framework preset: **Vite**; build command `npm run build`; build output directory `dist`; root directory projek.
4. Dalam **Settings → Environment variables**, untuk Production dan Preview tetapkan `VITE_SUPABASE_URL` dan `VITE_SUPABASE_PUBLISHABLE_KEY`. Nilai ini konfigurasi client awam, bukan rahsia.
5. Deploy. Tetapkan **Supabase → Authentication → URL Configuration → Site URL** dan **Redirect URLs** kepada URL Pages sebenar. Tetapkan `INVITE_REDIRECT_URL` kepada URL homepage Pages itu. App mengesan token jemputan dan memaparkan borang tetapan kata laluan.
6. Deploy semula selepas menukar build variables.

Cloudflare Pages Free sesuai untuk frontend statik; pangkalan data/auth kekal pada pelan Supabase anda. Domain `pages.dev` boleh digunakan tanpa kos hosting Pages. Jika deploy dengan CLI sahaja, `npm run build` kemudian `npx wrangler pages deploy dist --project-name family-tree`.

## Struktur ringkas

- `src/App.tsx` — salasilah, login, edit profil, jemputan admin
- `supabase/schema.sql` — jadual, seed, RLS dan perlindungan pautan akaun
- `supabase/functions/invite-member/index.ts` — onboarding yang memerlukan admin
- `.env.example` — nama pemboleh ubah client sahaja

**Nota operasi:** fungsi mengundang e-mel menggunakan kuota penghantaran Auth projek. Untuk penggunaan keluarga kecil, gunakan SMTP Supabase yang dikonfigurasi dengan betul jika perlu kebolehantaran e-mel lebih baik.
