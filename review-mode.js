"use strict";

function isReviewModeAllowed(env = process.env) {
  return String(env.REPLIT_DEPLOYMENT || "").trim() !== "1" &&
    String(env.NODE_ENV || "").trim().toLowerCase() !== "production";
}

module.exports = { isReviewModeAllowed };
