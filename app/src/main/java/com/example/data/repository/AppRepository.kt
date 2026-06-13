package com.example.data.repository

import com.example.data.dao.AppDao
import com.example.data.model.*
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.firstOrNull
import kotlinx.coroutines.withContext
import java.util.UUID

class AppRepository(private val appDao: AppDao) {

    val settingsFlow: Flow<AppSettings?> = appDao.getSettingsFlow()
    val currentUserFlow: Flow<User?> = appDao.getCurrentUserFlow()
    val allUsersFlow: Flow<List<User>> = appDao.getAllUsersFlow()
    val allReferralsFlow: Flow<List<Referral>> = appDao.getAllReferralsFlow()
    val allTransactionsFlow: Flow<List<WalletTransaction>> = appDao.getAllTransactionsFlow()
    val gatewaysFlow: Flow<List<PaymentGateway>> = appDao.getGatewaysFlow()
    val auditLogsFlow: Flow<List<AuditLog>> = appDao.getAuditLogsFlow()

    fun getUserTransactions(userId: String): Flow<List<WalletTransaction>> {
        return appDao.getUserTransactionsFlow(userId)
    }

    fun getUserReferrals(userId: String): Flow<List<Referral>> {
        return appDao.getReferralsFlow(userId)
    }

    suspend fun getAppSettings(): AppSettings {
        return withContext(Dispatchers.IO) {
            appDao.getSettings() ?: AppSettings().also {
                appDao.insertSettings(it)
            }
        }
    }

    suspend fun updateSettings(settings: AppSettings) = withContext(Dispatchers.IO) {
        appDao.insertSettings(settings)
        insertAudit("Settings Updated", "Admin modified reward parameters or rates.")
    }

    suspend fun loginAsUser(userId: String, pin: String): Boolean = withContext(Dispatchers.IO) {
        val user = appDao.getUser(userId)
        if (user != null && user.pin == pin && !user.isBlocked) {
            // Unset current other user
            val currentUser = appDao.getCurrentUser()
            if (currentUser != null) {
                appDao.insertUser(currentUser.copy(isCurrent = false))
            }
            appDao.insertUser(user.copy(isCurrent = true))
            insertAudit("User Login", "User $userId logged in successfully.")
            true
        } else {
            false
        }
    }

    suspend fun registerUser(name: String, phone: String, pin: String, referredByCode: String): User? = withContext(Dispatchers.IO) {
        val userId = (10000000 + (Math.random() * 90000000).toInt()).toString()
        val refCode = "9UPI" + UUID.randomUUID().toString().take(4).uppercase()
        
        // Find referrer if referredCode is provided
        var referrer: User? = null
        if (referredByCode.isNotBlank()) {
            val users = appDao.getAllUsersFlow().firstOrNull() ?: emptyList()
            referrer = users.find { it.referralCode == referredByCode }
        }

        val settings = getAppSettings()
        val newUser = User(
            userId = userId,
            name = name,
            phone = phone,
            pin = pin,
            walletBalance = 0.0,
            rewardBalance = settings.newUserReward,
            totalEarnings = settings.newUserReward,
            referralCode = refCode,
            referredBy = referrer?.userId ?: ""
        )
        appDao.insertUser(newUser)

        // Switch active user to new registered user
        val currentUser = appDao.getCurrentUser()
        if (currentUser != null) {
            appDao.insertUser(currentUser.copy(isCurrent = false))
        }
        appDao.insertUser(newUser.copy(isCurrent = true))

        // Create Referral log if referee completes registration
        if (referrer != null) {
            val referralLog = Referral(
                referrerId = referrer.userId,
                referredUserId = userId,
                referredUserName = name,
                rewardAmount = settings.referralReward,
                isCompleted = false
            )
            appDao.insertReferral(referralLog)
            insertAudit("New Referral Created", "User $userId registered via code from ${referrer.userId}")
        }

        // Add transaction log for signup reward
        val signUpTx = WalletTransaction(
            transactionId = "TX-REG-" + UUID.randomUUID().toString().take(6).uppercase(),
            userId = userId,
            type = "Reward",
            amount = settings.newUserReward,
            gateway = "SYSTEM",
            utr = "SYSTEM",
            status = "Success",
            details = "Registration Sign-Up Bonus Credit"
        )
        appDao.insertTransaction(signUpTx)

        insertAudit("User Registered", "User $userId ($name) created successfully.")
        newUser
    }

