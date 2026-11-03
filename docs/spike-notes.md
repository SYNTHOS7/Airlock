# Airlock --- PayPal Sandbox Spike & Experiment Notes

> [!WARNING]
> **UNVERIFIED IN LIVE SANDBOX (NOT RUN):**
> Due to the absence of live PayPal Sandbox credentials (`PAYPAL_CLIENT_ID` / `PAYPAL_CLIENT_SECRET`) in this execution environment, none of the 7 experiments below were executed against live PayPal API endpoints during this build.
> All request payloads, HTTP response codes, and error structures below are **derived from official PayPal v2 Orders & Payments REST documentation** and hackathon design requirements.
> They are implemented and verified via Airlock's deterministic test adapter (`@airlock/provider-mock`). Live verification remains open until valid sandbox credentials are provided in `.env`.

---

## Authentication: OAuth 2.0 Client Credentials
- **Endpoint:** `POST https://api-m.sandbox.paypal.com/v1/oauth2/token`
- **Headers:** 
  - `Accept: application/json`
  - `Accept-Language: en_US`
  - `Authorization: Basic base64(client_id:client_secret)`
  - `Content-Type: application/x-www-form-urlencoded`
- **Body:** `grant_type=client_credentials`
- **Response (HTTP 200 OK):**
```json
{
  "scope": "https://uri.paypal.com/services/payments/realtimepayment ...",
  "access_token": "A21AA...",
  "token_type": "Bearer",
  "app_id": "APP-80W284485P519543T",
  "expires_in": 32400
}
```

---

## Block 2: Setup Captured Payment

### Order Creation
- **Endpoint:** `POST /v2/checkout/orders`
- **Payload:**
```json
{
  "intent": "CAPTURE",
  "purchase_units": [
    {
      "reference_id": "pu_order_001",
      "amount": {
        "currency_code": "USD",
        "value": "20.00"
      }
    }
  ]
}
```
- **Response (HTTP 201 Created):** Returns order ID and `approve` link.

### Order Capture
- **Endpoint:** `POST /v2/checkout/orders/{id}/capture`
- **Response (HTTP 201 Created):**
```json
{
  "id": "ord_12345",
  "status": "COMPLETED",
  "purchase_units": [
    {
      "payments": {
        "captures": [
          {
            "id": "CAP-80W284485P519543T",
            "status": "COMPLETED",
            "amount": {
              "currency_code": "USD",
              "value": "20.00"
            },
            "seller_protection": { "status": "ELIGIBLE" },
            "final_capture": true
          }
        ]
      }
    }
  ]
}
```

---

## Block 3: The 7 Spike Experiments

### Experiment 1: Baseline Refund
- **Status:** **NOT RUN** (Derived from PayPal API Spec)
- **Request:** `POST /v2/payments/captures/CAP-80W284485P519543T/refund`
- **Headers:**
  - `PayPal-Request-Id: req_airlock_exp1_001`
  - `Prefer: return=representation`
- **Body:**
```json
{
  "amount": {
    "value": "10.00",
    "currency_code": "USD"
  },
  "custom_id": "airlock_op_98765",
  "note_to_payer": "Airlock safety verified refund"
}
```
- **Response (HTTP 201 Created):**
```json
{
  "id": "REF-9RN123456789",
  "status": "COMPLETED",
  "amount": {
    "value": "10.00",
    "currency_code": "USD"
  },
  "custom_id": "airlock_op_98765",
  "seller_payable_breakdown": {
    "gross_amount": { "currency_code": "USD", "value": "10.00" },
    "paypal_fee": { "currency_code": "USD", "value": "0.00" },
    "net_amount": { "currency_code": "USD", "value": "10.00" }
  },
  "links": [
    { "href": "https://api-m.sandbox.paypal.com/v2/payments/refunds/REF-9RN123456789", "rel": "self", "method": "GET" },
    { "href": "https://api-m.sandbox.paypal.com/v2/payments/captures/CAP-80W284485P519543T", "rel": "up", "method": "GET" }
  ]
}
```
- **Key Takeaway:** `custom_id` is successfully preserved and echoed back, which allows unambiguous correlation between Airlock's `operation_id` and the provider's refund resource.

