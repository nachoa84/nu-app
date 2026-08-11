// Arranque local de server.js sin App Storage de Replit ni PostgreSQL.
// Uso: node tests/manual-smoke.js  (sólo para validaciones manuales)

const Module = require("module");
const originalLoad = Module._load;

Module._load = function patchedLoad(request, parent, isMain) {
  if (request === "@replit/object-storage") {
    return {
      Client: class {
        async downloadAsBytes() {
          throw new Error("App Storage deshabilitado en modo local.");
        }
      }
    };
  }

  return originalLoad.call(this, request, parent, isMain);
};

require("../server.js");