    suspend fun createDepositRequest(userId: String, amount: Double, gatewayId: String, utr: String): Boolean = withContext(Dispatchers.IO) {
        val user = appDao.getUser(userId) ?: return@withContext false
        val txId = "TX-DEP-" + UUID.randomUUID().toString().take(6).uppercase()
        val gateway = appDao.getGateways().find { it.id == gatewayId }
        val gatewayName = gateway?.name ?: gatewayId

        val transaction = WalletTransaction(
            transactionId = txId,
            userId = userId,
            type = "Deposit",
            amount = amount,
            gateway = gatewayName,
            utr = utr,
            status = "Pending",
            details = "Deposit of $amount INR via $gatewayName"
        )
        appDao.insertTransaction(transaction)
        insertAudit("Deposit Pending", "User $userId submitted deposit request for $amount INR, UTR: $utr.")
        true
    }

    suspend fun createWithdrawalRequest(userId: String, amount: Double, details: String): Boolean = withContext(Dispatchers.IO) {
        val user = appDao.getUser(userId) ?: return@withContext false
        if (user.walletBalance < amount) return@withContext false

        // Deduct from balance upfront (temporary pending state holding)
        val updatedUser = user.copy(walletBalance = user.walletBalance - amount)
        appDao.insertUser(updatedUser)

        val txId = "TX-WTD-" + UUID.randomUUID().toString().take(6).uppercase()
        val transaction = WalletTransaction(
            transactionId = txId,
            userId = userId,
            type = "Withdrawal",
            amount = amount,
            gateway = "BANK_UPI",
            utr = "",
            status = "Pending",
            details = "Withdrawal details: $details"
        )
        appDao.insertTransaction(transaction)
        insertAudit("Withdrawal Pending", "User $userId requested withdrawal of $amount INR.")
        true
    }

    suspend fun buyCoins(userId: String, inrAmount: Double): Boolean = withContext(Dispatchers.IO) {
        val user = appDao.getUser(userId) ?: return@withContext false
        val settings = getAppSettings()
        val rate = settings.buyRate
        val tokensToBuy = inrAmount / rate

        if (user.walletBalance < inrAmount) return@withContext false

        // Deduct wallet balance, add to user reward/token balance
        val updatedUser = user.copy(
            walletBalance = user.walletBalance - inrAmount,
            rewardBalance = user.rewardBalance + tokensToBuy,
            totalEarnings = user.totalEarnings + tokensToBuy
        )
        appDao.insertUser(updatedUser)

        val txId = "TX-BUY-" + UUID.randomUUID().toString().take(6).uppercase()
        val transaction = WalletTransaction(
            transactionId = txId,
            userId = userId,
            type = "Buy",
            amount = inrAmount,
            gateway = "LOCAL",
            utr = "AUTO_SETTLE",
            status = "Success",
            details = "Bought $tokensToBuy tokens at rate $rate INR/token"
        )
        appDao.insertTransaction(transaction)
        insertAudit("Asset Buy", "User $userId bought $tokensToBuy tokens.")
        true
    }

    suspend fun sellCoins(userId: String, tokenAmount: Double): Boolean = withContext(Dispatchers.IO) {
        val user = appDao.getUser(userId) ?: return@withContext false
        val settings = getAppSettings()
        val rate = settings.sellRate
        val inrValue = tokenAmount * rate

        if (user.rewardBalance < tokenAmount) return@withContext false

        // Deduct token, add inr to wallet
        val updatedUser = user.copy(
            rewardBalance = user.rewardBalance - tokenAmount,
            walletBalance = user.walletBalance + inrValue
        )
        appDao.insertUser(updatedUser)

        val txId = "TX-SEL-" + UUID.randomUUID().toString().take(6).uppercase()
        val transaction = WalletTransaction(
            transactionId = txId,
            userId = userId,
            type = "Sell",
            amount = inrValue,
            gateway = "LOCAL",
            utr = "AUTO_SETTLE",
            status = "Success",
            details = "Sold $tokenAmount tokens at rate $rate INR/token (Credited $inrValue INR)"
        )
        appDao.insertTransaction(transaction)
        insertAudit("Asset Sell", "User $userId sold $tokenAmount tokens for $inrValue INR.")
        true
    }

