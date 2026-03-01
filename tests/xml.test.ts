import { describe, it, expect } from 'vitest';
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
  getXmlBlocks,
} from '../src/xml';

describe('el (XML element builder)', () => {
  it('should build an XML element', () => {
    expect(el('ShopID', 'MYSHOP')).toBe('<ShopID>MYSHOP</ShopID>');
  });

  it('should handle numeric values', () => {
    expect(el('Amount', 1500)).toBe('<Amount>1500</Amount>');
  });

  it('should return empty string for undefined', () => {
    expect(el('Empty', undefined)).toBe('');
  });

  it('should return empty string for null', () => {
    expect(el('Empty', null)).toBe('');
  });

  it('should return empty string for empty string', () => {
    expect(el('Empty', '')).toBe('');
  });

  it('should escape XML special characters', () => {
    expect(el('Desc', 'A & B <C>')).toBe('<Desc>A &amp; B &lt;C&gt;</Desc>');
  });

  it('should escape quotes', () => {
    expect(el('Desc', 'say "hello"')).toBe('<Desc>say &quot;hello&quot;</Desc>');
  });
});

describe('buildHeaderXml', () => {
  it('should build a Header XML block', () => {
    const xml = buildHeaderXml('SHOP1', 'OP1', 'REF123');
    expect(xml).toContain('<Header>');
    expect(xml).toContain('<ShopID>SHOP1</ShopID>');
    expect(xml).toContain('<OperatorID>OP1</OperatorID>');
    expect(xml).toContain('<ReqRefNum>REF123</ReqRefNum>');
    expect(xml).toContain('</Header>');
  });
});

describe('buildBPWXmlRequest', () => {
  it('should build a complete BPWXmlRequest', () => {
    const xml = buildBPWXmlRequest({
      release: '02',
      operation: 'AUTHORIZATION',
      timestamp: '2025-01-01T00:00:00.000',
      mac: 'abc123',
      dataXml: '<Test>data</Test>',
    });

    expect(xml).toContain('<?xml version="1.0" encoding="ISO-8859-1"?>');
    expect(xml).toContain('<BPWXmlRequest>');
    expect(xml).toContain('<Release>02</Release>');
    expect(xml).toContain('<Operation>AUTHORIZATION</Operation>');
    expect(xml).toContain('<Timestamp>2025-01-01T00:00:00.000</Timestamp>');
    expect(xml).toContain('<MAC>abc123</MAC>');
    expect(xml).toContain('<Data>');
    expect(xml).toContain('<Test>data</Test>');
    expect(xml).toContain('</BPWXmlRequest>');
  });
});

describe('getXmlValue', () => {
  it('should extract text from XML element', () => {
    expect(getXmlValue('<Root><Name>Hello</Name></Root>', 'Name')).toBe('Hello');
  });

  it('should return undefined for missing element', () => {
    expect(getXmlValue('<Root></Root>', 'Missing')).toBeUndefined();
  });

  it('should handle case-insensitive matching', () => {
    expect(getXmlValue('<ROOT><name>test</name></ROOT>', 'name')).toBe('test');
  });

  it('should trim whitespace', () => {
    expect(getXmlValue('<Root><Name>  Hello  </Name></Root>', 'Name')).toBe('Hello');
  });
});

describe('getXmlBlocks', () => {
  it('should extract multiple blocks', () => {
    const xml = '<List><Item>A</Item><Item>B</Item><Item>C</Item></List>';
    const blocks = getXmlBlocks(xml, 'Item');
    expect(blocks).toHaveLength(3);
    expect(blocks).toEqual(['A', 'B', 'C']);
  });

  it('should return empty array when no matches', () => {
    expect(getXmlBlocks('<Root></Root>', 'Item')).toEqual([]);
  });
});

