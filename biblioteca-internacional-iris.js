(() => {
  "use strict";
  // Biblioteca Internacional · mismas acciones individuales que las rutinas de Nu App.
  const groups=[
    {name:"España",flag:"🇪🇸",items:[["collagen/es","Collagen+"]]},
    {name:"Italia",flag:"🇮🇹",items:[["collagen/it","Collagen+"],["lumispa/it","Lumi"]]}
  ];
  let sheet=null,returnToProducts=null;
  let disposePilotPreview=null,pilotCloseObserver=null;
  // Cache acotada: evitar retener decenas de MP4 al navegar por la biblioteca.
  const shareReadyFiles=new Map();
  const hasStaticPoster=item=>item?.type==="video"&&
    typeof item.poster==="string"&&item.poster.includes("?poster=first-frame&v=international-posters-55-1");
  function rememberShareFile(key,file){
    shareReadyFiles.delete(key);
    shareReadyFiles.set(key,file);
    let bytes=0;
    for(const ready of shareReadyFiles.values())bytes+=ready.size;
    while(shareReadyFiles.size>2||(bytes>35*1024*1024&&shareReadyFiles.size>1)){
      const firstKey=shareReadyFiles.keys().next().value;
      const old=shareReadyFiles.get(firstKey);
      shareReadyFiles.delete(firstKey);
      bytes-=old?.size||0;
    }
  }
  const create=(tag,cls,label)=>{const el=document.createElement(tag);if(cls)el.className=cls;if(label!==undefined)el.textContent=label;return el;};
  const button=(label,click,cls)=>{const el=create("button",cls,label);el.type="button";el.onclick=click;return el;};
  const entries=(id,day)=>window.NuInternationalLibraryData?.[id+"/"+day]||[];
  const isValid=item=>item&&/^(image|video)$/.test(item.type)&&/^\/api\/international-assets\/[a-z0-9-]+\/\d+\/\d+(?:\?v=[a-z0-9-]+)?$/.test(item.src);
  const title=id=>id==="collagen/es"?"Collagen+ · España":id==="collagen/it"?"Collagen+ · Italia":"Lumi · Italia";

  function frame(heading,subtitle,back){
    if(disposePilotPreview){
      const dispose=disposePilotPreview;
      disposePilotPreview=null;
      dispose();
    }
    if(!sheet?.isConnected)return null;
    const list=sheet.querySelector(".bot-quick-access-list");
    const backButton=sheet.querySelector(".bot-quick-access-back");
    sheet.querySelector(".bot-quick-access-title").textContent=heading;
    sheet.querySelector(".bot-quick-access-subtitle").textContent=subtitle;
    backButton.hidden=false;backButton.onclick=back;
    list.className="bot-quick-access-list nu-il-list";
    list.replaceChildren();list.scrollTop=0;
    return list;
  }
  function card(list,label,click){
    const el=button("",click,"bot-quick-access-row is-command nu-il-row");
    const text=create("span","bot-quick-access-row-copy");
    text.append(create("strong","",label));
    el.append(text,create("span","nu-il-chevron","›"));list.append(el);
  }
  function showGroups(){
    const list=frame("Material internacional","Elegí el país y contenido",returnToProducts);
    if(!list)return;
    for(const group of groups){
      list.append(create("h3","nu-il-group-heading",group.flag+" "+group.name));
      for(const [id,name] of group.items)card(list,name,()=>showDays(id));
    }
  }
  function showDays(id){
    const list=frame(title(id),"Elegí uno de los 10 días",showGroups);
    if(!list)return;
    const days=create("div","nu-il-days");
    for(let day=1;day<=10;day++)days.append(button("Día "+day,()=>showDay(id,day),"nu-il-day"));
    list.append(days);
  }
  function showDay(id,day){
    const list=frame(title(id),"Día "+day+" de 10",()=>showDays(id));
    if(!list)return;
    const files=entries(id,day);
    if(!files.length){list.append(create("p","nu-il-notice","Cargando materiales…"));return;}
    files.forEach((file,index)=>{
      if(!isValid(file))return;
      const row=button("",()=>showCanonicalGallery(id,day,index),"nu-il-media-row");
      const thumb=create("span","nu-il-thumbnail");
      if(file.type==="image"){
        const img=create("img");
        img.alt="Material "+(index+1);
        img.loading="lazy";
        img.decoding="async";
        let originalTried=false;
        img.onerror=()=>{
          if(!originalTried&&file.thumbSrc){
            originalTried=true;img.src=file.src;return;
          }
          thumb.replaceChildren(create("span","nu-il-error","Sin vista previa"));
        };
        img.src=file.thumbSrc||file.src;
        thumb.append(img);
      }else{
        if(hasStaticPoster(file)){
          const still=create("img");
          still.alt="Primer fotograma del video";
          still.loading="lazy";still.decoding="async";
          still.src=file.poster;
          thumb.append(still);
        }else thumb.append(firstFrame(file.src,"nu-il-video-thumb"));
        thumb.append(create("span","nu-il-play","▶"));
      }
      const copy=create("span","nu-il-media-copy");
      copy.append(create("strong","","Material "+(index+1)),create("small","",file.type==="video"?"Video":"Imagen"));
      row.append(thumb,copy,create("span","nu-il-chevron","›"));list.append(row);
    });
  }
  function firstFrame(src,cls){
    // Vista de primer fotograma: solo se solicita metadata/fragmento inicial.
    const video=create("video",cls);
    video.muted=true;video.playsInline=true;video.preload="metadata";
    video.autoplay=false;video.loop=false;video.controls=false;
    const start=()=>{if(video.dataset.nuPlayback!=="active"&&!video.getAttribute("src"))video.src=src+"#t=0.001";};
    if(typeof IntersectionObserver!=="undefined"){
      const observer=new IntersectionObserver(items=>{
        if(items.some(item=>item.isIntersecting)){observer.disconnect();start();}
      },{rootMargin:"120px"});
      observer.observe(video);
    }else start();
    video.addEventListener("loadeddata",()=>{if(video.dataset.nuPlayback!=="active")video.pause();},{once:true});
    return video;
  }
  function showCanonicalGallery(id,day,index){
    if(typeof window.openMediaPreview!=="function"){
      showPreview(id,day,index);
      return;
    }
    const files=entries(id,day);
    const items=files.map((file,position)=>{
      if(!isValid(file))return null;
      return {
        src:file.src,
        displaySrc:file.type==="image"?(file.previewSrc||file.src):undefined,
        fallbackSrc:file.type==="image"?file.src:undefined,
        label:"Material "+(position+1),
        mediaType:file.type,
        poster:hasStaticPoster(file)?file.poster:undefined,
        favorite:false,
        international:true,
        prepareShare:control=>prepareInternationalShareFile(file,id,day,position,control),
        download:()=>download(file,id,day,position)
      };
    }).filter(Boolean);
    if(!items.length)return;
    const selected=files.slice(0,index).filter(isValid).length;
    window.openMediaPreview(items,selected,day);
  }
  function showPreview(id,day,index){
    const files=entries(id,day),file=files[index];
    if(!isValid(file))return;
    const list=frame("Material "+(index+1)+" de "+files.length,title(id)+" · Día "+day,()=>showDay(id,day));
    if(!list)return;
    const stage=create("div","nu-il-stage");
    const pilot=hasStaticPoster(file);
    let pilotVideo=null,pilotVideoObjectUrl=null,pilotShareLifecycle=null;
    if(file.type==="image"){
      const img=create("img");img.src=file.src;img.alt="Material "+(index+1);
      img.onerror=()=>stage.replaceChildren(create("p","nu-il-error","No se pudo cargar esta imagen."));
      stage.append(img);
    }else{
      const media=create("div","nu-il-video-shell");
      const video=pilot?create("video","nu-il-video-stage"):firstFrame(file.src,"nu-il-video-stage");
      if(pilot){
        // Miniatura JPG fija: el MP4 no se solicita hasta que se presiona Play.
        video.poster=file.poster;
        video.preload="none";
        video.playsInline=true;
        video.controls=false;
        pilotVideo=video;
      }
      const posterImage=pilot?create("img","nu-il-video-poster"):null;
      if(posterImage){
        posterImage.src=file.poster;
        posterImage.alt="Primer fotograma";
      }
      let starting=false;
      const showPlaybackError=message=>{
        let notice=stage.querySelector(".nu-il-video-error");
        if(!notice){notice=create("p","nu-il-error nu-il-video-error");stage.append(notice);}
        notice.textContent=message;
      };
      video.onerror=()=>showPlaybackError("No se pudo cargar el video. Probá nuevamente.");
      const play=button("▶",()=>{
        if(starting)return;
        starting=true;
        // Reproducción real: fuente completa sin fragmento, sonido y sin
        // pausa automática del primer fotograma ni controles nativos superpuestos.
        video.dataset.nuPlayback="active";
        video.muted=false;video.controls=false;
        if(pilot){
          pilotShareLifecycle?.onPlay();
          if(!video.getAttribute("src")){
            const ready=shareReadyFiles.get(id+"/"+day+"/"+index);
            if(ready){
              pilotVideoObjectUrl=URL.createObjectURL(ready);
              video.src=pilotVideoObjectUrl;
            }else video.src=file.src;
          }
        }else{
          video.preload="auto";
          if(video.getAttribute("src")!==file.src)video.src=file.src;
        }
        const notice=stage.querySelector(".nu-il-video-error");
        if(notice)notice.remove();
        Promise.resolve(video.play()).then(()=>{
          starting=false;
          play.style.visibility="hidden";
        }).catch(error=>{
          starting=false;
          play.style.visibility="visible";
          console.warn("No se pudo iniciar el video internacional",error);
          showPlaybackError("No se pudo iniciar el video. Probá nuevamente.");
          if(pilot)pilotShareLifecycle?.onPause();
        });
      },"nu-il-play-overlay");
      play.setAttribute("aria-label","Reproducir video");
      if(posterImage)video.addEventListener("playing",()=>{
        posterImage.style.visibility="hidden";
      });
      video.addEventListener("ended",()=>{
        video.dataset.nuPlayback="";play.style.visibility="visible";
        if(pilot)pilotShareLifecycle?.onPause();
      });
      video.addEventListener("pause",()=>{
        if(pilot&&!video.ended){
          play.style.visibility="visible";
          pilotShareLifecycle?.onPause();
        }
      });
      video.addEventListener("click",()=>{if(!video.paused){video.pause();play.style.visibility="visible";}});
      if(posterImage)media.append(video,posterImage,play);
      else media.append(video,play);
      stage.append(media);
    }
    list.append(stage);
    const nav=create("div","nu-il-action-row");
    const previous=button("← Anterior",()=>showPreview(id,day,index-1),"nu-il-action");
    previous.disabled=index===0;
    const next=button("Siguiente →",()=>showPreview(id,day,index+1),"nu-il-action");
    next.disabled=index===files.length-1;
    nav.append(previous,next);list.append(nav);
    const actions=create("div","nu-il-action-row");
    const share=button("Compartir",null,"nu-il-action nu-il-primary");
    pilotShareLifecycle=prepareInternationalShareFile(file,id,day,index,share);
    disposePilotPreview=()=>{
      pilotShareLifecycle?.dispose();
      if(pilotVideo){
        pilotVideo.pause();
        pilotVideo.removeAttribute("src");
        pilotVideo.load();
      }
      if(pilotVideoObjectUrl)URL.revokeObjectURL(pilotVideoObjectUrl);
    };
    actions.append(share,button("Descargar",()=>download(file,id,day,index),"nu-il-action"));
    list.append(actions);
  }
  async function readShareFile(item,id,day,index,onProgress,requestController){
    const controller=requestController||new AbortController();
    // Un archivo puede ser grande: el tiempo se reinicia mientras llegan datos.
    let inactivityTimer;
    const resetTimeout=()=>{
      clearTimeout(inactivityTimer);
      inactivityTimer=setTimeout(()=>controller.abort(),60000);
    };
    resetTimeout();
    try{
      // La reproducción recibe prioridad frente a la preparación para compartir.
      const response=await fetch(item.src,{signal:controller.signal,cache:"no-store",priority:"high"});
      if(!response.ok)throw Error("HTTP "+response.status);
      const total=Number(response.headers.get("content-length"))||0;
      const type=response.headers.get("content-type")||(item.type==="video"?"video/mp4":"image/jpeg");
      let blob;
      if(response.body?.getReader){
        const reader=response.body.getReader(),chunks=[];let downloaded=0,shown=-1;
        while(true){
          const {done,value}=await reader.read();
          if(done)break;
          chunks.push(value);downloaded+=value.byteLength;resetTimeout();
          if(total>0){
            const percent=Math.min(99,Math.floor(downloaded*100/total));
            if(percent>=shown+5){shown=percent;onProgress?.(percent);}
          }else onProgress?.(null,downloaded);
        }
        blob=new Blob(chunks,{type});
      }else blob=await response.blob();
      const ext=item.type==="video"?(type.includes("quicktime")?"mov":"mp4"):
        type.includes("png")?"png":"jpg";
      return new File([blob],"nu-"+id.replace("/","-")+"-dia-"+day+"-"+(index+1)+"."+ext,{type});
    }finally{clearTimeout(inactivityTimer);}
  }
  // No descargamos materiales al abrir la miniatura: se preparan solo al tocar Compartir.
  function prepareInternationalShareFile(item,id,day,index,control){
    const key=id+"/"+day+"/"+index;
    let pending=null,disposed=false,playbackUrl=null;
    const setShareLabel=label=>{
      const span=control.querySelector("span");
      if(span)span.textContent=label;
      else control.textContent=label;
    };
    const readyToShare=ready=>{
      if(disposed||!control.isConnected)return;
      control.disabled=false;
      setShareLabel("Compartir ahora");
      control.onclick=()=>sharePreparedFile(ready);
    };
    const onPrepared=ready=>{
      readyToShare(ready);
      if(disposed||!control.isConnected||navigator.userActivation?.isActive===false)return;
      try{
        Promise.resolve(navigator.share({files:[ready]})).then(()=>{
          if(!disposed&&control.isConnected)setShareLabel("Compartir");
        }).catch(error=>{
          if(error?.name==="AbortError")return;
          console.warn("Compartir internacional requiere otro toque",error);
          readyToShare(ready);
        });
      }catch(error){readyToShare(ready);}
    };
    const begin=()=>{
      if(disposed||pending)return;
      const cached=shareReadyFiles.get(key);
      if(cached){sharePreparedFile(cached);return;}
      const controller=new AbortController();
      const task={controller,promise:null};
      pending=task;
      control.disabled=true;
      setShareLabel("Preparando…");
      control.onclick=null;
      task.promise=readShareFile(item,id,day,index,(percent,downloaded)=>{
        if(disposed||pending!==task||!control.isConnected)return;
        setShareLabel(percent!==null
          ?"Preparando "+percent+"%"
          :"Preparando "+(downloaded/1048576).toFixed(1)+" MB");
      },controller);
      task.promise.then(ready=>{
        if(disposed||pending!==task)return;
        pending=null;
        rememberShareFile(key,ready);
        if(typeof navigator.share!=="function"||!navigator.canShare?.({files:[ready]})){
          control.disabled=false;
          setShareLabel("Compartir no disponible");
          control.onclick=()=>alert("Este navegador no permite compartir el archivo. Podés usar Descargar.");
          return;
        }
        onPrepared(ready);
      }).catch(error=>{
        if(pending!==task)return;
        pending=null;
        if(disposed||error?.name==="AbortError")return;
        console.warn("No se pudo preparar el material internacional",error);
        control.disabled=false;
        setShareLabel("Reintentar compartir");
        control.onclick=begin;
      });
    };
    control.disabled=false;
    setShareLabel("Compartir");
    control.onclick=begin;
    return {
      playbackSrc(defaultSrc){
        const ready=shareReadyFiles.get(key);
        if(!ready)return defaultSrc;
        if(!playbackUrl)playbackUrl=URL.createObjectURL(ready);
        return playbackUrl;
      },
      onPlay(){},
      onPlaying(){},
      onDisplayReady(){},
      onPause(){},
      dispose(){
        disposed=true;
        if(playbackUrl)URL.revokeObjectURL(playbackUrl);
        playbackUrl=null;
        if(pending){
          const task=pending;
          pending=null;
          task.controller.abort();
        }
      }
    };
  }
  function sharePreparedFile(file){
    if(typeof navigator.share!=="function"||!navigator.canShare?.({files:[file]})){
      alert("Este navegador no admite compartir este formato. Podés usar Descargar para guardar el archivo.");
      return;
    }
    const showError=error=>{
      if(error?.name==="AbortError")return;
      console.warn("No se pudo compartir el material internacional",error);
      alert("No se pudo abrir el menú de compartir ("+(error?.name||"error")+"). El archivo no se descargó.");
    };
    try{Promise.resolve(navigator.share({files:[file]})).catch(showError);}
    catch(error){showError(error);}
  }
  async function download(file,id,day,index){
    try{
      const response=await fetch(file.src);
      if(!response.ok)throw Error("Archivo no disponible");
      const blob=await response.blob();
      const originalType=blob.type.toLowerCase();
      const ext=file.type==="video"?(originalType.includes("quicktime")?"mov":"mp4"):
        originalType.includes("png")?"png":"jpg";
      const url=URL.createObjectURL(blob),link=create("a");
      link.href=url;link.download="nu-"+id.replace("/","-")+"-dia-"+day+"-"+(index+1)+"."+ext;
      document.body.append(link);link.click();link.remove();
      setTimeout(()=>URL.revokeObjectURL(url),60000);
    }catch{alert("No se pudo descargar este material.");}
  }
  window.openInternationalLibrary=(targetSheet,back)=>{
    if(!targetSheet?.isConnected&&typeof window.openBotQuickAccess==="function"){
      window.openBotQuickAccess();targetSheet=document.querySelector(".bot-quick-access-sheet");
      back=()=>window.openBotQuickAccess();
    }
    if(!targetSheet)return;
    sheet=targetSheet;
    returnToProducts=typeof back==="function"?back:()=>window.openBotQuickAccess();
    pilotCloseObserver?.disconnect();
    const layer=sheet.closest?.(".bot-quick-access-layer");
    if(layer?.parentNode&&typeof MutationObserver!=="undefined"){
      pilotCloseObserver=new MutationObserver(()=>{
        if(!layer.isConnected){
          pilotCloseObserver?.disconnect();pilotCloseObserver=null;
          if(disposePilotPreview){
            const dispose=disposePilotPreview;disposePilotPreview=null;dispose();
          }
        }
      });
      pilotCloseObserver.observe(layer.parentNode,{childList:true});
    }
    showGroups();
  };
  document.addEventListener("click",event=>{
    const anchor=event.target.closest?.('a[href*="biblioteca-internacional.html"]');
    if(anchor){event.preventDefault();window.openInternationalLibrary();}
  },true);
  const style=create("style");
  style.textContent=`
    .bot-quick-access-list.nu-il-list{display:block!important;overflow-y:auto!important;max-height:min(65dvh,540px);padding-bottom:15px}
    /* El visor canónico debe quedar por encima de la hoja de selección (z-index 260).
       Se limita el área visual para conservar un tamaño cómodo en el teléfono. */
    .media-preview.is-international{z-index:300}
    .media-preview.is-international .media-preview-stage>img{width:min(88vw,440px);height:min(48dvh,380px);object-fit:contain}
    .media-preview.is-international .preview-video-shell{position:relative;inset:auto;width:min(88vw,440px);height:min(48dvh,380px)}
    .nu-il-group-heading{margin:16px 10px 8px;color:#33455f;font-size:14px;font-weight:750}
    .nu-il-row{width:100%;margin-bottom:8px}
    .nu-il-chevron{margin-left:auto;color:#3b82f6;font-size:20px;flex-shrink:0}
    .nu-il-days{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;padding:8px 3px}
    .nu-il-day{border:1px solid #e6edf6;background:#fff;border-radius:13px;min-height:48px;color:#3565c4;font:600 14px system-ui;cursor:pointer}
    .nu-il-media-row{width:100%;display:flex;align-items:center;gap:12px;border:1px solid #e7edf5;background:#fff;border-radius:14px;padding:10px;margin:8px 0;text-align:left;color:inherit;cursor:pointer}
    .nu-il-thumbnail{width:60px;height:60px;border-radius:9px;background:#eef4fd;display:grid;place-items:center;overflow:hidden;flex-shrink:0}
    .nu-il-thumbnail img,.nu-il-thumbnail video{width:100%;height:100%;object-fit:cover}.nu-il-play{color:#3377d8;font-size:22px}
    .nu-il-thumbnail{position:relative}.nu-il-thumbnail .nu-il-play{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);display:grid;place-items:center;width:27px;height:27px;border-radius:50%;background:rgba(255,255,255,.95);color:#2869d5;font:700 13px system-ui;text-shadow:none;pointer-events:none}
    .nu-il-video-stage{display:block;width:100%;height:100%;max-height:100%;object-fit:contain}
    .nu-il-video-poster{position:absolute;inset:0;width:100%;height:100%;object-fit:contain;pointer-events:none}
    .nu-il-video-shell{position:relative;width:100%;height:100%;min-width:0;min-height:0;display:grid;place-items:center}
    .nu-il-play-overlay{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%)!important;z-index:1;display:grid;place-items:center;width:48px;height:48px;border:1px solid #e3eaf4;border-radius:50%;padding:0;background:rgba(255,255,255,.96);color:#2869d5;font:700 20px system-ui;cursor:pointer;transition:none!important;animation:none!important;box-shadow:none!important}
    .nu-il-play-overlay:active,.nu-il-play-overlay:hover,.nu-il-play-overlay:focus{transform:translate(-50%,-50%)!important;transition:none!important;animation:none!important;box-shadow:none!important}
    .nu-il-media-copy{flex:1;display:grid;gap:3px}.nu-il-media-copy strong{font-size:13px}.nu-il-media-copy small{font-size:12px;color:#738094}
    .nu-il-stage{position:relative;background:#edf2f8;border-radius:12px;overflow:hidden;height:min(42dvh,360px);min-height:180px;display:grid;grid-template-rows:minmax(0,1fr);place-items:center}
    .nu-il-stage img,.nu-il-stage video{width:100%;height:100%;max-height:100%;object-fit:contain;display:block}
    .nu-il-video-error{position:absolute;z-index:2;left:8px;right:8px;bottom:6px;margin:0;border-radius:8px;background:rgba(255,255,255,.96);text-align:center}
    .nu-il-action-row{display:flex;gap:8px;margin-top:12px}
    .nu-il-action{flex:1;border:1px solid #dce6f4;border-radius:11px;min-height:42px;padding:7px;background:#fff;color:#2869d5;font:600 12px system-ui;cursor:pointer}
    .nu-il-action:disabled{opacity:.35;cursor:default}.nu-il-primary{background:#3475da;color:#fff;border-color:#3475da}
    .nu-il-notice,.nu-il-error{font-size:12px;color:#9b4d32;padding:10px}
  `;
  document.head.append(style);
})();