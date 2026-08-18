"use strict";

const crypto = require("node:crypto");
const {
  chunkIrisDocumentV1
} = require("./iris-document-chunker-v1");

const MAX_PDF_BYTES_V1 = 15 * 1024 * 1024;
const PDF_MIME_TYPE_V1 = "application/pdf";

class IrisIngestionErrorV1 extends Error {
  constructor(message) {
    super(message);
    this.name = "IrisIngestionErrorV1";
  }
}

class IrisIngestionOperationalErrorV1 extends Error {
  constructor() {
    super("No se pudo completar la ingesta documental.");
    this.name = "IrisIngestionOperationalErrorV1";
  }
}

function requiredTextV1(value, label, maxLength = 500) {
  if (typeof value !== "string") {
    throw new IrisIngestionErrorV1(
      `${label} debe ser una cadena.`
    );
  }

  const normalized = value.trim();
  if (!normalized || normalized.length > maxLength) {
    throw new IrisIngestionErrorV1(
      `${label} no tiene una longitud válida.`
    );
  }

  return normalized;
}

function optionalTextV1(value, label, maxLength = 200) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  return requiredTextV1(value, label, maxLength);
}

function normalizeMetadataV1(metadata = {}) {
  const language = requiredTextV1(
    metadata.language,
    "language",
    10
  );
  if (!/^[a-z]{2}(-[A-Z]{2})?$/.test(language)) {
    throw new IrisIngestionErrorV1(
      "language no tiene un formato válido."
    );
  }

  const country = requiredTextV1(
    metadata.country,
    "country",
    6
  );
  if (!/^(GLOBAL|[A-Z]{2})$/.test(country)) {
    throw new IrisIngestionErrorV1(
      "country no tiene un formato válido."
    );
  }

  const category = requiredTextV1(
    metadata.category,
    "category",
    64
  );
  if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(category)) {
    throw new IrisIngestionErrorV1(
      "category no tiene un formato válido."
    );
  }

  const productSlug = optionalTextV1(
    metadata.productSlug,
    "productSlug",
    64
  );
  if (
    productSlug &&
    !/^[a-z0-9][a-z0-9-]{0,63}$/.test(productSlug)
  ) {
    throw new IrisIngestionErrorV1(
      "productSlug no tiene un formato válido."
    );
  }

  return {
    title: requiredTextV1(metadata.title, "title"),
    sourceName: requiredTextV1(
      metadata.sourceName,
      "sourceName"
    ),
    sourceReference: requiredTextV1(
      metadata.sourceReference,
      "sourceReference",
      1000
    ),
    rightsHolder: requiredTextV1(
      metadata.rightsHolder,
      "rightsHolder"
    ),
    authorizationReference: requiredTextV1(
      metadata.authorizationReference,
      "authorizationReference",
      1000
    ),
    language,
    country,
    category,
    productSlug,
    versionLabel: optionalTextV1(
      metadata.versionLabel,
      "versionLabel"
    ),
    documentFamilyKey: optionalTextV1(
      metadata.documentFamilyKey,
      "documentFamilyKey"
    ),
    effectiveFrom: normalizeOptionalDateV1(
      metadata.effectiveFrom,
      "effectiveFrom"
    ),
    effectiveUntil: normalizeOptionalDateV1(
      metadata.effectiveUntil,
      "effectiveUntil"
    )
  };
}

function normalizeOptionalDateV1(value, label) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new IrisIngestionErrorV1(
      `${label} debe representar una fecha válida.`
    );
  }

  return date;
}

function validateDatesV1(metadata) {
  if (
    metadata.effectiveFrom &&
    metadata.effectiveUntil &&
    metadata.effectiveUntil <= metadata.effectiveFrom
  ) {
    throw new IrisIngestionErrorV1(
      "effectiveUntil debe ser posterior a effectiveFrom."
    );
  }
}