describe('parseBPWXmlResponse', () => {
  it('should parse a complete response', () => {
    const xml = `<?xml version="1.0" encoding="ISO-8859-1"?>
<BPWXmlResponse>
<Timestamp>2025-01-01T12:00:00.000</Timestamp>
<Result>00</Result>
<MAC>abc123def456</MAC>
<Data><Authorization><OrderID>ORD1</OrderID></Authorization></Data>
</BPWXmlResponse>`;

    const parsed = parseBPWXmlResponse(xml);
    expect(parsed.timestamp).toBe('2025-01-01T12:00:00.000');
    expect(parsed.result).toBe('00');
    expect(parsed.mac).toBe('abc123def456');
    expect(parsed.data).toContain('Authorization');
    expect(parsed.rawXml).toBe(xml);
  });

  it('should handle response without data', () => {
    const xml = `<BPWXmlResponse>
<Timestamp>2025-01-01T12:00:00.000</Timestamp>
<Result>04</Result>
<MAC>NULL</MAC>
</BPWXmlResponse>`;

    const parsed = parseBPWXmlResponse(xml);
    expect(parsed.result).toBe('04');
    expect(parsed.data).toBeUndefined();
  });
});

describe('parseAuthorization', () => {
  it('should parse Authorization block', () => {
    const xml = `<Data>
<Authorization>
<PaymentType>01</PaymentType>
<AuthorizationType>I</AuthorizationType>
<TransactionID>TX123</TransactionID>
<Network>01</Network>
<OrderID>ORD123</OrderID>
<TransactionAmount>1500</TransactionAmount>
<AuthorizedAmount>1500</AuthorizedAmount>
<Currency>941</Currency>
<Exponent>2</Exponent>
<AccountedAmount>0</AccountedAmount>
<RefundedAmount>0</RefundedAmount>
<TransactionResult>00</TransactionResult>
<Timestamp>2025-01-01T12:00:00.000</Timestamp>
<AuthorizationNumber>AUTH1</AuthorizationNumber>
<AcquirerBIN>BIN1</AcquirerBIN>
<MerchantID>MID1</MerchantID>
<TransactionStatus>00</TransactionStatus>
<MAC>mac123</MAC>
</Authorization>
</Data>`;

    const auth = parseAuthorization(xml);
    expect(auth).toBeDefined();
    expect(auth!.transactionId).toBe('TX123');
    expect(auth!.orderId).toBe('ORD123');
    expect(auth!.transactionAmount).toBe('1500');
    expect(auth!.currency).toBe('941');
    expect(auth!.transactionResult).toBe('00');
    expect(auth!.mac).toBe('mac123');
  });

  it('should return undefined when no Authorization', () => {
    expect(parseAuthorization('<Data></Data>')).toBeUndefined();
  });
});

describe('parseLinkCreated', () => {
  it('should parse LinkCreated block', () => {
    const xml = `<Data>
<LinkCreated>
<CompleteLink>https://example.com/pay/TOKEN123</CompleteLink>
<Token>TOKEN123</Token>
<CreationDate>2025-01-01</CreationDate>
<Status>00</Status>
<LastUseDate></LastUseDate>
<ExpirationDate>2025-02-01</ExpirationDate>
<RevokeDate></RevokeDate>
<OrderId>ORD456</OrderId>
<MAC>linkmac123</MAC>
</LinkCreated>
</Data>`;

    const link = parseLinkCreated(xml);
    expect(link).toBeDefined();
    expect(link!.token).toBe('TOKEN123');
    expect(link!.orderId).toBe('ORD456');
    expect(link!.status).toBe('00');
  });
});

describe('parseLinkCreatedList', () => {
  it('should parse multiple LinkCreated blocks', () => {
    const xml = `
<LinkCreated>
<Token>T1</Token><OrderId>O1</OrderId><Status>00</Status>
<CompleteLink></CompleteLink><CreationDate></CreationDate>
<LastUseDate></LastUseDate><ExpirationDate></ExpirationDate>
<RevokeDate></RevokeDate><MAC>m1</MAC>
</LinkCreated>
<LinkCreated>
<Token>T2</Token><OrderId>O2</OrderId><Status>01</Status>
<CompleteLink></CompleteLink><CreationDate></CreationDate>
<LastUseDate></LastUseDate><ExpirationDate></ExpirationDate>
<RevokeDate></RevokeDate><MAC>m2</MAC>
</LinkCreated>`;

    const links = parseLinkCreatedList(xml);
    expect(links).toHaveLength(2);
    expect(links[0].token).toBe('T1');
    expect(links[1].token).toBe('T2');
  });
});

