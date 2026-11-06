#!/usr/bin/env node
"use strict";

// Prepara copias de revisión de videos internacionales: no sube ni reemplaza
// originales en Object Storage y jamás modifica el catálogo aprobado.
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const outputDir = path.join(root, "assets", "international-optimization-review");
const catalog = require(path.join(root, "biblioteca-internacional-catalog.json"));
const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(name);
  return i < 0 ? fallback : args[i + 1];
};
const port = Number(flag("--port", "5000"));
const limit = args.includes("--all") ? 5 : Number(flag("--limit", "1"));
if (!Number.isInteger(port) || port < 1 || port > 65535) throw Error("Puerto inválido.");
if (!Number.isInteger(limit) || limit < 1 || limit > 5) throw Error("Límite inválido (1 a 5).");

const targets = [
  ["collagen", "it", 3, 4],
  ["lumispa", "it", 3, 3],
  ["collagen", "it", 6, 2],
  ["collagen", "es", 6, 2],
  ["lumispa", "it", 6, 3]
];
const selected = targets.slice(0, limit).map(([product,country,day,index]) => {
  const key = product + "/" + country + "/" + day;
  const item = catalog[key]?.[index - 1];
  if (item?.type !== "video" || !/^[0-9]+\.mp4$/i.test(item.filename)) {
    throw Error("Material no verificado en catálogo: " + key + "/" + index);
  }
  return {
    key: key + "/" + index,
    url: "http://127.0.0.1:" + port + "/api/international-assets/" +
      product + "-" + country + "/" + day + "/" + index,
    stem: product + "-" + country + "-dia-" + day + "-material-" + index
  };
});
console.log("Candidatos para revisión: " + selected.length);
selected.forEach(t => console.log("  " + t.key));
if (args.includes("--dry-run")) process.exit(0);

for (const bin of ["curl", "ffprobe", "ffmpeg"]) {
  const test = spawnSync(bin, ["-version"], { encoding: "utf8", timeout: 10000 });
  if (test.error || test.status !== 0) throw Error("Falta " + bin + " en Replit Shell.");
}

const megabytes = bytes => (bytes / 1048576).toFixed(1) + " MB";
function probe(file) {
  const cmd = spawnSync("ffprobe", [
    "-v", "error", "-show_entries",
    "stream=codec_type,codec_name,width,height,pix_fmt,r_frame_rate:format=duration,size,bit_rate",
    "-of", "json", file
  ], { encoding: "utf8", timeout: 30000 });
  if (cmd.error || cmd.status !== 0) throw Error("ffprobe: " + (cmd.stderr || cmd.error || cmd.status));
  const result = JSON.parse(cmd.stdout);
  return {
    size: Number(result.format?.size || fs.statSync(file).size),
    duration: Number(result.format?.duration || 0),
    video: result.streams?.find(s => s.codec_type === "video") || {},
    audio: result.streams?.find(s => s.codec_type === "audio") || null
  };
}
function mp4Layout(file) {
  const fd = fs.openSync(file, "r");
  const bytes = fs.statSync(file).size;
  let pos=0,mdat=-1,moov=-1;
  try {
    for (let checked=0;checked<100 && pos+8<=bytes;checked++) {
      const header = Buffer.alloc(16);
      fs.readSync(fd, header, 0, 16, pos);
      let length = header.readUInt32BE(0);
      const atom = header.toString("latin1", 4, 8);
      if (length===1) length=Number(header.readBigUInt64BE(8));
      else if (length===0) length=bytes-pos;
      if (!Number.isSafeInteger(length)||length<8) break;
      if (atom==="mdat") mdat=pos;
      if (atom==="moov") moov=pos;
      pos+=length;
    }
  } finally { fs.closeSync(fd); }
  return moov>=0 && mdat>=0 ? (moov<mdat ? "faststart" : "moov al final") : "no determinado";
}
function screenshot(source,seconds,destination) {
  if (fs.existsSync(destination)) return;
  const result=spawnSync("ffmpeg",[
    "-hide_banner","-loglevel","error","-nostdin",
    "-ss",String(seconds),"-i",source,
    "-frames:v","1","-q:v","3","-y",destination
  ],{encoding:"utf8",timeout:60000});
  if (result.status!==0) console.warn("  No se creó captura de comparación: "+(result.stderr||"error"));
}
fs.mkdirSync(outputDir, {recursive:true});
console.log("\nLas copias de prueba se guardarán en: " + outputDir);
console.log("Los materiales originales permanecerán intactos.\n");

