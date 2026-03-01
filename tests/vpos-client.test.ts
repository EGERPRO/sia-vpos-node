import { describe, it, expect } from "vitest";
import {
  VposClient,
  generateTimestamp,
  generateReqRefNum,
} from "../src/vpos-client";
import { RESULT_CODES, REDIRECT_RESULT_CODES } from "../src/types";

// ─── Test credentials ────────────────────────────────────────────────────────
// Replace with your own SIA VPOS test credentials
const TEST_CONFIG = {
  shopId: "YOUR_SHOP_ID",
  operatorId: "YOUR_OPERATOR_ID",
  secretKey: "YOUR_SECRET_KEY",
  apiResultKey: "YOUR_API_RESULT_KEY",
  environment: "test" as const,
};

describe("VposClient — constructor & config", () => {
  it("should create client with test config", () => {
    const client = new VposClient(TEST_CONFIG);
    expect(client.isTest).toBe(true);
    expect(client.isProduction).toBe(false);
    expect(client.apiUrl).toBe(
      "https://virtualpostest.sia.eu/vpos/apibo/apiBOXML-UTF8.app",
    );
    expect(client.redirectUrl).toBe(
      "https://virtualpostest.sia.eu/vpos/payments/main",
    );
  });

  it("should default to test environment", () => {
    const client = new VposClient({
      shopId: "TEST",
      operatorId: "op",
      secretKey: "secret",
    });
    expect(client.isTest).toBe(true);
  });

  it("should use custom API URL when provided", () => {
    const client = new VposClient({
      ...TEST_CONFIG,
      apiUrl: "https://custom.example.com/api",
    });
    expect(client.apiUrl).toBe("https://custom.example.com/api");
  });

  it("should use custom redirect URL when provided", () => {
    const client = new VposClient({
      ...TEST_CONFIG,
      redirectUrl: "https://custom.example.com/redirect",
    });
    expect(client.redirectUrl).toBe("https://custom.example.com/redirect");
  });
});

describe("VposClient — buildRedirectForm", () => {
  const client = new VposClient(TEST_CONFIG);

  it("should build redirect form with required fields", () => {
    const form = client.buildRedirectForm({
      amount: 1500,
      currency: "941", // RSD
      orderId: `TEST-${Date.now()}`,
      urlBack: "https://example.com/back",
      urlDone: "https://example.com/done",
      urlMs: "https://example.com/notify",
      accountingMode: "I",
      authorMode: "I",
    });

    expect(form.url).toBe("https://virtualpostest.sia.eu/vpos/payments/main");
    expect(form.fields).toHaveProperty("PAGE", "LAND");
    expect(form.fields).toHaveProperty("SHOPID", "YOUR_SHOP_ID");
    expect(form.fields).toHaveProperty("AMOUNT", "1500");
    expect(form.fields).toHaveProperty("CURRENCY", "941");
    expect(form.fields).toHaveProperty("MAC");
    expect(form.fields.MAC).toHaveLength(64); // HMAC-SHA256
    expect(form.html).toContain("<form");
    expect(form.html).toContain('method="POST"');
  });

  it("should include optional fields when provided", () => {
    const form = client.buildRedirectForm({
      amount: 2000,
      currency: "941",
      orderId: `TEST-OPT-${Date.now()}`,
      urlBack: "https://example.com/back",
      urlDone: "https://example.com/done",
      urlMs: "https://example.com/notify",
      accountingMode: "I",
      authorMode: "I",
      lang: "EN",
      email: "test@example.com",
      ordDescr: "Test order",
      options: "B",
      name: "Test",
      surname: "User",
    });

    expect(form.fields).toHaveProperty("LANG", "EN");
    expect(form.fields).toHaveProperty("EMAIL", "test@example.com");
    expect(form.fields).toHaveProperty("ORDDESCR", "Test order");
    expect(form.fields).toHaveProperty("NAME", "Test");
    expect(form.fields).toHaveProperty("SURNAME", "User");
  });
});

describe("VposClient — buildTokenRedirectForm", () => {
  const client = new VposClient(TEST_CONFIG);

  it("should build token redirect form with PAGE=TOKEN", () => {
    const form = client.buildTokenRedirectForm({
      amount: 1000,
      currency: "941",
      orderId: `TTKN-${Date.now()}`,
      urlBack: "https://example.com/back",
      urlDone: "https://example.com/done",
      urlMs: "https://example.com/notify",
      accountingMode: "I",
      authorMode: "I",
      token: "PANALIASXYZ123",
      network: "98",
    });

    expect(form.fields).toHaveProperty("PAGE", "TOKEN");
    expect(form.fields).toHaveProperty("TOKEN", "PANALIASXYZ123");
    expect(form.fields).toHaveProperty("NETWORK", "98");
    expect(form.fields).toHaveProperty("TRECURR", "C");
    expect(form.fields.MAC).toHaveLength(64);
  });
});