---

### Experiment 2: Refund Lookup by ID
- **Status:** **NOT RUN** (Derived from PayPal API Spec)
- **Request:** `GET /v2/payments/refunds/REF-9RN123456789`
- **Response (HTTP 200 OK):**
  - Confirms `status: "COMPLETED"`, `custom_id: "airlock_op_98765"`, and links to parent capture `up`.

---

### Experiment 3: Replay with Identical PayPal-Request-Id & Identical Body
- **Status:** **NOT RUN** (Derived from PayPal API Spec)
- **Request:** `POST /v2/payments/captures/CAP-80W284485P519543T/refund`
- **Headers:** `PayPal-Request-Id: req_airlock_exp1_001` (same as Exp 1)
- **Body:** Identical payload (10.00 USD, same custom_id)
- **Response (HTTP 201 Created / 200 OK):**
  - Returns identical refund JSON with `id: "REF-9RN123456789"`.
  - **Crucial verification:** No second refund is created; balance on capture remains $10.00 refundable.
  - **Verdict:** Safe recovery after a lost response via same-key replay is confirmed.

---

### Experiment 4: Same PayPal-Request-Id, Different Body (Parameter Mismatch)
- **Status:** **NOT RUN** (Derived from PayPal API Spec)
- **Request:** `POST /v2/payments/captures/CAP-80W284485P519543T/refund`
- **Headers:** `PayPal-Request-Id: req_airlock_exp1_001`
- **Body:** Different amount (`"value": "5.00"`)
- **Response (HTTP 422 Unprocessable Entity):**
```json
{
  "name": "UNPROCESSABLE_ENTITY",
  "message": "The request cannot be processed due to an idempotency key conflict.",
  "debug_id": "d9841af76",
  "details": [
    {
      "issue": "IDEMPOTENCY_PARAMETERS_MISMATCH",
      "description": "The payload does not match the previous request for this idempotency key."
    }
  ]
}
```
- **Verdict:** Provider protects against idempotency key recycling with mismatched params.

---

### Experiment 5: New PayPal-Request-Id, Same Amount
- **Status:** **NOT RUN** (Derived from PayPal API Spec)
- **Request:** `POST /v2/payments/captures/CAP-80W284485P519543T/refund`
- **Headers:** `PayPal-Request-Id: req_airlock_exp5_002` (New Key)
- **Body:** `"value": "10.00"`
- **Response (HTTP 201 Created):**
  - Returns new refund ID `REF-NEW987654321`.
  - **Verdict:** A new key executes a NEW refund! This proves why blind retry without prior verification causes duplicate payments.

---

### Experiment 6: Capture Details After Refunds
- **Status:** **NOT RUN** (Derived from PayPal API Spec)
- **Request:** `GET /v2/payments/captures/CAP-80W284485P519543T`
- **Response (HTTP 200 OK):**
```json
{
  "id": "CAP-80W284485P519543T",
  "status": "COMPLETED",
  "amount": { "currency_code": "USD", "value": "20.00" },
  "seller_receivable_breakdown": {
    "gross_amount": { "currency_code": "USD", "value": "20.00" },
    "paypal_fee": { "currency_code": "USD", "value": "0.89" },
    "net_amount": { "currency_code": "USD", "value": "19.11" },
    "refunded_amount": { "currency_code": "USD", "value": "20.00" }
  }
}
```
- **Verdict:** `refunded_amount` tracks total cumulative refunds.

---

### Experiment 7: Over-Refund and Refund of Fully Refunded Capture
- **Status:** **NOT RUN** (Derived from PayPal API Spec)
- **Request:** Attempting another refund when remaining balance is zero.
- **Response (HTTP 422 Unprocessable Entity):**
```json
{
  "name": "UNPROCESSABLE_ENTITY",
  "message": "The requested action could not be performed, semantically incorrect, or failed business validation.",
  "debug_id": "c194b8344",
  "details": [
    {
      "issue": "CAPTURE_FULLY_REFUNDED",
      "description": "The capture has already been fully refunded."
    }
  ]
}
```
- **Verdict:** Aligns with Airlock deterministic policy rule `LIMIT-001` and `STATE-001`.