function validatePdfV1(file) {
  if (!file || !Buffer.isBuffer(file.bytes)) {
    throw new IrisIngestionErrorV1(
      "Se requiere un PDF en memoria."
    );
  }

  if (file.mimeType !== PDF_MIME_TYPE_V1) {
    throw new IrisIngestionErrorV1(
      "El tipo MIME permitido es application/pdf."
    );
  }

  if (
    file.bytes.length === 0 ||
    file.bytes.length > MAX_PDF_BYTES_V1
  ) {
    throw new IrisIngestionErrorV1(
      "El PDF está vacío o supera 15 MiB."
    );
  }

  if (file.bytes.subarray(0, 5).toString("ascii") !== "%PDF-") {
    throw new IrisIngestionErrorV1(
      "El archivo no tiene una firma PDF válida."
    );
  }

  return file.bytes;
}

function safeLogV1(error, operation) {
  return {
    operation,
    errorCode:
      typeof error?.code === "string"
        ? error.code
        : "",
    constraint:
      typeof error?.constraint === "string"
        ? error.constraint
        : "",
    retryable:
      Boolean(
        error?.code === "40001" ||
        error?.code === "40P01" ||
        error?.code === "08006"
      )
  };
}

function createIrisDocumentIngestionServiceV1({
  pool,
  objectStorage,
  extractPdfText,
  chunkDocument = chunkIrisDocumentV1,
  randomUUID = crypto.randomUUID,
  logError = () => {}
}) {
  if (
    !pool ||
    typeof pool.query !== "function" ||
    typeof pool.connect !== "function"
  ) {
    throw new IrisIngestionErrorV1(
      "Se requiere un pool PostgreSQL válido."
    );
  }

  if (
    !objectStorage ||
    typeof objectStorage.putObject !== "function" ||
    typeof objectStorage.deleteObject !== "function"
  ) {
    throw new IrisIngestionErrorV1(
      "Se requiere un adaptador privado de Object Storage."
    );
  }

  if (typeof extractPdfText !== "function") {
    throw new IrisIngestionErrorV1(
      "Se requiere un extractor PDF."
    );
  }

  if (
    typeof chunkDocument !== "function" ||
    typeof randomUUID !== "function" ||
    typeof logError !== "function"
  ) {
    throw new IrisIngestionErrorV1(
      "Las dependencias de ingesta no son válidas."
    );
  }

  async function ingestPdf({
    file,
    metadata,
    actorKeyId
  } = {}) {
    const pdfBytes = validatePdfV1(file);
    const normalizedMetadata = normalizeMetadataV1(metadata);
    validateDatesV1(normalizedMetadata);

    const normalizedActorKeyId = requiredTextV1(
      actorKeyId,
      "actorKeyId",
      200
    );

    const contentSha256 = crypto
      .createHash("sha256")
      .update(pdfBytes)
      .digest("hex");

    const duplicate = await pool.query(
      `SELECT document_key
       FROM iris_documents
       WHERE content_sha256 = $1
       LIMIT 1`,
      [contentSha256]
    );

    if (duplicate.rows.length > 0) {
      throw new IrisIngestionErrorV1(
        "El documento ya fue incorporado."
      );
    }

    let extractedText;
    try {
      extractedText = await extractPdfText(pdfBytes);
    } catch (error) {
      logError(safeLogV1(error, "extract_pdf_v1"));
      throw new IrisIngestionOperationalErrorV1();
    }

    const chunked = chunkDocument(extractedText);
    const documentKey = `doc_${randomUUID()}`;
    const documentFamilyKey =
      normalizedMetadata.documentFamilyKey ||
      `family_${randomUUID()}`;
    const objectKey = [
      "iris",
      "documents",
      "v1",
      documentFamilyKey,
      documentKey,
      contentSha256,
      "original.pdf"
    ].join("/");

    let uploaded = false;

    try {
      await objectStorage.putObject({
        key: objectKey,
        bytes: pdfBytes,
        contentType: PDF_MIME_TYPE_V1
      });
      uploaded = true;

      const client = await pool.connect();
      try {
        await client.query("BEGIN");

        const documentResult = await client.query(
          `INSERT INTO iris_documents (
             document_key,
             document_family_key,
             title,
             source_name,
             source_reference,
             rights_holder,
             authorization_status,
             authorization_reference,
             language,
             country,
             category,
             product_slug,
             version_label,
             effective_from,
             effective_until,
             object_key,
             mime_type,
             content_sha256,
             is_active
           )
           VALUES (
             $1, $2, $3, $4, $5, $6,
             'pending', $7, $8, $9, $10, $11,
             $12, $13, $14, $15, $16, $17, FALSE
           )
           RETURNING id`,
          [
            documentKey,
            documentFamilyKey,
            normalizedMetadata.title,
            normalizedMetadata.sourceName,
            normalizedMetadata.sourceReference,
            normalizedMetadata.rightsHolder,
            normalizedMetadata.authorizationReference,
            normalizedMetadata.language,
            normalizedMetadata.country,
            normalizedMetadata.category,
            normalizedMetadata.productSlug,
            normalizedMetadata.versionLabel,
            normalizedMetadata.effectiveFrom,
            normalizedMetadata.effectiveUntil,
            objectKey,
            PDF_MIME_TYPE_V1,
            contentSha256
          ]
        );

        const documentId = documentResult.rows[0].id;
        const documentIds = chunked.chunks.map(
          () => documentId
        );

        await client.query(
          `INSERT INTO iris_document_chunks (
             document_id,
             chunk_index,
             heading,
             content,
             content_sha256,
             search_text_normalized,
             character_start,
             character_end
           )
           SELECT *
           FROM UNNEST(
             $1::bigint[],
             $2::integer[],
             $3::text[],
             $4::text[],
             $5::text[],
             $6::text[],
             $7::integer[],
             $8::integer[]
           )`,
          [
            documentIds,
            chunked.chunks.map(item => item.chunkIndex),
            chunked.chunks.map(item => item.heading),
            chunked.chunks.map(item => item.content),
            chunked.chunks.map(item => item.contentSha256),
            chunked.chunks.map(
              item => item.searchTextNormalized
            ),
            chunked.chunks.map(item => item.characterStart),
            chunked.chunks.map(item => item.characterEnd)
          ]
        );

        await client.query(
          `INSERT INTO iris_document_audit (
             document_id,
             actor_key_id,
             action,
             details,
             client_ip
           )
           VALUES (
             $1,
             $2,
             'document_created',
             $3::jsonb,
             NULL
           )`,
          [
            documentId,
            normalizedActorKeyId,
            JSON.stringify({
              chunkCount: chunked.chunks.length,
              language: normalizedMetadata.language,
              country: normalizedMetadata.country,
              category: normalizedMetadata.category,
              productSlug: normalizedMetadata.productSlug
            })
          ]
        );

        await client.query("COMMIT");

        return {
          documentKey,
          documentFamilyKey,
          status: "pending",
          isActive: false,
          chunkCount: chunked.chunks.length
        };
      } catch (error) {
        try {
          await client.query("ROLLBACK");
        } catch {
          // La liberación de la conexión mantiene el fallo contenido.
        }
        throw error;
      } finally {
        client.release();
      }
    } catch (error) {
      if (uploaded) {
        try {
          await objectStorage.deleteObject({ key: objectKey });
        } catch (cleanupError) {
          logError(
            safeLogV1(
              cleanupError,
              "cleanup_uploaded_object_v1"
            )
          );
        }
      }

      if (
        error instanceof IrisIngestionErrorV1 ||
        error instanceof IrisIngestionOperationalErrorV1
      ) {
        throw error;
      }

      logError(safeLogV1(error, "ingest_pdf_v1"));
      throw new IrisIngestionOperationalErrorV1();
    }
  }

  return {
    ingestPdf
  };
}

module.exports = {
  MAX_PDF_BYTES_V1,
  PDF_MIME_TYPE_V1,
  IrisIngestionErrorV1,
  IrisIngestionOperationalErrorV1,
  createIrisDocumentIngestionServiceV1,
  normalizeMetadataV1,
  safeLogV1,
  validatePdfV1
};
