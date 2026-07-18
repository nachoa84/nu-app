
const blocks = [
  {
    type:"text",
    content:`List@ para desafiarte e iniciar el CHALLENGE?

IMPORTANTE: Durante el Challenge #30DíasCollagen+, diariamente y por este medio, recibirás las herramientas digitales, los típs de venta y el material de mercadeo del producto para que alcances la meta que te propongas!!!

COMENZAMOS!🚀🚀🚀`
  },
  {
    type:"text",
    content:`COMENZAMOS!🚀🚀🚀

Bienvenid@ al día #1 del Challenge #30DíasCollagen+ 🙌🏻

Hoy te propongo que aprendas sobre Collagen+, con este breve video que tiene toda la info que necesitas🙌🏻`,
    link:"https://mc.ht/s/MJ11OCy",
    linkLabel:"Ver video educativo"
  },
  {
    type:"text",
    content:`Ahora publica en tus estados y redes sociales este material de mercadeo.

Importante:
✅ Tienes que publicar el material en el orden en que te lo envío, porque eso garantiza la efectividad🙌🏻

✅ Sé constante... descargame día a día y realiza las acciones, tenemos 30 días juntos, si haces todo al pie de la letra vas a aprender mucho, tomar seguridad y cumplir tus metas🙌🏻`
  },
  {type:"text", content:"✨ Ábrete a esta oportunidad y permítete Soñar en GRANDE✨"},
  {type:"text", content:"A continuación el material para publicar hoy en tus estados de whatsapp, instagram y facebook."},
  {type:"media", mediaType:"image", src:"assets/01_a_partir_de_los_25.jpg", label:"Historia 1 de 4"},
  {type:"media", mediaType:"image", src:"assets/02_la_mejor_forma_de_revertirlo.jpg", label:"Historia 2 de 4"},
  {type:"media", mediaType:"image", src:"assets/03_si_queres_resultados.jpg", label:"Historia 3 de 4"},
  {type:"media", mediaType:"video", src:"assets/04_video.mp4", label:"Historia 4 de 4"},
  {type:"complete", label:"Marcar Día 1 como completado"}
];

const chat = document.getElementById("chat");
const chatWrap = document.getElementById("chatWrap");
const progressText = document.getElementById("progressText");
const startDayBtn = document.getElementById("startDayBtn");
const showAllBtn = document.getElementById("showAllBtn");
const restartBtn = document.getElementById("restartBtn");

let revealIndex = 0;
let revealTimer = null;

function toast(text){
  const el=document.createElement("div");
  el.className="toast";
  el.textContent=text;
  document.body.appendChild(el);
  setTimeout(()=>el.remove(),2200);
}

function saveFavorite(src,label,mediaType){
  const favs=JSON.parse(localStorage.getItem("favorites")||"[]");
  const idx=favs.findIndex(f=>f.src===src);
  if(idx>=0){favs.splice(idx,1);toast("Eliminado de favoritos");}
  else{favs.push({src,label,mediaType});toast("Guardado en favoritos");}
  localStorage.setItem("favorites",JSON.stringify(favs));
  renderFavorites();
}

async function shareAsset(src,label,mediaType){
  try{
    const res=await fetch(src);
    const blob=await res.blob();
    const ext=mediaType==="video"?"mp4":"jpg";
    const file=new File([blob], `${label.replaceAll(" ","_")}.${ext}`, {type:blob.type});
    if(navigator.canShare && navigator.canShare({files:[file]})){
      await navigator.share({files:[file], title:label});
      return;
    }
  }catch(e){}
  // Fallback: download/open
  const a=document.createElement("a");
  a.href=src;
  a.download="";
  a.target="_blank";
  a.click();
  toast("Tu dispositivo no permite compartir directo desde esta PWA. Se abrió/descargó el archivo.");
}

