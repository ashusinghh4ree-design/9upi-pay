const db = require('../config/db');

/**
 * Access analytics telemetry cards
 * GET /api/admin/analytics
 */
exports.getAnalytics = async (req, res) => {
  try {
    const totalUsersRes = await db.query('SELECT COUNT(*) as count FROM users');
    const totalDepositsRes = await db.query("SELECT SUM(amount) as sum FROM transactions WHERE type = 'Deposit' AND status = 'Success'");
    const totalWithdrawalsRes = await db.query("SELECT SUM(amount) as sum FROM transactions WHERE type = 'Withdrawal' AND status = 'Success'");
    const activeTicketsRes = await db.query("SELECT COUNT(*) as count FROM support_tickets WHERE status = 'Open'");
    const logsCountRes = await db.query('SELECT COUNT(*) as count FROM audit_logs');

    return res.status(200).json({
      success: true,
      analytics: {
        totalUsers: parseInt(totalUsersRes.rows[0].count),
        totalDeposits: parseFloat(totalDepositsRes.rows[0].sum || 0.00),
        totalWithdrawals: parseFloat(totalWithdrawalsRes.rows[0].sum || 0.00),
        activeTickets: parseInt(activeTicketsRes.rows[0].count),
        totalAudits: parseInt(logsCountRes.rows[0].count)
      }
    });
  } catch (error) {
    console.error('Analytics load error:', error);
    return res.status(500).json({ success: false, message: 'Administrative analytics currently unavailable.' });
  }
};

/**
 * List all users
 * GET /api/admin/users
 */
exports.getUsers = async (req, res) => {
  try {
    const usersRes = await db.query(
      'SELECT user_id, name, phone, wallet_balance, reward_balance, total_earnings, referral_code, referred_by, is_blocked, created_at FROM users ORDER BY created_at DESC'
    );
    const users = usersRes.rows.map(u => ({
      userId: u.user_id,
      name: u.name,
      phone: u.phone,
      walletBalance: parseFloat(u.wallet_balance),
      rewardBalance: parseFloat(u.reward_balance),
      totalEarnings: parseFloat(u.total_earnings),
      referralCode: u.referral_code,
      referredBy: u.referred_by || '',
      isBlocked: u.is_blocked,
      createdAt: u.created_at
    }));

    return res.status(200).json({ success: true, users });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Could not fetch user registrations.' });
  }
};

/**
 * Adjust user balances manually (credit / debit)
 * POST /api/admin/users/adjust
 */
