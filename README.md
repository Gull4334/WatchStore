# Casio Society — REST API

Complete backend API for the Casio Society watch store (Pakistan).  
**Stack:** Node.js · Express · Supabase (PostgreSQL) · JWT Auth · Zod Validation

---

## Quick Start

```bash
# 1. Clone & install
git clone https://github.com/your-org/casio-society-api.git
cd casio-society-api
npm install

# 2. Configure environment
cp .env.example .env
# → Edit .env with your Supabase project URL and keys

# 3. Run the Supabase schema
# → Paste casio_society_schema.sql into Supabase SQL Editor and run

# 4. Start the server
npm run dev        # development (nodemon)
npm start          # production
```

---

## Environment Variables

| Variable | Description |
|---|---|
| `SUPABASE_URL` | Your Supabase project URL |
| `SUPABASE_ANON_KEY` | Supabase anon/public key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (never expose to client) |
| `JWT_SECRET` | Secret for signing admin JWTs (min 32 chars) |
| `JWT_EXPIRES_IN` | Token expiry — e.g. `24h`, `7d` |
| `PORT` | Server port (default: 3000) |
| `ALLOWED_ORIGINS` | Comma-separated CORS origins |
| `FRONTEND_URL` | Frontend base URL (used in WhatsApp links) |
| `MAX_FILE_SIZE_MB` | Max screenshot upload size in MB (default: 5) |

---

## API Overview

### Base URL
```
Production : https://your-api-domain.com
Local      : http://localhost:3000
```

### Authentication
- **Public routes** — No auth. Pass `apikey` header (Supabase anon key) if calling Supabase directly.
- **Admin routes** — `Authorization: Bearer <jwt>` obtained from `POST /api/admin/auth/login`.

---

## Endpoints

### Public (Frontend — 9 endpoints)

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/settings/public` | Store name, ticker, shipping info |
| GET | `/api/settings/payment-accounts` | Bank/wallet details for checkout |
| GET | `/api/categories` | Active categories with product count |
| GET | `/api/products` | Filterable product catalog |
| GET | `/api/products/featured` | Featured product for homepage hero |
| POST | `/api/discounts/validate` | Validate promo code at checkout |
| POST | `/api/orders` | Place a new order |
| GET | `/api/orders/track?order_number=WPK-XXXXX` | Track order status |
| POST | `/api/payments/screenshot` | Upload payment screenshot |

### Admin Panel (26 endpoints)

| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/admin/auth/login` | Admin login → JWT |
| POST | `/api/admin/auth/logout` | Logout |
| PATCH | `/api/admin/auth/change-password` | Change password |
| GET | `/api/admin/dashboard/stats` | KPI stat cards |
| GET | `/api/admin/dashboard/orders-by-day` | Bar chart data |
| GET | `/api/admin/dashboard/payment-methods` | Donut chart data |
| GET | `/api/admin/dashboard/activity-log` | Activity log feed |
| GET | `/api/admin/orders` | Orders list (filterable) |
| GET | `/api/admin/orders/:id` | Single order detail |
| POST | `/api/admin/orders/manual` | Create manual order |
| PATCH | `/api/admin/orders/:id/cancel` | Cancel order |
| GET | `/api/admin/payments` | Payment submissions |
| PATCH | `/api/admin/payments/:id/confirm` | Confirm payment |
| PATCH | `/api/admin/payments/:id/reject` | Reject payment |
| GET | `/api/admin/shipments` | Shipments list |
| PATCH | `/api/admin/shipments/:id/dispatch` | Add tracking & dispatch |
| PATCH | `/api/admin/shipments/:id/deliver` | Mark delivered |
| GET | `/api/admin/products` | Full product catalog |
| POST | `/api/admin/products` | Create product |
| PUT | `/api/admin/products/:id` | Update product |
| PATCH | `/api/admin/products/:id/toggle-status` | Archive/activate |
| GET | `/api/admin/categories` | All categories |
| POST | `/api/admin/categories` | Create category |
| PUT | `/api/admin/categories/:id` | Update category |
| GET | `/api/admin/discounts` | All promo codes |
| POST | `/api/admin/discounts` | Create promo code |
| PUT | `/api/admin/discounts/:id` | Update promo code |
| PATCH | `/api/admin/discounts/:id/disable` | Disable code |
| GET | `/api/admin/customers` | Customer list |
| GET | `/api/admin/customers/:id/orders` | Customer order history |
| GET | `/api/admin/refunds` | Refunds list |
| PATCH | `/api/admin/refunds/:id/approve` | Approve refund |
| PATCH | `/api/admin/refunds/:id/process` | Mark processed |
| GET | `/api/admin/settings` | Full settings |
| PUT | `/api/admin/settings` | Update settings |

---

## Error Response Format

All errors return:
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Human-readable message",
    "details": { "field": "error reason" }
  }
}
```

| HTTP Code | Code | When |
|---|---|---|
| 400 | VALIDATION_ERROR | Invalid request body or params |
| 401 | UNAUTHORIZED | Missing/invalid JWT |
| 403 | FORBIDDEN | Insufficient role |
| 404 | NOT_FOUND | Resource not found |
| 409 | CONFLICT | Duplicate (e.g. promo code) |
| 422 | BUSINESS_RULE | Business logic violation |
| 500 | INTERNAL_ERROR | Unexpected server error |

---

## Project Structure

```
src/
├── config/
│   └── supabase.js        # Supabase client (anon + service role)
├── middleware/
│   ├── auth.js            # JWT guard (requireAuth, requireRole)
│   ├── validate.js        # Zod validation middleware
│   └── upload.js          # Multer file upload config
├── routes/
│   ├── public.settings.js   # A1, A2
│   ├── public.categories.js # A3
│   ├── public.products.js   # A4, A5
│   ├── public.orders.js     # A6, A7, A8
│   ├── public.payments.js   # A9
│   ├── admin.auth.js        # B1, B2, B3
│   ├── admin.dashboard.js   # B4, B5, B6, B7
│   ├── admin.orders.js      # B8, B9, B10, B11
│   ├── admin.payments.js    # B12, B13, B14
│   ├── admin.shipments.js   # B15, B16, B17
│   ├── admin.products.js    # B18, B19, B20, B21
│   ├── admin.categories.js  # B22, B23, B24
│   ├── admin.discounts.js   # B25, B26, B27, B28
│   ├── admin.customers.js   # B29, B30
│   ├── admin.refunds.js     # B31, B32, B33
│   └── admin.settings.js    # B34, B35
├── validators/
│   ├── public.validators.js # Zod schemas for public routes
│   └── admin.validators.js  # Zod schemas for admin routes
├── utils/
│   ├── response.js        # Standardised response helpers
│   └── whatsapp.js        # WhatsApp link builder
├── app.js                 # Express app factory
└── index.js               # Server entry point
```

---

## WhatsApp Integration

The API does not send WhatsApp messages directly. Instead it builds `wa.me` deep-links with pre-filled messages using templates stored in the `settings` table.

Template placeholders: `[Name]` `[ORDER_NUM]` `[Amount]` `[Method]` `[Bank]` `[Account]` `[TCS_TRACKING]` `[EST_DATE]` `[LINK]`

---

## Default Admin Credentials (Change Immediately)

```
Email    : admin@watchstorepk.com
Password : Admin@1234
```

> ⚠️ Change the password immediately after first login via `PATCH /api/admin/auth/change-password`
