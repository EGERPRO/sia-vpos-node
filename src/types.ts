// ─── Configuration ────────────────────────────────────────────────────────────

export type HashAlgorithm = 'sha1' | 'md5' | 'hmac-sha256';

export type VposEnvironment = 'test' | 'production';

export interface VposConfig {
  /** Merchant store identifier (MID) - 15 chars */
  shopId: string;
  /** Operator identifier (User ID) - 8-18 chars */
  operatorId: string;
  /** Shared secret string (50 or 100 chars). Used for API operations.
   *  For redirect, acts as both startKey and apiResultKey if they are not set. */
  secretKey: string;
  /** Start key for redirect MAC generation (50 or 100 chars).
   *  If not set, secretKey is used. */
  startKey?: string;
  /** API-Result key for verifying outcome MACs from SIA (50 or 100 chars).
   *  If not set, secretKey is used. */
  apiResultKey?: string;
  /** Hash algorithm: 'sha1' | 'md5' | 'hmac-sha256' (recommended) */
  hashAlgorithm?: HashAlgorithm;
  /** Environment: 'test' or 'production'. Defaults to 'test' for safety.
   *  Can also be set via VPOS_ENV environment variable. */
  environment?: VposEnvironment;
  /** Custom API URL - overrides environment-based URL if provided */
  apiUrl?: string;
  /** Custom Redirect URL - overrides environment-based redirect URL if provided */
  redirectUrl?: string;
  /** Release version - defaults to '02' */
  release?: string;
}

// ─── Common ──────────────────────────────────────────────────────────────────

export interface HeaderData {
  shopId: string;
  operatorId: string;
  reqRefNum: string;
}

// ─── Authorization (HPP) ─────────────────────────────────────────────────────

export interface AuthorizationRequest {
  /** Unique order identifier (1-50 chars) */
  orderId: string;
  /** Card number (PAN) - 10-19 chars */
  pan: string;
  /** Card expiry date - yyMM format */
  expDate: string;
  /** Amount in smallest currency unit (EUR cents) */
  amount: number;
  /** ISO currency code (978 = EUR) */
  currency?: string;
  /** Exponent of the currency */
  exponent?: string;
  /** Accounting mode: D=Deferred, I=Immediate */
  accountingMode: 'D' | 'I';
  /** Network code (01=VISA, 02=MasterCard, etc. 93=auto) */
  network: string;
  /** CVV2 code (optional) */
  cvv2?: string;
  /** Create PAN alias: S=DO, null=DON'T */
  createPanAlias?: 'S';
  /** Cardholder email */
  emailCH?: string;
  /** Cardholder identifier */
  userId?: string;
  /** Acquirer code */
  acquirer?: string;
  /** IP address */
  ipAddress?: string;
  /** Operation description (max 100) */
  opDescr?: string;
  /** User auth flag: 0=occasional, 1=registered, 2=unrecognized */
  usrAuthFlag?: '0' | '1' | '2';
  /** Additional options (max 26 chars) */
  options?: string;
  /** Antifraud payload */
  antifraud?: string;
  /** Sale identifier (max 15) */
  productRef?: string;
  /** Cardholder first name (max 40) */
  name?: string;
  /** Cardholder surname (max 40) */
  surname?: string;
  /** Cardholder tax ID (max 16) */
  taxId?: string;
  /** Recurring payment type: R, U, C */
  tRecurr?: 'R' | 'U' | 'C';
  /** Recurring code (max 50) */
  cRecurr?: string;
  /** Installments number (0-99) */
  installmentsNumber?: string;
}

export interface AuthorizationResponse {
  paymentType: string;
  authorizationType: string;
  transactionId: string;
  network: string;
  orderId: string;
  transactionAmount: string;
  authorizedAmount: string;
  currency: string;
  exponent: string;
  accountedAmount: string;
  refundedAmount: string;
  transactionResult: string;
  timestamp: string;
  authorizationNumber: string;
  acquirerBIN: string;
  merchantId: string;
  transactionStatus: string;
  responseCodeISO?: string;
  panTail?: string;
  panExpiryDate?: string;
  paymentTypePP?: string;
  rrn?: string;
  cardType?: string;
  cardholderInfo?: string;
  ibanCode?: string;
  mac: string;
}

