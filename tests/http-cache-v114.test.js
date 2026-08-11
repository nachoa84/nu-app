"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  etagListMatchesV114,
  shouldHonorRangeV114,
  shouldReturnNotModifiedV114
} = require("../http-cache-v114");

const request = (method, headers = {}) => ({ method, headers });

test("If-None-Match acepta ETag fuerte, débil y listas", () => {
  assert.equal(etagListMatchesV114('"abc"', '"abc"'), true);
  assert.equal(etagListMatchesV114('W/"abc"', '"abc"'), true);
  assert.equal(etagListMatchesV114('"otro", W/"abc"', '"abc"'), true);
  assert.equal(etagListMatchesV114('"otro"', '"abc"'), false);
});

test("GET y HEAD coincidentes responden como no modificados", () => {
  assert.equal(
    shouldReturnNotModifiedV114(request("GET", { "if-none-match": '"abc"' }), '"abc"'),
    true
  );
  assert.equal(
    shouldReturnNotModifiedV114(request("HEAD", { "if-none-match": "*" }), '"abc"'),
    true
  );
});

test("If-Range coincidente conserva el rango", () => {
  assert.equal(
    shouldHonorRangeV114(
      request("GET", { range: "bytes=0-99", "if-range": 'W/"abc"' }),
      '"abc"'
    ),
    true
  );
});

test("If-Range vencido obliga a devolver el objeto completo", () => {
  assert.equal(
    shouldHonorRangeV114(
      request("GET", { range: "bytes=0-99", "if-range": '"viejo"' }),
      '"abc"'
    ),
    false
  );
});