describe("VposClient — parseOutcomeParams", () => {
  const client = new VposClient(TEST_CONFIG);

  it("should parse query string", () => {
    const qs =
      "ORDERID=ORD1&SHOPID=SHOP1&AUTHNUMBER=123&AMOUNT=1500&CURRENCY=941&TRANSACTIONID=TX1&ACCOUNTINGMODE=I&AUTHORMODE=I&RESULT=00&MAC=abc";
    const outcome = client.parseOutcomeParams(qs);

    expect(outcome.orderId).toBe("ORD1");
    expect(outcome.shopId).toBe("SHOP1");
    expect(outcome.amount).toBe("1500");
    expect(outcome.result).toBe("00");
    expect(outcome.mac).toBe("abc");
  });

  it("should parse full URL", () => {
    const url = "https://example.com/done?ORDERID=ORD2&RESULT=00&MAC=xyz";
    const outcome = client.parseOutcomeParams(url);
    expect(outcome.orderId).toBe("ORD2");
    expect(outcome.result).toBe("00");
  });

  it("should parse URLSearchParams", () => {
    const params = new URLSearchParams({
      ORDERID: "ORD3",
      RESULT: "04",
      MAC: "NULL",
    });
    const outcome = client.parseOutcomeParams(params);
    expect(outcome.orderId).toBe("ORD3");
    expect(outcome.result).toBe("04");
  });

  it("should handle optional fields", () => {
    const qs =
      "ORDERID=O1&SHOPID=S1&AUTHNUMBER=&AMOUNT=100&CURRENCY=941&TRANSACTIONID=T1&ACCOUNTINGMODE=I&AUTHORMODE=I&RESULT=00&MAC=m1&PANTAIL=1234&CARDTYPE=VISA";
    const outcome = client.parseOutcomeParams(qs);
    expect(outcome.panTail).toBe("1234");
    expect(outcome.cardType).toBe("VISA");
  });
});

describe("VposClient — verifyOutcomeMAC", () => {
  const client = new VposClient(TEST_CONFIG);

  it("should return true for NULL MAC with non-00 result (expected per spec)", () => {
    const outcome = client.parseOutcomeParams(
      "ORDERID=O1&SHOPID=S1&AUTHNUMBER=&AMOUNT=100&CURRENCY=941&TRANSACTIONID=T1&ACCOUNTINGMODE=I&AUTHORMODE=I&RESULT=04&MAC=NULL",
    );
    expect(client.verifyOutcomeMAC(outcome)).toBe(true);
  });

  it("should return false for NULL MAC with 00 result", () => {
    const outcome = client.parseOutcomeParams(
      "ORDERID=O1&SHOPID=S1&AUTHNUMBER=&AMOUNT=100&CURRENCY=941&TRANSACTIONID=T1&ACCOUNTINGMODE=I&AUTHORMODE=I&RESULT=00&MAC=NULL",
    );
    expect(client.verifyOutcomeMAC(outcome)).toBe(false);
  });
});

describe("VposClient — verifyResponseMAC", () => {
  const client = new VposClient(TEST_CONFIG);

  it("should return false for NULL MAC", () => {
    const xml = `<BPWXmlResponse><Timestamp>2025-01-01T00:00:00.000</Timestamp><Result>04</Result><MAC>NULL</MAC></BPWXmlResponse>`;
    expect(client.verifyResponseMAC(xml)).toBe(false);
  });
});

describe("VposClient — parseWebhook", () => {
  const client = new VposClient(TEST_CONFIG);

  it("should parse webhook XML with authorization", () => {
    const xml = `<BPWXmlResponse>
<Timestamp>2025-01-01T12:00:00.000</Timestamp>
<Result>00</Result>
<MAC>somemac</MAC>
<Data>
<Authorization>
<TransactionID>TXWH1</TransactionID>
<OrderID>ORDWH1</OrderID>
<TransactionResult>00</TransactionResult>
<PaymentType>01</PaymentType>
<AuthorizationType>I</AuthorizationType>
<Network>01</Network>
<TransactionAmount>1500</TransactionAmount>
<AuthorizedAmount>1500</AuthorizedAmount>
<Currency>941</Currency>
<Exponent>2</Exponent>
<AccountedAmount>0</AccountedAmount>
<RefundedAmount>0</RefundedAmount>
<Timestamp>2025-01-01T12:00:00.000</Timestamp>
<AuthorizationNumber>AUTH1</AuthorizationNumber>
<AcquirerBIN>BIN1</AcquirerBIN>
<MerchantID>MID1</MerchantID>
<TransactionStatus>00</TransactionStatus>
<MAC>authmac</MAC>
</Authorization>
</Data>
</BPWXmlResponse>`;

    const result = client.parseWebhook(xml);
    expect(result.result).toBe("00");
    expect(result.authorization).toBeDefined();
    expect(result.authorization!.transactionId).toBe("TXWH1");
    expect(result.authorization!.orderId).toBe("ORDWH1");
  });
});