export interface PanAliasData {
  panAlias: string;
  panAliasRev: string;
  panAliasExpDate: string;
  panAliasTail: string;
  cRecurr?: string;
  mac: string;
}

// ─── Pay-By-Link (CREATELINK) ────────────────────────────────────────────────

export interface CreateLinkRequest {
  /** Send email: Y or N */
  sendMail: 'Y' | 'N';
  /** Link expiration (yyyy-MM-ddTHH:mm:ss.SSS) */
  linkExpirationDate?: string;
  /** Amount in smallest currency unit (EUR cents) */
  linkAmount: number;
  /** ISO currency code (978 = EUR) */
  linkCurrency?: string;
  /** Currency exponent */
  linkExponent?: string;
  /** Unique order identifier (max 50, must be unique for 5 years) */
  linkOrderId: string;
  /** Redirect URL on success (max 254) */
  linkUrlDone?: string;
  /** Server-to-server notification URL (max 254) */
  linkUrlMs: string;
  /** Accounting mode: D=Deferred, I=Immediate */
  linkAccountingMode: 'D' | 'I';
  /** Authorization mode (must be 'I') */
  linkAuthorMode: 'I';
  /** Language: ITA or EN */
  linkLang?: string;
  /** Shop email for transaction outcome (max 50) */
  linkShopEmail?: string;
  /** Additional options (max 10) */
  linkOptions?: string;
  /** Commission amount in cents (max 8) */
  linkCommis?: string;
  /** Cardholder email (max 50) */
  linkEmail?: string;
  /** Cardholder name (max 40) */
  linkName: string;
  /** Cardholder surname (max 40) */
  linkSurname: string;
  /** Order description (max 140) */
  linkOrdDescr?: string;
  /** Operation description (max 100) */
  linkOpDescr?: string;
  /** Phone number for Jiffy (10-14 chars) */
  linkPhoneNumber?: string;
  /** Min months of card remaining duration (0-60) */
  linkRemainingDuration?: string;
  /** Merchant user ID (max 255) */
  linkUserId?: string;
  /** Sale identifier (max 15) */
  linkProductRef?: string;
  /** Recurring type: R, U, C */
  linkTRecurr?: 'R' | 'U' | 'C';
  /** Recurring code (max 50) */
  linkCRecurr?: string;
  /** 3DS data (max 5000) */
  threeDsData?: string;
  /** Additional options */
  options?: string;
}

export interface LinkCreatedData {
  completeLink: string;
  token: string;
  creationDate: string;
  status: string;
  lastUseDate: string;
  expirationDate: string;
  revokeDate: string;
  orderId: string;
  mac: string;
}

// ─── List Links (LISTLINK) ───────────────────────────────────────────────────

export interface ListLinkRequest {
  /** Search start date (yyyy-MM-dd) */
  startDate: string;
  /** Search end date (yyyy-MM-dd) */
  endDate: string;
  /** Filter by status */
  linkStatus?: string;
  /** Filter by order ID */
  orderId?: string;
  /** Filter by token */
  token?: string;
  /** Additional options */
  options?: string;
}

// ─── Revoke Link (REVOKELINK) ────────────────────────────────────────────────

export interface RevokeLinkRequest {
  /** Token of the link to revoke */
  token: string;
  /** Additional options */
  options?: string;
}

// ─── Accounting / Booking (ACCOUNTING) ───────────────────────────────────────

export interface AccountingRequest {
  /** Transaction ID from the authorization */
  transactionId: string;
  /** Order ID */
  orderId: string;
  /** Amount in cents */
  amount: number;
  /** ISO currency code */
  currency?: string;
  /** Currency exponent */
  exponent?: string;
  /** Operation description (max 100) */
  opDescr?: string;
  /** Additional options */
  options?: string;
}

// ─── Reverse Accounting (REVERSEACCOUNTING) ──────────────────────────────────

export interface ReverseAccountingRequest {
  /** Transaction ID of the booking to cancel */
  transactionId: string;
  /** Order ID */
  orderId: string;
  /** Additional options */
  options?: string;
}

// ─── Refund (REFUND) ─────────────────────────────────────────────────────────

