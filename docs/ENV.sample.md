Backend (.env)

- PORT=3001
- CORS_ORIGIN=http://localhost:5173,http://localhost:3000,exp://127.0.0.1:19000
- JWT_SECRET=replace_with_strong_secret
- DATABASE_URL=postgresql://postgres:postgres@localhost:5432/mutingwende?schema=public  (optional)
- DB_HOST=localhost
- DB_USER=postgres
- DB_PASSWORD=Action15
- DB_NAME=mutingwende
- DB_PORT=5432
- WEB_BASE_URL=http://localhost:5173

Email (optional for dev — console fallback used if unset)

- SMTP_HOST=
- SMTP_PORT=587
- SMTP_USER=
- SMTP_PASS=
- SMTP_FROM="Mutingwende <no-reply@yourdomain.com>"

Payments (set in production)

- FLUTTERWAVE_SECRET=
- PAYFAST_PASSPHRASE=
- PAYFAST_MERCHANT_ID=
- PAYFAST_MERCHANT_KEY=


