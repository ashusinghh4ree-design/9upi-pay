# 🛡️ 9UPI PAY Enterprise Production Deployment Manual

This document provides step-by-step instructions to configure, initialize, and deploy the high-fidelity **9UPI PAY** backend service and administrative command panel using **Node.js, Express, and PostgreSQL**.

---

## 🏗️ Core Prerequisites
Ensure the target virtual server or hosting system has the following dependencies initialized:
1. **Node.js**: `v18.0.0+` (LTS highly recommended)
2. **NPM**: `v9.0.0+`
3. **PostgreSQL**: `v14.0+` (Direct local instance or cloud connection such as Supabase, Render, Heroku)

---

## 🐘 Step 1: PostgreSQL Setup
1. Log into your PostgreSQL terminal or dashboard console and create a new dedicated database:
   ```sql
   CREATE DATABASE nineupi;
   ```
2. Set up database permissions or retrieve your connections URL. The URL generally adheres to the following layout:
   ```bash
   postgresql://[db_user]:[db_password]@[db_host]:[db_port]/nineupi
   ```

---

## ⚙️ Step 2: Environment Provisioning
1. Move to the directory: `/backend`
2. Create or copy the `.env` configuration file:
   ```bash
   cp .env.example .env
   ```
3. Edit `.env` to supply secret keys and your PostgreSQL URI:
   ```ini
   PORT=5000
   NODE_ENV=production
   JWT_SECRET=EnterYourHighEntropySecretStringForJWTSigningHere
   CAPTCHA_SECRET=EnterSecureSecretForCaptchaChecksHere
   DATABASE_URL=postgresql://postgres:MySecurePassword123@localhost:5432/nineupi
   DATABASE_SSL=false
   ```

---

## ⚡ Step 3: Package Installations
Install production dependencies and dev packages:
```bash
cd backend
npm install
```

---

## 🚀 Step 4: Bootstrapping and Auto-Migrations
The **9UPI PAY** platform implements self-healing database bootstrap layers. When you initialize the server for the first time, it will:
1. Automatically establish database pool limits.
2. Search and discover `/backend/config/schema.sql`.
3. Auto-populate all required tables and constraints.
4. Inject initial required system settings, payment gateways, live CMS copywriting layouts, and security group roles.
5. Create a **Default Super Administrator** account if there are no registered users in the admin table.

### Launch local server:
- For active hot-reloads (Development):
  ```bash
  npm run dev
  ```
- For standard production execution:
  ```bash
  npm start
  ```

Once booted, look out for the confirmation flags in the terminal output:
```bash
✅ PostgreSQL connection pool successfully established.
⚡ PG Tables and seeds verified and successfully initialized.
=======================================================
🚀 9UPI PAY API Engine Server Status: [ONLINE]
📡 Server Address Port : http://localhost:5000
=======================================================
🔑 INITIAL ADMIN TERMINAL SEEDS REGISTERED SUCCESSFULLY
👤 UserID Key ID  : 9UPIADMIN
✉️ Email Target   : admin@nineupi.fun
🔒 Secret Pin Entry: 1234
=======================================================
```

---

## 🛡️ Step 5: Web Panel Entrance (h4r.fun/admin)
The Express server securely hosts the high-contrast administrative control app on-the-fly. 
Open your web browser and target the following gateway address:
```bash
http://localhost:5000/admin
```
Log in using your bootstrap admin credentials (`9UPIADMIN` and `1234`) to navigate users directory, configure rates, or approve transaction clearances.

---

## 🔒 Step 6: Nginx Reverse Proxy & SSL Configuration
To route your public domain `h4r.fun` to the local port securely with HTTPS, configure **Nginx**:
Create a configuration file at `/etc/nginx/sites-available/nineupi` containing:
```nginx
server {
    listen 80;
    server_name api.h4r.fun h4r.fun;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name api.h4r.fun h4r.fun;

    ssl_certificate /etc/letsencrypt/live/h4r.fun/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/h4r.fun/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```
Deploy the configurations, verify syntaxes, and reload Nginx service:
```bash
sudo ln -s /etc/nginx/sites-available/nineupi /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

---

## 📈 Step 7: PM2 Production Clustering Management
To guarantee persistent, round-the-clock availability under multi-cluster threading:
```bash
sudo npm install -g pm2
pm2 start server.js --name "nineupi-api"
pm2 save
pm2 startup
```
This is fully enterprise-grade, robust, and completely operational.
