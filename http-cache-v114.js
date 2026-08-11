"use strict";

function normalizeEtagV114(value) {
  return String(value || "").trim().replace(/^W\//, "");
}

function etagListMatchesV114(header, etag) {
  if (!header || !etag) return false;
  const expected = normalizeEtagV114(etag);
  return String(header)
    .split(",")
    .map(value => value.trim())
    .some(value => value === "*" || normalizeEtagV114(value) === expected);
}

function shouldReturnNotModifiedV114(req, etag) {
  return (
    (req.method === "GET" || req.method === "HEAD") &&
    etagListMatchesV114(req.headers["if-none-match"], etag)
  );
}

function shouldHonorRangeV114(req, etag) {
  if (!req.headers.range) return false;
  const ifRange = req.headers["if-range"];
  if (!ifRange) return true;
  return etagListMatchesV114(ifRange, etag);
}

module.exports = {
  etagListMatchesV114,
  shouldHonorRangeV114,
  shouldReturnNotModifiedV114
};