function createBlock(block, index){
  if(block.type==="text"){
    const el=document.createElement("div");
    el.className="bubble bot";
    el.textContent=block.content;
    if(block.link){
      const br=document.createElement("div");
      br.style.marginTop="10px";
      const a=document.createElement("a");
      a.href=block.link; a.target="_blank"; a.rel="noopener";
      a.textContent=block.linkLabel||"Abrir enlace";
      a.className="secondary";
      a.style.display="inline-block"; a.style.textDecoration="none";
      br.appendChild(a); el.appendChild(br);
    }
    return el;
  }

  if(block.type==="media"){
    const card=document.createElement("div");
    card.className="media-card";
    const media=block.mediaType==="video"?document.createElement("video"):document.createElement("img");
    media.src=block.src;
    if(block.mediaType==="video"){media.controls=true;media.preload="metadata";}
    else{media.alt=block.label;}
    card.appendChild(media);
    const meta=document.createElement("div");
    meta.className="media-meta";
    meta.innerHTML=`<div class="media-top"><strong>${block.label}</strong><span>${index-4}/4</span></div>`;
    const actions=document.createElement("div");
    actions.className="media-actions";
    const fav=document.createElement("button"); fav.className="secondary"; fav.textContent="♡ Favorito";
    fav.onclick=()=>saveFavorite(block.src,block.label,block.mediaType);
    const share=document.createElement("button"); share.className="primary"; share.textContent="Compartir";
    share.onclick=()=>shareAsset(block.src,block.label,block.mediaType);
    actions.append(fav,share);
    meta.appendChild(actions);
    card.appendChild(meta);
    return card;
  }

  if(block.type==="complete"){
    const card=document.createElement("div");
    card.className="complete-card";
    const done=localStorage.getItem("day1Complete")==="1";
    card.innerHTML=done
      ? `<div style="font-size:34px">✅</div><h3>Día 1 completado</h3><p>Podés volver cuando quieras desde Rutina.</p>`
      : `<h3>¿Terminaste tu acción de hoy?</h3><p>Marcá el día como completado para registrar tu avance.</p>`;
    if(!done){
      const btn=document.createElement("button");
      btn.className="primary"; btn.textContent=block.label;
      btn.onclick=()=>{
        localStorage.setItem("day1Complete","1");
        card.classList.add("done");
        card.innerHTML=`<div style="font-size:34px">✅</div><h3>Día 1 completado</h3><p>Nos vemos mañana con una nueva acción.</p>`;
        renderDays();
      };
      card.appendChild(btn);
    }
    return card;
  }
}

function updateProgress(){
  progressText.textContent=`${Math.min(revealIndex,blocks.length)}/${blocks.length} bloques`;
}

function revealNext(){
  if(revealIndex>=blocks.length) return;
  const el=createBlock(blocks[revealIndex], revealIndex);
  chat.appendChild(el);
  revealIndex++;
  updateProgress();
  setTimeout(()=>el.scrollIntoView({behavior:"smooth",block:"end"}),50);
  if(revealIndex<blocks.length){
    const delay=blocks[revealIndex-1].type==="media"?900:700;
    revealTimer=setTimeout(revealNext,delay);
  }
}

function startProgressive(){
  clearTimeout(revealTimer);
  chat.innerHTML="";
  revealIndex=0;
  chatWrap.classList.remove("hidden");
  updateProgress();
  revealNext();
}

function showAll(){
  clearTimeout(revealTimer);
  chat.innerHTML="";
  chatWrap.classList.remove("hidden");
  blocks.forEach((b,i)=>chat.appendChild(createBlock(b,i)));
  revealIndex=blocks.length;
  updateProgress();
  chatWrap.scrollIntoView({behavior:"smooth"});
}

startDayBtn.onclick=startProgressive;
showAllBtn.onclick=showAll;
restartBtn.onclick=startProgressive;

// Views
document.querySelectorAll(".nav-btn").forEach(btn=>{
  btn.addEventListener("click",()=>{
    const view=btn.dataset.view;
    document.querySelectorAll(".nav-btn").forEach(b=>b.classList.toggle("active",b===btn));
    document.querySelectorAll(".view").forEach(v=>v.classList.remove("active"));
    document.getElementById(`view-${view}`).classList.add("active");
    if(view==="favoritos") renderFavorites();
  });
});

