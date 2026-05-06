# WatchStore PK — Backend API

REST API for WatchStore PK e-commerce platform. Built with Node.js, Express, and PostgreSQL (Supabase).

## Tech Stack
- **Runtime**: Node.js 18+
- **Framework**: Express.js
- **Database**: PostgreSQL via Supabase
- **Auth**: JWT + bcryptjs
- **Validation**: Joi

## Getting Started

### 1. Clone & Install
```bash
git clone https://github.com/Gull4334/WatchStore.git
cd WatchStore
npm install
```

### 2. Environment Setup
```bash
cp .env.example .env
# Fill in your values in .env
```

### 3. Run Development Server
```bash
npm run dev
```

### 4. Health Check
```
GET http://localhost:5000/health
```

---

## API Base URL
```
http://localhost:5000/api/v1
```

## Authentication
All admin routes require a Bearer token in the Authorization header:
```
Authorization: Bearer <token>
```

Get token via `POST /api/v1/auth/login`

**Default Admin Credentials** (change immediately):
- Email: `admin@watchstorepk.com`
- Password: `Admin@123`

---

## Endpoints

### Auth
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/auth/login` | Public | Admin login |
| POST | `/auth/logout` | Admin | Logout |
| GET | `/auth/me` | Admin | Get profile |
| PUT | `/auth/change-password` | Admin | Change password |

### Products
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/products` | Public | List products (paginated, filterable) |
| GET | `/products/featured` | Public | Featured products |
| GET | `/products/:slug` | Public | Single product |
| POST | `/products` | Admin | Create product |
| PUT | `/products/:id` | Admin | Update product |
| DELETE | `/products/:id` | Admin | Archive product |
| POST | `/products/:id/images` | Admin | Add image |
| DELETE | `/products/:id/images/:imgId` | Admin | Remove image |

### Categories
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/categories` | Public | List categories |
| POST | `/categories` | Admin | Create category |

### Orders
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/orders` | Public | Place order (guest checkout) |
| GET | `/orders/track/:orderNumber` | Public | Track order |
| GET | `/orders` | Admin | List all orders |
| GET | `/orders/:id` | Admin | Order detail |
| PUT | `/orders/:id/status` | Admin | Update status |
| DELETE | `/orders/:id` | Admin | Cancel order |

### Payments
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/payments/methods` | Public | List payment methods |
| POST | `/payments/submit` | Public | Submit payment screenshot |
| GET | `/payments` | Admin | List all payments |
| GET | `/payments/:id` | Admin | Payment detail |
| POST | `/payments/:id/confirm` | Admin | Confirm payment |
| POST | `/payments/:id/reject` | Admin | Reject payment |

### Refunds
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/refunds` | Admin | List refunds |
| POST | `/refunds` | Admin | Create refund request |
| PUT | `/refunds/:id/approve` | Admin | Approve refund |
| PUT | `/refunds/:id/process` | Admin | Mark as processed |

### Shipments
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/shipments` | Admin | List shipments |
| POST | `/shipments` | Admin | Create shipment |
| PUT | `/shipments/:id` | Admin | Update tracking |
| PUT | `/shipments/:id/delivered` | Admin | Mark delivered |

### Discounts
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/discounts/validate` | Public | Validate a code |
| GET | `/discounts` | Admin | List all codes |
| POST | `/discounts` | Admin | Create code |
| PUT | `/discounts/:id` | Admin | Update code |

### Analytics
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/analytics/summary` | Admin | Dashboard summary |
| GET | `/analytics/orders-by-day` | Admin | Orders per day |
| GET | `/analytics/top-products` | Admin | Best sellers |
| GET | `/analytics/orders-by-status` | Admin | Orders by status |
| GET | `/analytics/revenue-by-payment-method` | Admin | Revenue by method |

---

## Response Format
All responses follow this envelope:
```json
{
  "success": true,
  "message": "Success",
  "data": {}
}
```

Paginated responses include:
```json
{
  "success": true,
  "data": [],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 100,
    "total_pages": 5
  }
}
```

## Order Status Flow
```
pending_payment → payment_submitted → payment_confirmed → processing → dispatched → delivered
                                                                                  ↘ cancelled
                                                                                  ↘ refunded
```

## Project Structure
```
src/
├── app.js                  # Entry point
├── config/
│   └── db.js               # PostgreSQL connection
├── middleware/
│   ├── auth.js             # JWT middleware
│   ├── errorHandler.js     # Global error handler
│   └── validate.js         # Joi validation middleware
├── modules/
│   ├── auth/               # Login, JWT, password
│   ├── products/           # Products + categories
│   ├── orders/             # Orders + discounts
│   ├── payments/           # Payments + refunds
│   ├── shipments/          # TCS dispatch tracking
│   └── analytics/          # Dashboard stats
└── utils/
    ├── asyncHandler.js     # Async wrapper
    ├── orderNumber.js      # WPK-XXXXX generator
    └── response.js         # Standard response helpers
```
