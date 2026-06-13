const db = require('../config/db');

/**
 * Fetch secured user profile
 * GET /api/user/profile
 */
exports.getProfile = async (req, res) => {
  try {
    const userId = req.user.userId;
    const userRes = await db.query(
      'SELECT user_id, name, phone, wallet_balance, reward_balance, total_earnings, referral_code, referred_by, is_blocked FROM users WHERE user_id = $1',
      [userId]
    );

    if (userRes.rows.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'Active profile context not found.' 
      });
    }

    const profile = userRes.rows[0];

    return res.status(200).json({
      success: true,
      profile: {
        userId: profile.user_id,
        name: profile.name,
        phone: profile.phone,
        walletBalance: parseFloat(profile.wallet_balance),
        rewardBalance: parseFloat(profile.reward_balance),
        totalEarnings: parseFloat(profile.total_earnings),
        referralCode: profile.referral_code,
        referredBy: profile.referred_by,
        isBlocked: profile.is_blocked
      }
    });
  } catch (error) {
    console.error('Profile access error:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Critical error reading core profile dataset.' 
    });
  }
};

/**
 * Retrieve current active dynamic configuration constraints, gateways, & TG links
 * GET /api/user/config
 */
exports.getPlatformConfig = async (req, res) => {
  try {
    const settingsRes = await db.query('SELECT * FROM system_settings WHERE id = 1');
    const settings = settingsRes.rows[0];

    const gatewaysRes = await db.query(
      'SELECT id, name, api_url, is_enabled, is_default FROM payment_gateways WHERE is_enabled = TRUE'
    );
    const gateways = gatewaysRes.rows;

    // Load active CMS elements to update headings or copy on-the-fly without coding edits
    const cmsRes = await db.query('SELECT page_key, title, content FROM content_management');
    const cms = {};
    cmsRes.rows.forEach(row => {
      cms[row.page_key] = { title: row.title, content: row.content };
    });

    return res.status(200).json({
      success: true,
      settings: {
        newUserReward: parseFloat(settings.new_user_reward),
        transactionReward: parseFloat(settings.transaction_reward),
        referralReward: parseFloat(settings.referral_reward),
        buyRate: parseFloat(settings.buy_rate),
        sellRate: parseFloat(settings.sell_rate),
        tgChannel: settings.tg_channel,
        tgHeadAgent: settings.tg_head_agent
      },
      gateways,
      content: cms
    });
  } catch (error) {
    console.error('Settings verification failure:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Failed to access dynamic platform configurations.' 
    });
  }
};

/**
 * Submit user support inquiry / assistance ticket
 * POST /api/user/support
 */
exports.createSupportTicket = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { subject, message } = req.body;

    if (!message || message.trim().length === 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'Support message can not be submitted empty.' 
      });
    }

    const ticketQuery = `
      INSERT INTO support_tickets (user_id, subject, message, status)
      VALUES ($1, $2, $3, 'Open')
      RETURNING ticket_id, subject, message, status, created_at
    `;
    const ticketRes = await db.query(ticketQuery, [userId, subject || 'General Query', message]);
    
    await db.logActivity(userId, 'CREATE_SUPPORT_TICKET', `Ticket #${ticketRes.rows[0].ticket_id} submitted.`);

    return res.status(201).json({
      success: true,
      message: 'Support assistance ticket logged successfully.',
      ticket: ticketRes.rows[0]
    });
  } catch (error) {
    console.error('Support logging failure:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Error creating support request.' 
    });
  }
};

/**
 * Fetch all registered support tickets for user
 * GET /api/user/support/list
 */
exports.getSupportTickets = async (req, res) => {
  try {
    const userId = req.user.userId;
    const ticketsRes = await db.query(
      'SELECT ticket_id, subject, message, reply, status, created_at FROM support_tickets WHERE user_id = $1 ORDER BY created_at DESC',
      [userId]
    );

    return res.status(200).json({
      success: true,
      tickets: ticketsRes.rows
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Could not fetch support history.' });
  }
};

/**
 * Fetch dynamic news announcements board
 * GET /api/user/announcements
 */
exports.getAnnouncements = async (req, res) => {
  try {
    const board = await db.query('SELECT id, title, content, created_at FROM announcements WHERE is_active = TRUE ORDER BY created_at DESC');
    return res.status(200).json({
      success: true,
      announcements: board.rows
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Could not fetch announcements.' });
  }
};