    suspend fun verifyAndChangePin(userId: String, oldPin: String, newPin: String): Boolean = withContext(Dispatchers.IO) {
        val user = appDao.getUser(userId) ?: return@withContext false
        if (user.pin != oldPin) return@withContext false

        appDao.insertUser(user.copy(pin = newPin))
        insertAudit("Security Update", "User $userId pin changed successfully.")
        true
    }

    // Admin Actions
    suspend fun approveDeposit(txId: String) = withContext(Dispatchers.IO) {
        val allTx = appDao.getAllTransactionsFlow().firstOrNull() ?: emptyList()
        val tx = allTx.find { it.transactionId == txId } ?: return@withContext
        if (tx.status != "Pending") return@withContext

        val updatedTx = tx.copy(status = "Success")
        appDao.insertTransaction(updatedTx)

        val user = appDao.getUser(tx.userId) ?: return@withContext
        
        // Add to wallet balance
        val oldBalance = user.walletBalance
        val updatedUser = user.copy(
            walletBalance = oldBalance + tx.amount,
            totalEarnings = user.totalEarnings + tx.amount
        )
        appDao.insertUser(updatedUser)

        // Trigger Transaction Reward
        val settings = getAppSettings()
        val transactionReward = settings.transactionReward
        if (transactionReward > 0) {
            val rewardTxId = "TX-REW-" + UUID.randomUUID().toString().take(6).uppercase()
            val rewardTx = WalletTransaction(
                transactionId = rewardTxId,
                userId = tx.userId,
                type = "Reward",
                amount = transactionReward,
                gateway = "SYSTEM",
                utr = "SYSTEM",
                status = "Success",
                details = "Deposit Transaction Reward"
            )
            appDao.insertTransaction(rewardTx)
            // Credit reward tokens
            appDao.insertUser(appDao.getUser(tx.userId)!!.copy(
                rewardBalance = appDao.getUser(tx.userId)!!.rewardBalance + transactionReward,
                totalEarnings = appDao.getUser(tx.userId)!!.totalEarnings + transactionReward
            ))
        }

        // Trigger Referrer Reward if referred user completes their first successful payment transaction (or deposit)
        if (user.referredBy.isNotBlank()) {
            val referrals = appDao.getAllReferralsFlow().firstOrNull() ?: emptyList()
            val referralRecord = referrals.find { it.referredUserId == user.userId && !it.isCompleted }
            if (referralRecord != null) {
                // Settle referral reward
                appDao.updateReferral(referralRecord.copy(isCompleted = true))

                val referrerUser = appDao.getUser(user.referredBy)
                if (referrerUser != null) {
                    val refRewardAmount = settings.referralReward
                    // Add referral reward transaction for referrer
                    val refTxId = "TX-REF-" + UUID.randomUUID().toString().take(6).uppercase()
                    val refTx = WalletTransaction(
                        transactionId = refTxId,
                        userId = referrerUser.userId,
                        type = "Referral Bonus",
                        amount = refRewardAmount,
                        gateway = "SYSTEM",
                        utr = "SYSTEM",
                        status = "Success",
                        details = "Referral balance credited for ${user.name}'s first action"
                    )
                    appDao.insertTransaction(refTx)

                    // Credit referrer
                    appDao.insertUser(referrerUser.copy(
                        rewardBalance = referrerUser.rewardBalance + refRewardAmount,
                        totalEarnings = referrerUser.totalEarnings + refRewardAmount
                    ))
                    insertAudit("Referral Reward Applied", "Referrer ${referrerUser.userId} credited $refRewardAmount tokens for ${user.userId}'s deposit.")
                }
            }
        }

        insertAudit("Deposit Approved", "Admin approved deposit of ${tx.amount} INR for ${tx.userId}.")
    }

