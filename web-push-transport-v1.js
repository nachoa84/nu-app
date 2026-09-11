"use strict";

function createWebPushTransportV1({ webpush, config }) {
  if (!webpush || typeof webpush.sendNotification !== "function") {
    throw new Error("Transporte Web Push inválido.");
  }
  webpush.setVapidDetails(
    config.vapidSubject,
    config.vapidPublicKey,
    config.vapidPrivateKey
  );
  return Object.freeze({
    async send(subscription, payload) {
      return webpush.sendNotification(subscription, JSON.stringify(payload), {
        timeout: config.pushTimeoutMs
      });
    }
  });
}

module.exports = { createWebPushTransportV1 };
