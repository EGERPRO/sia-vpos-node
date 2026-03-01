# sia-vpos-node

Node.js SDK for **SIA/Nexi VPOS** payment gateway.

Supports **Redirect** (hosted payment page), **API** (server-to-server), **Pay-By-Link**, Booking, Refund, Consultation (LISTOPERATION / LISTAUTHORIZATION), and webhook verification.

## Installation

```bash
npm install @networksolution/sia-vpos-node
```

## Quick Start

```typescript
import { VposClient } from '@networksolution/sia-vpos-node';

const vpos = new VposClient({
  shopId: '000000000000003',       // Merchant ID (15 chars)
  operatorId: 'oper0001',          // Operator ID (8-18 chars)
  secretKey: 'your_secret_string', // Shared secret for API operations
  startKey: 'your_start_key',     // (optional) For redirect MAC generation
  apiResultKey: 'your_result_key', // (optional) For verifying outcome MACs
  hashAlgorithm: 'hmac-sha256',   // 'hmac-sha256' (recommended) | 'sha1' | 'md5'
  environment: 'test',             // 'test' (default) | 'production'
});
```

## Environment (Test vs Production)

The SDK defaults to the **test** environment for safety. Three ways to control it:

**1. Config option (recommended):**
```typescript
// Test (default)
const vpos = new VposClient({ ..., environment: 'test' });

// Production
const vpos = new VposClient({ ..., environment: 'production' });
```

**2. Environment variable `VPOS_ENV`:**
```bash
# .env or shell
VPOS_ENV=test        # uses test URL
VPOS_ENV=production  # uses production URL
```
```typescript
// No need to specify environment - picks up VPOS_ENV automatically
const vpos = new VposClient({ shopId, operatorId, secretKey });
```

**3. Custom URL (overrides everything):**
```typescript
const vpos = new VposClient({
  ...,
  apiUrl: 'https://custom-proxy.example.com/vpos',
});
```

**Priority:** `apiUrl` > `environment` > `VPOS_ENV` > `'test'` (default)

**Helper properties:**
```typescript
vpos.isTest;       // true if test environment
vpos.isProduction; // true if production environment
vpos.apiUrl;       // current API URL
```

| Environment | API URL | Redirect URL |
|---|---|---|
| **test** | `https://virtualpostest.sia.eu/vpos/apibo/apiBOXML-UTF8.app` | `https://virtualpostest.sia.eu/vpos/payments/main` |
| **production** | `https://virtualpos.sia.eu/vpos/apibo/apiBOXML-UTF8.app` | `https://virtualpos.sia.eu/vpos/payments/main` |

## Redirect Integration (Hosted Payment Page)

The recommended PCI-compliant integration. The customer is redirected to SIA's secure page to enter card details.

### Build Redirect Form

```typescript
const form = vpos.buildRedirectForm({
  amount: 4450,                    // EUR 44.50 (in cents)
  currency: '978',                 // EUR
  orderId: 'ORDER-001',
  urlBack: 'https://yoursite.com/cart',
  urlDone: 'https://yoursite.com/payment/success',
  urlMs: 'https://yoursite.com/api/vpos/webhook',
  accountingMode: 'I',             // I=Immediate, D=Deferred
  authorMode: 'I',
  lang: 'EN',
  email: 'customer@example.com',
});

// Option 1: Use pre-built HTML form
res.send(form.html);

// Option 2: Use fields in your own template
console.log(form.url);    // SIA redirect URL
console.log(form.fields); // { PAGE, AMOUNT, CURRENCY, ORDERID, MAC, ... }
```

### Token Payment (Saved Card)

```typescript
const form = vpos.buildTokenRedirectForm({
  amount: 2500,
  currency: '978',
  orderId: 'ORDER-002',
  urlBack: 'https://yoursite.com/cart',
  urlDone: 'https://yoursite.com/payment/success',
  urlMs: 'https://yoursite.com/api/vpos/webhook',
  accountingMode: 'I',
  authorMode: 'I',
  token: 'saved_pan_alias_token',
  network: '98',                   // 98=standard SIA VPOS pan alias
  tRecurr: 'C',                   // C=card on file
});
```

### Verify Outcome (URLMS / URLDONE)

