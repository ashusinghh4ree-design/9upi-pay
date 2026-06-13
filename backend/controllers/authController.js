const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const db = require('../config/db');

// Helper to sign JWT payload
const generateToken = (userId, role) => {
  const jwtSecret = process.env.JWT_SECRET || '9upi_geometric_balance_secret_key_2026';
  return jwt.sign({ userId, role }, jwtSecret, { expiresIn: '7d' });
};

/**
 * Generate a secure Math/Text Captcha challenge
 * GET /api/auth/captcha
 */
exports.getCaptcha = async (req, res) => {
  try {
    const num1 = Math.floor(10 + Math.random() * 89); // Double digit
    const num2 = Math.floor(1 + Math.random() * 9);   // Single digit
    const answer = num1 + num2;
    
    // Sign the answer inside a short-lived token to prevent database state bloat
    const captchaSecret = process.env.CAPTCHA_SECRET || '9upi_captcha_seal_2026';
    const challengeToken = jwt.sign({ answer }, captchaSecret, { expiresIn: '5m' });

    return res.status(200).json({
      success: true,
      challenge: `What is ${num1} + ${num2}?`,
      challengeToken
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Captcha engine offline' });
  }
};

/**
 * Register a new wallet user with captcha validation
 * POST /api/auth/register
 */
exports.register = async (req, res) => {
  try {
    const { name, phone, pin, promoCode, captchaAnswer, challengeToken } = req.body;

    if (!name || !phone || !pin) {
      return res.status(400).json({ 
        success: false, 
        message: 'Name, phone number, and a secure 4-digit PIN are required.' 
      });
    }

    // 1. Validate Captcha Challenge
    if (!captchaAnswer || !challengeToken) {
      return res.status(400).json({
        success: false,
        message: 'Please complete the security captcha puzzle.'
      });
    }

    try {
      const captchaSecret = process.env.CAPTCHA_SECRET || '9upi_captcha_seal_2026';
      const decoded = jwt.verify(challengeToken, captchaSecret);
      if (parseInt(captchaAnswer) !== decoded.answer) {
        return res.status(400).json({
          success: false,
          message: 'Incorrect captcha evaluation. Please retry.'
        });
      }
    } catch (err) {
      return res.status(400).json({
        success: false,
        message: 'Captcha challenge expired. Please refresh captcha.'
      });
    }

    // 2. Clear duplicate phones
    const checkUser = await db.query('SELECT user_id FROM users WHERE phone = $1', [phone]);
    if (checkUser.rows.length > 0) {
      return res.status(409).json({ 
        success: false, 
        message: 'A wallet is already registered with this phone number.' 
      });
    }

    // Hash user's secure access PIN
    const hashedPin = await bcrypt.hash(pin, 10);
    const userId = 'U' + (100000 + Math.floor(Math.random() * 900000));
    const generatedReferralCode = '9UPI' + Math.random().toString(36).substr(2, 4).toUpperCase();

    // Load active settings rewards parameters dynamically from system_settings
    const settingsRes = await db.query('SELECT * FROM system_settings WHERE id = 1');
    const settings = settingsRes.rows[0];
    const newUserReward = parseFloat(settings.new_user_reward || 200.00);

    // Track dynamic referrer if code matching matches user or code
    let referrerId = null;
    if (promoCode && promoCode.trim().length > 0) {
      const refCheck = await db.query(
        'SELECT user_id FROM users WHERE referral_code = $1 OR phone = $2',
        [promoCode.trim().toUpperCase(), promoCode.trim()]
      );
      if (refCheck.rows.length > 0) {
        referrerId = refCheck.rows[0].user_id;
      }
    }

    // Insert new user holding registration rewards
    const signupQuery = `
      INSERT INTO users (user_id, name, phone, pin, wallet_balance, reward_balance, total_earnings, referral_code, referred_by)
      VALUES ($1, $2, $3, $4, 0.00, $5, $5, $6, $7)
      RETURNING user_id, name, phone, wallet_balance, reward_balance, total_earnings, referral_code, referred_by
    `;
    const signupParams = [userId, name, phone, hashedPin, newUserReward, generatedReferralCode, referrerId];
    const newUserResult = await db.query(signupQuery, signupParams);
    const createdUser = newUserResult.rows[0];

    // Log the base signUp transaction log
    const txId = 'TX-REG-' + Math.random().toString(36).substr(2, 6).toUpperCase();
    await db.query(`
      INSERT INTO transactions (transaction_id, user_id, type, amount, status, gateway, utr, details)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `, [txId, userId, 'Reward', newUserReward, 'Success', 'SYSTEM', txId, 'Registration Sign-Up Credit Reward']);

    // Log Referrer log entry (Pending until referred completes first transaction)
    if (referrerId) {
      await db.query(`
        INSERT INTO referrals (referrer_id, referred_user_id, referred_user_name, reward_amount, is_completed)
        VALUES ($1, $2, $3, $4, FALSE)
      `, [referrerId, userId, name, parseFloat(settings.referral_reward || 200.00)]);
      
      await db.logAudit("REFERRAL_LOGGED", "System", `User ${userId} registered under parent referrer ${referrerId}`);
    }

    await db.logAudit("USER_REGISTERED", "System", `Created secure wallet user: ${name} (${userId})`);
    await db.logActivity(userId, "WALLET_REGISTRATION", "Registered secure digital wallet.");

    // Sign active session
    const token = generateToken(userId, 'User');

    return res.status(201).json({
      success: true,
      message: 'Wallet registered and secured successfully!',
      token,
      user: {
        userId: createdUser.user_id,
        name: createdUser.name,
        phone: createdUser.phone,
        walletBalance: parseFloat(createdUser.wallet_balance),
        rewardBalance: parseFloat(createdUser.reward_balance),
        totalEarnings: parseFloat(createdUser.total_earnings),
        referralCode: createdUser.referral_code,
        referredBy: createdUser.referred_by
      }
    });
  } catch (error) {
    console.error('Registration processing failure:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Internal server error processing wallet registration.' 
    });
  }
};

/**
 * Handle user check-in / credentials verification with captcha option
 * POST /api/auth/login
 */
exports.login = async (req, res) => {
  try {
    const { userId, pin, captchaAnswer, challengeToken } = req.body;

    if (!userId || !pin) {
      return res.status(400).json({ 
        success: false, 
        message: 'User ID / Phone and PIN are required parameters.' 
      });
    }

    // Try verifying admin first if ID matches admin
    const checkAdmin = await db.query(
      'SELECT a.*, r.name as role_display FROM admins a JOIN roles r ON a.role_name = r.name WHERE a.admin_id = $1 OR a.email = $2',
      [userId, userId]
    );

    if (checkAdmin.rows.length > 0) {
      const admin = checkAdmin.rows[0];
      const match = await bcrypt.compare(pin, admin.pin);
      if (match) {
        const token = generateToken(admin.admin_id, admin.role_name);
        await db.logAudit("ADMIN_ACCESS_GRANTED", admin.name, `Unlocked administrative terminal: ${admin.role_display}`);
        
        return res.status(200).json({
          success: true,
          message: 'Secure Administrative Panel Unlocked!',
          token,
          user: {
            userId: admin.admin_id,
            name: admin.name,
            email: admin.email,
            role: admin.role_name,
            isAdmin: true
          }
        });
      }
    }

    // Try finding standard User
    const checkUser = await db.query('SELECT * FROM users WHERE user_id = $1 OR phone = $2', [userId, userId]);
    if (checkUser.rows.length === 0) {
      return res.status(401).json({ 
        success: false, 
        message: 'Invalid authorization credentials provided.' 
      });
    }

    const user = checkUser.rows[0];

    if (user.is_blocked) {
      return res.status(403).json({
        success: false,
        message: 'This wallet is permanently locked due to compliance / terms violations.'
      });
    }

    const pinMatch = await bcrypt.compare(pin, user.pin);
    if (!pinMatch) {
      return res.status(401).json({ 
        success: false, 
        message: 'Invalid authorization credentials provided.' 
      });
    }

    // Optional CAPTCHA check for standard user login if supplied
    if (challengeToken && captchaAnswer) {
      try {
        const captchaSecret = process.env.CAPTCHA_SECRET || '9upi_captcha_seal_2026';
        const decoded = jwt.verify(challengeToken, captchaSecret);
        if (parseInt(captchaAnswer) !== decoded.answer) {
          return res.status(400).json({ success: false, message: 'Incorrect captcha evaluation.' });
        }
      } catch (err) {
        return res.status(400).json({ success: false, message: 'Captcha token expired.' });
      }
    }

    const token = generateToken(user.user_id, 'User');
    await db.logActivity(user.user_id, 'USER_LOGIN', 'Wallet successfully unlocked.');

    return res.status(200).json({
      success: true,
      message: 'Secure Wallet Access Unlocked!',
      token,
      user: {
        userId: user.user_id,
        name: user.name,
        phone: user.phone,
        walletBalance: parseFloat(user.wallet_balance),
        rewardBalance: parseFloat(user.reward_balance),
        totalEarnings: parseFloat(user.total_earnings),
        referralCode: user.referral_code,
        referredBy: user.referred_by
      }
    });

  } catch (error) {
    console.error('Wallet clearance error:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Internal server error processing security unlock.' 
    });
  }
};
