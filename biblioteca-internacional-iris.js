(() => {
  "use strict";
  const groups=[{name:"España",flag:"🇪🇸",items:[["collagen/es","Collagen+"]]},
    {name:"Italia",flag:"🇮🇹",items:[["collagen/it","Collagen+"],["lumispa/it","Lumi"]]}];
  let sheet=null, returnToProducts=null, selection=null;
  const create=(tag,className,text)=>{const n=document.createElement(tag);if(className)n.className=className;if(text!==undefined)n.textContent=text;return n;};
  const button=(label,action,cls)=>{const n=create("button",cls,label);n.type="button";n.onclick=action;return n;};
  const entries=(id,day)=>window.NuInternationalLibraryData?.[id+"/"+day]||[];
  const valid=item=>item&&/^(image|video)$/.test(item.type)&&/^\/api\/international-assets\/[a-z0-9-]+\/\d+\/\d+$/.test(item.src);
  const title=id=>id==="collagen/es"?"Collagen+ · España":id==="collagen/it"?"Collagen+ · Italia":"LumiSpa · Italia";
  function frame(heading,subheading,back){
    if(!sheet?.isConnected)return null;
    const list=sheet.querySelector(".bot-quick-access-list");
    const backButton=sheet.querySelector(".bot-quick-access-back");
    sheet.querySelector(".bot-quick-access-title").textContent=heading;
    sheet.querySelector(".bot-quick-access-subtitle").textContent=subheading;
    backButton.hidden=false;backButton.onclick=back;
    list.className="bot-quick-access-list nu-il-list";
    list.replaceChildren();list.scrollTop=0;
    return list;
  }
  function row(list,label,description,action){
    const b=button("",action,"bot-quick-access-row is-command nu-il-row");
    const text=create("span","bot-quick-access-row-copy");
    text.append(create("strong","",label));
    if(description)text.append(create("small","",description));
    b.append(text,create("span","nu-il-chevron","›"));list.append(b);
  }
  function showGroups(){
    selection=null;
    const list=frame("Material internacional","Elegí el país y contenido",returnToProducts);
    if(!list)return;
    groups.forEach(group=>{
      list.append(create("h3","nu-il-group-heading",group.flag+" "+group.name));
      group.items.forEach(([id,name])=>row(list,name,"",()=>showDays(id)));
    });
  }
  function showDays(id){
    selection={id,day:null};
    const list=frame(title(id),"Elegí uno de los 10 días",showGroups);
    if(!list)return;
    const grid=create("div","nu-il-days");
    for(let d=1;d<=10;d++)grid.append(button("Día "+d,()=>showDay(id,d),"nu-il-day"));
    list.append(grid);
  }
  function showDay(id,day){
    selection={id,day};
    const list=frame(title(id),"Día "+day+" de 10",()=>showDays(id));
    if(!list)return;
    const items=entries(id,day);
    if(!items.length){list.append(create("p","nu-il-notice","Cargando materiales…"));return;}
    const allActions=create("div","nu-il-action-row nu-il-all-actions");
    allActions.append(button("Compartir todo",()=>shareAll(id,day),"nu-il-action nu-il-primary"),
      button("Descargar todo",()=>downloadAll(id,day),"nu-il-action"));
    list.append(allActions);
    prepareDayForSharing(id,day,allActions);
    items.forEach((item,index)=>{
      if(!valid(item))return;
      const b=button("",()=>showPreview(id,day,index),"nu-il-media-row");
      const thumb=create("span","nu-il-thumbnail");
      if(item.type==="image"){const img=create("img");img.src=item.src;img.alt="Material "+(index+1);img.loading="lazy";
        img.onerror=()=>thumb.replaceChildren(create("span","nu-il-error","Sin vista previa"));thumb.append(img);}
      else thumb.append(create("span","nu-il-play","▶"));
      const copy=create("span","nu-il-media-copy");copy.append(create("strong","","Material "+(index+1)),
        create("small","",item.type==="video"?"Video":"Imagen"));
      b.append(thumb,copy,create("span","nu-il-chevron","›"));list.append(b);
    });
  }
  function showPreview(id,day,index){
    const items=entries(id,day),item=items[index];
    if(!valid(item))return;
    selection={id,day,index};
    const list=frame("Material "+(index+1)+" de "+items.length,title(id)+" · Día "+day,()=>showDay(id,day));
    if(!list)return;
    const stage=create("div","nu-il-stage");
    if(item.type==="image"){const img=create("img");img.src=item.src;img.alt="Material "+(index+1);
      img.onerror=()=>stage.replaceChildren(create("p","nu-il-error","No se pudo cargar esta imagen."));stage.append(img);}
    else{const video=create("video");video.src=item.src;video.controls=true;video.playsInline=true;video.preload="metadata";
      video.onerror=()=>stage.append(create("p","nu-il-error","No se pudo reproducir este video."));stage.append(video);}
    list.append(stage);
    const nav=create("div","nu-il-action-row");
    const prev=button("← Anterior",()=>showPreview(id,day,index-1),"nu-il-action");prev.disabled=index===0;
    const next=button("Siguiente →",()=>showPreview(id,day,index+1),"nu-il-action");next.disabled=index===items.length-1;
    nav.append(prev,next);list.append(nav);
    const actions=create("div","nu-il-action-row");
    actions.append(button("Compartir",()=>share(item,id,day,index),"nu-il-action nu-il-primary"),
      button("Descargar",()=>download(item,id,day,index),"nu-il-action"));
    list.append(actions);
    const allActions=create("div","nu-il-action-row nu-il-all-actions");
    allActions.append(button("Compartir todo el día",()=>shareAll(id,day),"nu-il-action nu-il-primary"),
      button("Descargar todo",()=>downloadAll(id,day),"nu-il-action"));
    list.append(allActions);
    prepareDayForSharing(id,day,allActions);
  }
  async function assetFile(item,id,day,index){
    const response=await fetch(item.src);if(!response.ok)throw Error("Archivo no disponible");
    const blob=await response.blob();
    const ext=item.type==="video"?(blob.type.includes("quicktime")?"mov":"mp4"):"jpg";
    return new File([blob],"nu-"+id.replace("/","-")+"-dia-"+day+"-"+(index+1)+"."+ext,{type:blob.type});
  }
  async function share(item,id,day,index){
    try{
      const file=await assetFile(item,id,day,index);
      if(navigator.canShare?.({files:[file]}))await navigator.share({files:[file],title:title(id)});
      else if(navigator.share)await navigator.share({url:new URL(item.src,location.origin).href,title:title(id)});
      else{await navigator.clipboard.writeText(new URL(item.src,location.origin).href);alert("Enlace copiado.");}
    }catch(error){if(error.name!=="AbortError")alert("No se pudo compartir. Probá descargar el material.");}
  }
  async function download(item,id,day,index){
    try{const file=await assetFile(item,id,day,index);const url=URL.createObjectURL(file);
      const a=create("a");a.href=url;a.download=file.name;document.body.append(a);a.click();a.remove();
      setTimeout(()=>URL.revokeObjectURL(url),60000);
    }catch{alert("No se pudo descargar este material.");}
  }
  // Archivo ZIP sin dependencias externas: conserva nombre y orden de cada material del día.
  const zipCache=new Map();
  const crcTable=Array.from({length:256},(_,n)=>{let c=n;for(let i=0;i<8;i++)c=c&1?0xedb88320^(c>>>1):c>>>1;return c>>>0;});
  function checksum(data){let c=0xffffffff;for(const byte of data)c=crcTable[(c^byte)&255]^(c>>>8);return(c^0xffffffff)>>>0;}
  function zipFile(name,data){
    const encoder=new TextEncoder(),nameBytes=encoder.encode(name),len=data.length,crc=checksum(data);
    const local=new Uint8Array(30+nameBytes.length),lv=new DataView(local.buffer);
    lv.setUint32(0,0x04034b50,true);lv.setUint16(4,20,true);lv.setUint16(6,0x0800,true);
    lv.setUint32(14,crc,true);lv.setUint32(18,len,true);lv.setUint32(22,len,true);
    lv.setUint16(26,nameBytes.length,true);local.set(nameBytes,30);
    return {local,nameBytes,len,crc,data};
  }
  async function dayArchive(id,day){
    const key=id+"/"+day;if(zipCache.has(key))return zipCache.get(key);
    const promise=(async()=>{
      const items=entries(id,day);if(!items.length||items.some(item=>!valid(item)))throw Error("Catálogo incompleto");
      const files=[];
      for(let i=0;i<items.length;i++){
        const response=await fetch(items[i].src);
        if(!response.ok)throw Error("Material "+(i+1)+" no disponible");
        const bytes=new Uint8Array(await response.arrayBuffer());
        const type=response.headers.get("content-type")||"";
        const ext=items[i].type==="video"?(type.includes("quicktime")?"mov":"mp4"):type.includes("png")?"png":"jpg";
        files.push(zipFile(String(i+1).padStart(2,"0")+"."+ext,bytes));
      }
      const parts=[],central=[];let offset=0,centralSize=0;
      for(const file of files){
        parts.push(file.local,file.data);
        const record=new Uint8Array(46+file.nameBytes.length),v=new DataView(record.buffer);
        v.setUint32(0,0x02014b50,true);v.setUint16(4,20,true);v.setUint16(6,20,true);v.setUint16(8,0x0800,true);
        v.setUint32(16,file.crc,true);v.setUint32(20,file.len,true);v.setUint32(24,file.len,true);
        v.setUint16(28,file.nameBytes.length,true);v.setUint32(42,offset,true);
        record.set(file.nameBytes,46);central.push(record);centralSize+=record.length;
        offset+=file.local.length+file.len;
      }
      const end=new Uint8Array(22),v=new DataView(end.buffer);
      v.setUint32(0,0x06054b50,true);v.setUint16(8,files.length,true);v.setUint16(10,files.length,true);
      v.setUint32(12,centralSize,true);v.setUint32(16,offset,true);
      return new Blob([...parts,...central,end],{type:"application/zip"});
    })();
    zipCache.set(key,promise);
    promise.catch(()=>zipCache.delete(key));return promise;
  }
  function archiveName(id,day){return "Nu-"+id.replace("/","-")+"-dia-"+day+".zip";}
  function saveArchive(blob,name){
    const url=URL.createObjectURL(blob),a=create("a");a.href=url;a.download=name;
    document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
  }
  const shareCache=new Map();
  const shareReady=new Map();
  async function loadDayFiles(id,day){
    const key=id+"/"+day;
    if(shareCache.has(key))return shareCache.get(key);
    const task=(async()=>{
      const items=entries(id,day);
      if(!items.length||items.some(item=>!valid(item)))throw Error("El día todavía no está completo");
      const files=[];
      for(let index=0;index<items.length;index++){
        const file=await assetFile(items[index],id,day,index);
        files.push(file);
      }
      shareReady.set(key,files);
      return files;
    })();
    shareCache.set(key,task);
    task.catch(()=>shareCache.delete(key));
    return task;
  }
  function prepareDayForSharing(id,day,actionRow){
    const button=actionRow?.querySelector("button");
    if(!button)return;
    button.disabled=true;
    button.textContent="Preparando para compartir…";
    loadDayFiles(id,day).then(files=>{
      if(!button.isConnected)return;
      button.disabled=false;
      button.textContent="Compartir todo ("+files.length+")";
    }).catch(()=>{
      if(!button.isConnected)return;
      button.disabled=false;
      button.textContent="Reintentar compartir";
    });
  }
  function shareAll(id,day){
    const task=shareCache.get(id+"/"+day);
    if(!task){alert("Los archivos todavía no están preparados. Esperá unos segundos.");return;}
    // El botón queda habilitado después de cargar todos los archivos, para
    // preservar el gesto de usuario requerido por Web Share API.
    const filesReady=shareReady.get(id+"/"+day);
    if(!filesReady){alert("Los archivos se están preparando. Esperá unos segundos.");return;}
    if(typeof navigator.share!=="function"||!navigator.canShare?.({files:filesReady})){
      alert("Este navegador no permite compartir todos estos archivos juntos. Podés utilizar Descargar todo para obtener el ZIP.");
      return;
    }
    try{
      const result=navigator.share({files:filesReady,title:title(id)+" · Día "+day});
      Promise.resolve(result).catch(error=>{
        if(error?.name!=="AbortError")alert("No se pudieron compartir juntos los archivos. Probá con Descargar todo.");
      });
    }catch(error){
      if(error?.name!=="AbortError")alert("Este dispositivo no pudo compartir todos los archivos juntos.");
    }
  }
  async function downloadAll(id,day){
    const actionRow=sheet?.querySelector(".nu-il-all-actions");
    const button=actionRow?.querySelectorAll("button")[1],previous=button?.textContent;
    if(button){button.disabled=true;button.textContent="Preparando ZIP…";}
    try{
      const archive=await dayArchive(id,day);
      saveArchive(archive,archiveName(id,day));
    }catch(error){alert("No se pudo descargar el día completo: "+error.message);}
    finally{if(button){button.disabled=false;button.textContent=previous;}}
  }
  window.openInternationalLibrary=(targetSheet,back)=>{
    if(!targetSheet?.isConnected){
      if(typeof window.openBotQuickAccess==="function"){
        window.openBotQuickAccess();
        targetSheet=document.querySelector(".bot-quick-access-sheet");
        back=()=>window.openBotQuickAccess();
      }
    }
    if(!targetSheet)return;
    sheet=targetSheet;
    returnToProducts=typeof back==="function"?back:()=>window.openBotQuickAccess();
    showGroups();
  };
  document.addEventListener("click",event=>{
    const anchor=event.target.closest?.('a[href*="biblioteca-internacional.html"]');
    if(anchor){event.preventDefault();window.openInternationalLibrary();}
  },true);
  const style=create("style");
  style.textContent=`
    .bot-quick-access-list.nu-il-list{display:block!important;overflow-y:auto!important;max-height:min(65dvh,540px);padding-bottom:15px}
    .nu-il-group-heading{margin:16px 10px 8px;color:#33455f;font-size:14px;font-weight:750}
    .nu-il-row{width:100%;margin-bottom:8px}
    .nu-il-chevron{margin-left:auto;color:#3b82f6;font-size:20px;flex-shrink:0}
    .nu-il-days{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;padding:8px 3px}
    .nu-il-day{border:1px solid #e6edf6;background:#fff;border-radius:13px;min-height:48px;color:#3565c4;font:600 14px system-ui;cursor:pointer}
    .nu-il-media-row{width:100%;display:flex;align-items:center;gap:12px;border:1px solid #e7edf5;background:#fff;border-radius:14px;padding:10px;margin:8px 0;text-align:left;color:inherit;cursor:pointer}
    .nu-il-thumbnail{width:60px;height:60px;border-radius:9px;background:#eef4fd;display:grid;place-items:center;overflow:hidden;flex-shrink:0}
    .nu-il-thumbnail img{width:100%;height:100%;object-fit:cover}.nu-il-play{color:#3377d8;font-size:22px}
    .nu-il-media-copy{flex:1;display:grid;gap:3px}.nu-il-media-copy strong{font-size:13px}.nu-il-media-copy small{font-size:12px;color:#738094}
    .nu-il-stage{background:#edf2f8;border-radius:12px;overflow:hidden;min-height:180px;display:grid;place-items:center}
    .nu-il-stage img,.nu-il-stage video{width:100%;max-height:42dvh;object-fit:contain;display:block}
    .nu-il-action-row{display:flex;gap:8px;margin-top:12px}\n    .nu-il-all-actions{margin:8px 0 16px}
    .nu-il-action{flex:1;border:1px solid #dce6f4;border-radius:11px;min-height:42px;padding:7px;background:#fff;color:#2869d5;font:600 12px system-ui;cursor:pointer}
    .nu-il-action:disabled{opacity:.35;cursor:default}.nu-il-primary{background:#3475da;color:#fff;border-color:#3475da}
    .nu-il-notice,.nu-il-error{font-size:12px;color:#9b4d32;padding:10px}
  `;
  document.head.append(style);
})();