```typescript
// In your Express webhook handler:
app.get('/api/vpos/webhook', (req, res) => {
  // Parse query string params
  const outcome = vpos.parseOutcomeParams(req.url);

  // Verify MAC using API-Result key
  if (!vpos.verifyOutcomeMAC(outcome)) {
    return res.status(400).send('Invalid MAC');
  }

  if (outcome.result === '00') {
    console.log('Payment OK!', outcome.orderId, outcome.transactionId);
  }

  res.status(200).send('OK');
});
```

### 3DS 2.0 Data Encryption

```typescript
const encrypted3ds = vpos.encrypt3DSData({
  threeDSRequestorChallengeInd: '02',
  addrMatch: 'Y',
  billAddrCity: 'Belgrade',
  billAddrCountry: '688',
  // ... more 3DS fields per EMVCo spec
});

const form = vpos.buildRedirectForm({
  // ...other fields
  threeDsData: encrypted3ds,
});
```

## API Operations (Server-to-Server)

### Authorization

Server-to-server card payment authorization (requires PCI DSS compliance).

```typescript
const result = await vpos.authorize({
  orderId: 'ORDER-001',
  pan: '9998500000000015',
  expDate: '0409',       // yyMM
  cvv2: '123',
  amount: 4450,          // EUR 44.50 (in cents)
  currency: '978',       // EUR
  accountingMode: 'I',   // I=Immediate, D=Deferred
  network: '01',         // 01=VISA, 02=MC, 93=auto
});

if (result.result === '00') {
  console.log('Authorized!', result.authorization);
}
```

### Pay-By-Link (Create Payment Link)

```typescript
const link = await vpos.createLink({
  sendMail: 'Y',
  linkAmount: 9900,                // EUR 99.00
  linkOrderId: 'PBL-20260220-001',
  linkUrlMs: 'https://yoursite.com/api/vpos/webhook',
  linkUrlDone: 'https://yoursite.com/payment/success',
  linkAccountingMode: 'I',
  linkAuthorMode: 'I',
  linkLang: 'EN',
  linkName: 'John',
  linkSurname: 'Doe',
  linkEmail: 'john@example.com',
});

if (link.result === '00' && link.linkCreated) {
  console.log('Payment link:', link.linkCreated.completeLink);
  console.log('Token:', link.linkCreated.token);
}
```

### List Links

```typescript
const links = await vpos.listLinks({
  startDate: '2026-01-01',
  endDate: '2026-12-31',
  linkStatus: '01',  // optional filter
});
console.log('Found links:', links.links);
```

### Revoke Link

```typescript
await vpos.revokeLink({ token: 'scxfuyegan23510hi68vm7s12' });
```

### Booking / Capture (Accounting)

Capture a deferred authorization.

```typescript
const capture = await vpos.accounting({
  transactionId: '8032180310AB0E30917930112',
  orderId: 'ORDER-001',
  amount: 4450,
});
```

### Reverse Accounting (Cancel Booking)

```typescript
await vpos.reverseAccounting({
  transactionId: '8032180310AB0E30917930112',
  orderId: 'ORDER-001',
});
```

### Refund

```typescript
const refund = await vpos.refund({
  transactionId: '8032180310AB0E30917930112',
  orderId: 'ORDER-001',
  amount: 2000, // partial refund EUR 20.00
});
```

### Order Status

```typescript
const status = await vpos.orderStatus({ orderId: 'ORDER-001' });
console.log('Authorization:', status.authorization);
```

### List Operations (LISTOPERATION)

Query all operations (accounting, refund, etc.) within a date range.

```typescript
const ops = await vpos.listOperations({
  startDate: '2026-02-01',
  endDate: '2026-02-25',
  srcType: '02',   // optional: 01=BO, 02=API, 03=BatchFile, 04=Scheduler
  opDescr: 'capture', // optional: filter by description
});

console.log(`Found ${ops.numberOfItems} operations`);
for (const op of ops.operations) {
  console.log(op.transactionId, op.amount, op.result, op.status);
  if (op.authorization) {
    console.log('  Auth:', op.authorization.orderId, op.authorization.transactionResult);
  }
}
```

### List Authorizations (LISTAUTHORIZATION)

Query authorizations by filter type, date range, time range, or transaction ID.

