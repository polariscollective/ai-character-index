/** Run: node --test app/lib/__tests__/allowed-email.test.mjs */
import assert from "node:assert/strict";
import { test } from "node:test";
import { isAllowedEmail } from "../allowed-email.mjs";

function withEnv(emails, domains, body) {
  const before = [process.env.ALLOWED_EMAILS, process.env.ALLOWED_DOMAINS];
  process.env.ALLOWED_EMAILS = emails;
  process.env.ALLOWED_DOMAINS = domains;
  try { body(); } finally {
    [process.env.ALLOWED_EMAILS, process.env.ALLOWED_DOMAINS] = before;
  }
}

test("nothing configured lets nobody in", () => {
  withEnv("", "", () => {
    assert.equal(isAllowedEmail("anyone@example.com"), false);
  });
});

test("an address on the list gets in, whatever its case and spacing", () => {
  withEnv(" Someone@Example.com , other@example.com ", "", () => {
    assert.equal(isAllowedEmail("someone@example.com"), true);
    assert.equal(isAllowedEmail("SOMEONE@EXAMPLE.COM"), true);
    assert.equal(isAllowedEmail(" other@example.com "), true);
    assert.equal(isAllowedEmail("nobody@example.com"), false);
  });
});

test("a domain on the list admits every address in it", () => {
  withEnv("", "polariscollective.com", () => {
    assert.equal(isAllowedEmail("anyone@polariscollective.com"), true);
    assert.equal(isAllowedEmail("anyone@notpolariscollective.com"), false);
  });
});

test("no address is no entry", () => {
  withEnv("", "example.com", () => {
    for (const value of [null, undefined, "", "   ", "no-at-sign"]) {
      assert.equal(isAllowedEmail(value), false, `${JSON.stringify(value)} got in`);
    }
  });
});
