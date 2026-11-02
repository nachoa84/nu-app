(() => {
  "use strict";
  const groups = [
    {country:"España", flag:"🇪🇸", items:[{id:"collagen/es",name:"Collagen+"}]},
    {country:"Italia", flag:"🇮🇹", items:[{id:"collagen/it",name:"Collagen+"},{id:"lumispa/it",name:"LumiSpa"}]}
  ];
  let root, panel, previousFocus, current = {id:null,day:null,index:null};
  const make=(tag,cls,label)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(label!==undefined)n.textContent=label;return n;};
  const button=(label,fn,cls="")=>{const b=make("button",cls,label);b.type="button";b.addEventListener("click",fn);return b;};
  const files=(id,day)=>window.NuInternationalLibraryData?.[id+"/"+day]||[];
  const valid=(item)=>item && /^(image|video)$/.test(item.type) && /^\/api\/international-assets\/[a-z0-9-]+\/\d+\/\d+$/.test(item.src);
  function close(){
    if(!root)return;
    root.remove();root=null;panel=null;document.body.classList.remove("nu-il-open");
    document.removeEventListener("keydown",onKey);
    if(previousFocus?.isConnected)previousFocus.focus();
  }
  function onKey(e){
    if(e.key==="Escape"){e.preventDefault();close();}
    if(e.key==="Tab"&&root){const focus=[...root.querySelectorAll("button,a")].filter(x=>!x.disabled);if(!focus.length)return;
      if(e.shiftKey&&document.activeElement===focus[0]){e.preventDefault();focus.at(-1).focus();}
      else if(!e.shiftKey&&document.activeElement===focus.at(-1)){e.preventDefault();focus[0].focus();}
    }
    if(current.index!==null&&e.key==="ArrowLeft")showPreview(current.index-1);
    if(current.index!==null&&e.key==="ArrowRight")showPreview(current.index+1);
  }
  function frame(title,subtitle,back){
    panel.replaceChildren();
    const bar=make("div","nu-il-bar");
    bar.append(button("←",back||close,"nu-il-back"));
    const titleWrap=make("div","nu-il-title");
    titleWrap.append(make("strong","",title),make("small","",subtitle));
    bar.append(titleWrap,button("✕",close,"nu-il-close"));
    panel.append(bar);
    const body=make("div","nu-il-body");panel.append(body);return body;
  }
  function itemCard(body,label,description,fn){
    const b=button("","nu-il-unused");b.className="nu-il-card";b.replaceChildren();
    const copy=make("span");copy.append(make("strong","",label),make("small","",description));
    b.append(copy,make("span","nu-il-chevron","›"));b.addEventListener("click",fn);body.append(b);
  }
  function showGroups(){
    current={id:null,day:null,index:null};
    const body=frame("Material internacional","Elegí el contenido que necesitás",close);
    for(const group of groups){
      const section=make("section","nu-il-group");
      section.append(make("h3","",group.flag+" "+group.country));
      for(const item of group.items){
        const b=button("","nu-il-card");const copy=make("span");copy.append(make("strong","",item.name),make("small","",""));
        copy.lastChild.textContent="Contenido de 10 días";
        b.append(copy,make("span","nu-il-chevron","›"));
        b.addEventListener("click",()=>showDays(item.id));section.append(b);
      }
      body.append(section);
    }
  }
  function label(id){return id==="collagen/es"?"Collagen+ · España":id==="collagen/it"?"Collagen+ · Italia":"LumiSpa · Italia";}
  function showDays(id){
    current={id,day:null,index:null};
    const body=frame(label(id),"Elegí un día del 1 al 10",showGroups);
    const grid=make("div","nu-il-days");
    for(let d=1;d<=10;d++)grid.append(button("Día "+d,()=>showDay(id,d),"nu-il-day"));
    body.append(grid);
  }
  function showDay(id,day){
    current={id,day,index:null};
    const body=frame(label(id),"Día "+day+" de 10",()=>showDays(id));
    const items=files(id,day);
    if(!items.length){body.append(make("p","nu-il-note","Cargando materiales…"));return;}
    const list=make("div","nu-il-assets");
    items.forEach((item,index)=>{
      if(!valid(item))return;
      const card=button("","nu-il-asset");
      const thumb=make("div","nu-il-thumb");
      if(item.type==="image"){const img=make("img");img.src=item.src;img.alt="Vista previa "+(index+1);img.loading="lazy";
        img.onerror=()=>{thumb.replaceChildren(make("span","nu-il-error","No se pudo cargar la imagen"));};thumb.append(img);}
      else thumb.append(make("span","nu-il-play","▶"));
      const copy=make("span","nu-il-asset-copy");
      copy.append(make("strong","","Material "+(index+1)),make("small","",item.type==="video"?"Video · Ver y compartir":"Imagen · Ver y compartir"));
      card.append(thumb,copy,make("span","nu-il-chevron","›"));
      card.addEventListener("click",()=>showPreview(index));
      list.append(card);
    });
    body.append(list);
  }
  function showPreview(index){
    if(current.day===null)return;
    const {id,day}=current,items=files(id,day);
    if(index<0||index>=items.length||!valid(items[index]))return;
    current.index=index;
    const item=items[index];
    const body=frame("Material "+(index+1)+" de "+items.length,label(id)+" · Día "+day,()=>showDay(id,day));
    const stage=make("div","nu-il-stage");
    if(item.type==="image"){const img=make("img");img.src=item.src;img.alt="Material "+(index+1);
      img.onerror=()=>stage.replaceChildren(make("p","nu-il-error","No se pudo cargar la imagen. Revisaremos el archivo."));stage.append(img);}
    else {const video=make("video");video.src=item.src;video.controls=true;video.playsInline=true;video.preload="metadata";
      video.onerror=()=>stage.append(make("p","nu-il-error","No se pudo reproducir el video."));stage.append(video);}
    body.append(stage);
    const nav=make("div","nu-il-navigation");
    const prev=button("← Anterior",()=>showPreview(index-1));prev.disabled=index===0;
    const next=button("Siguiente →",()=>showPreview(index+1));next.disabled=index===items.length-1;
    nav.append(prev,next);body.append(nav);
    const actions=make("div","nu-il-actions");
    const share=button("Compartir",async()=>{
      try {
        const response=await fetch(item.src);if(!response.ok)throw Error("Archivo no disponible");
        const blob=await response.blob();
        const ext=blob.type.startsWith("video/")?(blob.type.includes("quicktime")?"mov":"mp4"):"jpg";
        const file=new File([blob],"material-"+(index+1)+"."+ext,{type:blob.type});
        if(navigator.canShare?.({files:[file]})){await navigator.share({files:[file],title:label(id)+" · Día "+day});}
        else if(navigator.share){await navigator.share({url:new URL(item.src,location.origin).href,title:label(id)+" · Día "+day});}
        else {await navigator.clipboard.writeText(new URL(item.src,location.origin).href);alert("Enlace copiado para compartir.");}
      }catch(e){if(e.name!=="AbortError")alert("No se pudo compartir este archivo. Probá descargarlo.");}
    },"nu-il-primary");
    const download=button("Descargar",async()=>{
      try{const response=await fetch(item.src);if(!response.ok)throw Error();
        const blob=await response.blob();const url=URL.createObjectURL(blob);
        const a=make("a");a.href=url;a.download="nu-"+id.replace("/","-")+"-dia-"+day+"-"+(index+1)+"."+(item.type==="video"?(blob.type.includes("quicktime")?"mov":"mp4"):"jpg");
        document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
      }catch{alert("No se pudo descargar el material. Revisaremos el archivo.");}
    });
    actions.append(share,download);body.append(actions);
  }
  function open(){
    if(root){showGroups();return;}
    previousFocus=document.activeElement;
    root=make("div","nu-il-overlay");root.setAttribute("role","presentation");
    root.addEventListener("mousedown",e=>{if(e.target===root)close();});
    panel=make("section","nu-il-panel");panel.setAttribute("role","dialog");panel.setAttribute("aria-modal","true");
    panel.setAttribute("aria-label","Biblioteca Internacional");root.append(panel);document.body.append(root);
    document.body.classList.add("nu-il-open");document.addEventListener("keydown",onKey);
    showGroups();panel.querySelector("button")?.focus();
  }
  window.openInternationalLibrary=open;
  document.addEventListener("click",event=>{
    const anchor=event.target.closest?.('a[href*="biblioteca-internacional.html"]');
    if(anchor){event.preventDefault();open();}
  },true);
  const style=make("style");
  style.textContent=`
    .nu-il-open{overflow:hidden!important}
    .nu-il-overlay{position:fixed;inset:0;z-index:2147483000;display:flex;justify-content:center;align-items:flex-end;background:rgba(22,32,53,.42);font-family:inherit;color:#253348}
    .nu-il-panel{background:#f7f9fc;width:min(100%,480px);height:min(91dvh,850px);border-radius:22px 22px 0 0;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 0 40px #15213b30}
    .nu-il-bar{background:#fff;display:flex;align-items:center;gap:12px;padding:18px 16px;border-bottom:1px solid #edf0f5;flex-shrink:0}
    .nu-il-bar button{border:0;background:#f3f6fb;border-radius:12px;width:38px;height:38px;color:#2d65c8;font-size:19px;cursor:pointer;flex-shrink:0}
    .nu-il-title{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px}
    .nu-il-title strong{font-size:15px}.nu-il-title small{color:#758196;font-size:12px}
    .nu-il-body{padding:20px 16px 36px;overflow-y:auto;flex:1;overscroll-behavior:contain}
    .nu-il-group{margin-bottom:24px}.nu-il-group h3{font-size:15px;margin:0 0 10px;color:#24354d}
    .nu-il-card,.nu-il-asset{font:inherit;color:inherit;width:100%;border:1px solid #e7edf5;background:#fff;border-radius:15px;margin-bottom:9px;padding:15px;text-align:left;display:flex;gap:12px;align-items:center;cursor:pointer}
    .nu-il-card span:first-child,.nu-il-asset-copy{flex:1;display:flex;flex-direction:column;gap:3px}
    .nu-il-card strong,.nu-il-asset strong{font-size:14px}.nu-il-card small,.nu-il-asset small{color:#718098;font-size:12px}
    .nu-il-chevron{font-size:22px;color:#3980e7}
    .nu-il-days{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
    .nu-il-day{background:#fff;border:1px solid #e1e9f3;border-radius:13px;min-height:55px;font:600 14px inherit;color:#2a5fad;cursor:pointer}
    .nu-il-thumb{width:66px;height:66px;border-radius:10px;background:#eff4fb;overflow:hidden;display:grid;place-items:center;flex-shrink:0}
    .nu-il-thumb img{width:100%;height:100%;object-fit:cover}.nu-il-play{font-size:25px;color:#3476db}
    .nu-il-stage{background:#edf2f8;min-height:180px;display:grid;place-items:center;border-radius:14px;overflow:hidden}
    .nu-il-stage img,.nu-il-stage video{display:block;width:100%;max-height:55dvh;object-fit:contain}
    .nu-il-navigation,.nu-il-actions{display:flex;gap:10px;margin-top:14px}
    .nu-il-navigation button,.nu-il-actions button{flex:1;min-height:44px;border:1px solid #dfe7f3;background:#fff;color:#2769d8;border-radius:12px;font:600 13px inherit;cursor:pointer}
    .nu-il-navigation button:disabled{opacity:.35;cursor:default}
    .nu-il-actions .nu-il-primary{background:#286ad4;border-color:#286ad4;color:#fff}
    .nu-il-note,.nu-il-error{color:#9b502b;font-size:13px;padding:10px}
    @media(min-width:600px){.nu-il-overlay{align-items:center}.nu-il-panel{border-radius:22px;height:min(85dvh,850px)}}
  `;
  document.head.append(style);
})();