```typescript
// Search by date range with filter
const auths = await vpos.listAuthorizations({
  filter: '1',              // 1=All, 2=Pending, 3=Accounted, 4=Not Accounted
  startDate: '2026-02-01',
  endDate: '2026-02-25',
  startTime: '08.00',       // optional: HH.mm format
  endTime: '20.00',         // optional: HH.mm format
});

console.log(`Found ${auths.numberOfItems} authorizations`);
for (const auth of auths.authorizations) {
  console.log(auth.orderId, auth.transactionAmount, auth.transactionResult);
}

// Search by specific transaction ID
const single = await vpos.listAuthorizations({
  filter: '1',
  transactionId: '8032180310AB0E30917930112',
});
```

## Webhook Verification

When SIA sends server-to-server notifications (URLMS), verify the response MAC:

```typescript
// In your Express/Next.js webhook handler:
app.post('/api/vpos/webhook', (req, res) => {
  const xml = req.body; // raw XML string

  // Parse the webhook data
  const data = vpos.parseWebhook(xml);

  // Verify root MAC (Timestamp + Result)
  const isValid = vpos.verifyBPWResponseMAC(
    data.timestamp,
    data.result,
    data.mac
  );

  if (!isValid) {
    return res.status(400).send('Invalid MAC');
  }

  if (data.result === '00' && data.authorization) {
    // Payment successful
    console.log('Order:', data.authorization.orderId);
    console.log('Amount:', data.authorization.authorizedAmount);
  }

  res.status(200).send('OK');
});
```

## MAC Algorithms

The SDK supports 3 hash algorithms (spec section 4.2):

| Algorithm | MAC Length | Method |
|---|---|---|
| `md5` | 32 chars | `MD5(text + secretKey)` |
| `sha1` | 40 chars | `SHA1(text + secretKey)` |
| `hmac-sha256` | 64 chars | `HMAC-SHA256(text, secretKey)` **(recommended)** |

## Result Codes

| Code | Description |
|---|---|
| `00` | Success |
| `02` | ReqRefNum duplicated or incorrect |
| `03` | Incorrect message format |
| `04` | Incorrect MAC / authentication |
| `06` | Processing error |
| `07` | TransactionID not found |
| `13` | Duplicated order |
| `99` | Transaction failed (see Data) |

Full list available via `import { RESULT_CODES } from '@networksolution/sia-vpos-node'`.

## Link Statuses

| Code | Status |
|---|---|
| `00` | Created |
| `01` | Returned |
| `02` | Sent |
| `03` | Used |
| `04` | Paid |
| `05` | Revoked |

## Constants

All constants are importable:

```typescript
import {
  RESULT_CODES,           // API result codes
  REDIRECT_RESULT_CODES,  // Redirect outcome codes
  LINK_STATUS,            // Pay-By-Link statuses
  NETWORK_CODES,          // Payment method / network codes
  TRANSACTION_TYPES,      // Transaction type codes (TT01, TT06, etc.)
} from '@networksolution/sia-vpos-node';
```

## Secret Keys

SIA VPOS provides two separate secret strings:

| Key | Used For |
|---|---|
| **Start key** (`startKey`) | Generating MAC for redirect payment initiation |
| **API-Result key** (`apiResultKey`) | Verifying outcome MAC + API operations |

If you only use API operations (not redirect), a single `secretKey` is sufficient.

## Changelog

### 1.3.1

- **Fix (critical)**: API operations (`orderStatus`, `authorize`, `accounting`, `refund`, `listOperations`, `listAuthorizations`, etc.) now correctly use `apiResultKey` instead of `secretKey` for MAC generation, per SIA VPOS specification
- **Fix**: Redirect forms (`buildRedirectForm`, `buildTokenRedirectForm`) correctly use `secretKey` (Start key) for MAC generation

### 1.3.0

- **Fix**: `orderStatus()` MAC field order corrected (OPTIONS before PRODUCTREF per spec 4.2.6)
- **Fix**: `verifyResponseMAC()` now produces correct values-only MAC format per spec 4.2.7
- **Fix**: `verifyAuthorizationMAC()` now includes `ibanCode` field per spec 4.2.9

### 1.2.0

- Added LISTOPERATION and LISTAUTHORIZATION consultation operations
- Added Pay-By-Link: CREATELINK, LISTLINK, REVOKELINK
- Added Redirect integration with 3DS 2.0 data encryption
- Added Token payment (saved card) redirect support
- Added outcome verification (URLMS / URLDONE)

### 1.0.0

- Initial release: Authorization, Accounting, Reverse Accounting, Refund, Order Status
- MAC support: HMAC-SHA256, SHA-1, MD5
- Webhook verification

## License

MIT