// Days
function renderDays(){
  const grid=document.getElementById("daysGrid");
  grid.innerHTML="";
  for(let d=1;d<=7;d++){
    const card=document.createElement("div");
    const complete=d===1 && localStorage.getItem("day1Complete")==="1";
    card.className=`day-card ${d===1?"current":""} ${d>1?"locked":""}`;
    card.innerHTML=`<strong>Día ${d}</strong><span>${d===1?(complete?"✅ Completado":"🔥 Disponible"):"🔒 Próximamente"}</span>`;
    if(d===1){
      card.onclick=()=>{
        document.querySelector('[data-view="hoy"]').click();
        showAll();
      };
      card.style.cursor="pointer";
    }
    grid.appendChild(card);
  }
}
renderDays();

// Favorites
function renderFavorites(){
  const list=document.getElementById("favoritesList");
  const favs=JSON.parse(localStorage.getItem("favorites")||"[]");
  if(!favs.length){
    list.className="favorites-list empty-state";
    list.textContent="Todavía no guardaste contenido.";
    return;
  }
  list.className="favorites-list";
  list.innerHTML="";
  favs.forEach(f=>{
    const item=document.createElement("div");
    item.className="favorite-item";
    const media=f.mediaType==="video"?document.createElement("video"):document.createElement("img");
    media.src=f.src;
    if(f.mediaType==="video"){media.controls=true;media.preload="metadata";}
    item.appendChild(media);
    const pad=document.createElement("div"); pad.className="pad";
    pad.innerHTML=`<strong>${f.label}</strong>`;
    const actions=document.createElement("div"); actions.className="media-actions";
    const share=document.createElement("button"); share.className="primary"; share.textContent="Compartir";
    share.onclick=()=>shareAsset(f.src,f.label,f.mediaType);
    const remove=document.createElement("button"); remove.className="secondary"; remove.textContent="Quitar";
    remove.onclick=()=>saveFavorite(f.src,f.label,f.mediaType);
    actions.append(share,remove); pad.appendChild(actions); item.appendChild(pad);
    list.appendChild(item);
  });
}

// Simple bot
const answers={
  comisiones:"Para cobrar tus comisiones necesitás tener tu cuenta y documentación en regla. En la versión final, acá aparecería el paso a paso completo y actualizado.",
  documentación:"Acá podríamos mostrar la documentación necesaria, organizada por país, con enlaces y checklist.",
  "primeros pasos":"Podríamos guiar a un nuevo socio con una secuencia de primeros pasos, accesos, capacitaciones y acciones iniciales.",
  colágeno:"Podríamos centralizar información de producto, preguntas frecuentes, contenido de venta y material para compartir."
};
function botAsk(q){
  const thread=document.getElementById("botThread");
  const user=document.createElement("div"); user.className="bubble user"; user.textContent=q; thread.appendChild(user);
  const normalized=q.toLowerCase();
  let response="Todavía no tengo una respuesta preparada para eso. En la versión completa, este buscador podría encontrar el recurso correcto aunque la persona no recuerde el comando exacto.";
  Object.keys(answers).forEach(k=>{if(normalized.includes(k)) response=answers[k];});
  setTimeout(()=>{
    const bot=document.createElement("div"); bot.className="bubble bot"; bot.textContent=response; thread.appendChild(bot);
    thread.scrollTop=thread.scrollHeight;
  },350);
}
document.getElementById("botForm").addEventListener("submit",e=>{
  e.preventDefault();
  const input=document.getElementById("botInput");
  const q=input.value.trim(); if(!q)return; input.value=""; botAsk(q);
});
document.querySelectorAll("[data-command]").forEach(b=>b.onclick=()=>botAsk(b.dataset.command));

// PWA install
let deferredPrompt;
const installBtn=document.getElementById("installBtn");
window.addEventListener("beforeinstallprompt",e=>{
  e.preventDefault(); deferredPrompt=e; installBtn.classList.remove("hidden");
});
installBtn.onclick=async()=>{
  if(!deferredPrompt) return;
  deferredPrompt.prompt();
  await deferredPrompt.userChoice;
  deferredPrompt=null; installBtn.classList.add("hidden");
};

if("serviceWorker" in navigator){
  window.addEventListener("load",()=>navigator.serviceWorker.register("service-worker.js"));
}
