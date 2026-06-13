const express = require('express');
const router = express.Router();

// Controllers
const authController = require('../controllers/authController');
const userController = require('../controllers/userController');
const walletController = require('../controllers/walletController');
const adminController = require('../controllers/adminController');

// Middlewares
const authMiddleware = require('../middleware/auth');
const adminAuth = require('../middleware/adminAuth');

// Definition of admin group roles for RBAC filters
const ALL_ADMINS = ['Super Admin', 'Admin', 'Moderator', 'Support Staff'];
const FULL_ADMINS = ['Super Admin', 'Admin'];

// ==========================================
// 🔓 PUBLIC & OPEN ENDPOINTS
// ==========================================
router.get('/auth/captcha', authController.getCaptcha);
router.post('/auth/register', authController.register);
router.post('/auth/login', authController.login);
router.get('/user/config', userController.getPlatformConfig);
router.get('/user/announcements', userController.getAnnouncements);

// ==========================================
// 🔒 SECURED CLIENT ENDPOINTS (Requires active JWT Bearer)
// ==========================================
router.get('/user/profile', authMiddleware, userController.getProfile);
router.post('/user/support', authMiddleware, userController.createSupportTicket);
router.get('/user/support/list', authMiddleware, userController.getSupportTickets);

router.get('/wallet/transactions', authMiddleware, walletController.getTransactions);
router.post('/wallet/deposit', authMiddleware, walletController.deposit);
router.post('/wallet/withdraw', authMiddleware, walletController.withdraw);
router.post('/wallet/settle', authMiddleware, walletController.settleTokens);

// ==========================================
// 🛡️ SECURED SYSTEM ADMINISTRATIVE ENDPOINTS (Requires admin RBAC)
// ==========================================

// Dashboard Analytics & Logs (Permit all administrative accounts)
router.get('/admin/analytics', authMiddleware, adminAuth.allowRoles(ALL_ADMINS), adminController.getAnalytics);
router.get('/admin/audit', authMiddleware, adminAuth.allowRoles(FULL_ADMINS), adminController.getAuditLogs);
router.get('/admin/activity', authMiddleware, adminAuth.allowRoles(FULL_ADMINS), adminController.getActivityLogs);

// User Profile Directory Management
router.get('/admin/users', authMiddleware, adminAuth.allowRoles(ALL_ADMINS), adminController.getUsers);
router.post('/admin/users/adjust', authMiddleware, adminAuth.allowRoles(FULL_ADMINS), adminController.adjustUserBalances);
router.post('/admin/users/toggle-block', authMiddleware, adminAuth.allowRoles(FULL_ADMINS), adminController.toggleUserBlock);

// Ledger Deposits Processing
router.get('/admin/deposits', authMiddleware, adminAuth.allowRoles(ALL_ADMINS), adminController.getDeposits);
router.post('/admin/deposits/approve', authMiddleware, adminAuth.allowRoles(ALL_ADMINS), adminController.approveDeposit);
router.post('/admin/deposits/reject', authMiddleware, adminAuth.allowRoles(ALL_ADMINS), adminController.rejectDeposit);

// Ledger Withdrawal Processing
router.get('/admin/withdrawals', authMiddleware, adminAuth.allowRoles(ALL_ADMINS), adminController.getWithdrawals);
router.post('/admin/withdrawals/approve', authMiddleware, adminAuth.allowRoles(ALL_ADMINS), adminController.approveWithdrawal);
router.post('/admin/withdrawals/reject', authMiddleware, adminAuth.allowRoles(ALL_ADMINS), adminController.rejectWithdrawal);

// Interactive Customer Support Resolutions
router.get('/admin/support', authMiddleware, adminAuth.allowRoles(ALL_ADMINS), adminController.getSupportTickets);
router.post('/admin/support/reply', authMiddleware, adminAuth.allowRoles(ALL_ADMINS), adminController.replySupportTicket);

// Dynamic Announcements Board
router.get('/admin/announcements', authMiddleware, adminAuth.allowRoles(ALL_ADMINS), adminController.getAnnouncements);
router.post('/admin/announcements', authMiddleware, adminAuth.allowRoles(FULL_ADMINS), adminController.createAnnouncement);
router.delete('/admin/announcements/:id', authMiddleware, adminAuth.allowRoles(FULL_ADMINS), adminController.deleteAnnouncement);

// Dynamic Payment Gateway Terminals (Limited to master Super Admin & Admin roles)
router.get('/admin/gateways', authMiddleware, adminAuth.allowRoles(FULL_ADMINS), adminController.getGateways);
router.post('/admin/gateways', authMiddleware, adminAuth.allowRoles(FULL_ADMINS), adminController.createGateway);
router.post('/admin/gateways/update', authMiddleware, adminAuth.allowRoles(FULL_ADMINS), adminController.updateGateway);
router.delete('/admin/gateways/:id', authMiddleware, adminAuth.allowRoles(FULL_ADMINS), adminController.deleteGateway);

// Dynamic Copywriter CMS Modules (Super Admin & Admin roles)
router.get('/admin/cms', authMiddleware, adminAuth.allowRoles(FULL_ADMINS), adminController.getCmsPages);
router.post('/admin/cms', authMiddleware, adminAuth.allowRoles(FULL_ADMINS), adminController.updateCmsPage);

// Global Reward & Setting Multipliers (Limited to full admins)
router.get('/admin/settings', authMiddleware, adminAuth.allowRoles(FULL_ADMINS), adminController.getSettings);
router.post('/admin/settings', authMiddleware, adminAuth.allowRoles(FULL_ADMINS), adminController.updateSettings);

module.exports = router;
