# Deploy-ready хувилбар

Энэ хувилбар DEMO_MODE=true үед Supabase тохиргоогүй шууд Vercel дээр ажиллана.

# Гэр бүлийн Санхүү — Supabase + Vercel Web App

## 1. Supabase үүсгэх
1. supabase.com → New project
2. SQL Editor → `supabase.sql` файлын бүх кодыг paste → Run
3. Project Settings → API → Project URL болон anon public key хуулна
4. `config.js` дээр оруулна

## 2. Auth тохиргоо
Supabase → Authentication → URL Configuration:
- Site URL: эхлээд Vercel link гарсны дараа `https://таны-app.vercel.app`
- Redirect URLs дээр мөн адил link нэмнэ

Email OTP / Magic link Supabase Auth-оор ажиллана.

## 3. GitHub/Vercel deploy
1. Энэ folder-ийг GitHub repo болгоно
2. Vercel → Add New Project → repo сонгоно
3. Framework: Other
4. Build command: хоосон
5. Output directory: ./
6. Deploy

## 4. Админ бүртгэл
App нээгдээд "Админ бүртгэх" tab:
- Email: Adyaasd1@gmail.com
- Password: 85570802
- Family name оруулж үүсгэнэ

## 5. Гишүүн нэмэх
Гишүүд хэсэг → Урих:
- Имэйл оруулахад Supabase OTP / magic link илгээнэ
- Гишүүн нэвтрэхэд нэг family_id дээрх дата харагдана

## Анхаарах зүйл
Энэ бол frontend + Supabase хувилбар. Жинхэнэ OpenAI API-г шууд frontend дээр хийхгүй, backend/serverless function-оор хамгаалж холбох хэрэгтэй.