let completed=0;
for (let i=0;i<selected.length;i++) {
  const target=selected[i];
  const output=path.join(outputDir,target.stem+".mp4");
  if (fs.existsSync(output)) {
    console.log("["+(i+1)+"/"+selected.length+"] Ya existe: "+output+" (no se sobrescribe)");
    completed++;
    continue;
  }
  const tempDir=fs.mkdtempSync(path.join(os.tmpdir(),"nu-intl-opt-"));
  const source=path.join(tempDir,"source.mp4");
  const candidate=path.join(tempDir,"candidate.mp4");
  console.log("["+(i+1)+"/"+selected.length+"] "+target.key);
  try {
    const download=spawnSync("curl",[
      "-fLsS","--retry","2","--retry-all-errors",
      "--retry-delay","1","--max-time","300",
      "-o",source,target.url
    ],{encoding:"utf8",timeout:920000});
    if (download.error||download.status!==0||!fs.existsSync(source)||
        fs.statSync(source).size<1024) {
      throw Error("Descarga incompleta: "+(download.stderr||download.error||download.status));
    }
    const before=probe(source);
    console.log("  Original: "+megabytes(before.size)+", "+
      before.video.width+"x"+before.video.height+", "+
      before.video.codec_name+"/"+(before.audio?.codec_name||"sin audio")+", "+
      before.duration.toFixed(1)+" segundos, "+mp4Layout(source));
    // Mantener orientación y relación de aspecto; máximo 1280 píxeles en el lado largo.
    // H.264/AAC + faststart: estándar de revisión apto para navegadores móviles.
    const scale="scale=iw*min(1\\,1280/max(iw\\,ih)):-2";
    const encode=spawnSync("ffmpeg",[
      "-hide_banner","-loglevel","error","-nostdin",
      "-i",source,"-map","0:v:0","-map","0:a:0?",
      "-vf",scale,"-c:v","libx264","-preset","fast","-crf","24",
      "-pix_fmt","yuv420p","-c:a","aac","-b:a","96k",
      "-movflags","+faststart","-threads","2","-y",candidate
    ],{encoding:"utf8",timeout:1200000,maxBuffer:1024*1024});
    if (encode.error||encode.status!==0) throw Error("ffmpeg: "+(encode.stderr||encode.error||encode.status));
    const after=probe(candidate);
    if (after.duration<=0||before.duration<=0||
        Math.abs(after.duration-before.duration)>Math.max(1,before.duration*0.02)) {
      throw Error("La duración cambió demasiado; no guardé la versión.");
    }
    console.log("  Candidata: "+megabytes(after.size)+", "+
      after.video.width+"x"+after.video.height+", "+
      after.video.codec_name+"/"+(after.audio?.codec_name||"sin audio")+", "+
      after.duration.toFixed(1)+" segundos, "+mp4Layout(candidate));
    console.log("  Reducción: "+((1-after.size/before.size)*100).toFixed(1)+"%");
    fs.copyFileSync(candidate,output,fs.constants.COPYFILE_EXCL);
    const seek=Math.min(Math.max(before.duration*0.25,0),60);
    screenshot(source,seek,path.join(outputDir,target.stem+".original.jpg"));
    screenshot(candidate,seek,path.join(outputDir,target.stem+".candidata.jpg"));
    console.log("  Para revisar: "+output);
    completed++;
  } catch (error) {
    console.error("  ERROR: "+(error.message||error));
    process.exitCode=1;
  } finally {
    for (const file of [source,candidate]) {
      if (fs.existsSync(file)) fs.unlinkSync(file);
    }
    fs.rmdirSync(tempDir);
  }
}
console.log("\nPreparadas: "+completed+"/"+selected.length+" copias de prueba.");
console.log("No se modificaron originales, catálogo ni aplicación publicada.");
