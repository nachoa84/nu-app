"use strict";
// Vista previa aislada: no importa server.js, no conecta a PostgreSQL,
// no inicia rutinas, notificaciones, crons ni tareas programadas.
const express = require("express");
const path = require("path");
const { Client } = require("@replit/object-storage");
const catalog = require("./biblioteca-internacional-catalog.json");

const app = express();
const storage = new Client();
const collectionFolders = Object.freeze({
  "collagen-es": ["collagen", "es", "ES COLAGENO"],
  "collagen-it": ["collagen", "it", "IT COLAGENO"],
  "lumispa-it": ["lumispa", "it", "IT LUMI"]
});

for (const filename of [
  "biblioteca-internacional.html",
  "biblioteca-internacional-data.js",
  "biblioteca-internacional-catalog.json"
]) {
  app.get("/" + filename, (req, res) => res.sendFile(path.join(__dirname, filename)));
}
app.get("/", (req, res) => res.redirect("/biblioteca-internacional.html"));

app.get("/api/international-assets/:collection/:day/:index", async (req, res) => {
  const collection = collectionFolders[req.params.collection];
  const day = Number(req.params.day);
  const index = Number(req.params.index);
  if (!collection || !Number.isInteger(day) || day < 1 || day > 10 ||
      !Number.isInteger(index) || index < 1) return res.sendStatus(404);
  const item = catalog[collection[0] + "/" + collection[1] + "/" + day]?.[index - 1];
  if (!item || !/^[0-9]+\.(?:jpg|jpeg|png|mp4|mov)$/i.test(item.filename)) {
    return res.sendStatus(404);
  }

  try {
    const bucket = await storage.getBucket();
    const filenames = [item.filename];
    if (/\.jpg$/i.test(item.filename)) filenames.push(item.filename.replace(/\.jpg$/i, ".JPG"));
    let media;
    for (const folder of ["DIA " + day, "DÍA " + day]) {
      for (const filename of [...new Set(filenames)]) {
        try {
          const file = bucket.file("bot/active/international/v1/" + collection[2] + "/" + folder + "/" + filename);
          const [metadata] = await file.getMetadata();
          media = {file,metadata};
          break;
        } catch (error) {
          if (Number(error.code) !== 404 && Number(error.status) !== 404) throw error;
        }
      }
      if (media) break;
    }
    if (!media) return res.sendStatus(404);

    const size = Number(media.metadata.size);
    const types = {jpg:"image/jpeg",jpeg:"image/jpeg",png:"image/png",mp4:"video/mp4",mov:"video/quicktime"};
    const extension = item.filename.split(".").pop().toLowerCase();
    res.set({"Content-Type":media.metadata.contentType || types[extension],"Accept-Ranges":"bytes","Cache-Control":"no-store"});
    const match = /^bytes=(\d+)-(\d*)$/.exec(String(req.headers.range || ""));
    if (req.headers.range && !match) return res.status(416).set("Content-Range","bytes */" + size).end();
    if (match) {
      const start=Number(match[1]),end=match[2]?Math.min(Number(match[2]),size-1):size-1;
      if (!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start>=size||end<start) {
        return res.status(416).set("Content-Range","bytes */" + size).end();
      }
      res.status(206).set({"Content-Range":"bytes " + start + "-" + end + "/" + size,"Content-Length":String(end-start+1)});
      media.file.createReadStream({start,end,decompress:false}).on("error",err=>res.destroy(err)).pipe(res);
    } else {
      res.set("Content-Length",String(size));
      media.file.createReadStream({decompress:false}).on("error",err=>res.destroy(err)).pipe(res);
    }
  } catch(error) {
    console.error("[library-preview] read failed:", error.message);
    if (!res.headersSent) res.status(502).send("No se pudo leer el archivo.");
  }
});

const port = Number(process.env.LIBRARY_PREVIEW_PORT || 3101);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error("Puerto inválido");
app.listen(port, "0.0.0.0", () => {
  console.log("Biblioteca Internacional preview en puerto " + port + " (solo lectura)");
});
