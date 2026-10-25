import {initSiteShell} from "./site-shell.js";
import {canReveal} from "./spoilers.js";
import {resource,books,h,sourceLink,locked,image,volumeFilter,dialogShell,showError} from "./universe-core.js";
initSiteShell();
try{
  const [items,volumes]=await Promise.all([resource("data/gallery.json"),books()]);
  const category=document.querySelector("#gallery-category"),volume=document.querySelector("#gallery-volume"),grid=document.querySelector("#gallery-grid");volumeFilter(volume,volumes);
  const viewer=dialogShell("Полноэкранный просмотр изображения");viewer.dialog.classList.add("gallery-viewer");let visible=[],index=0,touch=null;
  function show(next){
    if(!visible.length)return;index=(next+visible.length)%visible.length;const item=visible[index];
    const controls=h("nav",{class:"viewer-controls","aria-label":"Просмотр галереи"},h("button",{text:"←",type:"button","aria-label":"Предыдущее изображение",disabled:visible.length<2,onclick:()=>show(index-1)}),h("p",{text:`${index+1} / ${visible.length} · ${item.title}`}),h("button",{text:"→",type:"button","aria-label":"Следующее изображение",disabled:visible.length<2,onclick:()=>show(index+1)}));
    if(item.source)controls.append(sourceLink(item.source));
    viewer.body.replaceChildren(image(item.src,item.alt,{loading:"eager",width:item.width,height:item.height}),controls);
    if(!viewer.dialog.open)viewer.open();
  }
  viewer.dialog.addEventListener("keydown",e=>{if(e.key==="ArrowLeft"){e.preventDefault();show(index-1)}if(e.key==="ArrowRight"){e.preventDefault();show(index+1)}});
  viewer.body.addEventListener("pointerdown",e=>{if(e.pointerType==="touch")touch=e.clientX});
  viewer.body.addEventListener("pointerup",e=>{if(touch!==null&&e.pointerType==="touch"&&Math.abs(e.clientX-touch)>50)show(index+(e.clientX<touch?1:-1));touch=null});
  viewer.dialog.addEventListener("close",()=>viewer.body.replaceChildren());
  function render(){
    if(viewer.dialog.open)viewer.dialog.close();
    const filtered=items.filter(item=>(category.value==="all"||category.value===item.category)&&(volume.value==="all"||item.volumes.includes(volume.value)));
    visible=filtered.filter(item=>canReveal(item.unlock));grid.replaceChildren();
    document.querySelector("#gallery-count").textContent=`Изображений: ${filtered.length} · Открыто: ${visible.length}`;
    for(const item of filtered){
      const open=canReveal(item.unlock),card=h("article",{class:`gallery-card ${item.category==="covers"?"cover-card":""} ${open?"":"locked"}`});
      if(open){
        card.append(h("button",{type:"button","aria-label":`Открыть: ${item.title}`,onclick:()=>show(visible.indexOf(item))},image(item.src,item.alt,{width:item.width,height:item.height})),h("p",{class:"gallery-caption",text:item.title}));
      }else card.append(locked(item.source));
      grid.append(card);
    }
    if(!filtered.length)grid.append(h("div",{class:"empty-state"},h("h2",{text:category.value==="archive"?"Архив ещё собирается":"Здесь пока нет изображений"}),h("p",{text:"Отдельные материалы этой категории не предоставлены. Подтверждённые записи можно прочитать в синей тетради."}),h("a",{class:"text-link",href:"notebook.html",text:"Открыть тетрадь"})));
  }
  category.addEventListener("change",render);volume.addEventListener("change",render);
  for(const event of ["spoilerchange","readingchange","storage"])addEventListener(event,render);
  render();document.body.dataset.pageReady="true";
}catch(error){showError(error)}
