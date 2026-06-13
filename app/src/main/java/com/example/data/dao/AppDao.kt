package com.example.data.dao

import androidx.room.*
import com.example.data.model.*
import kotlinx.coroutines.flow.Flow

@Dao
interface AppDao {

    // App Settings Queries
    @Query("SELECT * FROM app_settings WHERE id = 1")
    fun getSettingsFlow(): Flow<AppSettings?>

    @Query("SELECT * FROM app_settings WHERE id = 1")
    suspend fun getSettings(): AppSettings?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertSettings(settings: AppSettings)

    // User Queries
    @Query("SELECT * FROM users WHERE isCurrent = 1 LIMIT 1")
    fun getCurrentUserFlow(): Flow<User?>

    @Query("SELECT * FROM users WHERE isCurrent = 1 LIMIT 1")
    suspend fun getCurrentUser(): User?

    @Query("SELECT * FROM users WHERE userId = :userId LIMIT 1")
    fun getUserFlow(userId: String): Flow<User?>

    @Query("SELECT * FROM users WHERE userId = :userId LIMIT 1")
    suspend fun getUser(userId: String): User?

    @Query("SELECT * FROM users ORDER BY userId DESC")
    fun getAllUsersFlow(): Flow<List<User>>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertUser(user: User)

    @Update
    suspend fun updateUser(user: User)

    // Referral Queries
    @Query("SELECT * FROM referrals WHERE referrerId = :referrerId ORDER BY timestamp DESC")
    fun getReferralsFlow(referrerId: String): Flow<List<Referral>>

    @Query("SELECT * FROM referrals ORDER BY timestamp DESC")
    fun getAllReferralsFlow(): Flow<List<Referral>>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertReferral(referral: Referral)

    @Update
    suspend fun updateReferral(referral: Referral)

    // Transaction Queries
    @Query("SELECT * FROM wallet_transactions WHERE userId = :userId ORDER BY timestamp DESC")
    fun getUserTransactionsFlow(userId: String): Flow<List<WalletTransaction>>

    @Query("SELECT * FROM wallet_transactions ORDER BY timestamp DESC")
    fun getAllTransactionsFlow(): Flow<List<WalletTransaction>>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertTransaction(transaction: WalletTransaction)

    @Update
    suspend fun updateTransaction(transaction: WalletTransaction)

    // Payment Gateway Queries
    @Query("SELECT * FROM payment_gateways ORDER BY isDefault DESC, name ASC")
    fun getGatewaysFlow(): Flow<List<PaymentGateway>>

    @Query("SELECT * FROM payment_gateways ORDER BY isDefault DESC, name ASC")
    suspend fun getGateways(): List<PaymentGateway>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertGateway(gateway: PaymentGateway)

    @Update
    suspend fun updateGateway(gateway: PaymentGateway)

    @Delete
    suspend fun deleteGateway(gateway: PaymentGateway)

    // Audit Log Queries
    @Query("SELECT * FROM audit_logs ORDER BY timestamp DESC")
    fun getAuditLogsFlow(): Flow<List<AuditLog>>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertAuditLog(log: AuditLog)
}