exports.adjustUserBalances = async (req, res) => {
  const client = await db.pool.connect();
  try {
    const { userId, walletDelta, rewardDelta } = req.body;
    const adminId = req.user.userId;

    const wDelta = parseFloat(walletDelta || 0);
    const rDelta = parseFloat(rewardDelta || 0);

    await client.query('BEGIN');

    const userRes = await client.query('SELECT name, wallet_balance, reward_balance, total_earnings FROM users WHERE user_id = $1 FOR UPDATE', [userId]);
    if (userRes.rows.length === 0) {
      await client.query('ROLLBACK');
      client.release();
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    const user = userRes.rows[0];
    const newWallet = Math.max(0, parseFloat(user.wallet_balance) + wDelta);
    const newReward = Math.max(0, parseFloat(user.reward_balance) + rDelta);
    // Only adjust total_earnings if we positive check
    const newEarnings = parseFloat(user.total_earnings) + (wDelta > 0 ? wDelta : 0) + (rDelta > 0 ? rDelta : 0);

    await client.query(
      'UPDATE users SET wallet_balance = $1, reward_balance = $2, total_earnings = $3 WHERE user_id = $4',
      [newWallet, newReward, newEarnings, userId]
    );

    // Create tracking transaction entry
    const adjustTxId = 'TX-ADJ-' + Math.random().toString(36).substr(2, 6).toUpperCase();
    await client.query(`
      INSERT INTO transactions (transaction_id, user_id, type, amount, gateway, status, details)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
    `, [adjustTxId, userId, 'Reward', wDelta !== 0 ? wDelta : rDelta, 'SYSTEM_ADMIN_ADJUST', 'Success', `Manual adjustment applied: Wallet offset: ${wDelta}, Rewards offset: ${rDelta}`]);

    await client.query('COMMIT');
    client.release();

    const detailText = `Admin adjusted balance for ${userId}: Wallet=${wDelta}, Reward=${rDelta}`;
    await db.logAudit('BALANCE_ADJUST', adminId, detailText);

    return res.status(200).json({
      success: true,
      message: 'Balances updated successfully!',
      user: {
        userId,
        walletBalance: newWallet,
        rewardBalance: newReward
      }
    });

  } catch (error) {
    await client.query('ROLLBACK');
    client.release();
    console.error('Adjustment manual failure:', error);
    return res.status(500).json({ success: false, message: 'Error processing balance updates.' });
  }
};

/**
 * Toggle lock/block status of user
 * POST /api/admin/users/toggle-block
 */
exports.toggleUserBlock = async (req, res) => {
  try {
    const { userId } = req.body;
    const adminId = req.user.userId;

    const currentRes = await db.query('SELECT is_blocked, name FROM users WHERE user_id = $1', [userId]);
    if (currentRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    const state = !currentRes.rows[0].is_blocked;
    await db.query('UPDATE users SET is_blocked = $1 WHERE user_id = $2', [state, userId]);
    await db.logAudit('USER_BLOCK_TOGGLE', adminId, `Toggled block status of ${userId} (${currentRes.rows[0].name}) to ${state}`);

    return res.status(200).json({
      success: true,
      message: `User is now ${state ? 'blocked' : 'unblocked'}.`
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Block status error.' });
  }
};

/**
 * List all deposit requests
 * GET /api/admin/deposits
 */
exports.getDeposits = async (req, res) => {
  try {
    const depositsRes = await db.query(`
      SELECT d.id, d.transaction_id, d.user_id, u.name as user_name, d.amount, d.gateway_id, pg.name as gateway_name, d.utr, d.status, d.created_at
      FROM deposits d
      JOIN users u ON d.user_id = u.user_id
      LEFT JOIN payment_gateways pg ON d.gateway_id = pg.id
      ORDER BY d.created_at DESC
    `);
    
    return res.status(200).json({
      success: true,
      deposits: depositsRes.rows
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Error fetching deposits' });
  }
};

/**
 * Approve deposit transaction, crediting wallet & processing referrers reward payouts
 * POST /api/admin/deposits/approve
 */
exports.approveDeposit = async (req, res) => {
  const client = await db.pool.connect();
  try {
    const { transactionId } = req.body;
    const adminId = req.user.userId;

    await client.query('BEGIN');

    // 1. Resolve deposit and locks transaction
    const txSelect = await client.query('SELECT * FROM transactions WHERE transaction_id = $1 FOR UPDATE', [transactionId]);
    if (txSelect.rows.length === 0) {
      await client.query('ROLLBACK');
      client.release();
      return res.status(404).json({ success: false, message: 'Transaction target not found.' });
    }

    const tx = txSelect.rows[0];
    if (tx.status !== 'Pending') {
      await client.query('ROLLBACK');
      client.release();
      return res.status(400).json({ success: false, message: 'This transaction has already been processed previously.' });
    }

    const amount = parseFloat(tx.amount);
    const userId = tx.user_id;

    // 2. Clear deposit status
    await client.query("UPDATE deposits SET status = 'Approved' WHERE transaction_id = $1", [transactionId]);
    await client.query("UPDATE transactions SET status = 'Success' WHERE transaction_id = $1", [transactionId]);

    // 3. Credit user's wallet_balance
    const userRes = await client.query('SELECT wallet_balance, reward_balance, total_earnings, name, referred_by FROM users WHERE user_id = $1 FOR UPDATE', [userId]);
    const user = userRes.rows[0];

    const currentWallet = parseFloat(user.wallet_balance);
    const newWallet = currentWallet + amount;
    const newEarnings = parseFloat(user.total_earnings) + amount;

    await client.query('UPDATE users SET wallet_balance = $1, total_earnings = $2 WHERE user_id = $3', [newWallet, newEarnings, userId]);

    // 4. Issue Transaction reward points
    const settingsRes = await client.query('SELECT * FROM system_settings WHERE id = 1');
    const settings = settingsRes.rows[0];
    const transactionReward = parseFloat(settings.transaction_reward || 200.00);

    if (transactionReward > 0) {
      const rewardTxId = 'TX-REW-' + Math.random().toString(36).substr(2, 6).toUpperCase();
      await client.query(`
        INSERT INTO transactions (transaction_id, user_id, type, amount, status, gateway, utr, details)
        VALUES ($1, $2, 'Reward', $3, 'Success', 'SYSTEM', $1, 'Deposit Loyalty Speed Reward')
      `, [rewardTxId, userId, transactionReward]);

      await client.query('UPDATE users SET reward_balance = reward_balance + $1, total_earnings = total_earnings + $1 WHERE user_id = $2', [transactionReward, userId]);
    }

    // 5. Trigger referral completion rewards if referrer exist
    if (user.referred_by) {
      const parentId = user.referred_by;
      
      // Look for a pending referral mapping
      const refCheck = await client.query(
        'SELECT id, reward_amount FROM referrals WHERE referrer_id = $1 AND referred_user_id = $2 AND is_completed = FALSE',
        [parentId, userId]
      );

      if (refCheck.rows.length > 0) {
        const referralId = refCheck.rows[0].id;
        const referralRewardAmount = parseFloat(refCheck.rows[0].reward_amount || settings.referral_reward || 200.00);

        // Mark completed
        await client.query('UPDATE referrals SET is_completed = TRUE WHERE id = $1', [referralId]);

        // Credit parent referrer's rewards
        await client.query(
          'UPDATE users SET reward_balance = reward_balance + $1, total_earnings = total_earnings + $1 WHERE user_id = $2',
          [referralRewardAmount, parentId]
        );

        // Logs referral reward transaction
        const refBonusTxId = 'TX-REF-' + Math.random().toString(36).substr(2, 6).toUpperCase();
        await client.query(`
          INSERT INTO transactions (transaction_id, user_id, type, amount, status, gateway, utr, details)
          VALUES ($1, $2, 'Referral Bonus', $3, 'Success', 'SYSTEM', $1, $4)
        `, [refBonusTxId, parentId, referralRewardAmount, `Referral invite payout for ${user.name}`]);

        await client.query(`
          INSERT INTO notifications (user_id, title, message)
          VALUES ($1, 'Referral Bonus Received!', 'Your referral of ${user.name} has completed their first payment. ₹${referralRewardAmount} equivalent tokens credited!')
        `, [parentId]);
      }
    }

    await client.query('COMMIT');
    client.release();

    await db.logAudit('DEPOSIT_APPROVE', adminId, `Approved deposit tx ${transactionId} of ₹${amount} for user $${userId}`);

    return res.status(200).json({
      success: true,
      message: 'Deposit approved, wallet credited, and rewards cleared!'
    });

  } catch (error) {
    await client.query('ROLLBACK');
    client.release();
    console.error('Deposit clearing failure:', error);
    return res.status(500).json({ success: false, message: 'Failed to clear deposit transaction.' });
  }
};

/**
 * Reject deposit transaction
 * POST /api/admin/deposits/reject
 */
exports.rejectDeposit = async (req, res) => {
  try {
    const { transactionId } = req.body;
    const adminId = req.user.userId;

    const txCheck = await db.query('SELECT status FROM transactions WHERE transaction_id = $1', [transactionId]);
    if (txCheck.rows.length === 0 || txCheck.rows[0].status !== 'Pending') {
      return res.status(400).json({ success: false, message: 'Transaction can not be rejected.' });
    }

    await db.query("UPDATE deposits SET status = 'Rejected' WHERE transaction_id = $1", [transactionId]);
    await db.query("UPDATE transactions SET status = 'Rejected' WHERE transaction_id = $1", [transactionId]);
    
    await db.logAudit('DEPOSIT_REJECT', adminId, `Rejected deposit tx ${transactionId}`);

    return res.status(200).json({ success: true, message: 'Deposit request has been marked Rejected.' });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Deposit rejection fail.' });
  }
};

/**
 * List all cash withdrawal tickets
 * GET /api/admin/withdrawals
 */
exports.getWithdrawals = async (req, res) => {
  try {
    const withdrawalsRes = await db.query(`
      SELECT w.id, w.transaction_id, w.user_id, u.name as user_name, w.amount, w.upi_address, w.status, w.created_at
      FROM withdrawals w
      JOIN users u ON w.user_id = u.user_id
      ORDER BY w.created_at DESC
    `);
    return res.status(200).json({ success: true, withdrawals: withdrawalsRes.rows });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Error retrieving withdrawals' });
  }
};

/**
 * Approve payout withdrawal requests
 * POST /api/admin/withdrawals/approve
 */
exports.approveWithdrawal = async (req, res) => {
  try {
    const { transactionId, utr } = req.body;
    const adminId = req.user.userId;

    const txCheck = await db.query('SELECT status, user_id, amount FROM transactions WHERE transaction_id = $1', [transactionId]);
    if (txCheck.rows.length === 0 || txCheck.rows[0].status !== 'Pending') {
      return res.status(400).json({ success: false, message: 'Invalid transaction clearance request.' });
    }

    const tx = txCheck.rows[0];

    await db.query("UPDATE withdrawals SET status = 'Approved', actioned_by = $1 WHERE transaction_id = $2", [adminId, transactionId]);
    await db.query("UPDATE transactions SET status = 'Success', utr = $1 WHERE transaction_id = $2", [utr || `WTD-${Date.now()}`, transactionId]);

    await db.logAudit('WITHDRAW_APPROVE', adminId, `Approved withdrawal transaction ID ${transactionId} worth ₹${tx.amount}`);

    return res.status(200).json({ success: true, message: 'Withdrawal successfully approved.' });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Withdrawal clearance failure.' });
  }
};

/**
 * Reject withdrawal, returning frozen ledger amounts back to wallet
 * POST /api/admin/withdrawals/reject
 */
exports.rejectWithdrawal = async (req, res) => {
  const client = await db.pool.connect();
  try {
    const { transactionId } = req.body;
    const adminId = req.user.userId;

    await client.query('BEGIN');

    const txCheck = await client.query('SELECT status, user_id, amount FROM transactions WHERE transaction_id = $1 FOR UPDATE', [transactionId]);
    if (txCheck.rows.length === 0 || txCheck.rows[0].status !== 'Pending') {
      await client.query('ROLLBACK');
      client.release();
      return res.status(400).json({ success: false, message: 'Transaction reject invalid.' });
    }

    const tx = txCheck.rows[0];
    const amount = parseFloat(tx.amount);
    const userId = tx.user_id;

    // Refund frozen balances to user
    await client.query('UPDATE users SET wallet_balance = wallet_balance + $1 WHERE user_id = $2', [amount, userId]);
    
    // Set statuses
    await client.query("UPDATE withdrawals SET status = 'Rejected', actioned_by = $1 WHERE transaction_id = $2", [adminId, transactionId]);
    await client.query("UPDATE transactions SET status = 'Rejected' WHERE transaction_id = $2", [transactionId]);

    // Send notifications
    await client.query(`
      INSERT INTO notifications (user_id, title, message)
      VALUES ($1, 'Withdrawal Rejected', 'Your withdrawal request of ₹${amount} was declined and refunded to your wallet balance.')
    `, [userId]);

    await client.query('COMMIT');
    client.release();

    await db.logAudit('WITHDRAW_REJECT', adminId, `Rejected withdrawal transaction ID ${transactionId} of ₹${amount}`);

    return res.status(200).json({ success: true, message: 'Withdrawal request rejected. Funds refunded successfully.' });

  } catch (error) {
    await client.query('ROLLBACK');
    client.release();
    console.error('Rejection error:', error);
    return res.status(500).json({ success: false, message: 'Rejection error processing.' });
  }
};

/**
 * Manage payment gateways CRUD
 */
exports.getGateways = async (req, res) => {
  try {
    const gw = await db.query('SELECT * FROM payment_gateways ORDER BY id ASC');
    return res.json({ success: true, gateways: gw.rows });
  } catch (e) {
    return res.status(500).json({ success: false, error: e.message });
  }
};

exports.createGateway = async (req, res) => {
  try {
    const { id, name, apiUrl, apiKey, secretKey, merchantId, callbackUrl, webhookUrl } = req.body;
    await db.query(`
      INSERT INTO payment_gateways (id, name, api_url, api_key, secret_key, merchant_id, callback_url, webhook_url)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `, [id, name, apiUrl, apiKey, secretKey, merchantId, callbackUrl, webhookUrl]);

    await db.logAudit('GATEWAY_CREATE', req.user.userId, `Created gateway: ${name}`);
    return res.json({ success: true, message: 'Gateway created successfully.' });
  } catch (e) {
    return res.status(500).json({ success: false, error: e.message });
  }
};

exports.updateGateway = async (req, res) => {
  try {
    const { id, name, apiUrl, apiKey, secretKey, merchantId, isEnabled, isDefault } = req.body;
    
    if (isDefault) {
      // Unset previous defaults
      await db.query('UPDATE payment_gateways SET is_default = FALSE');
    }

    await db.query(`
      UPDATE payment_gateways
      SET name = $1, api_url = $2, api_key = $3, secret_key = $4, merchant_id = $5, is_enabled = $6, is_default = $7
      WHERE id = $8
    `, [name, apiUrl, apiKey, secretKey, merchantId, isEnabled, isDefault, id]);

    await db.logAudit('GATEWAY_UPDATE', req.user.userId, `Updated gateway specs: ${name}`);
    return res.json({ success: true, message: 'Gateway modified.' });
  } catch (e) {
    return res.status(500).json({ success: false, error: e.message });
  }
};

exports.deleteGateway = async (req, res) => {
  try {
    const { id } = req.params;
    await db.query('DELETE FROM payment_gateways WHERE id = $1', [id]);
    await db.logAudit('GATEWAY_DELETE', req.user.userId, `Deleted gateway ${id}`);
    return res.json({ success: true, message: 'Gateway deleted successfully.' });
  } catch (e) {
    return res.status(500).json({ success: false, error: e.message });
  }
};

/**
 * Manage Content Pages copy dynamically
 */
exports.getCmsPages = async (req, res) => {
  try {
    const cms = await db.query('SELECT * FROM content_management');
    return res.json({ success: true, cms: cms.rows });
  } catch (e) {
    return res.status(500).json({ success: false });
  }
};

exports.updateCmsPage = async (req, res) => {
  try {
    const { pageKey, title, content } = req.body;
    await db.query('UPDATE content_management SET title = $1, content = $2, updated_at = NOW() WHERE page_key = $3', [title, content, pageKey]);
    await db.logAudit('CMS_UPDATE', req.user.userId, `Updated page copywriting: ${pageKey}`);
    return res.json({ success: true, message: 'Page content modified.' });
  } catch (e) {
    return res.status(500).json({ success: false });
  }
};

/**
 * Support Tickets Resolver
 */
exports.getSupportTickets = async (req, res) => {
  try {
    const tickets = await db.query(`
      SELECT st.*, u.name as user_name, u.phone as user_phone 
      FROM support_tickets st 
      JOIN users u ON st.user_id = u.user_id 
      ORDER BY st.created_at DESC
    `);
    return res.json({ success: true, tickets: tickets.rows });
  } catch (e) {
    return res.status(500).json({ success: false });
  }
};

exports.replySupportTicket = async (req, res) => {
  try {
    const { ticketId, reply } = req.body;
    await db.query("UPDATE support_tickets SET reply = $1, status = 'Resolved' WHERE ticket_id = $2", [reply, ticketId]);
    return res.json({ success: true, message: 'Inquiry response logged and marked Resolved.' });
  } catch (e) {
    return res.status(500).json({ success: false });
  }
};

/**
 * System Settings Configuration Modifiers
 */
exports.getSettings = async (req, res) => {
  try {
    const set = await db.query('SELECT * FROM system_settings WHERE id = 1');
    return res.json({ success: true, settings: set.rows[0] });
  } catch (e) {
    return res.status(500).json({ success: false });
  }
};

exports.updateSettings = async (req, res) => {
  try {
    const { newUserReward, transactionReward, referralReward, buyRate, sellRate } = req.body;
    await db.query(`
      UPDATE system_settings
      SET new_user_reward = $1, transaction_reward = $2, referral_reward = $3, buy_rate = $4, sell_rate = $5
      WHERE id = 1
    `, [newUserReward, transactionReward, referralReward, buyRate, sellRate]);

    await db.logAudit('SETTINGS_UPDATE', req.user.userId, `Global rewards configured updated.`);
    return res.json({ success: true, message: 'Platform parameters successfully updated.' });
  } catch (e) {
    return res.status(500).json({ success: false, error: e.message });
  }
};

/**
 * Logging and trackers
 */
exports.getAuditLogs = async (req, res) => {
  try {
    const logs = await db.query('SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 500');
    return res.json({ success: true, logs: logs.rows });
  } catch (e) {
    return res.status(500).json({ success: false });
  }
};

exports.getActivityLogs = async (req, res) => {
  try {
    const logs = await db.query(`
      SELECT al.*, u.name as user_name 
      FROM activity_logs al 
      JOIN users u ON al.user_id = u.user_id 
      ORDER BY al.created_at DESC LIMIT 500
    `);
    return res.json({ success: true, logs: logs.rows });
  } catch (e) {
    return res.status(500).json({ success: false });
  }
};

/**
 * Custom announcements management
 */
exports.getAnnouncements = async (req, res) => {
  try {
    const ann = await db.query('SELECT * FROM announcements ORDER BY created_at DESC');
    return res.json({ success: true, announcements: ann.rows });
  } catch (e) {
    return res.status(500).json({ success: false });
  }
};

exports.createAnnouncement = async (req, res) => {
  try {
    const { title, content } = req.body;
    await db.query('INSERT INTO announcements (title, content) VALUES ($1, $2)', [title, content]);
    return res.json({ success: true, message: 'Announcement created.' });
  } catch (e) {
    return res.status(500).json({ success: false });
  }
};

exports.deleteAnnouncement = async (req, res) => {
  try {
    const { id } = req.params;
    await db.query('DELETE FROM announcements WHERE id = $1', [id]);
    return res.json({ success: true, message: 'Announcement deleted.' });
  } catch (e) {
    return res.status(500).json({ success: false });
  }
};
