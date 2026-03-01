/**
 * XML builder and parser for SIA VPOS BPWXmlRequest/BPWXmlResponse.
 * Zero external dependencies — uses simple string manipulation.
 */

/**
 * Escape XML special characters
 */
function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Build a complete BPWXmlRequest XML string.
 *
 * Structure per spec (p.33):
 * <?xml version="1.0" encoding="ISO-8859-1"?>
 * <BPWXmlRequest>
 *   <Release>02</Release>
 *   <Request>
 *     <Operation>AUTHORIZATION</Operation>
 *     <Timestamp>2015-02-08T12:02:00.000</Timestamp>
 *     <MAC>...</MAC>
 *   </Request>
 *   <Data>
 *     ...operation-specific data...
 *   </Data>
 * </BPWXmlRequest>
 */
export function buildBPWXmlRequest(params: {
  release: string;
  operation: string;
  timestamp: string;
  mac: string;
  dataXml: string;
}): string {
  return [
    '<?xml version="1.0" encoding="ISO-8859-1"?>',
    '<BPWXmlRequest>',
    `<Release>${escapeXml(params.release)}</Release>`,
    '<Request>',
    `<Operation>${escapeXml(params.operation)}</Operation>`,
    `<Timestamp>${escapeXml(params.timestamp)}</Timestamp>`,
    `<MAC>${escapeXml(params.mac)}</MAC>`,
    '</Request>',
    '<Data>',
    params.dataXml,
    '</Data>',
    '</BPWXmlRequest>',
  ].join('\n');
}

/**
 * Build XML element with optional value. If value is undefined/null/empty, returns empty string.
 */
export function el(tag: string, value: string | number | undefined | null): string {
  if (value === undefined || value === null || value === '') return '';
  return `<${tag}>${escapeXml(String(value))}</${tag}>`;
}

/**
 * Build Header XML block
 */
export function buildHeaderXml(shopId: string, operatorId: string, reqRefNum: string): string {
  return [
    '<Header>',
    el('ShopID', shopId),
    el('OperatorID', operatorId),
    el('ReqRefNum', reqRefNum),
    '</Header>',
  ].join('\n');
}

// ─── XML Parsing (simple regex-based for SIA VPOS responses) ─────────────────

/**
 * Extract the text content of an XML element.
 * Returns undefined if element not found.
 */
export function getXmlValue(xml: string, tag: string): string | undefined {
  const regex = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, 'i');
  const match = xml.match(regex);
  return match ? match[1].trim() : undefined;
}

/**
 * Extract all occurrences of an XML element (for arrays like LinkCreated).
 */
export function getXmlBlocks(xml: string, tag: string): string[] {
  const regex = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, 'gi');
  const blocks: string[] = [];
  let match;
  while ((match = regex.exec(xml)) !== null) {
    blocks.push(match[1]);
  }
  return blocks;
}

/**
 * Parse a BPWXmlResponse into a structured object.
 */
export function parseBPWXmlResponse(xml: string): {
  timestamp: string;
  result: string;
  mac: string;
  data?: string;
  rawXml: string;
} {
  return {
    timestamp: getXmlValue(xml, 'Timestamp') || '',
    result: getXmlValue(xml, 'Result') || '',
    mac: getXmlValue(xml, 'MAC') || '',
    data: getXmlValue(xml, 'Data'),
    rawXml: xml,
  };
}

/**
 * Parse Authorization element from response XML.
 */