describe('parseOperation', () => {
  it('should parse Operation block', () => {
    const xml = `<Data>
<Operation>
<TransactionID>TX789</TransactionID>
<TimestampReq>2025-01-01T12:00:00.000</TimestampReq>
<TimestampElab>2025-01-01T12:00:01.000</TimestampElab>
<SrcType>02</SrcType>
<Amount>2000</Amount>
<Result>00</Result>
<Status>00</Status>
<MAC>opmac1</MAC>
</Operation>
</Data>`;

    const op = parseOperation(xml);
    expect(op).toBeDefined();
    expect(op!.transactionId).toBe('TX789');
    expect(op!.amount).toBe('2000');
    expect(op!.result).toBe('00');
  });
});

describe('parseOperationList', () => {
  it('should parse multiple Operation blocks', () => {
    const xml = `
<Operation>
<TransactionID>T1</TransactionID><TimestampReq>ts1</TimestampReq>
<TimestampElab>te1</TimestampElab><SrcType>01</SrcType>
<Amount>100</Amount><Result>00</Result><Status>00</Status><MAC>m1</MAC>
</Operation>
<Operation>
<TransactionID>T2</TransactionID><TimestampReq>ts2</TimestampReq>
<TimestampElab>te2</TimestampElab><SrcType>02</SrcType>
<Amount>200</Amount><Result>00</Result><Status>00</Status><MAC>m2</MAC>
</Operation>`;

    const ops = parseOperationList(xml);
    expect(ops).toHaveLength(2);
    expect(ops[0].transactionId).toBe('T1');
    expect(ops[1].amount).toBe('200');
  });
});

describe('parseAuthorizationList', () => {
  it('should parse multiple Authorization blocks', () => {
    const xml = `
<Authorization>
<PaymentType>01</PaymentType><AuthorizationType>I</AuthorizationType>
<TransactionID>TX1</TransactionID><Network>01</Network>
<OrderID>O1</OrderID><TransactionAmount>100</TransactionAmount>
<AuthorizedAmount>100</AuthorizedAmount><Currency>978</Currency>
<Exponent>2</Exponent><AccountedAmount>0</AccountedAmount>
<RefundedAmount>0</RefundedAmount><TransactionResult>00</TransactionResult>
<Timestamp>ts1</Timestamp><AuthorizationNumber>AN1</AuthorizationNumber>
<AcquirerBIN>BIN1</AcquirerBIN><MerchantID>MID1</MerchantID>
<TransactionStatus>00</TransactionStatus><MAC>m1</MAC>
</Authorization>
<Authorization>
<PaymentType>02</PaymentType><AuthorizationType>I</AuthorizationType>
<TransactionID>TX2</TransactionID><Network>02</Network>
<OrderID>O2</OrderID><TransactionAmount>200</TransactionAmount>
<AuthorizedAmount>200</AuthorizedAmount><Currency>978</Currency>
<Exponent>2</Exponent><AccountedAmount>0</AccountedAmount>
<RefundedAmount>0</RefundedAmount><TransactionResult>00</TransactionResult>
<Timestamp>ts2</Timestamp><AuthorizationNumber>AN2</AuthorizationNumber>
<AcquirerBIN>BIN2</AcquirerBIN><MerchantID>MID2</MerchantID>
<TransactionStatus>00</TransactionStatus><MAC>m2</MAC>
</Authorization>`;

    const auths = parseAuthorizationList(xml);
    expect(auths).toHaveLength(2);
    expect(auths[0].transactionId).toBe('TX1');
    expect(auths[1].transactionId).toBe('TX2');
  });
});
