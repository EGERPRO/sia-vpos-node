import CryptoJS from 'crypto-js';
import { generateMAC, verifyMAC, computeHash } from './mac';
import {
  buildBPWXmlRequest,
  buildHeaderXml,
  el,
  parseBPWXmlResponse,
  parseAuthorization,
  parsePanAliasData,
  parseOperation,
  parseOperationList,
  parseAuthorizationList,
  parseLinkCreated,
  parseLinkCreatedList,
  getXmlValue,
} from './xml';
import type {
  VposConfig,
  VposEnvironment,
  HashAlgorithm,
  AuthorizationRequest,
  CreateLinkRequest,
  ListLinkRequest,
  RevokeLinkRequest,
  AccountingRequest,
  ReverseAccountingRequest,
  RefundRequest,
  OrderStatusRequest,
  ListOperationRequest,
  ListAuthorizationRequest,
  RedirectRequest,
  TokenRedirectRequest,
  RedirectOutcome,
  RedirectFormData,
} from './types';

// ─── Defaults ────────────────────────────────────────────────────────────────

const API_URLS: Record<VposEnvironment, string> = {
  production: 'https://virtualpos.sia.eu/vpos/apibo/apiBOXML-UTF8.app',
  test: 'https://virtualpostest.sia.eu/vpos/apibo/apiBOXML-UTF8.app',
};
const REDIRECT_URLS: Record<VposEnvironment, string> = {
  production: 'https://virtualpos.sia.eu/vpos/payments/main',
  test: 'https://virtualpostest.sia.eu/vpos/payments/main',
};
const DEFAULT_RELEASE = '02';
const DEFAULT_CURRENCY = '978'; // EUR
const DEFAULT_EXPONENT = '2';

function resolveEnvironment(config: VposConfig): VposEnvironment {
  return config.environment
    || (typeof process !== 'undefined' && process.env?.VPOS_ENV as VposEnvironment)
    || 'test';
}

/**
 * Resolve the API URL from config or VPOS_ENV env variable.
 * Priority: config.apiUrl > config.environment > VPOS_ENV > 'test' (default)
 */
function resolveApiUrl(config: VposConfig): string {
  if (config.apiUrl) return config.apiUrl;
  return API_URLS[resolveEnvironment(config)] || API_URLS.test;
}

