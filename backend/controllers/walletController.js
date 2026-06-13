const db = require('../config/db');

/**
 * Fetch transaction history for active user profile
 * GET /api/wallet/transactions
 */
exports.getTransactions = async (req, res) => {
  try {
    const userId = req.user.userId;
    const txRes = await db.query(
      'SELECT transaction_id, user_id, type, amount, currency, gateway, utr, status, details, created_at FROM transactions WHERE user_id = $1 ORDER BY created_at DESC',
      [userId]
    );

    const formattedTxs = txRes.rows.map(tx => ({
      transactionId: tx.transaction_id,
      userId: tx.user_id,
      type: tx.type,
      amount: parseFloat(tx.amount),
      currency: tx.currency,
      gateway: tx.gateway,
      utr: tx.utr,
      status: tx.status,
      details: tx.details,
      timestamp: new Date(tx.created_at).getTime()
    }));

    return res.status(200).json({
      success: true,
      transactions: formattedTxs
    });
  } catch (error) {
    console.error('Transactions reading error:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Failed to access transaction ledger histories.' 
    });
  }
};

/**
 * Submit payment deposit request via gateway
 * POST /api/wallet/deposit
 */
exports.deposit = async (req, res) => {
  const client = await db.pool.connect();
  try {
    const userId = req.user.userId;
    const { amount, gatewayId, utr } = req.body;

    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'A valid deposit amount greater than zero is required.' 
      });
    }

    if (!utr || utr.trim().length < 8) {
      return res.status(400).json({ 
        success: false, 
        message: 'Please provide a valid 12-digit UPI reference UTR number.' 
      });
    }

    // Check for duplicate UTR
    const utrCheck = await db.query('SELECT transaction_id FROM transactions WHERE utr = $1', [utr.trim()]);
    if (utrCheck.rows.length > 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'This UTR identifier has already been submitted or cleared previously.' 
      });
    }

    // Fetch user
    const userRes = await client.query('SELECT user_id, name FROM users WHERE user_id = $1', [userId]);
    if (userRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'User profile mismatch.' });
    }

    // Verify dynamic active gateway
    const gatewayRes = await client.query('SELECT * FROM payment_gateways WHERE id = $1', [gatewayId]);
    const activeGateway = gatewayRes.rows[0] || { name: 'Direct NetBanking', id: null };

    const transactionId = 'TX-DEP-' + Math.random().toString(36).substr(2, 6).toUpperCase();

    // Start database transaction
    await client.query('BEGIN');

    // Create central transactions entry
    await client.query(`
      INSERT INTO transactions (transaction_id, user_id, type, amount, gateway, utr, status, details)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `, [transactionId, userId, 'Deposit', parsedAmount, activeGateway.name, utr.trim(), 'Pending', `Deposited ₹${parsedAmount} via ${activeGateway.name}`]);

    // Create deposit tracking entry
    await client.query(`
      INSERT INTO deposits (transaction_id, user_id, amount, gateway_id, utr, status)
      VALUES ($1, $2, $3, $4, $5, $6)
    `, [transactionId, userId, parsedAmount, activeGateway.id, utr.trim(), 'Pending']);

    await client.query('COMMIT');

    await db.logActivity(userId, 'SUBMIT_DEPOSIT', `Submitted deposit request of ₹${parsedAmount}. UTR: ${utr}`);
    await db.logAudit('DEPOSIT_SUBMITTED', 'User', `Deposit request logged by user ${userId} for INR ${parsedAmount}`);

    client.release();

    return res.status(200).json({
      success: true,
      message: 'Deposit request recorded. It will be credited once verified by support.',
      transaction: {
        transactionId,
        amount: parsedAmount,
        status: 'Pending',
        utr: utr.trim()
      }
    });

  } catch (error) {
    await client.query('ROLLBACK');
    client.release();
    console.error('Deposit request failure:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Error processing deposit ledger creation.' 
    });
  }
};

/**
 * Submit cash clearance withdrawal request
 * POST /api/wallet/withdraw
 */