    suspend fun rejectDeposit(txId: String) = withContext(Dispatchers.IO) {
        val allTx = appDao.getAllTransactionsFlow().firstOrNull() ?: emptyList()
        val tx = allTx.find { it.transactionId == txId } ?: return@withContext
        if (tx.status != "Pending") return@withContext

        appDao.insertTransaction(tx.copy(status = "Rejected"))
        insertAudit("Deposit Rejected", "Admin rejected deposit UTR ${tx.utr} for ${tx.userId}.")
    }

    suspend fun approveWithdrawal(txId: String, utr: String) = withContext(Dispatchers.IO) {
        val allTx = appDao.getAllTransactionsFlow().firstOrNull() ?: emptyList()
        val tx = allTx.find { it.transactionId == txId } ?: return@withContext
        if (tx.status != "Pending") return@withContext

        val updatedTx = tx.copy(status = "Success", utr = utr)
        appDao.insertTransaction(updatedTx)

        insertAudit("Withdrawal Approved", "Admin cleared withdrawal of ${tx.amount} INR for ${tx.userId}, UTR $utr.")
    }

    suspend fun rejectWithdrawal(txId: String) = withContext(Dispatchers.IO) {
        val allTx = appDao.getAllTransactionsFlow().firstOrNull() ?: emptyList()
        val tx = allTx.find { it.transactionId == txId } ?: return@withContext
        if (tx.status != "Pending") return@withContext

        val updatedTx = tx.copy(status = "Rejected")
        appDao.insertTransaction(updatedTx)

        // Refund user balance
        val user = appDao.getUser(tx.userId)
        if (user != null) {
            appDao.insertUser(user.copy(walletBalance = user.walletBalance + tx.amount))
        }

        insertAudit("Withdrawal Rejected", "Admin rejected/refunded withdrawal of ${tx.amount} INR for ${tx.userId}.")
    }

    suspend fun adjustUserBalance(userId: String, walletDelta: Double, rewardDelta: Double) = withContext(Dispatchers.IO) {
        val user = appDao.getUser(userId) ?: return@withContext
        val updated = user.copy(
            walletBalance = (user.walletBalance + walletDelta).coerceAtLeast(0.0),
            rewardBalance = (user.rewardBalance + rewardDelta).coerceAtLeast(0.0),
            totalEarnings = (user.totalEarnings + (if (walletDelta > 0) walletDelta else 0.0) + (if (rewardDelta > 0) rewardDelta else 0.0)).coerceAtLeast(0.0)
        )
        appDao.insertUser(updated)
        // Add transaction entry for compliance
        if (walletDelta != 0.0 || rewardDelta != 0.0) {
            val adjTxId = "TX-ADJ-" + UUID.randomUUID().toString().take(6).uppercase()
            val description = "Balance Adjust Wallet:${walletDelta} INR, Reward:${rewardDelta} tokens"
            val tx = WalletTransaction(
                transactionId = adjTxId,
                userId = userId,
                type = "Reward",
                amount = if (walletDelta != 0.0) walletDelta else rewardDelta,
                gateway = "SYSTEM",
                utr = "ADMIN_ADJUST",
                status = "Success",
                details = description
            )
            appDao.insertTransaction(tx)
        }
        insertAudit("User Balance Adjusted", "Admin adjusted user $userId balances by Wallet:$walletDelta, Reward:$rewardDelta")
    }

    suspend fun toggleUserBlockStatus(userId: String) = withContext(Dispatchers.IO) {
        val user = appDao.getUser(userId) ?: return@withContext
        appDao.insertUser(user.copy(isBlocked = !user.isBlocked))
        insertAudit("User Block Toggle", "Admin toggled block status of $userId to ${!user.isBlocked}.")
    }

    suspend fun addGateway(gateway: PaymentGateway) = withContext(Dispatchers.IO) {
        appDao.insertGateway(gateway)
        insertAudit("Gateway Added", "Admin added gateway: ${gateway.name}")
    }

    suspend fun updateGateway(gateway: PaymentGateway) = withContext(Dispatchers.IO) {
        appDao.insertGateway(gateway)
        insertAudit("Gateway Updated", "Admin modified gateway ${gateway.name} configs.")
    }

    suspend fun deleteGateway(gateway: PaymentGateway) = withContext(Dispatchers.IO) {
        appDao.deleteGateway(gateway)
        insertAudit("Gateway Deleted", "Admin deleted gateway: ${gateway.name}")
    }