export interface RefundRequest {
  /** Transaction ID of the authorization */
  transactionId: string;
  /** Order ID */
  orderId: string;
  /** Amount to refund in cents */
  amount: number;
  /** ISO currency code */
  currency?: string;
  /** Currency exponent */
  exponent?: string;
  /** Operation description (max 100) */
  opDescr?: string;
  /** Additional options */
  options?: string;
}

// ─── Order Status (ORDERSTATUS) ──────────────────────────────────────────────

export interface OrderStatusRequest {
  /** Order ID to query */
  orderId: string;
  /** Product reference */
  productRef?: string;
  /** Additional options */
  options?: string;
}

// ─── List Operations (LISTOPERATION) ────────────────────────────────────────

export interface ListOperationRequest {
  /** Search start date (yyyy-MM-dd) */
  startDate: string;
  /** Search end date (yyyy-MM-dd) */
  endDate: string;
  /** Source type filter: 01=BO, 02=API, 03=BatchFile, 04=Scheduler */
  srcType?: string;
  /** Operation description filter (max 100) */
  opDescr?: string;
  /** Additional options */
  options?: string;
}

// ─── List Authorizations (LISTAUTHORIZATION) ────────────────────────────────

export interface ListAuthorizationRequest {
  /** Filter type: 1=All, 2=Pending, 3=Accounted, 4=Not Accounted */
  filter: string;
  /** Search start date (yyyy-MM-dd) - required when searching by date */
  startDate?: string;
  /** Search end date (yyyy-MM-dd) - required when searching by date */
  endDate?: string;
  /** Transaction ID - for searching by specific transaction */
  transactionId?: string;
  /** Start time (HH.mm) - for filtering by time range */
  startTime?: string;
  /** End time (HH.mm) - for filtering by time range */
  endTime?: string;
  /** Additional options */
  options?: string;
}

// ─── Operation Response (shared by Accounting, Refund, etc.) ─────────────────

export interface OperationData {
  transactionId: string;
  timestampReq: string;
  timestampElab: string;
  srcType: string;
  amount: string;
  result: string;
  status: string;
  opDescr?: string;
  mac: string;
  authorization?: AuthorizationResponse;
}

// ─── BPWXmlResponse (root) ───────────────────────────────────────────────────

export interface VposResponse {
  timestamp: string;
  result: string;
  mac: string;
  data?: Record<string, any>;
}

// ─── Result codes ────────────────────────────────────────────────────────────

export const RESULT_CODES: Record<string, string> = {
  '00': 'Success',
  '01': 'Order or ReqRefNum not found',
  '02': 'ReqRefNum duplicated or not valid',
  '03': 'Incorrect message format, missing or incorrect field',
  '04': 'Incorrect API authentication, incorrect MAC',
  '05': 'Incorrect date, or period indicated is empty',
  '06': 'Unforeseen error in the circuit during processing of request',
  '07': 'TransactionID not found',
  '08': 'Operator indicated not found',
  '09': 'TRANSACTIONID does not reference the entered ORDERID',
  '10': 'Amount exceeds maximum amount permitted',
  '11': 'Incorrect status. Transaction not possible in the current status',
  '12': 'Circuit disabled',
  '13': 'Duplicated order',
  '16': 'Currency not supported or not available for the merchant',
  '17': 'Exponent not supported for the chosen currency',
  '20': 'VBV/SecureCode/SafeKey-enabled card, redirection needed',
  '21': 'Maximum time-limit for VBV request step 2 expired',
  '25': 'A call to 3DS method must be performed by the Requestor',
  '26': 'A challenge flow must be initiated by the Requestor',
  '35': 'No payment instrument is acceptable',
  '37': 'Missing CVV2',
  '38': 'Pan alias not found or revoked',
  '40': 'Empty XML or missing data parameter',
  '41': 'XML not parsable',
  '50': 'Installments not available',
  '51': 'Installment number out of bounds',
  '52': 'No link found with the preset search criteria',
  '98': 'Application error',
  '99': 'Transaction failed, see specific outcome in Data element',
};

export const LINK_STATUS: Record<string, string> = {
  '00': 'Created',
  '01': 'Returned',
  '02': 'Sent',
  '03': 'Used',
  '04': 'Paid',
  '05': 'Revoked',
};

// ═══════════════════════════════════════════════════════════════════════════════
//  REDIRECT INTEGRATION
// ═══════════════════════════════════════════════════════════════════════════════

// ─── Redirect Payment Initiation (4.2.1) ────────────────────────────────────

