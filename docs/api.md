# Mining Equipment Backend API Documentation

**Documentation Version:** 2.0
**Last Updated:** 28/09/25
**API Version:** v1

## Table of Contents
1. [Overview](#overview)
2. [Authentication](#authentication)
3. [Error Handling](#error-handling)
4. [Rate Limiting](#rate-limiting)
5. [File Uploads](#file-uploads)
6. [API Endpoints](#api-endpoints)
   - [Authentication](#auth-endpoints)
   - [Users](#user-endpoints)
   - [Products](#product-endpoints)
   - [Categories](#category-endpoints)
   - [Shopping Cart](#cart-endpoints)
   - [Orders](#order-endpoints)
   - [Checkout](#checkout-endpoints)
   - [Payments](#payment-endpoints)
   - [Invoices](#invoice-endpoints)
   - [Quotes](#quote-endpoints)
   - [Blog](#blog-endpoints)
   - [Contact](#contact-endpoints)
   - [Pages](#page-endpoints)
   - [Email](#email-endpoints)
   - [Admin](#admin-endpoints)
   - [Search](#search-endpoints)
7. [Additional Information](#additional-information)
8. [Sample API Calls](#sample-api-calls)
9. [Data Models](#data-models)
10. [Testing](#testing-the-api)
11. [Error Codes](#error-codes-reference)
12. [Performance](#performance-considerations)
13. [Security](#security-features)
14. [Support](#support-and-documentation)

## Overview

**Base URL:**
- Development: `http://localhost:5000`
- Production: `https://mining-equipment-backend.onrender.com`

**API Version:** v1

**Content-Type:** `application/json`

## Authentication

The API uses JWT (JSON Web Tokens) for authentication. Include the token in the Authorization header:

```
Authorization: Bearer <your-jwt-token>
```

### User Roles
- `guest` - Can browse and purchase without account
- `customer` - Standard registered user
- `business` - B2B customer with bulk pricing
- `sales_rep` - Manage quotes and customers
- `content_manager` - Manage blog and pages
- `inventory_manager` - Manage products and categories
- `order_manager` - Process orders and payments
- `super_admin` - Full system access

## Error Handling

All API responses follow a consistent format:

### Success Response
```json
{
  "success": true,
  "data": {},
  "message": "Operation successful"
}
```

### Error Response
```json
{
  "success": false,
  "message": "Error description",
  "errors": [] // Optional validation errors
}
```

### HTTP Status Codes
- `200` - OK
- `201` - Created
- `400` - Bad Request
- `401` - Unauthorized
- `403` - Forbidden
- `404` - Not Found
- `422` - Validation Error
- `429` - Too Many Requests
- `500` - Internal Server Error

## Rate Limiting

- **General API:** 100 requests per 15 minutes (production), 1000 (development)
- **Auth endpoints:** 5 requests per 15 minutes (production), 50 (development)

Rate limit headers:
- `RateLimit-Limit` - Request limit
- `RateLimit-Remaining` - Remaining requests
- `RateLimit-Reset` - Reset time

## File Uploads

- **Max file size:** 5MB
- **Supported image formats:** JPG, PNG, GIF, WebP
- **Max files per upload:** 10
- **Upload path:** `/uploads/`

---

## API Endpoints

## Auth Endpoints

### POST /api/auth/register
Register a new user account.

**Access:** Public

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "Password123!",
  "firstName": "John",
  "lastName": "Doe",
  "phone": "+263-xxx-xxxx",
  "role": "customer"
}
```

**Response:**
```json
{
  "message": "User registered successfully",
  "token": "jwt-token-here",
  "user": {
    "id": "user-id",
    "email": "user@example.com",
    "firstName": "John",
    "lastName": "Doe",
    "role": "customer",
    "isVerified": false
  }
}
```

### POST /api/auth/login
Authenticate user and get JWT token.

**Access:** Public

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "Password123!"
}
```

**Response:**
```json
{
  "message": "Login successful",
  "token": "jwt-token-here",
  "user": {
    "id": "user-id",
    "email": "user@example.com",
    "firstName": "John",
    "lastName": "Doe",
    "role": "customer",
    "isVerified": true
  }
}
```

### POST /api/auth/verify-email
Verify user email address.

**Access:** Public

**Request Body:**
```json
{
  "token": "verification-token"
}
```

### POST /api/auth/forgot-password
Request password reset.

**Access:** Public

**Request Body:**
```json
{
  "email": "user@example.com"
}
```

### POST /api/auth/reset-password
Reset password with token.

**Access:** Public

**Request Body:**
```json
{
  "token": "reset-token",
  "password": "NewPassword123!"
}
```

### POST /api/auth/resend-verification
Resend verification email.

**Access:** Private

### GET /api/auth/me
Get current user profile.

**Access:** Private

**Response:**
```json
{
  "id": "user-id",
  "email": "user@example.com",
  "firstName": "John",
  "lastName": "Doe",
  "role": "customer",
  "isVerified": true,
  "createdAt": "2024-01-01T00:00:00.000Z"
}
```

### POST /api/auth/change-password
Change user password.

**Access:** Private

**Request Body:**
```json
{
  "currentPassword": "OldPassword123!",
  "newPassword": "NewPassword123!"
}
```

---

## User Endpoints

### GET /api/users/profile
Get user profile.

**Access:** Private

### PUT /api/users/profile
Update user profile.

**Access:** Private

**Request Body:**
```json
{
  "firstName": "John",
  "lastName": "Doe",
  "phone": "+263-xxx-xxxx",
  "company": "Company Name",
  "address": {
    "street": "123 Main St",
    "city": "Harare",
    "state": "Harare Province",
    "zipCode": "00263",
    "country": "Zimbabwe"
  }
}
```

### DELETE /api/users/account
Delete user account.

**Access:** Private

**Request Body:**
```json
{
  "password": "Password123!"
}
```

### GET /api/users
Get all users (Admin only).

**Access:** Private (Super Admin)

**Query Parameters:**
- `page` - Page number (default: 1)
- `limit` - Items per page (default: 20)
- `role` - Filter by role
- `search` - Search term
- `isVerified` - Filter by verification status
- `sortBy` - Sort field (default: createdAt)
- `sortOrder` - Sort order (asc/desc)

### GET /api/users/:id
Get single user (Admin only).

**Access:** Private (Super Admin)

### PUT /api/users/:id
Update user (Admin only).

**Access:** Private (Super Admin)

### DELETE /api/users/:id
Delete user (Admin only).

**Access:** Private (Super Admin)

### POST /api/users/:id/toggle-status
Toggle user active/inactive status.

**Access:** Private (Super Admin)

### GET /api/users/stats/overview
Get user statistics.

**Access:** Private (Super Admin)

---

## Product Endpoints

### GET /api/products
Get products with filtering and pagination.

**Access:** Public

**Query Parameters:**
- `page` - Page number (default: 1)
- `limit` - Items per page (default: 12)
- `category` - Category ID
- `minPrice` - Minimum price
- `maxPrice` - Maximum price
- `inStock` - Filter in-stock products (true/false)
- `search` - Search term
- `sortBy` - Sort field (default: createdAt)
- `sortOrder` - Sort order (asc/desc)
- `featured` - Filter featured products (true/false)

**Response:**
```json
{
  "products": [
    {
      "_id": "product-id",
      "name": "Product Name",
      "slug": "product-slug",
      "description": "Product description",
      "price": 199.99,
      "salePrice": 179.99,
      "sku": "PROD001",
      "category": {
        "_id": "category-id",
        "name": "Category Name",
        "slug": "category-slug"
      },
      "images": ["/uploads/products/image1.jpg"],
      "stockQuantity": 50,
      "inStock": true,
      "featured": false,
      "createdAt": "2024-01-01T00:00:00.000Z"
    }
  ],
  "pagination": {
    "currentPage": 1,
    "totalPages": 5,
    "totalProducts": 50,
    "hasNext": true,
    "hasPrev": false
  }
}
```

### GET /api/products/search
Advanced product search.

**Access:** Public

**Query Parameters:**
- `q` - Search query
- `category` - Category ID
- `tags` - Comma-separated tags
- `specifications` - JSON string of specifications

### GET /api/products/:id
Get single product by ID.

**Access:** Public

**Response:**
```json
{
  "_id": "product-id",
  "name": "Product Name",
  "slug": "product-slug",
  "description": "Detailed product description",
  "shortDescription": "Brief description",
  "price": 199.99,
  "salePrice": 179.99,
  "sku": "PROD001",
  "category": {
    "_id": "category-id",
    "name": "Category Name"
  },
  "images": ["/uploads/products/image1.jpg"],
  "specifications": {
    "brand": "Brand Name",
    "model": "Model ABC"
  },
  "stockQuantity": 50,
  "weight": 5.5,
  "dimensions": {
    "length": 10,
    "width": 5,
    "height": 3
  },
  "tags": ["tag1", "tag2"],
  "viewCount": 150,
  "createdAt": "2024-01-01T00:00:00.000Z"
}
```

### GET /api/products/:id/related
Get related products.

**Access:** Public

### POST /api/products
Create new product.

**Access:** Private (Inventory Manager/Super Admin)

**Content-Type:** `multipart/form-data`

**Form Data:**
```
name: Product Name
description: Product description
price: 199.99
sku: PROD001
category: category-id
images: [file1, file2] // Image files
stockQuantity: 100
specifications: {"brand": "Brand Name"}
tags: tag1,tag2,tag3
```

### PUT /api/products/:id
Update product.

**Access:** Private (Inventory Manager/Super Admin)

### DELETE /api/products/:id
Delete product.

**Access:** Private (Inventory Manager/Super Admin)

### POST /api/products/bulk-import
Bulk import products from CSV.

**Access:** Private (Inventory Manager/Super Admin)

**Content-Type:** `multipart/form-data`

**Form Data:**
```
csv: [CSV file]
```

### GET /api/products/import/template
Get CSV import template.

**Access:** Private (Inventory Manager/Super Admin)

### GET /api/products/import/sample
Download sample CSV.

**Access:** Private (Inventory Manager/Super Admin)

---

## Category Endpoints

### GET /api/categories
Get all categories.

**Access:** Public

**Query Parameters:**
- `includeProducts` - Include products (true/false)
- `activeOnly` - Filter active categories (true/false)

**Response:**
```json
{
  "categories": [
    {
      "_id": "category-id",
      "name": "Category Name",
      "slug": "category-slug",
      "description": "Category description",
      "image": "/uploads/categories/image.jpg",
      "parent": null,
      "isActive": true,
      "sortOrder": 0,
      "children": []
    }
  ],
  "total": 5
}
```

### GET /api/categories/:id
Get single category by ID.

**Access:** Public

### GET /api/categories/slug/:slug
Get category by slug with products.

**Access:** Public

**Query Parameters:**
- `page` - Page number
- `limit` - Items per page
- `sortBy` - Sort field
- `sortOrder` - Sort order

### POST /api/categories
Create new category.

**Access:** Private (Inventory Manager/Super Admin)

**Content-Type:** `multipart/form-data`

**Form Data:**
```
name: Category Name
description: Category description
parent: parent-category-id // Optional
image: [image file] // Optional
sortOrder: 0
```

### PUT /api/categories/:id
Update category.

**Access:** Private (Inventory Manager/Super Admin)

### DELETE /api/categories/:id
Delete category.

**Access:** Private (Inventory Manager/Super Admin)

### GET /api/categories/tree
Get category tree structure.

**Access:** Public

---

## Cart Endpoints

### GET /api/cart
Get user's cart.

**Access:** Public (Optional Auth)

**Headers:**
```
x-session-id: session-id // For guest users
```

**Response:**
```json
{
  "cart": {
    "_id": "cart-id",
    "items": [
      {
        "_id": "item-id",
        "product": {
          "_id": "product-id",
          "name": "Product Name",
          "price": 199.99,
          "images": ["/uploads/products/image.jpg"]
        },
        "quantity": 2,
        "price": 199.99,
        "addedAt": "2024-01-01T00:00:00.000Z"
      }
    ],
    "totalItems": 2,
    "subtotal": 399.98,
    "isGuest": true
  },
  "sessionId": "session-id" // For guest users
}
```

### POST /api/cart/items
Add item to cart.

**Access:** Public (Optional Auth)

**Headers:**
```
x-session-id: session-id // For guest users
```

**Request Body:**
```json
{
  "productId": "product-id",
  "quantity": 2
}
```

### PUT /api/cart/items/:id
Update cart item quantity.

**Access:** Public (Optional Auth)

**Request Body:**
```json
{
  "quantity": 3
}
```

### PUT /api/cart/items/:id/increment
Increment item quantity.

**Access:** Public (Optional Auth)

### PUT /api/cart/items/:id/decrement
Decrement item quantity.

**Access:** Public (Optional Auth)

### DELETE /api/cart/items/:id
Remove item from cart.

**Access:** Public (Optional Auth)

### DELETE /api/cart
Clear cart.

**Access:** Public (Optional Auth)

### GET /api/cart/count
Get cart items count.

**Access:** Public (Optional Auth)

### POST /api/cart/merge
Merge guest cart with user cart after login.

**Access:** Private

**Request Body:**
```json
{
  "guestSessionId": "session-id"
}
```

### POST /api/cart/validate
Validate cart items (stock, price, availability).

**Access:** Public (Optional Auth)

### POST /api/cart/save-for-later/:id
Save cart item for later.

**Access:** Private

### GET /api/cart/summary
Get cart summary.

**Access:** Public (Optional Auth)

---

## Order Endpoints

### POST /api/orders
Create new order.

**Access:** Public (Optional Auth)

**Request Body:**
```json
{
  "customerInfo": {
    "firstName": "John",
    "lastName": "Doe",
    "email": "john@example.com",
    "phone": "+263-xxx-xxxx",
    "address": {
      "street": "123 Main St",
      "city": "Harare",
      "country": "Zimbabwe"
    }
  },
  "paymentMethod": "cash_on_delivery",
  "notes": "Order notes",
  "sessionId": "session-id" // For guest orders
}
```

**Response:**
```json
{
  "message": "Order created successfully",
  "order": {
    "_id": "order-id",
    "orderNumber": "ORD-123456-ABCD",
    "isGuest": true,
    "customerInfo": {},
    "items": [],
    "subtotal": 399.98,
    "tax": 59.997,
    "total": 459.977,
    "status": "pending",
    "paymentStatus": "payment_on_delivery",
    "paymentMethod": "cash_on_delivery",
    "createdAt": "2024-01-01T00:00:00.000Z"
  },
  "orderNumber": "ORD-123456-ABCD"
}
```

### GET /api/orders
Get user's orders.

**Access:** Private

**Query Parameters:**
- `page` - Page number
- `limit` - Items per page
- `status` - Filter by status

### GET /api/orders/:id
Get single order.

**Access:** Private

### GET /api/orders/track/:orderNumber/:email
Track order (for guests).

**Access:** Public

**Response:**
```json
{
  "orderNumber": "ORD-123456-ABCD",
  "status": "processing",
  "paymentStatus": "paid",
  "createdAt": "2024-01-01T00:00:00.000Z",
  "total": 459.977,
  "trackingNumber": "TRACK123",
  "items": [
    {
      "name": "Product Name",
      "quantity": 2,
      "price": 199.99
    }
  ]
}
```

### PUT /api/orders/:id
Update order status (Admin only).

**Access:** Private (Order Manager/Super Admin)

**Request Body:**
```json
{
  "status": "shipped",
  "paymentStatus": "paid",
  "trackingNumber": "TRACK123",
  "notes": "Order shipped via courier"
}
```

### DELETE /api/orders/:id
Cancel order.

**Access:** Private

---

## Checkout Endpoints

### POST /api/checkout/validate
Validate cart before checkout.

**Access:** Public (Optional Auth)

### POST /api/checkout/calculate
Calculate order totals.

**Access:** Public (Optional Auth)

**Request Body:**
```json
{
  "shippingAddress": {
    "country": "Zimbabwe",
    "city": "Harare"
  }
}
```

**Response:**
```json
{
  "subtotal": 399.98,
  "tax": 59.997,
  "shipping": 10.00,
  "total": 469.977
}
```

### POST /api/checkout/validate-address
Validate shipping address.

**Access:** Public

### POST /api/checkout/validate-customer
Validate customer information.

**Access:** Public

### POST /api/checkout/guest
Guest checkout validation.

**Access:** Public

### GET /api/checkout/shipping-methods
Get available shipping methods.

**Access:** Public

**Query Parameters:**
- `country` - Destination country
- `total` - Order total

**Response:**
```json
[
  {
    "id": "standard-zw",
    "name": "Standard Delivery",
    "description": "3-5 business days",
    "cost": 10,
    "estimatedDays": "3-5"
  }
]
```

### POST /api/checkout/apply-coupon
Apply coupon code.

**Access:** Public (Optional Auth)

**Request Body:**
```json
{
  "couponCode": "SAVE10"
}
```

---

## Payment Endpoints

### GET /api/payments/methods
Get available payment methods.

**Access:** Public

**Response:**
```json
[
  {
    "id": "paynow",
    "name": "Paynow",
    "description": "Pay online with Paynow (Cards, Mobile Money)",
    "enabled": true
  },
  {
    "id": "cash_on_delivery",
    "name": "Cash on Delivery",
    "description": "Pay when your order is delivered",
    "enabled": true
  }
]
```

### POST /api/payments/paynow/initiate
Initiate Paynow payment.

**Access:** Public

**Request Body:**
```json
{
  "orderId": "order-id"
}
```

**Response:**
```json
{
  "success": true,
  "redirectUrl": "https://www.paynow.co.zw/Payment/Link/...",
  "pollUrl": "https://www.paynow.co.zw/Interface/CheckPayment/...",
  "reference": "order-reference"
}
```

### POST /api/payments/paynow/callback
Handle Paynow webhook/callback.

**Access:** Public

### POST /api/payments/cash-on-delivery
Process COD order.

**Access:** Public

### POST /api/payments/collection
Process collection order.

**Access:** Public

---

## Invoice Endpoints

### GET /api/invoices/:orderId
Get invoice (PDF/HTML).

**Access:** Private

**Query Parameters:**
- `format` - Response format (json/pdf)

### GET /api/invoices/guest/:orderNumber/:email
Get guest invoice.

**Access:** Public

### POST /api/invoices/:orderId/send
Send invoice via email.

**Access:** Private

### GET /api/invoices/:orderId/download
Download PDF invoice.

**Access:** Private

### GET /api/invoices
Get user's invoices.

**Access:** Private

### GET /api/invoices/admin/all
List all invoices (Admin).

**Access:** Private (Order Manager/Super Admin)

### POST /api/invoices/admin/:orderId/send
Send invoice to customer (Admin).

**Access:** Private (Order Manager/Super Admin)

### GET /api/invoices/admin/:orderId/pdf
Generate PDF invoice (Admin).

**Access:** Private (Order Manager/Super Admin)

### POST /api/invoices/admin/bulk-send
Send multiple invoices (Admin).

**Access:** Private (Order Manager/Super Admin)

### GET /api/invoices/stats/overview
Get invoice statistics (Admin).

**Access:** Private (Order Manager/Super Admin)

---

## Quote Endpoints

### POST /api/quotes
Create quote request.

**Access:** Public (Optional Auth)

**Request Body:**
```json
{
  "customerInfo": {
    "firstName": "John",
    "lastName": "Doe",
    "email": "john@example.com",
    "phone": "+263-xxx-xxxx",
    "company": "Company Name"
  },
  "items": [
    {
      "product": "product-id",
      "quantity": 10
    },
    {
      "customItem": {
        "name": "Custom Item",
        "description": "Custom item description"
      },
      "quantity": 5,
      "unitPrice": 100
    }
  ],
  "notes": "Quote notes"
}
```

### GET /api/quotes
Get user's quotes.

**Access:** Private

### GET /api/quotes/:id
Get single quote.

**Access:** Private

### PUT /api/quotes/:id/accept
Accept quote (customer).

**Access:** Private

### PUT /api/quotes/:id/reject
Reject quote (customer).

**Access:** Private

**Request Body:**
```json
{
  "reason": "Rejection reason"
}
```

### GET /api/quotes/admin/all
Get all quotes (Admin).

**Access:** Private (Sales Rep/Super Admin)

### PUT /api/quotes/:id/admin/update
Update quote (Admin).

**Access:** Private (Sales Rep/Super Admin)

### POST /api/quotes/:id/send
Send quote to customer (Admin).

**Access:** Private (Sales Rep/Super Admin)

### DELETE /api/quotes/:id
Delete quote.

**Access:** Private

### GET /api/quotes/stats/overview
Get quote statistics (Admin).

**Access:** Private (Sales Rep/Super Admin)

---

## Blog Endpoints

### GET /api/blog/posts
Get blog posts with pagination.

**Access:** Public

**Query Parameters:**
- `page` - Page number
- `limit` - Items per page
- `category` - Category ID
- `tag` - Tag filter
- `search` - Search term
- `status` - Post status (default: published)

**Response:**
```json
{
  "posts": [
    {
      "_id": "post-id",
      "title": "Blog Post Title",
      "slug": "blog-post-slug",
      "content": "Post content...",
      "excerpt": "Post excerpt...",
      "featuredImage": "/uploads/blog/image.jpg",
      "author": {
        "firstName": "John",
        "lastName": "Doe"
      },
      "category": {
        "name": "Category Name",
        "slug": "category-slug"
      },
      "tags": ["tag1", "tag2"],
      "status": "published",
      "publishedAt": "2024-01-01T00:00:00.000Z",
      "viewCount": 150
    }
  ],
  "pagination": {
    "currentPage": 1,
    "totalPages": 5,
    "totalPosts": 50
  }
}
```

### GET /api/blog/posts/:slug
Get single blog post by slug.

**Access:** Public

### GET /api/blog/posts/related/:slug
Get related blog posts.

**Access:** Public

### POST /api/blog/posts
Create blog post.

**Access:** Private (Content Manager/Super Admin)

**Content-Type:** `multipart/form-data`

### PUT /api/blog/posts/:id
Update blog post.

**Access:** Private (Content Manager/Super Admin)

### DELETE /api/blog/posts/:id
Delete blog post.

**Access:** Private (Content Manager/Super Admin)

### GET /api/blog/categories
Get blog categories.

**Access:** Public

### POST /api/blog/categories
Create blog category.

**Access:** Private (Content Manager/Super Admin)

### PUT /api/blog/categories/:id
Update blog category.

**Access:** Private (Content Manager/Super Admin)

### DELETE /api/blog/categories/:id
Delete blog category.

**Access:** Private (Content Manager/Super Admin)

### GET /api/blog/tags
Get popular blog tags.

**Access:** Public

### GET /api/blog/featured
Get featured/popular blog posts.

**Access:** Public

### GET /api/blog/archive
Get blog archive by month/year.

**Access:** Public

---

## Contact Endpoints

### POST /api/contact
Submit contact form.

**Access:** Public

**Request Body:**
```json
{
  "name": "John Doe",
  "email": "john@example.com",
  "phone": "+263-xxx-xxxx",
  "subject": "Inquiry Subject",
  "message": "Message content"
}
```

### GET /api/contact
Get all contact messages (Admin).

**Access:** Private (Content Manager/Super Admin)

### GET /api/contact/:id
Get single contact message (Admin).

**Access:** Private (Content Manager/Super Admin)

### PUT /api/contact/:id
Update contact message status/response (Admin).

**Access:** Private (Content Manager/Super Admin)

**Request Body:**
```json
{
  "status": "replied",
  "response": "Thank you for your inquiry..."
}
```

### DELETE /api/contact/:id
Delete contact message (Admin).

**Access:** Private (Super Admin)

---

## Page Endpoints

### GET /api/pages/:slug
Get static page by slug.

**Access:** Public

### POST /api/pages
Create static page.

**Access:** Private (Content Manager/Super Admin)

**Request Body:**
```json
{
  "title": "Page Title",
  "content": "Page content...",
  "metaTitle": "Meta title",
  "metaDescription": "Meta description",
  "isPublished": true
}
```

### PUT /api/pages/:id
Update static page.

**Access:** Private (Content Manager/Super Admin)

### DELETE /api/pages/:id
Delete static page.

**Access:** Private (Content Manager/Super Admin)

---

## Email Endpoints

### POST /api/emails/order-confirmation
Send order confirmation email.

**Access:** Private (Order Manager/Super Admin)

### POST /api/emails/invoice
Send invoice email.

**Access:** Private (Order Manager/Super Admin)

### POST /api/emails/order-status
Send order status update email.

**Access:** Private (Order Manager/Super Admin)

### POST /api/emails/custom
Send custom email.

**Access:** Private (Content Manager/Super Admin)

### POST /api/emails/newsletter
Send newsletter email.

**Access:** Private (Content Manager/Super Admin)

### POST /api/emails/bulk-order-update
Send bulk order status updates.

**Access:** Private (Order Manager/Super Admin)

### POST /api/emails/test
Send test email.

**Access:** Private (Super Admin)

### GET /api/emails/templates
Get email templates.

**Access:** Private (Content Manager/Super Admin)

### GET /api/emails/stats
Get email statistics.

**Access:** Private (Content Manager/Super Admin)

---

## Admin Endpoints

### GET /api/admin/dashboard
Get admin dashboard stats.

**Access:** Private (Admin)

**Query Parameters:**
- `period` - Time period in days (default: 30)

**Response:**
```json
{
  "stats": {
    "totalOrders": 150,
    "totalProducts": 75,
    "totalUsers": 200,
    "pendingOrders": 25,
    "recentOrders": 45,
    "lowStockProducts": 8,
    "totalRevenue": 15000.50,
    "newMessages": 12
  },
  "ordersByStatus": [
    {
      "_id": "pending",
      "count": 25
    }
  ],
  "revenueByDay": [
    {
      "_id": "2024-01-01",
      "revenue": 500.00,
      "orders": 5
    }
  ],
  "topProducts": []
}
```

### GET /api/admin/orders
Get all orders for admin.

**Access:** Private (Order Manager/Super Admin)

**Query Parameters:**
- `page` - Page number
- `limit` - Items per page
- `status` - Order status
- `paymentStatus` - Payment status
- `startDate` - Start date
- `endDate` - End date
- `search` - Search term

---

## Search Endpoints

### GET /api/search/suggestions
Get search suggestions/autocomplete.

**Access:** Public

**Query Parameters:**
- `q` - Search query (minimum 2 characters)

**Response:**
```json
{
  "suggestions": [
    {
      "type": "product",
      "text": "Product Name",
      "id": "product-id"
    },
    {
      "type": "tag",
      "text": "tag-name"
    }
  ]
}
```

---

## Health Check

### GET /health
Check API health status.

**Access:** Public

**Response:**
```json
{
  "status": "OK",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "uptime": 3600,
  "environment": "development",
  "database": "connected"
}
```

---

## Additional Information

### Environment Variables
The API requires several environment variables to be configured:

```env
NODE_ENV=production
PORT=10000
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/mining-equipment
JWT_SECRET=your-jwt-secret-key
JWT_EXPIRES_IN=30d

EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=your-email@gmail.com
EMAIL_PASS=your-email-password
EMAIL_FROM=noreply@miningequipment.com

PAYNOW_INTEGRATION_ID=your-paynow-integration-id
PAYNOW_INTEGRATION_KEY=your-paynow-integration-key
PAYNOW_RESULT_URL=https://mining-equipment-backend.onrender.com/api/payments/paynow/callback
PAYNOW_RETURN_URL=https://your-frontend-url.com/payment/success

MAX_FILE_SIZE=5242880
UPLOAD_PATH=uploads/

FRONTEND_URL=https://your-frontend-url.com
BACKEND_URL=https://mining-equipment-backend.onrender.com
```

## Sample API Calls

### Using cURL

**Register a new user:**
```bash
curl -X POST https://mining-equipment-backend.onrender.com/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "Password123!",
    "firstName": "Test",
    "lastName": "User"
  }'
```

**Login:**
```bash
curl -X POST https://mining-equipment-backend.onrender.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "Password123!"
  }'
```

**Get products:**
```bash
curl -X GET "https://mining-equipment-backend.onrender.com/api/products?page=1&limit=10&category=category-id"
```

**Add item to cart (guest):**
```bash
curl -X POST https://mining-equipment-backend.onrender.com/api/cart/items \
  -H "Content-Type: application/json" \
  -H "x-session-id: guest-session-123" \
  -d '{
    "productId": "product-id",
    "quantity": 2
  }'
```

**Create order (authenticated):**
```bash
curl -X POST https://mining-equipment-backend.onrender.com/api/orders \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-jwt-token" \
  -d '{
    "customerInfo": {
      "firstName": "John",
      "lastName": "Doe",
      "email": "john@example.com",
      "phone": "+263-xxx-xxxx",
      "address": {
        "street": "123 Main St",
        "city": "Harare",
        "country": "Zimbabwe"
      }
    },
    "paymentMethod": "cash_on_delivery"
  }'
```

### Using JavaScript (Fetch API)

**Get products with authentication:**
```javascript
const response = await fetch('https://mining-equipment-backend.onrender.com/api/products', {
  method: 'GET',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${localStorage.getItem('token')}`
  }
});

const data = await response.json();
console.log(data);
```

**Add to cart (guest user):**
```javascript
const sessionId = localStorage.getItem('sessionId') || 'guest-' + Date.now();

const response = await fetch('https://mining-equipment-backend.onrender.com/api/cart/items', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-session-id': sessionId
  },
  body: JSON.stringify({
    productId: 'product-id-here',
    quantity: 1
  })
});

const result = await response.json();
if (result.sessionId) {
  localStorage.setItem('sessionId', result.sessionId);
}
```

## Data Models

### User Model
```json
{
  "_id": "ObjectId",
  "email": "string (unique)",
  "password": "string (hashed)",
  "firstName": "string",
  "lastName": "string",
  "phone": "string",
  "role": "enum",
  "isVerified": "boolean",
  "company": "string",
  "address": {
    "street": "string",
    "city": "string",
    "state": "string",
    "zipCode": "string",
    "country": "string"
  },
  "createdAt": "Date",
  "updatedAt": "Date"
}
```

### Product Model
```json
{
  "_id": "ObjectId",
  "name": "string",
  "slug": "string (unique)",
  "description": "string",
  "shortDescription": "string",
  "price": "number",
  "salePrice": "number",
  "sku": "string (unique)",
  "category": "ObjectId (ref: Category)",
  "images": ["string"],
  "specifications": "Map",
  "inStock": "boolean",
  "stockQuantity": "number",
  "weight": "number",
  "dimensions": {
    "length": "number",
    "width": "number",
    "height": "number"
  },
  "tags": ["string"],
  "isActive": "boolean",
  "featured": "boolean",
  "viewCount": "number",
  "createdAt": "Date",
  "updatedAt": "Date"
}
```

### Order Model
```json
{
  "_id": "ObjectId",
  "orderNumber": "string (unique)",
  "isGuest": "boolean",
  "user": "ObjectId (ref: User)",
  "customerInfo": {
    "firstName": "string",
    "lastName": "string",
    "email": "string",
    "phone": "string",
    "address": "object"
  },
  "items": [{
    "product": "ObjectId (ref: Product)",
    "name": "string",
    "sku": "string",
    "quantity": "number",
    "price": "number",
    "total": "number"
  }],
  "subtotal": "number",
  "tax": "number",
  "shipping": "number",
  "total": "number",
  "status": "enum",
  "paymentStatus": "enum",
  "paymentMethod": "enum",
  "trackingNumber": "string",
  "notes": "string",
  "createdAt": "Date",
  "updatedAt": "Date"
}
```

## Testing the API

### Postman Collection
A Postman collection is available for testing all endpoints. Import the following URL:
```
https://mining-equipment-backend.onrender.com/api/docs/postman.json
```

### Test Credentials
Use these test accounts for development:

**Admin:**
- Email: `webmaster@dicomm.co.zw`
- Password: `Admin123!`
- Role: `super_admin`

**Customer:**
- Email: `john.customer@example.com`
- Password: `Customer123!`
- Role: `customer`

**Business:**
- Email: `jane.business@example.com`
- Password: `Business123!`
- Role: `business`

**Sales Rep:**
- Email: `sales@miningequipment.com`
- Password: `Sales123!`
- Role: `sales_rep`

## Error Codes Reference

| Code | Status | Description |
|------|--------|-------------|
| `AUTH_001` | 401 | Invalid or expired token |
| `AUTH_002` | 401 | User not found |
| `AUTH_003` | 403 | Insufficient permissions |
| `VALID_001` | 400 | Validation failed |
| `PROD_001` | 404 | Product not found |
| `CART_001` | 400 | Cart is empty |
| `CART_002` | 400 | Insufficient stock |
| `ORDER_001` | 404 | Order not found |
| `PAY_001` | 400 | Payment failed |
| `FILE_001` | 413 | File too large |
| `RATE_001` | 429 | Rate limit exceeded |

## Performance Considerations

- **Pagination:** All list endpoints support pagination with `page` and `limit` parameters
- **Caching:** Static content is cached for 24 hours
- **Compression:** All responses are gzipped
- **CDN:** Images and static files should be served via CDN in production
- **Database Indexing:** Proper indexes are configured for search and filtering

## Security Features

- **CORS:** Configured for specific origins
- **Helmet:** Security headers enabled
- **Rate Limiting:** Applied per endpoint
- **Input Validation:** All inputs are validated and sanitized
- **Password Hashing:** bcrypt with salt rounds
- **JWT:** Secure token-based authentication
- **File Upload:** Restricted file types and sizes

## Support and Documentation

- **API Documentation:** This document
- **Support Email:** webmaster@dicomm.co.zw

### Version History

| Version | Date | Changes |
|---------|------|---------|

| 2.0.0 | 2025-09-28 | Complete documentation restructuring and updates |

---

*This documentation is maintained and updated regularly. For the latest version, please check the repository or contact the development team.*
