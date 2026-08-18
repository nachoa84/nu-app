"use strict";

const {
  createIrisDocumentIngestionServiceV1
} = require("./iris-document-ingestion-service-v1");
const {
  createIrisPdfJsTextExtractorV1
} = require("./iris-pdfjs-text-extractor-v1");
const {
  createIrisReplitStorageAdapterV1
} = require("./iris-replit-storage-adapter-v1");

function createIrisIngestionRuntimeV1({
  pool,
  storageClient,
  loadPdfJs,
  randomUUID,
  logError
} = {}) {
  const objectStorage =
    createIrisReplitStorageAdapterV1({
      client: storageClient
    });

  const extractPdfText =
    createIrisPdfJsTextExtractorV1({
      loadPdfJs
    });

  return createIrisDocumentIngestionServiceV1({
    pool,
    objectStorage,
    extractPdfText,
    randomUUID,
    logError
  });
}

module.exports = {
  createIrisIngestionRuntimeV1
};