export interface RedirectRequest {
  /** Amount in smallest currency unit (EUR cents). Min 1, max 8 digits */
  amount: number;
  /** ISO currency code (978 = EUR) */
  currency: string;
  /** Unique order ID (max 50 chars, unique for 5 years). Regex: [a-zA-Z0-9\-_] */
  orderId: string;
  /** Complete URL for cancelled payment redirect (max 254) */
  urlBack: string;
  /** Complete URL for successful payment redirect (max 254) */
  urlDone: string;
  /** Server-to-server notification URL (max 400, standard ports only) */
  urlMs: string;
  /** Accounting mode: D=Deferred, I=Immediate */
  accountingMode: 'D' | 'I';
  /** Authorization mode: D=Deferred, I=Immediate (usually I) */
  authorMode: 'D' | 'I';
  /** URLMS header params (max 2000) */
  urlMsHeader?: string;
  /** Language: EN, IT/ITA, SR, SC, SK, AL, EL, HU */
  lang?: string;
  /** Shop email for transaction results (7-50 chars) */
  shopEmail?: string;
  /** OPTIONS flags (e.g. 'BGH') */
  options?: string;
  /** Restrict payment methods. 01=Visa, 02=MC, CC=cards, NC=non-cards, etc. */
  lockCard?: string;
  /** Customer email (7-50 chars) */
  email?: string;
  /** Order description (max 140, for OPTIONS O or V) */
  ordDescr?: string;
  /** MyBank validation service ID (max 35) */
  vsid?: string;
  /** Capture operation description (max 100) */
  opDescr?: string;
  /** Min card validity in months (for OPTIONS D) */
  remainingDuration?: string;
  /** User identifier (max 255) */
  userId?: string;
  /** Phone number for BancomatPay (10-14 chars) */
  phoneNumber?: string;
  /** Reason for BancomatPay */
  causation?: string;
  /** User for BancomatPay */
  user?: string;
  /** Customer first name (max 40, for OPTIONS B) */
  name?: string;
  /** Customer surname (max 40, for OPTIONS B) */
  surname?: string;
  /** Customer tax ID */
  taxId?: string;
  /** Sale identifier (max 50) */
  productRef?: string;
  /** Antifraud data payload */
  antifraud?: string;
  /** 3DS 2.0 data (encrypted JSON, use encrypt3DSData helper) */
  threeDsData?: string;
  /** Recurring type: R, U, C */
  tRecurr?: 'R' | 'U' | 'C';
  /** Number of installments (0-99) */
  installmentsNumber?: string;
  /** Tickler plan ID */
  ticklerPlan?: string;
  /** Exponent of the currency (defaults to 2) */
  exponent?: string;
  /** Commission amount in cents (max 8, for OPTIONS F) */
  commis?: string;
}

// ─── Redirect with Token (4.2.4) ─────────────────────────────────────────────

export interface TokenRedirectRequest extends RedirectRequest {
  /** Token or pan alias of saved payment instrument */
  token: string;
  /** Expiry date of token (yyMM, or 9912 if unknown) */
  expDate?: string;
  /** Network/tokenization type: 83=COF, 88=tokenizator, 89=gateway, 98=standard (default 98) */
  network: string;
  /** IBAN for presaved IBAN payments */
  iban?: string;
  /** Recurring code for TRECURR=C */
  cRecurr?: string;
}

// ─── Redirect Outcome (4.2.3) ────────────────────────────────────────────────

export interface RedirectOutcome {
  orderId: string;
  shopId: string;
  authNumber: string;
  amount: string;
  currency: string;
  transactionId: string;
  accountingMode: string;
  authorMode: string;
  result: string;
  transactionType?: string;
  network?: string;
  mac: string;
  // Optional fields based on OPTIONS / services
  issuerCountry?: string;
  authCode?: string;
  payerId?: string;
  payer?: string;
  payerStatus?: string;
  hashPan?: string;
  panAlias?: string;
  panAliasRev?: string;
  panAliasExpDate?: string;
  panAliasTail?: string;
  maskedPan?: string;
  tRecurr?: string;
  cRecurr?: string;
  panTail?: string;
  panExpiryDate?: string;
  accountHolder?: string;
  iban?: string;
  aliasStr?: string;
  ahEmail?: string;
  ahTaxId?: string;
  acquirerBin?: string;
  merchantId?: string;
  cardType?: string;
  amazonAuthId?: string;
  amazonCaptureId?: string;
  chInfo?: string;
  panCode?: string;
  installmentsNumber?: string;
  cardholderData?: string;
  threeDsResult?: string;
  subscriptionCode?: string;
}