    // Seeder helper
    suspend fun seedInitialDataIfNotPresent() = withContext(Dispatchers.IO) {
        // Settings Seeding
        if (appDao.getSettings() == null) {
            appDao.insertSettings(AppSettings())
        }

        // Default Gateways Seeding
        val currentGateways = appDao.getGateways()
        if (currentGateways.isEmpty()) {
            val gateways = listOf(
                PaymentGateway("UPI_GLOW", "UPI GLOW Gateway", "https://api.glowpayments.com/v1", "sk_glow_89fca889c19fb9023", "MERCH_GLOW_77189a", isEnabled = true, isDefault = true),
                PaymentGateway("GPAY_FAST", "GPAY Fast Checkout", "https://api.gpayquick.com/v2", "sk_gpf_99aecc1234ba09b11", "MERCH_GPAY_100232", isEnabled = true, isDefault = false),
                PaymentGateway("PHONEPE_DIRECT", "PhonePe API Direct", "https://api.phonepesettlements.com/v3", "sk_ppe_8711efbcad44e8c11", "MERCH_PPE_55018a", isEnabled = true, isDefault = false)
            )
            for (g in gateways) {
                appDao.insertGateway(g)
            }
        }

        // Default Current Active User Seeding (to make the app immediately polished and delightful style)
        val currentUser = appDao.getCurrentUser()
        if (currentUser == null) {
            val defaultUser = User(
                userId = "10009799",
                name = "Aswini Singh",
                phone = "76******96",
                walletBalance = 15500.0,
                rewardBalance = 1200.0,
                totalEarnings = 16700.0,
                referralCode = "9UPI888F",
                pin = "1234",
                isCurrent = true
            )
            appDao.insertUser(defaultUser)

            // Seed Referral instances to showcase stats instantly
            val stats = listOf(
                Referral(referrerId = "10009799", referredUserId = "10002133", referredUserName = "Rahul Kumar", rewardAmount = 200.0, isCompleted = true),
                Referral(referrerId = "10009799", referredUserId = "10004522", referredUserName = "Priya Sharma", rewardAmount = 200.0, isCompleted = true),
                Referral(referrerId = "10009799", referredUserId = "10007891", referredUserName = "Amit Verma", rewardAmount = 200.0, isCompleted = false)
            )
            for (ref in stats) {
                appDao.insertReferral(ref)
            }

            // Seed Transaction History
            val history = listOf(
                WalletTransaction("TX-DEP-A1", "10009799", "Deposit", 10000.0, "UPI GLOW Gateway", "UTR992817281", "Success", System.currentTimeMillis() - 86400000 * 3, "Deposit Approved Credit"),
                WalletTransaction("TX-REW-A1", "10009799", "Reward", 200.0, "SYSTEM", "SYSTEM", "Success", System.currentTimeMillis() - 86400000 * 3, "Deposit Transaction Reward"),
                WalletTransaction("TX-DEP-A2", "10009799", "Deposit", 5500.0, "PhonePe API Direct", "UTR112028123", "Success", System.currentTimeMillis() - 86400000 * 2, "Deposit Approved Credit"),
                WalletTransaction("TX-REF-A1", "10009799", "Referral Bonus", 200.0, "SYSTEM", "SYSTEM", "Success", System.currentTimeMillis() - 86400000, "Ref. Rahul Kumar Bonus Approved"),
                WalletTransaction("TX-REF-A2", "10009799", "Referral Bonus", 200.0, "SYSTEM", "SYSTEM", "Success", System.currentTimeMillis() - 43200000, "Ref. Priya Sharma Bonus Approved"),
                WalletTransaction("TX-WTD-A1", "10009799", "Withdrawal", 1500.0, "BANK_UPI", "UTR882910283", "Success", System.currentTimeMillis() - 20000000, "Withdrawal processed to UPI ID aswini@okhdfc")
            )
            for (tx in history) {
                appDao.insertTransaction(tx)
            }

            insertAudit("System Initiated", "Default wallet values and 9UPI PAY configurations successfully seeded.")
        }
    }

    private suspend fun insertAudit(action: String, details: String) {
        appDao.insertAuditLog(AuditLog(action = action, details = details))
    }
}