function resolveRedirectUrl(config: VposConfig): string {
  if (config.redirectUrl) return config.redirectUrl;
  return REDIRECT_URLS[resolveEnvironment(config)] || REDIRECT_URLS.test;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Generate timestamp in yyyy-MM-ddTHH:mm:ss.SSS format
 */
export function generateTimestamp(date?: Date): string {
  const d = date || new Date();
  const pad = (n: number, len = 2) => String(n).padStart(len, '0');
  return [
    d.getFullYear(), '-', pad(d.getMonth() + 1), '-', pad(d.getDate()),
    'T',
    pad(d.getHours()), ':', pad(d.getMinutes()), ':', pad(d.getSeconds()),
    '.', pad(d.getMilliseconds(), 3),
  ].join('');
}

/**
 * Generate ReqRefNum: first 8 digits = yyyyMMdd, remaining 24 = random numeric
 * Total: 32 chars numeric
 */
export function generateReqRefNum(date?: Date): string {
  const d = date || new Date();
  const pad = (n: number, len = 2) => String(n).padStart(len, '0');
  const datePrefix = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
  let random = '';
  for (let i = 0; i < 24; i++) {
    random += Math.floor(Math.random() * 10).toString();
  }
  return datePrefix + random;
}

// ─── Main Client ─────────────────────────────────────────────────────────────

export class VposClient {
  private config: Required<Pick<VposConfig, 'shopId' | 'operatorId' | 'secretKey'>> & {
    startKey: string;
    apiResultKey: string;
    hashAlgorithm: HashAlgorithm;
    apiUrl: string;
    redirectUrl: string;
    environment: VposEnvironment;
    release: string;
  };

  constructor(config: VposConfig) {
    const environment = resolveEnvironment(config);

    this.config = {
      shopId: config.shopId,
      operatorId: config.operatorId,
      secretKey: config.secretKey,
      startKey: config.startKey || config.secretKey,
      apiResultKey: config.apiResultKey || config.secretKey,
      hashAlgorithm: config.hashAlgorithm || 'hmac-sha256',
      apiUrl: resolveApiUrl(config),
      redirectUrl: resolveRedirectUrl(config),
      environment,
      release: config.release || DEFAULT_RELEASE,
    };
  }

  /** Returns true if using the test environment */
  get isTest(): boolean {
    return this.config.environment === 'test';
  }

  /** Returns true if using the production environment */
  get isProduction(): boolean {
    return this.config.environment === 'production';
  }

  /** Returns the current API URL */
  get apiUrl(): string {
    return this.config.apiUrl;
  }

  /** Returns the current Redirect URL */
  get redirectUrl(): string {
    return this.config.redirectUrl;
  }

  // ── Internal: send XML request to VPOS ──────────────────────────────────────

  private async sendRequest(xml: string): Promise<string> {
    const body = `data=${encodeURIComponent(xml)}`;
    const response = await fetch(this.config.apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    if (!response.ok) {
      throw new Error(`SIA VPOS HTTP error: ${response.status} ${response.statusText}`);
    }
    return response.text();
  }

  // ══════════════════════════════════════════════════════════════════════════════
  //  AUTHORIZATION (Hosted Payment Page - server-to-server)
  // ══════════════════════════════════════════════════════════════════════════════

  async authorize(data: AuthorizationRequest) {
    const timestamp = generateTimestamp();
    const reqRefNum = generateReqRefNum();
    const currency = data.currency || DEFAULT_CURRENCY;
    const exponent = data.exponent || DEFAULT_EXPONENT;

    // MAC fields per spec 4.2.10 — order is critical!
    const macFields: [string, string | number | undefined][] = [
      ['OPERATION', 'AUTHORIZATION'],
      ['TIMESTAMP', timestamp],
      ['SHOPID', this.config.shopId],
      ['ORDERID', data.orderId],
      ['OPERATORID', this.config.operatorId],
      ['REQREFNUM', reqRefNum],
      ['PAN', data.pan],
      ['CVV2', data.cvv2],
      ['EXPDATE', data.expDate],
      ['AMOUNT', data.amount],
      ['CURRENCY', currency],
      ['EXPONENT', exponent],
      ['ACCOUNTINGMODE', data.accountingMode],
      ['NETWORK', data.network],
      ['EMAILCH', data.emailCH],
      ['USERID', data.userId],
      ['ACQUIRER', data.acquirer],
      ['IPADDRESS', data.ipAddress],
      ['OPDESCR', data.opDescr],
      ['USRAUTHFLAG', data.usrAuthFlag],
      ['OPTIONS', data.options],
      ['ANTIFRAUD', data.antifraud],
      ['PRODUCTREF', data.productRef],
      ['NAME', data.name],
      ['SURNAME', data.surname],
      ['TAXID', data.taxId],
      ['TRECURR', data.tRecurr],
      ['CRECURR', data.cRecurr],
      ['INSTALLMENTSNUMBER', data.installmentsNumber],
    ];

    const mac = generateMAC(macFields, this.config.apiResultKey, this.config.hashAlgorithm);

    // Build inner Data XML
    const dataXml = [
      '<AuthorizationRequest>',
      buildHeaderXml(this.config.shopId, this.config.operatorId, reqRefNum),
      el('OrderID', data.orderId),
      el('Pan', data.pan),
      el('CVV2', data.cvv2),
      el('CreatePanAlias', data.createPanAlias),
      el('ExpDate', data.expDate),
      el('Amount', data.amount),
      el('Currency', currency),
      el('Exponent', exponent),
      el('AccountingMode', data.accountingMode),
      el('Network', data.network),
      el('EmailCH', data.emailCH),
      el('Userid', data.userId),
      el('OpDescr', data.opDescr),
      el('IpAddress', data.ipAddress),
      el('UsrAuthFlag', data.usrAuthFlag),
      el('Options', data.options),
      el('Antifraud', data.antifraud),
      el('ProductRef', data.productRef),
      el('Name', data.name),
      el('Surname', data.surname),
      el('TaxID', data.taxId),
      el('TRecurr', data.tRecurr),
      el('CRecurr', data.cRecurr),
      el('InstallmentsNumber', data.installmentsNumber),
      '</AuthorizationRequest>',
    ].filter(Boolean).join('\n');

    const xml = buildBPWXmlRequest({
      release: this.config.release,
      operation: 'AUTHORIZATION',
      timestamp,
      mac,
      dataXml,
    });

    const responseXml = await this.sendRequest(xml);
    const parsed = parseBPWXmlResponse(responseXml);

    return {
      ...parsed,
      authorization: parsed.data ? parseAuthorization(parsed.data) : undefined,
      panAliasData: parsed.data ? parsePanAliasData(parsed.data) : undefined,
    };
  }

  // ══════════════════════════════════════════════════════════════════════════════
  //  PAY-BY-LINK: CREATELINK
  // ══════════════════════════════════════════════════════════════════════════════

  async createLink(data: CreateLinkRequest) {
    const timestamp = generateTimestamp();
    const reqRefNum = generateReqRefNum();
    const currency = data.linkCurrency || DEFAULT_CURRENCY;
    const exponent = data.linkExponent || DEFAULT_EXPONENT;

    // MAC fields per spec 4.2.23 — order is critical!
    const macFields: [string, string | number | undefined][] = [
      ['OPERATION', 'CREATELINK'],
      ['TIMESTAMP', timestamp],
      ['REQREFNUM', reqRefNum],
      ['SHOPID', this.config.shopId],
      ['OPERATORID', this.config.operatorId],
      ['SENDMAIL', data.sendMail],
      ['LINKEXPIRATIONDATE', data.linkExpirationDate],
      ['LINKAMOUNT', data.linkAmount],
      ['LINKCURRENCY', currency],
      ['LINKEXPONENT', exponent],
      ['LINKORDERID', data.linkOrderId],
      ['LINKURLDONE', data.linkUrlDone],
      ['LINKURLMS', data.linkUrlMs],
      ['LINKACCOUNTINGMODE', data.linkAccountingMode],
      ['LINKAUTHORMODE', data.linkAuthorMode],
      ['LINKLANG', data.linkLang],
      ['LINKSHOPEMAIL', data.linkShopEmail],
      ['LINKOPTIONS', data.linkOptions],
      ['LINKCOMMIS', data.linkCommis],
      ['LINKEMAIL', data.linkEmail],
      ['LINKNAME', data.linkName],
      ['LINKSURNAME', data.linkSurname],
      ['LINKORDDESCR', data.linkOrdDescr],
      ['LINKOPDESCR', data.linkOpDescr],
      ['LINKPHONENUMBER', data.linkPhoneNumber],
      ['LINKREMAININGDURATION', data.linkRemainingDuration],
      ['LINKUSERID', data.linkUserId],
      ['LINKPRODUCTREF', data.linkProductRef],
      ['LINKTRECURR', data.linkTRecurr],
      ['LINKCRECURR', data.linkCRecurr],
      ['THREEDSDATA', data.threeDsData],
      ['OPTIONS', data.options],
    ];

    const mac = generateMAC(macFields, this.config.apiResultKey, this.config.hashAlgorithm);

    const dataXml = [
      '<CreateLinkRequest>',
      buildHeaderXml(this.config.shopId, this.config.operatorId, reqRefNum),
      el('Sendmail', data.sendMail),
      el('LinkExpirationDate', data.linkExpirationDate),
      el('LinkAmount', data.linkAmount),
      el('LinkCurrency', currency),
      el('LinkExponent', exponent),
      el('LinkOrderId', data.linkOrderId),
      el('LinkUrlDone', data.linkUrlDone),
      el('LinkUrlMs', data.linkUrlMs),
      el('LinkAccountingMode', data.linkAccountingMode),
      el('LinkAuthorMode', data.linkAuthorMode),
      el('LinkLang', data.linkLang),
      el('LinkShopEmail', data.linkShopEmail),
      el('LinkOptions', data.linkOptions),
      el('LinkCommis', data.linkCommis),
      el('LinkEmail', data.linkEmail),
      el('LinkName', data.linkName),
      el('LinkSurname', data.linkSurname),
      el('LinkOrdDescr', data.linkOrdDescr),
      el('LinkOpDescr', data.linkOpDescr),
      el('LinkPhoneNumber', data.linkPhoneNumber),
      el('LinkRemainingDuration', data.linkRemainingDuration),
      el('LinkUserId', data.linkUserId),
      el('LinkProductRef', data.linkProductRef),
      el('LinkTRecurr', data.linkTRecurr),
      el('LinkCRecurr', data.linkCRecurr),
      el('ThreeDsData', data.threeDsData),
      '</CreateLinkRequest>',
    ].filter(Boolean).join('\n');

    const xml = buildBPWXmlRequest({
      release: this.config.release,
      operation: 'CREATELINK',
      timestamp,
      mac,
      dataXml,
    });

    const responseXml = await this.sendRequest(xml);
    const parsed = parseBPWXmlResponse(responseXml);

    return {
      ...parsed,
      linkCreated: parsed.data ? parseLinkCreated(parsed.data) : undefined,
    };
  }

  // ══════════════════════════════════════════════════════════════════════════════
  //  PAY-BY-LINK: LISTLINK
  // ══════════════════════════════════════════════════════════════════════════════

  async listLinks(data: ListLinkRequest) {
    const timestamp = generateTimestamp();
    const reqRefNum = generateReqRefNum();

    // MAC fields per spec 4.2.24
    const macFields: [string, string | number | undefined][] = [
      ['OPERATION', 'LISTLINK'],
      ['TIMESTAMP', timestamp],
      ['REQREFNUM', reqRefNum],
      ['SHOPID', this.config.shopId],
      ['OPERATORID', this.config.operatorId],
      ['STARTDATE', data.startDate],
      ['ENDDATE', data.endDate],
      ['LINKSTATUS', data.linkStatus],
      ['ORDERID', data.orderId],
      ['TOKEN', data.token],
      ['OPTIONS', data.options],
    ];

    const mac = generateMAC(macFields, this.config.apiResultKey, this.config.hashAlgorithm);

    const dataXml = [
      '<ListLinkRequest>',
      buildHeaderXml(this.config.shopId, this.config.operatorId, reqRefNum),
      el('StartDate', data.startDate),
      el('EndDate', data.endDate),
      el('LinkStatus', data.linkStatus),
      el('OrderId', data.orderId),
      el('Token', data.token),
      '</ListLinkRequest>',
    ].filter(Boolean).join('\n');

    const xml = buildBPWXmlRequest({
      release: this.config.release,
      operation: 'LISTLINK',
      timestamp,
      mac,
      dataXml,
    });

    const responseXml = await this.sendRequest(xml);
    const parsed = parseBPWXmlResponse(responseXml);

    return {
      ...parsed,
      links: parsed.data ? parseLinkCreatedList(parsed.data) : [],
    };
  }

  // ══════════════════════════════════════════════════════════════════════════════
  //  PAY-BY-LINK: REVOKELINK
  // ══════════════════════════════════════════════════════════════════════════════

  async revokeLink(data: RevokeLinkRequest) {
    const timestamp = generateTimestamp();
    const reqRefNum = generateReqRefNum();

    // MAC fields per spec 4.2.25
    const macFields: [string, string | number | undefined][] = [
      ['OPERATION', 'REVOKELINK'],
      ['TIMESTAMP', timestamp],
      ['REQREFNUM', reqRefNum],
      ['SHOPID', this.config.shopId],
      ['OPERATORID', this.config.operatorId],
      ['TOKEN', data.token],
      ['OPTIONS', data.options],
    ];

    const mac = generateMAC(macFields, this.config.apiResultKey, this.config.hashAlgorithm);

    const dataXml = [
      '<RevokeLinkRequest>',
      buildHeaderXml(this.config.shopId, this.config.operatorId, reqRefNum),
      el('Token', data.token),
      '</RevokeLinkRequest>',
    ].filter(Boolean).join('\n');

    const xml = buildBPWXmlRequest({
      release: this.config.release,
      operation: 'REVOKELINK',
      timestamp,
      mac,
      dataXml,
    });

    const responseXml = await this.sendRequest(xml);
    return parseBPWXmlResponse(responseXml);
  }

  // ══════════════════════════════════════════════════════════════════════════════
  //  ACCOUNTING (Booking / Capture)
  // ══════════════════════════════════════════════════════════════════════════════

  async accounting(data: AccountingRequest) {
    const timestamp = generateTimestamp();
    const reqRefNum = generateReqRefNum();
    const currency = data.currency || DEFAULT_CURRENCY;
    const exponent = data.exponent || DEFAULT_EXPONENT;

    // MAC fields per spec 4.2.2
    const macFields: [string, string | number | undefined][] = [
      ['OPERATION', 'ACCOUNTING'],
      ['TIMESTAMP', timestamp],
      ['SHOPID', this.config.shopId],
      ['OPERATORID', this.config.operatorId],
      ['REQREFNUM', reqRefNum],
      ['TRANSACTIONID', data.transactionId],
      ['ORDERID', data.orderId],
      ['AMOUNT', data.amount],
      ['CURRENCY', currency],
      ['EXPONENT', exponent],
      ['OPDESCR', data.opDescr],
      ['OPTIONS', data.options],
    ];

    const mac = generateMAC(macFields, this.config.apiResultKey, this.config.hashAlgorithm);

    const dataXml = [
      '<Accounting>',
      buildHeaderXml(this.config.shopId, this.config.operatorId, reqRefNum),
      el('TransactionID', data.transactionId),
      el('OrderID', data.orderId),
      el('Amount', data.amount),
      el('Currency', currency),
      el('Exponent', exponent),
      el('OpDescr', data.opDescr),
      '</Accounting>',
    ].filter(Boolean).join('\n');

    const xml = buildBPWXmlRequest({
      release: this.config.release,
      operation: 'ACCOUNTING',
      timestamp,
      mac,
      dataXml,
    });

    const responseXml = await this.sendRequest(xml);
    const parsed = parseBPWXmlResponse(responseXml);

    return {
      ...parsed,
      operation: parsed.data ? parseOperation(parsed.data) : undefined,
    };
  }

  // ══════════════════════════════════════════════════════════════════════════════
  //  REVERSEACCOUNTING (Cancel Booking)
  // ══════════════════════════════════════════════════════════════════════════════

  async reverseAccounting(data: ReverseAccountingRequest) {
    const timestamp = generateTimestamp();
    const reqRefNum = generateReqRefNum();

    // MAC fields per spec 4.2.3
    const macFields: [string, string | number | undefined][] = [
      ['OPERATION', 'REVERSEACCOUNTING'],
      ['TIMESTAMP', timestamp],
      ['SHOPID', this.config.shopId],
      ['OPERATORID', this.config.operatorId],
      ['REQREFNUM', reqRefNum],
      ['TRANSACTIONID', data.transactionId],
      ['ORDERID', data.orderId],
      ['OPTIONS', data.options],
    ];

    const mac = generateMAC(macFields, this.config.apiResultKey, this.config.hashAlgorithm);

    const dataXml = [
      '<ReverseAccounting>',
      buildHeaderXml(this.config.shopId, this.config.operatorId, reqRefNum),
      el('TransactionID', data.transactionId),
      el('OrderID', data.orderId),
      '</ReverseAccounting>',
    ].filter(Boolean).join('\n');

    const xml = buildBPWXmlRequest({
      release: this.config.release,
      operation: 'REVERSEACCOUNTING',
      timestamp,
      mac,
      dataXml,
    });

    const responseXml = await this.sendRequest(xml);
    const parsed = parseBPWXmlResponse(responseXml);

    return {
      ...parsed,
      operation: parsed.data ? parseOperation(parsed.data) : undefined,
    };
  }

  // ══════════════════════════════════════════════════════════════════════════════
  //  REFUND (Payment Reversal)
  // ══════════════════════════════════════════════════════════════════════════════

  async refund(data: RefundRequest) {
    const timestamp = generateTimestamp();
    const reqRefNum = generateReqRefNum();
    const currency = data.currency || DEFAULT_CURRENCY;
    const exponent = data.exponent || DEFAULT_EXPONENT;

    // MAC fields per spec 4.2.1
    const macFields: [string, string | number | undefined][] = [
      ['OPERATION', 'REFUND'],
      ['TIMESTAMP', timestamp],
      ['SHOPID', this.config.shopId],
      ['OPERATORID', this.config.operatorId],
      ['REQREFNUM', reqRefNum],
      ['TRANSACTIONID', data.transactionId],
      ['ORDERID', data.orderId],
      ['AMOUNT', data.amount],
      ['CURRENCY', currency],
      ['EXPONENT', exponent],
      ['OPDESCR', data.opDescr],
      ['OPTIONS', data.options],
    ];

    const mac = generateMAC(macFields, this.config.apiResultKey, this.config.hashAlgorithm);

    const dataXml = [
      '<Refund>',
      buildHeaderXml(this.config.shopId, this.config.operatorId, reqRefNum),
      el('TransactionID', data.transactionId),
      el('OrderID', data.orderId),
      el('Amount', data.amount),
      el('Currency', currency),
      el('Exponent', exponent),
      el('OpDescr', data.opDescr),
      '</Refund>',
    ].filter(Boolean).join('\n');

    const xml = buildBPWXmlRequest({
      release: this.config.release,
      operation: 'REFUND',
      timestamp,
      mac,
      dataXml,
    });

    const responseXml = await this.sendRequest(xml);
    const parsed = parseBPWXmlResponse(responseXml);

    return {
      ...parsed,
      operation: parsed.data ? parseOperation(parsed.data) : undefined,
    };
  }

  // ══════════════════════════════════════════════════════════════════════════════
  //  ORDERSTATUS
  // ══════════════════════════════════════════════════════════════════════════════

  async orderStatus(data: OrderStatusRequest) {
    const timestamp = generateTimestamp();
    const reqRefNum = generateReqRefNum();

    // MAC fields per spec 4.2.6
    const macFields: [string, string | number | undefined][] = [
      ['OPERATION', 'ORDERSTATUS'],
      ['TIMESTAMP', timestamp],
      ['SHOPID', this.config.shopId],
      ['OPERATORID', this.config.operatorId],
      ['REQREFNUM', reqRefNum],
      ['ORDERID', data.orderId],
      ['OPTIONS', data.options],
      ['PRODUCTREF', data.productRef],
    ];

    const mac = generateMAC(macFields, this.config.apiResultKey, this.config.hashAlgorithm);

    const dataXml = [
      '<OrderStatus>',
      buildHeaderXml(this.config.shopId, this.config.operatorId, reqRefNum),
      el('OrderID', data.orderId),
      el('ProductRef', data.productRef),
      '</OrderStatus>',
    ].filter(Boolean).join('\n');

    const xml = buildBPWXmlRequest({
      release: this.config.release,
      operation: 'ORDERSTATUS',
      timestamp,
      mac,
      dataXml,
    });

    const responseXml = await this.sendRequest(xml);
    const parsed = parseBPWXmlResponse(responseXml);

    return {
      ...parsed,
      authorization: parsed.data ? parseAuthorization(parsed.data) : undefined,
      panAliasData: parsed.data ? parsePanAliasData(parsed.data) : undefined,
    };
  }

  // ══════════════════════════════════════════════════════════════════════════════
  //  LISTOPERATION (Consultation: list operations by date range)
  // ══════════════════════════════════════════════════════════════════════════════

  async listOperations(data: ListOperationRequest) {
    const timestamp = generateTimestamp();
    const reqRefNum = generateReqRefNum();

    // MAC fields per spec 4.2.4
    const macFields: [string, string | number | undefined][] = [
      ['OPERATION', 'LISTOPERATION'],
      ['TIMESTAMP', timestamp],
      ['SHOPID', this.config.shopId],
      ['OPERATORID', this.config.operatorId],
      ['REQREFNUM', reqRefNum],
      ['STARTDATE', data.startDate],
      ['ENDDATE', data.endDate],
      ['OPDESCR', data.opDescr],
      ['OPTIONS', data.options],
    ];

    const mac = generateMAC(macFields, this.config.apiResultKey, this.config.hashAlgorithm);

    const dataXml = [
      '<ListOperation>',
      buildHeaderXml(this.config.shopId, this.config.operatorId, reqRefNum),
      el('StartDate', data.startDate),
      el('EndDate', data.endDate),
      el('SrcType', data.srcType),
      el('OpDescr', data.opDescr),
      '</ListOperation>',
    ].filter(Boolean).join('\n');

    const xml = buildBPWXmlRequest({
      release: this.config.release,
      operation: 'LISTOPERATION',
      timestamp,
      mac,
      dataXml,
    });

    const responseXml = await this.sendRequest(xml);
    const parsed = parseBPWXmlResponse(responseXml);

    return {
      ...parsed,
      numberOfItems: parsed.data ? getXmlValue(parsed.data, 'NumberOfItems') : undefined,
      operations: parsed.data ? parseOperationList(parsed.data) : [],
    };
  }

  // ══════════════════════════════════════════════════════════════════════════════
  //  LISTAUTHORIZATION (Consultation: list authorizations by filter)
  // ══════════════════════════════════════════════════════════════════════════════

  async listAuthorizations(data: ListAuthorizationRequest) {
    const timestamp = generateTimestamp();
    const reqRefNum = generateReqRefNum();

    // MAC fields per spec 4.2.5 — TRANSACTIONID must ALWAYS be included (even empty)
    // STARTTIME/ENDTIME only included when searching by time
    const macParts: string[] = [
      `OPERATION=LISTAUTHORIZATION`,
      `TIMESTAMP=${timestamp}`,
      `SHOPID=${this.config.shopId}`,
      `OPERATORID=${this.config.operatorId}`,
      `REQREFNUM=${reqRefNum}`,
    ];
    if (data.startDate) macParts.push(`STARTDATE=${data.startDate}`);
    if (data.endDate) macParts.push(`ENDDATE=${data.endDate}`);
    macParts.push(`FILTER=${data.filter}`);
    macParts.push(`TRANSACTIONID=${data.transactionId || ''}`);
    if (data.startTime) macParts.push(`STARTTIME=${data.startTime}`);
    if (data.endTime) macParts.push(`ENDTIME=${data.endTime}`);
    if (data.options) macParts.push(`OPTIONS=${data.options}`);

    const macString = macParts.join('&');
    const mac = computeHash(macString, this.config.apiResultKey, this.config.hashAlgorithm);

    const dataXml = [
      '<ListAuthorization>',
      buildHeaderXml(this.config.shopId, this.config.operatorId, reqRefNum),
      el('StartDate', data.startDate),
      el('EndDate', data.endDate),
      el('Filter', data.filter),
      el('TransactionID', data.transactionId),
      el('StartTime', data.startTime),
      el('EndTime', data.endTime),
      '</ListAuthorization>',
    ].filter(Boolean).join('\n');

    const xml = buildBPWXmlRequest({
      release: this.config.release,
      operation: 'LISTAUTHORIZATION',
      timestamp,
      mac,
      dataXml,
    });

    const responseXml = await this.sendRequest(xml);
    const parsed = parseBPWXmlResponse(responseXml);

    return {
      ...parsed,
      numberOfItems: parsed.data ? getXmlValue(parsed.data, 'NumberOfItems') : undefined,
      authorizations: parsed.data ? parseAuthorizationList(parsed.data) : [],
    };
  }

  // ══════════════════════════════════════════════════════════════════════════════
  //  WEBHOOK VERIFICATION
  // ══════════════════════════════════════════════════════════════════════════════

  /**
   * Verify the MAC of a BPWXmlResponse received from SIA (webhook/URLMS notification).
   * Verifies the root-level MAC (Timestamp + Result) per spec 4.2.7.
   */
  verifyResponseMAC(responseXml: string): boolean {
    const parsed = parseBPWXmlResponse(responseXml);
    return this.verifyBPWResponseMAC(parsed.timestamp, parsed.result, parsed.mac);
  }

  /**
   * Verify the root-level response MAC (spec 4.2.7).
   * MAC = Hash(timestamp&result&secretstring) for SHA-1/MD5
   * MAC = HMAC(timestamp&result, secretkey) for HMAC-256
   */
  verifyBPWResponseMAC(timestamp: string, result: string, receivedMac: string): boolean {
    if (!receivedMac || receivedMac === 'NULL') return false;
    const text = `${timestamp}&${result}`;
    const computed = computeHash(text, this.config.apiResultKey, this.config.hashAlgorithm);
    return computed.toLowerCase() === receivedMac.toLowerCase();
  }

  /**
   * Verify the Authorization element MAC (spec 4.2.9).
   * Use this for verifying authorization data in webhook responses.
   */
  verifyAuthorizationMAC(auth: {
    authorizationType: string;
    transactionId: string;
    network: string;
    orderId: string;
    transactionAmount: string;
    authorizedAmount: string;
    currency: string;
    accountedAmount: string;
    refundedAmount?: string;
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
    ibanCode?: string;
    cardType?: string;
    cardholderInfo?: string;
    mac: string;
  }): boolean {
    const fields: [string, string | undefined][] = [
      ['', auth.authorizationType],
      ['', auth.transactionId],
      ['', auth.network],
      ['', auth.orderId],
      ['', auth.transactionAmount],
      ['', auth.authorizedAmount],
      ['', auth.currency],
      ['', auth.accountedAmount],
      ['', auth.refundedAmount],
      ['', auth.transactionResult],
      ['', auth.timestamp],
      ['', auth.authorizationNumber],
      ['', auth.acquirerBIN],
      ['', auth.merchantId],
      ['', auth.transactionStatus],
      ['', auth.responseCodeISO],
      ['', auth.panTail],
      ['', auth.panExpiryDate],
      ['', auth.paymentTypePP],
      ['', auth.rrn],
      ['', auth.ibanCode],
      ['', auth.cardType],
      ['', auth.cardholderInfo],
    ];

    // For Authorization response MAC, the format is just values joined by &
    const parts: string[] = [];
    for (const [, value] of fields) {
      if (value === undefined || value === null || value === '') continue;
      parts.push(value);
    }
    const text = parts.join('&');
    const computed = computeHash(text, this.config.apiResultKey, this.config.hashAlgorithm);
    return computed.toLowerCase() === auth.mac.toLowerCase();
  }

  /**
   * Parse a webhook/notification XML response and return structured data.
   */
  parseWebhook(responseXml: string) {
    const parsed = parseBPWXmlResponse(responseXml);
    return {
      ...parsed,
      authorization: parsed.data ? parseAuthorization(parsed.data) : undefined,
      panAliasData: parsed.data ? parsePanAliasData(parsed.data) : undefined,
      operation: parsed.data ? parseOperation(parsed.data) : undefined,
      linkCreated: parsed.data ? parseLinkCreated(parsed.data) : undefined,
    };
  }

  // ══════════════════════════════════════════════════════════════════════════════
  //  REDIRECT: Build Payment Form (4.2.1)
  // ══════════════════════════════════════════════════════════════════════════════

  /**
   * Build redirect form data for standard payment initiation.
   * Returns URL, form fields, and pre-built HTML.
   * The customer's browser should POST this form to SIA VPOS.
   */
  buildRedirectForm(data: RedirectRequest): RedirectFormData {
    const exponent = data.exponent || DEFAULT_EXPONENT;

    // MAC fields per spec 5.2.1 — order is critical!
    const macFields: [string, string | number | undefined][] = [
      ['URLMS', data.urlMs],
      ['URLDONE', data.urlDone],
      ['ORDERID', data.orderId],
      ['SHOPID', this.config.shopId],
      ['AMOUNT', data.amount],
      ['CURRENCY', data.currency],
      ['EXPONENT', data.exponent],  // only if present
      ['ACCOUNTINGMODE', data.accountingMode],
      ['AUTHORMODE', data.authorMode],
      ['OPTIONS', data.options],
      ['NAME', data.name],
      ['SURNAME', data.surname],
      ['TAXID', data.taxId],
      ['LOCKCARD', data.lockCard],
      ['COMMIS', data.commis],
      ['ORDDESCR', data.ordDescr],
      ['VSID', data.vsid],
      ['OPDESCR', data.opDescr],
      ['REMAININGDURATION', data.remainingDuration],
      ['USERID', data.userId],
      ['PHONENUMBER', data.phoneNumber],
      ['CAUSATION', data.causation],
      ['USER', data.user],
      ['PRODUCTREF', data.productRef],
      ['ANTIFRAUD', data.antifraud],
      ['3DSDATA', data.threeDsData],
      ['TRECURR', data.tRecurr],
      ['URLMSHEADER', data.urlMsHeader],
      ['INSTALLMENTSNUMBER', data.installmentsNumber],
      ['TICKLERPLAN', data.ticklerPlan],
    ];

    const mac = generateMAC(macFields, this.config.startKey, this.config.hashAlgorithm);

    // Build form fields (all uppercase, case sensitive per spec)
    const fields: Record<string, string> = {
      PAGE: 'LAND',
      AMOUNT: String(data.amount),
      CURRENCY: data.currency,
      ORDERID: data.orderId,
      SHOPID: this.config.shopId,
      URLBACK: data.urlBack,
      URLDONE: data.urlDone,
      URLMS: data.urlMs,
      ACCOUNTINGMODE: data.accountingMode,
      AUTHORMODE: data.authorMode,
      MAC: mac,
    };

    // Add optional fields
    const optionals: [string, string | number | undefined][] = [
      ['URLMSHEADER', data.urlMsHeader],
      ['LANG', data.lang],
      ['SHOPEMAIL', data.shopEmail],
      ['OPTIONS', data.options],
      ['LOCKCARD', data.lockCard],
      ['EMAIL', data.email],
      ['ORDDESCR', data.ordDescr],
      ['VSID', data.vsid],
      ['OPDESCR', data.opDescr],
      ['REMAININGDURATION', data.remainingDuration],
      ['USERID', data.userId],
      ['PHONENUMBER', data.phoneNumber],
      ['CAUSATION', data.causation],
      ['USER', data.user],
      ['NAME', data.name],
      ['SURNAME', data.surname],
      ['TAXID', data.taxId],
      ['PRODUCTREF', data.productRef],
      ['ANTIFRAUD', data.antifraud],
      ['3DSDATA', data.threeDsData],
      ['TRECURR', data.tRecurr],
      ['INSTALLMENTSNUMBER', data.installmentsNumber],
      ['TICKLERPLAN', data.ticklerPlan],
      ['EXPONENT', data.exponent],
      ['COMMIS', data.commis],
    ];

    for (const [key, value] of optionals) {
      if (value !== undefined && value !== null && value !== '') {
        fields[key] = String(value);
      }
    }

    const url = this.config.redirectUrl;
    const html = buildHtmlForm(url, fields);

    return { url, fields, html };
  }

  // ══════════════════════════════════════════════════════════════════════════════
  //  REDIRECT: Build Token Payment Form (4.2.4)
  // ══════════════════════════════════════════════════════════════════════════════

  /**
   * Build redirect form data for token-based payment (saved card / pan alias).
   * Returns URL, form fields, and pre-built HTML.
   */
  buildTokenRedirectForm(data: TokenRedirectRequest): RedirectFormData {
    // MAC fields per spec 5.2.3 — same as 5.2.1 but adds TOKEN, EXPDATE, NETWORK, IBAN at end
    const macFields: [string, string | number | undefined][] = [
      ['URLMS', data.urlMs],
      ['URLDONE', data.urlDone],
      ['ORDERID', data.orderId],
      ['SHOPID', this.config.shopId],
      ['AMOUNT', data.amount],
      ['CURRENCY', data.currency],
      ['EXPONENT', data.exponent],
      ['ACCOUNTINGMODE', data.accountingMode],
      ['AUTHORMODE', data.authorMode],
      ['OPTIONS', data.options],
      ['NAME', data.name],
      ['SURNAME', data.surname],
      ['TAXID', data.taxId],
      ['LOCKCARD', data.lockCard],
      ['COMMIS', data.commis],
      ['ORDDESCR', data.ordDescr],
      ['VSID', data.vsid],
      ['OPDESCR', data.opDescr],
      ['REMAININGDURATION', data.remainingDuration],
      ['USERID', data.userId],
      ['PHONENUMBER', data.phoneNumber],
      ['CAUSATION', data.causation],
      ['USER', data.user],
      ['PRODUCTREF', data.productRef],
      ['ANTIFRAUD', data.antifraud],
      ['3DSDATA', data.threeDsData],
      ['TRECURR', data.tRecurr],
      ['CRECURR', data.cRecurr],
      ['URLMSHEADER', data.urlMsHeader],
      ['INSTALLMENTSNUMBER', data.installmentsNumber],
      ['TICKLERPLAN', data.ticklerPlan],
      ['TOKEN', data.token],
      ['EXPDATE', data.expDate],
      ['NETWORK', data.network],
      ['IBAN', data.iban],
    ];

    const mac = generateMAC(macFields, this.config.startKey, this.config.hashAlgorithm);

    const fields: Record<string, string> = {
      PAGE: 'TOKEN',
      AMOUNT: String(data.amount),
      CURRENCY: data.currency,
      ORDERID: data.orderId,
      SHOPID: this.config.shopId,
      URLBACK: data.urlBack,
      URLDONE: data.urlDone,
      URLMS: data.urlMs,
      ACCOUNTINGMODE: data.accountingMode,
      AUTHORMODE: data.authorMode,
      TOKEN: data.token,
      NETWORK: data.network,
      TRECURR: data.tRecurr || 'C',
      MAC: mac,
    };

    // Optional fields
    const optionals: [string, string | number | undefined][] = [
      ['URLMSHEADER', data.urlMsHeader],
      ['LANG', data.lang],
      ['SHOPEMAIL', data.shopEmail],
      ['OPTIONS', data.options],
      ['EMAIL', data.email],
      ['ORDDESCR', data.ordDescr],
      ['VSID', data.vsid],
      ['OPDESCR', data.opDescr],
      ['REMAININGDURATION', data.remainingDuration],
      ['USERID', data.userId],
      ['PHONENUMBER', data.phoneNumber],
      ['CAUSATION', data.causation],
      ['USER', data.user],
      ['NAME', data.name],
      ['SURNAME', data.surname],
      ['TAXID', data.taxId],
      ['PRODUCTREF', data.productRef],
      ['ANTIFRAUD', data.antifraud],
      ['3DSDATA', data.threeDsData],
      ['INSTALLMENTSNUMBER', data.installmentsNumber],
      ['TICKLERPLAN', data.ticklerPlan],
      ['EXPONENT', data.exponent],
      ['COMMIS', data.commis],
      ['EXPDATE', data.expDate],
      ['CRECURR', data.cRecurr],
      ['IBAN', data.iban],
    ];

    for (const [key, value] of optionals) {
      if (value !== undefined && value !== null && value !== '') {
        fields[key] = String(value);
      }
    }

    const url = this.config.redirectUrl;
    const html = buildHtmlForm(url, fields);

    return { url, fields, html };
  }

  // ══════════════════════════════════════════════════════════════════════════════
  //  REDIRECT: Parse Outcome (4.2.3)
  // ══════════════════════════════════════════════════════════════════════════════

  /**
   * Parse URLMS or URLDONE query string parameters into a typed object.
   * Accepts a full URL string, a query string, or URLSearchParams.
   */
  parseOutcomeParams(input: string | URLSearchParams): RedirectOutcome {
    let params: URLSearchParams;
    if (typeof input === 'string') {
      const qIdx = input.indexOf('?');
      params = new URLSearchParams(qIdx >= 0 ? input.substring(qIdx + 1) : input);
    } else {
      params = input;
    }

    const g = (key: string) => params.get(key) || '';

    return {
      orderId: g('ORDERID'),
      shopId: g('SHOPID'),
      authNumber: g('AUTHNUMBER'),
      amount: g('AMOUNT'),
      currency: g('CURRENCY'),
      transactionId: g('TRANSACTIONID'),
      accountingMode: g('ACCOUNTINGMODE'),
      authorMode: g('AUTHORMODE'),
      result: g('RESULT'),
      transactionType: g('TRANSACTIONTYPE') || undefined,
      network: g('NETWORK') || undefined,
      mac: g('MAC'),
      // Optional fields
      issuerCountry: g('ISSUERCOUNTRY') || undefined,
      authCode: g('AUTHCODE') || undefined,
      payerId: g('PAYERID') || undefined,
      payer: g('PAYER') || undefined,
      payerStatus: g('PAYERSTATUS') || undefined,
      hashPan: g('HASHPAN') || undefined,
      panAlias: g('PANALIAS') || undefined,
      panAliasRev: g('PANALIASREV') || undefined,
      panAliasExpDate: g('PANALIASEXPDATE') || undefined,
      panAliasTail: g('PANALIASTAIL') || undefined,
      maskedPan: g('MASKEDPAN') || undefined,
      tRecurr: g('TRECURR') || undefined,
      cRecurr: g('CRECURR') || undefined,
      panTail: g('PANTAIL') || undefined,
      panExpiryDate: g('PANEXPIRYDATE') || undefined,
      accountHolder: g('ACCOUNTHOLDER') || undefined,
      iban: g('IBAN') || undefined,
      aliasStr: g('ALIASSTR') || undefined,
      ahEmail: g('AHEMAIL') || undefined,
      ahTaxId: g('AHTAXID') || undefined,
      acquirerBin: g('ACQUIRERBIN') || undefined,
      merchantId: g('MERCHANTID') || undefined,
      cardType: g('CARDTYPE') || undefined,
      amazonAuthId: g('AMAZONAUTHID') || undefined,
      amazonCaptureId: g('AMAZONCAPTUREID') || undefined,
      chInfo: g('CHINFO') || undefined,
      panCode: g('PANCODE') || undefined,
      installmentsNumber: g('INSTALLMENTSNUMBER') || undefined,
      cardholderData: g('CARDHOLDERDATA') || undefined,
      threeDsResult: g('THREEDSRESULT') || undefined,
      subscriptionCode: g('SUBSCRIPTIONCODE') || undefined,
    };
  }

  // ══════════════════════════════════════════════════════════════════════════════
  //  REDIRECT: Verify Outcome MAC (5.2.2)
  // ══════════════════════════════════════════════════════════════════════════════

  /**
   * Verify the MAC of a redirect outcome (URLMS/URLDONE) using the API-Result key.
   * Per spec 5.2.2: MAC is NULL if result is negative (unless OPTION R).
   * Returns true if MAC is valid, false otherwise.
   */
  verifyOutcomeMAC(outcome: RedirectOutcome): boolean {
    // If MAC is NULL and result is not 00, it's expected (unless OPTION R)
    if (!outcome.mac || outcome.mac === 'NULL') {
      return outcome.result !== '00';
    }

    // Build MAC string per spec 5.2.2 — field order is critical
    // Required fields always present:
    const macFields: [string, string | undefined][] = [
      ['ORDERID', outcome.orderId],
      ['SHOPID', outcome.shopId],
      ['AUTHNUMBER', outcome.authNumber],
      ['AMOUNT', outcome.amount],
      ['CURRENCY', outcome.currency],
      ['TRANSACTIONID', outcome.transactionId],
      ['ACCOUNTINGMODE', outcome.accountingMode],
      ['AUTHORMODE', outcome.authorMode],
      ['RESULT', outcome.result],
      ['TRANSACTIONTYPE', outcome.transactionType],
      // Conditional fields — only included if present in the response
      ['ISSUERCOUNTRY', outcome.issuerCountry],
      ['AUTHCODE', outcome.authCode],
      ['PAYERID', outcome.payerId],
      ['PAYER', outcome.payer],
      ['PAYERSTATUS', outcome.payerStatus],
      ['HASHPAN', outcome.hashPan],
      ['PANALIASREV', outcome.panAliasRev],
      ['PANALIAS', outcome.panAlias],
      ['PANALIASEXPDATE', outcome.panAliasExpDate],
      ['PANALIASTAIL', outcome.panAliasTail],
      ['MASKEDPAN', outcome.maskedPan],
      ['TRECURR', outcome.tRecurr],
      ['CRECURR', outcome.cRecurr],
      ['PANTAIL', outcome.panTail],
      ['PANEXPIRYDATE', outcome.panExpiryDate],
      ['ACCOUNTHOLDER', outcome.accountHolder],
      ['IBAN', outcome.iban],
      ['ALIASSTR', outcome.aliasStr],
      ['AHEMAIL', outcome.ahEmail],
      ['AHTAXID', outcome.ahTaxId],
      ['ACQUIRERBIN', outcome.acquirerBin],
      ['MERCHANTID', outcome.merchantId],
      ['CARDTYPE', outcome.cardType],
      ['AMAZONAUTHID', outcome.amazonAuthId],
      ['AMAZONCAPTUREID', outcome.amazonCaptureId],
      ['CHINFO', outcome.chInfo],
      ['PANCODE', outcome.panCode],
      ['INSTALLMENTSNUMBER', outcome.installmentsNumber],
      ['CARDHOLDERDATA', outcome.cardholderData],
      ['THREEDSRESULT', outcome.threeDsResult],
      ['SUBSCRIPTIONCODE', outcome.subscriptionCode],
    ];

    const computed = generateMAC(macFields, this.config.apiResultKey, this.config.hashAlgorithm);
    return computed.toLowerCase() === outcome.mac.toLowerCase();
  }

  // ══════════════════════════════════════════════════════════════════════════════
  //  3DS DATA ENCRYPTION (spec 5.4)
  // ══════════════════════════════════════════════════════════════════════════════

  /**
   * Encrypt 3DS 2.0 data for use in the 3DSDATA redirect field.
   * Uses AES/CBC/PKCS5Padding with first 16 bytes of API secret key, IV = 0.
   * Input: JSON object with 3DS fields. Output: Base64 string.
   */
  encrypt3DSData(data: Record<string, string>): string {
    const json = JSON.stringify(data);
    const keyBytes = CryptoJS.enc.Utf8.parse(this.config.apiResultKey.substring(0, 16));
    const iv = CryptoJS.lib.WordArray.create(new Uint8Array(16));
    const encrypted = CryptoJS.AES.encrypt(
      CryptoJS.enc.Utf8.parse(json),
      keyBytes,
      { iv, mode: CryptoJS.mode.CBC, padding: CryptoJS.pad.Pkcs7 }
    );
    return encrypted.ciphertext.toString(CryptoJS.enc.Base64);
  }
}

// ─── Helper: Build HTML Form ──────────────────────────────────────────────────

function buildHtmlForm(url: string, fields: Record<string, string>): string {
  const inputs = Object.entries(fields)
    .map(([name, value]) => {
      const escaped = value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
      return `  <input type="hidden" name="${name}" value="${escaped}">`;
    })
    .join('\n');

  return [
    `<form id="vpos-redirect-form" method="POST" action="${url}">`,
    inputs,
    '  <button type="submit">Proceed to payment</button>',
    '</form>',
  ].join('\n');
}
