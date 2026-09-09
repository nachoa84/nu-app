"use strict";

function normalizeSearchText(input) {
  if (typeof input !== "string") throw new TypeError("input debe ser texto.");
  return input
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase()
    .replace(/\s+/gu, " ")
    .trim();
}

module.exports = { normalizeSearchText };