exports.withdraw = async (req, res) => {
  const client = await db.pool.connect();
  try {
    const userId = req.user.userId;
    const { amount, upiAddress } = req.body;

    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount < 100) {
      return res.status(400).json({ 
        success: false, 
        message: 'Minimum withdrawal amount allowed is ₹100.' 
      });
    }

    if (!upiAddress || !upiAddress.includes('@')) {
      return res.status(400).json({ 
        success: false, 
        message: 'A valid destination UPI VPA ID handle is required.' 
      });
    }

    // Start SQL Transaction to safely deduct ledger value upfront
    await client.query('BEGIN');

    const userRes = await client.query('SELECT wallet_balance FROM users WHERE user_id = $1 FOR UPDATE', [userId]);
    if (userRes.rows.length === 0) {
      await client.query('ROLLBACK');
      client.release();
      return res.status(404).json({ success: false, message: 'User context mismatch.' });
    }

    const currentBalance = parseFloat(userRes.rows[0].wallet_balance);
    if (currentBalance < parsedAmount) {
      await client.query('ROLLBACK');
      client.release();
      return res.status(400).json({ 
        success: false, 
        message: 'Insufficient ledger balance to complete withdrawal request.' 
      });
    }

    // Deduct pending balance upfront
    const finalBalance = currentBalance - parsedAmount;
    await client.query('UPDATE users SET wallet_balance = $1 WHERE user_id = $2', [finalBalance, userId]);

    const transactionId = 'TX-WTD-' + Math.random().toString(36).substr(2, 6).toUpperCase();

    // Insert generic transaction log
    await client.query(`
      INSERT INTO transactions (transaction_id, user_id, type, amount, gateway, utr, status, details)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `, [transactionId, userId, 'Withdrawal', parsedAmount, 'BANK_UPI', '', 'Pending', `Requested withdraw worth ₹${parsedAmount} to ${upiAddress}`]);

    // Insert withdrawal detail entry
    await client.query(`
      INSERT INTO withdrawals (transaction_id, user_id, amount, upi_address, status)
      VALUES ($1, $2, $3, $4, 'Pending')
    `, [transactionId, userId, parsedAmount, upiAddress.trim()]);

    await client.query('COMMIT');
    client.release();

    await db.logActivity(userId, 'SUBMIT_WITHDRAWAL', `Requested withdrawal of ₹${parsedAmount} to ${upiAddress}`);
    await db.logAudit('WITHDRAWAL_SUBMITTED', 'User', `Withdrawal requested for user ${userId} of INR ${parsedAmount}`);

    return res.status(200).json({
      success: true,
      message: 'Withdrawal logged. Funds are frozen while processing payments.',
      walletBalance: finalBalance
    });

  } catch (error) {
    await client.query('ROLLBACK');
    client.release();
    console.error('Withdrawal request failure:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Internal server error logging withdrawal request.' 
    });
  }
};

/**
 * Exchange / Settle dynamic loyalty tokens into spendable cash INR
 * POST /api/wallet/settle
 */
exports.settleTokens = async (req, res) => {
  const client = await db.pool.connect();
  try {
    const userId = req.user.userId;
    const { tokensToRedeem } = req.body;

    const parsedTokens = parseFloat(tokensToRedeem);
    if (isNaN(parsedTokens) || parsedTokens <= 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'Please enter a valid quantity of tokens to settle.' 
      });
    }

    // Start SQL Transaction to prevent race conditions
    await client.query('BEGIN');

    // Retrieve user & active settings
    const userRes = await client.query('SELECT reward_balance, wallet_balance, total_earnings FROM users WHERE user_id = $1 FOR UPDATE', [userId]);
    if (userRes.rows.length === 0) {
      await client.query('ROLLBACK');
      client.release();
      return res.status(404).json({ success: false, message: 'User context mismatch.' });
    }

    const settingsRes = await client.query('SELECT * FROM system_settings WHERE id = 1');
    const settings = settingsRes.rows[0];

    const user = userRes.rows[0];
    const userRewards = parseFloat(user.reward_balance);
    const userWallet = parseFloat(user.wallet_balance);

    if (userRewards < parsedTokens) {
      await client.query('ROLLBACK');
      client.release();
      return res.status(400).json({ 
        success: false, 
        message: 'Insufficient loyalty reward token balance to complete exchange.' 
      });
    }

    // Exchange conversion: tokens * sellRate = INR
    const sellRate = parseFloat(settings.sell_rate || 1.00);
    const inrValueEarned = parsedTokens * sellRate;

    const finalRewards = userRewards - parsedTokens;
    const finalWallet = userWallet + inrValueEarned;

    // Apply updates to user
    await client.query(
      'UPDATE users SET reward_balance = $1, wallet_balance = $2 WHERE user_id = $3',
      [finalRewards, finalWallet, userId]
    );

    const transactionId = 'TX-EXCH-' + Math.random().toString(36).substr(2, 6).toUpperCase();

    // Create exchange ledger log
    await client.query(`
      INSERT INTO transactions (transaction_id, user_id, type, amount, gateway, utr, status, details)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `, [transactionId, userId, 'Exchange Redeem', inrValueEarned, 'Loyalty Settle Engine', transactionId, 'Success', `Exchanged ${parsedTokens} TKN for ₹${inrValueEarned.toFixed(2)} cash rate: ${sellRate}`]);

    await client.query('COMMIT');
    client.release();

    await db.logActivity(userId, 'EXCHANGE_TOKENS', `Redeemed ${parsedTokens} tokens for ₹${inrValueEarned.toFixed(2)} Cash.`);
    await db.logAudit('TOKEN_EXCHANGE', 'System', `Executed token conversion for user ${userId}: ${parsedTokens} TKN to INR ${inrValueEarned}`);

    return res.status(200).json({
      success: true,
      message: `Successfully exchanged ${parsedTokens} reward tokens for ₹${inrValueEarned.toFixed(2)} cash balance!`,
      walletBalance: finalWallet,
      rewardBalance: finalRewards
    });

  } catch (error) {
    await client.query('ROLLBACK');
    client.release();
    console.error('Token conversion failure:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Failed to complete loyalty reward token settlement.' 
    });
  }
};