// ─── Redirect Form Data (output of buildRedirectForm) ────────────────────────

export interface RedirectFormData {
  /** The URL to POST/redirect to */
  url: string;
  /** All form fields as key-value pairs (for hidden inputs) */
  fields: Record<string, string>;
  /** Pre-built HTML form string */
  html: string;
}

// ─── Network / LOCKCARD codes ────────────────────────────────────────────────

export const NETWORK_CODES: Record<string, string> = {
  '01': 'Visa',
  '02': 'Mastercard',
  '03': 'Dina',
  '04': 'Maestro',
  '06': 'American Express',
  '08': 'JCB',
  '80': 'IBAN',
  '81': 'AmazonPay',
  '82': 'EnelX',
  '83': 'COF (Card on File)',
  '84': 'Satispay',
  '88': 'Tokenizator Pan Alias',
  '89': 'ApplePay / Gateway Pan Alias',
  '91': 'BancomatPay (Jiffy)',
  '92': 'Paga con Postepay',
  '93': 'Auto-detect',
  '94': 'Postepay',
  '96': 'MyBank',
  '97': 'Paypal',
  '98': 'Standard SIA VPOS Pan Alias',
  'A1': 'Google Pay',
  'CC': 'Credit cards only',
  'NC': 'Non-card instruments only',
};

// ─── Redirect RESULT codes (different from API) ──────────────────────────────

export const REDIRECT_RESULT_CODES: Record<string, string> = {
  '00': 'Success',
  '01': 'Denied by system',
  '02': 'Denied due to store configuration issues',
  '03': 'Denied due to communication issues with authorization circuits',
  '04': 'Denied by card issuer',
  '05': 'Denied due to incorrect card number',
  '06': 'Unforeseen error during processing of request',
  '07': 'Duplicated order',
  '10': 'Card not eligible for installments',
  '50': 'Installments not available',
  '51': 'Installment number out of bounds',
  '60': 'Denied: failed Riskshield antifraud check',
  '61': 'Denied: failed AmexPan antifraud check',
  '62': 'Denied: failed AmexPanIP antifraud check',
  '63': 'Denied: failed H3GPan antifraud check',
  '64': 'Denied: failed ItaPanCountry antifraud check',
  '65': 'Denied: failed PaypalCountry antifraud check',
  '66': 'Denied: failed CardEnrolledAuthenticate antifraud check',
  '67': 'Denied: failed PanBlackList antifraud check',
  '68': 'Denied: failed CountryPan antifraud check',
  '69': 'Denied: failed PrepaidPan antifraud check',
  '70': 'Denied: failed DebitPan antifraud check',
  '71': 'Denied: failed VirtualPan antifraud check',
  '72': 'Denied: failed ThresholdAmount antifraud check',
  '73': 'Denied: failed H3GPanLit antifraud check',
  '74': 'Denied: failed AcqrBinTab antifraud check',
  '75': 'Denied: failed CountryWL antifraud check',
  '76': 'Denied: failed PrepgWLPan antifraud check',
  '77': 'Denied: failed IllimitPan antifraud check',
  '90': 'Denied: no card authentication method for the customer',
};

// ─── Transaction Type codes ──────────────────────────────────────────────────

export const TRANSACTION_TYPES: Record<string, string> = {
  'TT01': 'SSL',
  'TT06': 'VBV (Verified by Visa)',
  'TT07': 'Secure Code (Mastercard)',
  'TT08': 'Merchant VBV',
  'TT09': 'Merchant Secure Code',
  'TT10': 'Not authenticated owner VBV',
  'TT11': 'Mail Order Telephone Order',
  'TT13': 'SafeKey (AMEX)',
  'TT14': 'Merchant SafeKey',
  'TT15': 'Not authenticated owner SafeKey',
  'TT16': 'ProtectBuy',
  'TT17': 'Merchant ProtectBuy',
  'TT18': 'Not authenticated owner ProtectBuy',
};
