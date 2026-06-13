# 9UPI Geometric Balance Wallet API Backend

A production-grade, secure **Node.js & Express** backend service structure engineered specifically to power the **9UPI Pay** application at `api.h4r.fun`. Adheres to clean, modular MVC style conventions, with built-in JWT security checks, password/PIN cryptographic hashing, and a persistent simulated database engine.

---

## 🎨 Geometric Balance System Arch

This server architecture mirrors the high-fidelity **Geometric Balance** fintech design system, implementing precise real-time ledger accounting, reward rate calculation, and multi-currency token settlements (Loyalty Token TKN $\leftrightarrow$ INR Rupee).

---

## 🛠️ Folder Hierarchy & Architecture
```bash
/backend
├── config
│   └── db.js                 # Local In-Memory Database State Store & Auditor
├── controllers
│   ├── authController.js     # User registration (cryptographic PIN hashing) & Login token creation
│   ├── userController.js     # Profile retrieval & System settings configurations
│   └── walletController.js   # Ledger transactions, Deposits, Withdrawals, & Token Exchange conversions
├── middleware
│   └── auth.js               # JWT Filter enforcing Bearer tokens security bounds
├── routes
│   └── api.js                # Centralized namespace routing router mount
├── package.json              # App dependencies & script configurations
├── server.js                 # App configuration bootstrapper & database seeder
└── README.md                 # System developer layout & API route docs
```

---

## 🚀 Speed-Run Quick Start

### 1. Install Workspace Dependencies
Make sure you are in the `/backend` directory:
```bash
cd backend
npm install
```

### 2. Set Up Environment Configuration (`.env`)
Create a `.env` file inside the `/backend` folder:
```ini
PORT=5000
JWT_SECRET=9upi_geometric_balance_secret_key_2026
```

### 3. Launch the Server State
For active hot-reload development:
```bash
npm run dev
```
For simple production start:
```bash
npm start
```

---

## 🔒 API Endpoints & Request-Response Specifications

All requests accept and return JSON bodies. Protected endpoints require the `Authorization` header formatted as:
`Authorization: Bearer <Your_JWT_Token>`

### 1. Authentication Endpoints

#### • **Register New User Wallet**
- **Method / Url:** `POST /api/auth/register`
- **Body:**
  ```json
  {
    "name": "Jane Doe",
    "phone": "9876543210",
    "pin": "9999",
    "promoCode": "U4821" 
  }
  ```
- **Response (201 Created):**
  ```json
  {
    "success": true,
    "message": "Wallet created successfully!",
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "user": {
      "userId": "U4512",
      "name": "Jane Doe",
      "phone": "9876543210",
      "walletBalance": 0,
      "rewardBalance": 100,
      "totalEarnings": 0,
      "role": "User",
      "joinedAt": 178129381023
    }
  }
  ```

#### • **Unlock Wallet Terminal**
- **Method / Url:** `POST /api/auth/login`
- **Body:**
  ```json
  {
    "userId": "U4821",
    "pin": "4321"
  }
  ```
- **Response (200 OK):**
  ```json
  {
    "success": true,
    "message": "Secure wallet unlocked!",
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "user": { ... }
  }
  ```

---

### 2. Secured User Operations

#### • **Retrieve Current User Profile**
- **Method / Url:** `GET /api/user/profile`
- **Required Header:** `Authorization: Bearer <Token>`
- **Response (200 OK):**
  ```json
  {
    "success": true,
    "profile": {
      "userId": "U4821",
      "name": "Alex Thompson",
      "phone": "8888888888",
      "walletBalance": 12450.50,
      "rewardBalance": 2400.0,
      "totalEarnings": 5200.00,
      "role": "User"
    }
  }
  ```

#### • **Get Active Platform State Configurations**
- **Method / Url:** `GET /api/user/config`
- **Response (200 OK):**
  ```json
  {
    "success": true,
    "settings": {
      "newUserReward": 100,
      "transactionReward": 10,
      "referralReward": 50,
      "buyRate": 1.0,
      "sellRate": 0.98,
      "upiId": "9upi@pay"
    },
    "gateways": [ ... ]
  }
  ```

---

### 3. Secured Transaction & Wallet Ledgers

#### • **Fetch Transaction Ledger Logs**
- **Method / Url:** `GET /api/wallet/transactions`
- **Required Header:** `Authorization: Bearer <Token>`
- **Response (200 OK):**
  ```json
  {
    "success": true,
    "transactions": [
      {
        "id": "tx_init_1",
        "userId": "U4821",
        "type": "Deposit",
        "amount": 10000.00,
        "currency": "INR",
        "status": "Approved",
        "gateway": "Google Pay",
        "txRef": "REF-01039",
        "timestamp": 178129000000
      }
    ]
  }
  ```

#### • **Execute Seamless Deposit**
- **Method / Url:** `POST /api/wallet/deposit`
- **Required Header:** `Authorization: Bearer <Token>`
- **Body:**
  ```json
  {
    "amount": 1500,
    "gatewayId": "gw_gpay",
    "txRef": "G-REF-88319"
  }
  ```
- **Response (200 OK):**
  ```json
  {
    "success": true,
    "message": "Funds deposited successfully and rewards unlocked!",
    "transaction": {
      "id": "tx_1781294821",
      "userId": "U4821",
      "type": "Deposit",
      "amount": 1500,
      "currency": "INR",
      "status": "Approved",
      "gateway": "Google Pay",
      "txRef": "G-REF-88319",
      "timestamp": 178129482100
    },
    "walletBalance": 13950.50,
    "rewardBalance": 2410.0
  }
  ```

#### • **Request Instant Cashout/Withdrawal**
- **Method / Url:** `POST /api/wallet/withdraw`
- **Required Header:** `Authorization: Bearer <Token>`
- **Body:**
  ```json
  {
    "amount": 500,
    "upiAddress": "alex@okaxis"
  }
  ```
- **Response (200 OK):**
  ```json
  {
    "success": true,
    "message": "Withdrawal completed instantly.",
    "transaction": { ... },
    "walletBalance": 11950.50
  }
  ```

#### • **Redeem Reward Tokens into Real INR Cash**
- **Method / Url:** `POST /api/wallet/settle`
- **Required Header:** `Authorization: Bearer <Token>`
- **Body:**
  ```json
  {
    "tokensToRedeem": 1000
  }
  ```
- **Response (200 OK):**
  ```json
  {
    "success": true,
    "message": "Successfully exchanged 1000 tokens for ₹980.00 cash!",
    "walletBalance": 13430.50,
    "rewardBalance": 1400.0,
    "transaction": { ... }
  }
  ```

---

## 🧭 Live Dev Diagnostics Console

When the server starts up, navigate your browser to the root routing interface:
`http://localhost:5000/`

You will see health diagnostics and active registration statistics checking the memory sandbox database.
