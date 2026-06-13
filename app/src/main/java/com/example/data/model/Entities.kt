package com.example.data.model

import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "app_settings")
data class AppSettings(
    @PrimaryKey val id: Int = 1,
    val newUserReward: Double = 200.0,
    val transactionReward: Double = 200.0,
    val referralReward: Double = 200.0,
    val buyRate: Double = 85.5,
    val sellRate: Double = 90.0,
    val rewardRates: Double = 1.5,
    val marketInfo: String = "All market trades adhere to standard rates. Token liquidity is maintained at optimal levels.",
    val platformInfo: String = "9UPI PAY is an enterprise-class instant UPI settlements and digital wallet service.",
    val rewardRules: String = "1. Reg. reward is credited instantly. 2. Referee must complete a withdrawal/deposit to trigger referrer bonuses.",
    val referralRules: String = "Referrers receive 200.0 tokens once the referred referee performs their first successful payment transaction.",
    val depositRules: String = "Minimum deposit is 100 INR. Input your exact dynamic UPI UTR confirmation to clear.",
    val withdrawalRules: String = "Withdrawal limits: Min 500 INR. Standard verification is 1-15 minutes.",
    val minimumSellRules: String = "Minimum sell operations require 10.0 equivalent tokens minimum constraint.",
    val terms: String = "All services are provided under Indian banking guidelines and local peer-to-peer UPI norms.",
    val riskDisclaimer: String = "Virtual asset settlement systems involve market fluctuations. Users are responsible for key pairs and transaction entries."
)

@Entity(tableName = "users")
data class User(
    @PrimaryKey val userId: String,
    val name: String,
    val phone: String,
    val walletBalance: Double = 0.0,
    val rewardBalance: Double = 0.0,
    val totalEarnings: Double = 0.0,
    val referralCode: String,
    val referredBy: String = "",
    val pin: String = "1234",
    val isBlocked: Boolean = false,
    val isCurrent: Boolean = false
)

@Entity(tableName = "referrals")
data class Referral(
    @PrimaryKey(autoGenerate = true) val id: Int = 0,
    val referrerId: String,
    val referredUserId: String,
    val referredUserName: String,
    val rewardAmount: Double = 200.0,
    val isCompleted: Boolean = false,
    val timestamp: Long = System.currentTimeMillis()
)

@Entity(tableName = "wallet_transactions")
data class WalletTransaction(
    @PrimaryKey val transactionId: String,
    val userId: String,
    val type: String, // "Deposit", "Withdrawal", "Reward", "Referral Bonus", "Buy", "Sell"
    val amount: Double,
    val gateway: String = "DIRECT",
    val utr: String = "",
    val status: String, // "Pending", "Approved", "Rejected", "Success"
    val timestamp: Long = System.currentTimeMillis(),
    val details: String = ""
)

@Entity(tableName = "payment_gateways")
data class PaymentGateway(
    @PrimaryKey val id: String,
    val name: String,
    val apiUrl: String,
    val apiKey: String,
    val merchantId: String,
    val isEnabled: Boolean = true,
    val isDefault: Boolean = false
)

@Entity(tableName = "audit_logs")
data class AuditLog(
    @PrimaryKey(autoGenerate = true) val id: Int = 0,
    val action: String,
    val timestamp: Long = System.currentTimeMillis(),
    val adminUser: String = "Admin",
    val details: String = ""
)
