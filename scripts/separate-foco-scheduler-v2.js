const fs = require("fs");
const { execFileSync } = require("child_process");

const file = "server.js";
const original = fs.readFileSync(file, "utf8");
let source = original;

const oldPromiseBlock = `const [maintenance, notifications, foco] = await Promise.all([
      runLeaderMaintenanceV116(deadline),
      pushConfigured && Date.now() < deadline
        ? processUnifiedRoutineNotificationJobsV109(deadline)
        : Promise.resolve(emptyNotifications),
      pushConfigured && Date.now() < deadline
        ? processFocoNotificationsV1()
        : Promise.resolve({ processed: 0, sent: 0, removed: 0, failed: 0 })
    ]);`;

const newPromiseBlock = `const [maintenance, notifications] = await Promise.all([
      runLeaderMaintenanceV116(deadline),
      pushConfigured && Date.now() < deadline
        ? processUnifiedRoutineNotificationJobsV109(deadline)
        : Promise.resolve(emptyNotifications)
    ]);`;

if (source.includes(oldPromiseBlock)) {
  source = source.replace(oldPromiseBlock, newPromiseBlock);
} else if (!source.includes(newPromiseBlock)) {
  throw new Error("No se encontró el bloque esperado de runSchedulerCycle().");
}

source = source.replace(
  /\s*\|\|\s*foco\.processed > 0/g,
  ""
);

source = source.replace(
  /\s*`foco_procesados=\$\{foco\.processed\} foco_enviados=\$\{foco\.sent\} ` \+\n\s*`foco_fallidos=\$\{foco\.failed\} ` \+/g,
  ""
);

const schedulerStart = source.indexOf("async function runSchedulerCycle() {");
const schedulerEnd = source.indexOf("\nfunction startScheduler()", schedulerStart);
if (schedulerStart < 0 || schedulerEnd < 0) {
  throw new Error("No se pudo delimitar runSchedulerCycle().");
}

const schedulerBlock = source.slice(schedulerStart, schedulerEnd);
if (/\bfoco\b/.test(schedulerBlock)) {
  throw new Error("Todavía quedan referencias a Foco dentro de runSchedulerCycle().");
}

try {
  fs.writeFileSync(file, source);
  execFileSync(process.execPath, ["--check", file], { stdio: "inherit" });
} catch (error) {
  fs.writeFileSync(file, original);
  throw error;
}

console.log("[foco-v2-separate] OK: Foco quedó fuera del scheduler general.");
