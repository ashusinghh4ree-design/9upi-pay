package com.example.ui.viewmodel

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.example.data.database.AppDatabase
import com.example.data.model.*
import com.example.data.repository.AppRepository
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch

sealed interface UiState<out T> {
    object Idle : UiState<Nothing?>
    object Loading : UiState<Nothing?>
    data class Success<out T>(val data: T) : UiState<T>
    data class Error(val message: String) : UiState<Nothing>
}

class MainViewModel(application: Application) : AndroidViewModel(application) {

    private val repository: AppRepository

    init {
        val database = AppDatabase.getDatabase(application)
        repository = AppRepository(database.appDao())
        
        // Seed initial data asynchronously on start
        viewModelScope.launch {
            repository.seedInitialDataIfNotPresent()
        }
    }

    // Expose DB Flows
    val settingsState: StateFlow<AppSettings> = repository.settingsFlow
        .filterNotNull()
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), AppSettings())

    val currentUserState: StateFlow<User?> = repository.currentUserFlow
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), null)

    val allUsersState: StateFlow<List<User>> = repository.allUsersFlow
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    val allReferralsState: StateFlow<List<Referral>> = repository.allReferralsFlow
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    val allTransactionsState: StateFlow<List<WalletTransaction>> = repository.allTransactionsFlow
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    val gatewaysState: StateFlow<List<PaymentGateway>> = repository.gatewaysFlow
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    val auditLogsState: StateFlow<List<AuditLog>> = repository.auditLogsFlow
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    // Filtered lists for the logged-in user
    val userTransactionsState: StateFlow<List<WalletTransaction>> = currentUserState
        .flatMapLatest { user ->
            if (user != null) repository.getUserTransactions(user.userId) else flowOf(emptyList())
        }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    val userReferralsState: StateFlow<List<Referral>> = currentUserState
        .flatMapLatest { user ->
            if (user != null) repository.getUserReferrals(user.userId) else flowOf(emptyList())
        }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    // Navigation and UI States
    private val _currentTab = MutableStateFlow("home")
    val currentTab: StateFlow<String> = _currentTab.asStateFlow()

    private val _adminMode = MutableStateFlow(false)
    val adminMode: StateFlow<Boolean> = _adminMode.asStateFlow()

    private val _adminTab = MutableStateFlow("dashboard")
    val adminTab: StateFlow<String> = _adminTab.asStateFlow()

    private val _errorMessage = MutableStateFlow<String?>(null)
    val errorMessage: StateFlow<String?> = _errorMessage.asStateFlow()

    private val _successMessage = MutableStateFlow<String?>(null)
    val successMessage: StateFlow<String?> = _successMessage.asStateFlow()

    // Helper functions
    fun setTab(tab: String) {
        _currentTab.value = tab
    }

    fun setAdminMode(enabled: Boolean) {
        _adminMode.value = enabled
    }

    fun setAdminTab(tab: String) {
        _adminTab.value = tab
    }

    fun clearMessages() {
        _errorMessage.value = null
        _successMessage.value = null
    }

    // User Operations
    fun login(userId: String, pin: String, onFinished: (Boolean) -> Unit) {
        viewModelScope.launch {
            val success = repository.loginAsUser(userId, pin)
            if (success) {
                _successMessage.value = "Welcome back, $userId!"
                onFinished(true)
            } else {
                _errorMessage.value = "Invalid User ID, code, or blocked account."
                onFinished(false)
            }
        }
    }

    fun register(name: String, phone: String, pin: String, promoCode: String, onFinished: (Boolean) -> Unit) {
        viewModelScope.launch {
            if (name.isBlank() || phone.isBlank() || pin.length < 4) {
                _errorMessage.value = "Please complete all field requirements beautifully."
                onFinished(false)
                return@launch
            }
            val newUser = repository.registerUser(name, phone, pin, promoCode)
            if (newUser != null) {
                _successMessage.value = "Registration Successful! Logged in as: ${newUser.userId}"
                onFinished(true)
            } else {
                _errorMessage.value = "An unknown registration error occurred."
                onFinished(false)
            }
        }
    }

    fun logout() {
        viewModelScope.launch {
            val currentUser = repository.currentUserFlow.firstOrNull()
            if (currentUser != null) {
                repository.adjustUserBalance(currentUser.userId, 0.0, 0.0) // trigger state
                val database = AppDatabase.getDatabase(getApplication())
                database.appDao().insertUser(currentUser.copy(isCurrent = false))
            }
            _successMessage.value = "Logged out successfully."
            _adminMode.value = false
            _currentTab.value = "home"
        }
    }

    fun requestDeposit(amount: Double, gatewayId: String, utr: String, onFinished: (Boolean) -> Unit) {
        viewModelScope.launch {
            val user = currentUserState.value
            if (user == null) {
                _errorMessage.value = "Session error. Log in again."
                onFinished(false)
                return@launch
            }
            if (amount < 100.0) {
                _errorMessage.value = "Minimum deposit threshold is 100 INR."
                onFinished(false)
                return@launch
            }
            if (utr.trim().length < 6) {
                _errorMessage.value = "Please enter a valid 6-12 character UPI transaction UTR."
                onFinished(false)
                return@launch
            }
            val success = repository.createDepositRequest(user.userId, amount, gatewayId, utr)
            if (success) {
                _successMessage.value = "Deposit request registered. Pending clearance."
                onFinished(true)
            } else {
                _errorMessage.value = "Failed to submit deposit."
                onFinished(false)
            }
        }
    }

    fun requestWithdrawal(amount: Double, details: String, onFinished: (Boolean) -> Unit) {
        viewModelScope.launch {
            val user = currentUserState.value
            if (user == null) {
                _errorMessage.value = "Session error. Please log in."
                onFinished(false)
                return@launch
            }
            val minWithdraw = 500.0
            if (amount < minWithdraw) {
                _errorMessage.value = "Minimum withdrawal requirement is $minWithdraw INR."
                onFinished(false)
                return@launch
            }
            if (user.walletBalance < amount) {
                _errorMessage.value = "Insufficient wallet funds available."
                onFinished(false)
                return@launch
            }
            val success = repository.createWithdrawalRequest(user.userId, amount, details)
            if (success) {
                _successMessage.value = "Withdrawal request logged successfully."
                onFinished(true)
            } else {
                _errorMessage.value = "Transaction failed to initialize."
                onFinished(false)
            }
        }
    }

    fun buyAsset(inrAmount: Double, onFinished: (Boolean) -> Unit) {
        viewModelScope.launch {
            val user = currentUserState.value
            if (user == null) {
                _errorMessage.value = "No active session."
                onFinished(false)
                return@launch
            }
            if (user.walletBalance < inrAmount) {
                _errorMessage.value = "Insufficient wallet funds."
                onFinished(false)
                return@launch
            }
            val success = repository.buyCoins(user.userId, inrAmount)
            if (success) {
                _successMessage.value = "Asset purchase complete!"
                onFinished(true)
            } else {
                _errorMessage.value = "Purchase operation failed."
                onFinished(false)
            }
        }
    }

    fun sellAsset(tokenAmount: Double, onFinished: (Boolean) -> Unit) {
        viewModelScope.launch {
            val user = currentUserState.value
            val settings = settingsState.value
            if (user == null) {
                _errorMessage.value = "No active session."
                onFinished(false)
                return@launch
            }
            if (tokenAmount < 10.0) {
                _errorMessage.value = "Minimum sell configuration is 10.0 tokens."
                onFinished(false)
                return@launch
            }
            if (user.rewardBalance < tokenAmount) {
                _errorMessage.value = "Insufficient token balance."
                onFinished(false)
                return@launch
            }
            val success = repository.sellCoins(user.userId, tokenAmount)
            if (success) {
                _successMessage.value = "Asset liquidated back to INR wallet size!"
                onFinished(true)
            } else {
                _errorMessage.value = "Liquidation operation failed."
                onFinished(false)
            }
        }
    }

    fun changePin(oldPin: String, newPin: String, onFinished: (Boolean) -> Unit) {
        viewModelScope.launch {
            val user = currentUserState.value
            if (user == null) {
                _errorMessage.value = "Session not validated."
                onFinished(false)
                return@launch
            }
            if (newPin.length < 4) {
                _errorMessage.value = "Security PIN must be at least 4 digits."
                onFinished(false)
                return@launch
            }
            val success = repository.verifyAndChangePin(user.userId, oldPin, newPin)
            if (success) {
                _successMessage.value = "Security PIN updated."
                onFinished(true)
            } else {
                _errorMessage.value = "Current PIN did not match database recordings."
                onFinished(false)
            }
        }
    }

    // Admin Panel Controllers
    fun adminApproveDeposit(txId: String) {
        viewModelScope.launch {
            repository.approveDeposit(txId)
            _successMessage.value = "Deposit cleared successfully!"
        }
    }

    fun adminRejectDeposit(txId: String) {
        viewModelScope.launch {
            repository.rejectDeposit(txId)
            _successMessage.value = "Deposit transaction marked Rejected."
        }
    }

    fun adminApproveWithdrawal(txId: String, utr: String) {
        viewModelScope.launch {
            if (utr.isBlank()) {
                _errorMessage.value = "A reference payout UTR code is required to settle."
                return@launch
            }
            repository.approveWithdrawal(txId, utr)
            _successMessage.value = "Withdrawal marked Success."
        }
    }

    fun adminRejectWithdrawal(txId: String) {
        viewModelScope.launch {
            repository.rejectWithdrawal(txId)
            _successMessage.value = "Withdrawal declined. Funds auto-refunded to user's wallet."
        }
    }

    fun adminAdjustUserBalance(userId: String, walletDelta: Double, rewardDelta: Double) {
        viewModelScope.launch {
            repository.adjustUserBalance(userId, walletDelta, rewardDelta)
            _successMessage.value = "Balances modified for $userId."
        }
    }

    fun adminToggleUserBlocked(userId: String) {
        viewModelScope.launch {
            repository.toggleUserBlockStatus(userId)
            _successMessage.value = "User block status updated."
        }
    }

    fun adminAddPaymentGateway(name: String, apiUrl: String, apiKey: String, merchantId: String) {
        viewModelScope.launch {
            if (name.isBlank() || merchantId.isBlank()) {
                _errorMessage.value = "Gateway name and Merchant ID are mandatory attributes."
                return@launch
            }
            val key = "GW_" + name.trim().uppercase().replace(" ", "_")
            repository.addGateway(PaymentGateway(key, name, apiUrl, apiKey, merchantId, isEnabled = true))
            _successMessage.value = "New payment gateway '$name' integrated."
        }
    }

    fun adminDeletePaymentGateway(gateway: PaymentGateway) {
        viewModelScope.launch {
            repository.deleteGateway(gateway)
            _successMessage.value = "Gateway removed from system."
        }
    }

    fun adminToggleGatewayState(gateway: PaymentGateway) {
        viewModelScope.launch {
            repository.updateGateway(gateway.copy(isEnabled = !gateway.isEnabled))
            _successMessage.value = "Gateway configuration toggled."
        }
    }

    fun adminToggleDefaultGateway(gateway: PaymentGateway) {
        viewModelScope.launch {
            val list = gatewaysState.value
            for (g in list) {
                val isTarget = g.id == gateway.id
                repository.updateGateway(g.copy(isDefault = isTarget))
            }
            _successMessage.value = "Primary system gateway redefined."
        }
    }

    fun adminUpdateSettings(settings: AppSettings) {
        viewModelScope.launch {
            repository.updateSettings(settings)
            _successMessage.value = "Platform content rules and settings saved."
        }
    }
}