export function parseAuthorization(xml: string) {
  const authBlock = getXmlValue(xml, 'Authorization');
  if (!authBlock) return undefined;
  return {
    paymentType: getXmlValue(authBlock, 'PaymentType') || '',
    authorizationType: getXmlValue(authBlock, 'AuthorizationType') || '',
    transactionId: getXmlValue(authBlock, 'TransactionID') || '',
    network: getXmlValue(authBlock, 'Network') || '',
    orderId: getXmlValue(authBlock, 'OrderID') || '',
    transactionAmount: getXmlValue(authBlock, 'TransactionAmount') || '',
    authorizedAmount: getXmlValue(authBlock, 'AuthorizedAmount') || '',
    currency: getXmlValue(authBlock, 'Currency') || '',
    exponent: getXmlValue(authBlock, 'Exponent') || '',
    accountedAmount: getXmlValue(authBlock, 'AccountedAmount') || '',
    refundedAmount: getXmlValue(authBlock, 'RefundedAmount') || '',
    transactionResult: getXmlValue(authBlock, 'TransactionResult') || '',
    timestamp: getXmlValue(authBlock, 'Timestamp') || '',
    authorizationNumber: getXmlValue(authBlock, 'AuthorizationNumber') || '',
    acquirerBIN: getXmlValue(authBlock, 'AcquirerBIN') || '',
    merchantId: getXmlValue(authBlock, 'MerchantID') || '',
    transactionStatus: getXmlValue(authBlock, 'TransactionStatus') || '',
    responseCodeISO: getXmlValue(authBlock, 'ResponseCodeISO'),
    panTail: getXmlValue(authBlock, 'PanTail'),
    panExpiryDate: getXmlValue(authBlock, 'PanExpiryDate'),
    paymentTypePP: getXmlValue(authBlock, 'PaymentTypePP'),
    rrn: getXmlValue(authBlock, 'RRN'),
    cardType: getXmlValue(authBlock, 'CardType'),
    cardholderInfo: getXmlValue(authBlock, 'CardholderInfo'),
    ibanCode: getXmlValue(authBlock, 'IbanCode'),
    mac: getXmlValue(authBlock, 'MAC') || '',
  };
}

/**
 * Parse PanAliasData element from response XML.
 */
export function parsePanAliasData(xml: string) {
  const block = getXmlValue(xml, 'PanAliasData');
  if (!block) return undefined;
  return {
    panAlias: getXmlValue(block, 'PanAlias') || '',
    panAliasRev: getXmlValue(block, 'PanAliasRev') || '',
    panAliasExpDate: getXmlValue(block, 'PanAliasExpDate') || '',
    panAliasTail: getXmlValue(block, 'PanAliasTail') || '',
    cRecurr: getXmlValue(block, 'CRecurr'),
    mac: getXmlValue(block, 'MAC') || '',
  };
}

/**
 * Parse Operation element from response XML (used by Accounting, Refund, etc.)
 */
export function parseOperation(xml: string) {
  const block = getXmlValue(xml, 'Operation');
  if (!block) return undefined;
  return {
    transactionId: getXmlValue(block, 'TransactionID') || '',
    timestampReq: getXmlValue(block, 'TimestampReq') || '',
    timestampElab: getXmlValue(block, 'TimestampElab') || '',
    srcType: getXmlValue(block, 'SrcType') || '',
    amount: getXmlValue(block, 'Amount') || '',
    result: getXmlValue(block, 'Result') || '',
    status: getXmlValue(block, 'Status') || '',
    opDescr: getXmlValue(block, 'OpDescr'),
    mac: getXmlValue(block, 'MAC') || '',
    authorization: parseAuthorization(block),
  };
}

/**
 * Parse LinkCreated element from response XML.
 */
export function parseLinkCreated(xml: string) {
  const block = getXmlValue(xml, 'LinkCreated');
  if (!block) return undefined;
  return {
    completeLink: getXmlValue(block, 'CompleteLink') || '',
    token: getXmlValue(block, 'Token') || '',
    creationDate: getXmlValue(block, 'CreationDate') || '',
    status: getXmlValue(block, 'Status') || '',
    lastUseDate: getXmlValue(block, 'LastUseDate') || '',
    expirationDate: getXmlValue(block, 'ExpirationDate') || '',
    revokeDate: getXmlValue(block, 'RevokeDate') || '',
    orderId: getXmlValue(block, 'OrderId') || '',
    mac: getXmlValue(block, 'MAC') || '',
  };
}