describe("VposClient — encrypt3DSData", () => {
  const client = new VposClient(TEST_CONFIG);

  it("should encrypt 3DS data to base64", () => {
    const encrypted = client.encrypt3DSData({
      browserAcceptHeader: "text/html",
      browserIP: "1.2.3.4",
      browserLanguage: "en",
    });
    expect(typeof encrypted).toBe("string");
    expect(encrypted.length).toBeGreaterThan(0);
    // Base64 encoded
    expect(encrypted).toMatch(/^[A-Za-z0-9+/]+=*$/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
//  INTEGRATION TESTS — hitting the real SIA test endpoint
// ═══════════════════════════════════════════════════════════════════════════════

describe("VposClient — LIVE integration with SIA test environment", () => {
  const client = new VposClient(TEST_CONFIG);

  it("should connect to SIA test endpoint (orderStatus for non-existing order)", async () => {
    const result = await client.orderStatus({
      orderId: `INTEGRATION-TEST-${Date.now()}`,
    });

    console.log(
      "orderStatus response:",
      JSON.stringify(
        {
          timestamp: result.timestamp,
          result: result.result,
          mac: result.mac,
        },
        null,
        2,
      ),
    );

    // We expect a response (not an HTTP error)
    expect(result.timestamp).toBeTruthy();
    expect(result.result).toBeTruthy();
    // Result 01 = "Order or ReqRefNum not found" — expected for non-existing order
    // Result 04 = "Incorrect API authentication, incorrect MAC" — means credentials are wrong
    // Result 00 = "Success" — unlikely for non-existing order
    console.log(
      `Result code: ${result.result} = "${RESULT_CODES[result.result] || "Unknown"}"`,
    );

    if (result.result === "00") {
      console.log(
        "SUCCESS! Credentials are working, order found (unexpected).",
      );
    } else if (result.result === "01") {
      console.log(
        "CREDENTIALS VALID! Order not found (expected for test order). Keys are working!",
      );
    } else if (result.result === "04") {
      console.log(
        "MAC ERROR — credentials may be incorrect or shop not configured for this algorithm.",
      );
    } else {
      console.log(`Unexpected result: ${result.result}`);
    }
  });

  it("should try listOperations to verify API access", async () => {
    const today = new Date();
    const startDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

    const result = await client.listOperations({
      startDate,
      endDate: startDate,
    });

    console.log(
      "listOperations response:",
      JSON.stringify(
        {
          timestamp: result.timestamp,
          result: result.result,
          mac: result.mac,
          numberOfItems: result.numberOfItems,
          operationsCount: result.operations.length,
        },
        null,
        2,
      ),
    );

    console.log(
      `Result code: ${result.result} = "${RESULT_CODES[result.result] || "Unknown"}"`,
    );

    expect(result.timestamp).toBeTruthy();
    expect(result.result).toBeTruthy();
  });

  it("should try listAuthorizations to verify API access", async () => {
    const today = new Date();
    const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

    const result = await client.listAuthorizations({
      filter: "1", // All
      startDate: dateStr,
      endDate: dateStr,
    });

    console.log(
      "listAuthorizations response:",
      JSON.stringify(
        {
          timestamp: result.timestamp,
          result: result.result,
          mac: result.mac,
          numberOfItems: result.numberOfItems,
          authorizationsCount: result.authorizations.length,
        },
        null,
        2,
      ),
    );

    console.log(
      `Result code: ${result.result} = "${RESULT_CODES[result.result] || "Unknown"}"`,
    );

    expect(result.timestamp).toBeTruthy();
    expect(result.result).toBeTruthy();
  });
});

// ─── Constant maps sanity checks ──────────────────────────────────────────────

describe("Constants", () => {
  it("RESULT_CODES should have standard codes", () => {
    expect(RESULT_CODES["00"]).toBe("Success");
    expect(RESULT_CODES["04"]).toContain("MAC");
    expect(RESULT_CODES["01"]).toContain("not found");
  });

  it("REDIRECT_RESULT_CODES should have standard codes", () => {
    expect(REDIRECT_RESULT_CODES["00"]).toBe("Success");
    expect(REDIRECT_RESULT_CODES["04"]).toContain("issuer");
  });
});
