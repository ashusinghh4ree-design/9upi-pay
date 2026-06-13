-- 9UPI PAY - Complete Enterprise Production PostgreSQL Database Schema
-- Designed for Geometric Balance, JWT Security, & Rich Ledger Verification

CREATE TABLE IF NOT EXISTS roles (
    role_id SERIAL PRIMARY KEY,
    name VARCHAR(50) UNIQUE NOT NULL,
    description VARCHAR(255)
);

CREATE TABLE IF NOT EXISTS users (
    user_id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    phone VARCHAR(20) UNIQUE NOT NULL,
    pin VARCHAR(255) NOT NULL, -- Cryptographic hash (bcryptjs)
    wallet_balance NUMERIC(15, 2) DEFAULT 0.00 CHECK (wallet_balance >= 0),
    reward_balance NUMERIC(15, 2) DEFAULT 200.00 CHECK (reward_balance >= 0), -- Initial registration reward
    total_earnings NUMERIC(15, 2) DEFAULT 200.00 CHECK (total_earnings >= 0),
    referral_code VARCHAR(50) UNIQUE NOT NULL,
    referred_by VARCHAR(50) REFERENCES users(user_id) ON DELETE SET NULL,
    is_blocked BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS admins (
    admin_id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    pin VARCHAR(255) NOT NULL, -- Cryptographic hash
    role_name VARCHAR(50) REFERENCES roles(name) ON DELETE RESTRICT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS payment_gateways (
    id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    api_url VARCHAR(255),
    api_key VARCHAR(255),
    secret_key VARCHAR(255),
    merchant_id VARCHAR(100),
    callback_url VARCHAR(255),
    webhook_url VARCHAR(255),
    is_enabled BOOLEAN DEFAULT TRUE,
    is_default BOOLEAN DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS system_settings (
    id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    new_user_reward NUMERIC(15, 2) DEFAULT 200.00,
    transaction_reward NUMERIC(15, 2) DEFAULT 200.00,
    referral_reward NUMERIC(15, 2) DEFAULT 200.00,
    buy_rate NUMERIC(10, 4) DEFAULT 85.5000,
    sell_rate NUMERIC(10, 4) DEFAULT 90.0000,
    tg_channel VARCHAR(255) DEFAULT 'https://t.me/NineUpiPay',
    tg_head_agent VARCHAR(255) DEFAULT 'https://t.me/NineUpipayhead'
);

CREATE TABLE IF NOT EXISTS referrals (
    id SERIAL PRIMARY KEY,
    referrer_id VARCHAR(50) REFERENCES users(user_id) ON DELETE CASCADE,
    referred_user_id VARCHAR(50) REFERENCES users(user_id) ON DELETE CASCADE,
    referred_user_name VARCHAR(100) NOT NULL,
    reward_amount NUMERIC(15, 2) DEFAULT 200.00,
    is_completed BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS transactions (
    transaction_id VARCHAR(50) PRIMARY KEY,
    user_id VARCHAR(50) REFERENCES users(user_id) ON DELETE CASCADE,
    type VARCHAR(50) NOT NULL, -- 'Deposit', 'Withdrawal', 'Reward', 'Referral Bonus', 'Buy', 'Sell'
    amount NUMERIC(15, 2) NOT NULL,
    currency VARCHAR(10) DEFAULT 'INR',
    gateway VARCHAR(100) DEFAULT 'DIRECT',
    utr VARCHAR(100) UNIQUE,
    status VARCHAR(50) NOT NULL DEFAULT 'Pending', -- 'Pending', 'Approved', 'Rejected', 'Success'
    details TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS deposits (
    id SERIAL PRIMARY KEY,
    transaction_id VARCHAR(50) REFERENCES transactions(transaction_id) ON DELETE CASCADE,
    user_id VARCHAR(50) REFERENCES users(user_id) ON DELETE CASCADE,
    amount NUMERIC(15, 2) NOT NULL,
    gateway_id VARCHAR(50) REFERENCES payment_gateways(id) ON DELETE SET NULL,
    utr VARCHAR(100) UNIQUE NOT NULL,
    status VARCHAR(50) DEFAULT 'Pending',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS withdrawals (
    id SERIAL PRIMARY KEY,
    transaction_id VARCHAR(50) REFERENCES transactions(transaction_id) ON DELETE CASCADE,
    user_id VARCHAR(50) REFERENCES users(user_id) ON DELETE CASCADE,
    amount NUMERIC(15, 2) NOT NULL,
    upi_address VARCHAR(100) NOT NULL,
    status VARCHAR(50) DEFAULT 'Pending',
    actioned_by VARCHAR(50),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS content_management (
    page_key VARCHAR(50) PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    content TEXT,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS notifications (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR(50) REFERENCES users(user_id) ON DELETE CASCADE,
    title VARCHAR(150) NOT NULL,
    message TEXT NOT NULL,
    is_read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS announcements (
    id SERIAL PRIMARY KEY,
    title VARCHAR(150) NOT NULL,
    content TEXT NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS support_tickets (
    ticket_id SERIAL PRIMARY KEY,
    user_id VARCHAR(50) REFERENCES users(user_id) ON DELETE CASCADE,
    subject VARCHAR(150),
    message TEXT NOT NULL,
    reply TEXT,
    status VARCHAR(50) DEFAULT 'Open', -- 'Open', 'Resolved'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS audit_logs (
    id SERIAL PRIMARY KEY,
    action VARCHAR(100) NOT NULL,
    admin_user VARCHAR(100) DEFAULT 'System',
    details TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS activity_logs (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR(50) REFERENCES users(user_id) ON DELETE CASCADE,
    activity VARCHAR(150) NOT NULL,
    details TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Seed Initial Static Roles
INSERT INTO roles (name, description) VALUES
('Super Admin', 'Full master administrative rights over the entire 9UPI platform'),
('Admin', 'System administration, deposit clearances and rules configurations'),
('Moderator', 'Clearance and logs review support'),
('Support Staff', 'Resolve user query tickets')
ON CONFLICT (name) DO NOTHING;

-- Seed Settings Config
INSERT INTO system_settings (id, new_user_reward, transaction_reward, referral_reward, buy_rate, sell_rate)
VALUES (1, 200.00, 200.00, 200.00, 85.5000, 90.0000)
ON CONFLICT (id) DO NOTHING;

-- Seed Default Payment Gateways
INSERT INTO payment_gateways (id, name, api_url, api_key, secret_key, merchant_id, is_enabled, is_default)
VALUES 
('gw_gpay', 'Google Pay Direct', 'https://api.gpayquick.com/v2', 'gpay_live_key_948fbc', 'sh_gpg_9901a', 'MERCH_GPAY_102', TRUE, TRUE),
('gw_phonepe', 'PhonePe Standard', 'https://api.phonepesettlements.com/v3', 'pro_ppe_77fa2', 'sh_ppe_22091', 'MERCH_PPE_39f', TRUE, FALSE),
('gw_paytm', 'Paytm Auto', 'https://secure.paytm.co.in/v1', 'pro_ptm_1023ba', 'sh_ptm_4482a', 'MERCH_PTM_008', TRUE, FALSE)
ON CONFLICT (id) DO NOTHING;

-- Seed Web CMS Layout Components (Homepage, Banners, FAQs, Policies)
INSERT INTO content_management (page_key, title, content) VALUES
('home_banners', 'Dynamic Marketing Headline', '🚀 Upgrade your portfolio balance instantly! Enjoy guaranteed 200 token bonus rewards on new referrals in the 9UPI app.'),
('about_page', 'About 9UPI PAY', '9UPI PAY represents the forefront of high-fidelity automated decentralized peer-to-peer UPI settlements networks.'),
('disclaimer_page', 'Risk & Liability Disclaimer', 'Financial asset settlement operations carry inherent peer liquidity risks. Ensure exact matching deposit UTR matches before submitting.'),
('faq_page', 'Frequently Asked Questions & Support', 'Q: How fast are deposits? A: Automatically validated in 1-5 minutes via dynamic payment verification. Q: What is the minimum withdrawal? A: Minimum limit is set to 500 INR.'),
('terms_page', 'Terms of Usage Agreement', 'All UPI operations correspond directly to Reserve Bank of India peer transfer norms. Falsified or recycled UTR submissions trigger permanent account suspension.')
ON CONFLICT (page_key) DO NOTHING;