/**
 * Parse multiple LinkCreated elements (for LISTLINK response).
 */
export function parseLinkCreatedList(xml: string) {
  const blocks = getXmlBlocks(xml, 'LinkCreated');
  return blocks.map((block) => ({
    completeLink: getXmlValue(block, 'CompleteLink') || '',
    token: getXmlValue(block, 'Token') || '',
    creationDate: getXmlValue(block, 'CreationDate') || '',
    status: getXmlValue(block, 'Status') || '',
    lastUseDate: getXmlValue(block, 'LastUseDate') || '',
    expirationDate: getXmlValue(block, 'ExpirationDate') || '',
    revokeDate: getXmlValue(block, 'RevokeDate') || '',
    orderId: getXmlValue(block, 'OrderId') || '',
    mac: getXmlValue(block, 'MAC') || '',
  }));
}

/**
 * Parse multiple Operation elements (for LISTOPERATION response).
 * Each Operation may contain a nested Authorization element.
 */
export function parseOperationList(xml: string) {
  const blocks = getXmlBlocks(xml, 'Operation');
  return blocks.map((block) => ({
    transactionId: getXmlValue(block, 'TransactionID') || '',
    timestampReq: getXmlValue(block, 'TimestampReq') || '',
    timestampElab: getXmlValue(block, 'TimestampElab') || '',
    srcType: getXmlValue(block, 'SrcType') || '',
    amount: getXmlValue(block, 'Amount') || '',
    result: getXmlValue(block, 'Result') || '',
    status: getXmlValue(block, 'Status') || '',
    opDescr: getXmlValue(block, 'OpDescr'),
    mac: getXmlValue(block, 'MAC') || '',
    authorization: parseAuthorization(block),
  }));
}

/**
 * Parse multiple Authorization elements (for LISTAUTHORIZATION response).
 */
export function parseAuthorizationList(xml: string) {
  const blocks = getXmlBlocks(xml, 'Authorization');
  return blocks.map((block) => ({
    paymentType: getXmlValue(block, 'PaymentType') || '',
    authorizationType: getXmlValue(block, 'AuthorizationType') || '',
    transactionId: getXmlValue(block, 'TransactionID') || '',
    network: getXmlValue(block, 'Network') || '',
    orderId: getXmlValue(block, 'OrderID') || '',
    transactionAmount: getXmlValue(block, 'TransactionAmount') || '',
    authorizedAmount: getXmlValue(block, 'AuthorizedAmount') || '',
    currency: getXmlValue(block, 'Currency') || '',
    exponent: getXmlValue(block, 'Exponent') || '',
    accountedAmount: getXmlValue(block, 'AccountedAmount') || '',
    refundedAmount: getXmlValue(block, 'RefundedAmount') || '',
    transactionResult: getXmlValue(block, 'TransactionResult') || '',
    timestamp: getXmlValue(block, 'Timestamp') || '',
    authorizationNumber: getXmlValue(block, 'AuthorizationNumber') || '',
    acquirerBIN: getXmlValue(block, 'AcquirerBIN') || '',
    merchantId: getXmlValue(block, 'MerchantID') || '',
    transactionStatus: getXmlValue(block, 'TransactionStatus') || '',
    responseCodeISO: getXmlValue(block, 'ResponseCodeISO'),
    panTail: getXmlValue(block, 'PanTail'),
    panExpiryDate: getXmlValue(block, 'PanExpiryDate'),
    paymentTypePP: getXmlValue(block, 'PaymentTypePP'),
    rrn: getXmlValue(block, 'RRN'),
    cardType: getXmlValue(block, 'CardType'),
    cardholderInfo: getXmlValue(block, 'CardholderInfo'),
    ibanCode: getXmlValue(block, 'IbanCode'),
    mac: getXmlValue(block, 'MAC') || '',
  }));
}
