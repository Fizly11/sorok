import {initSiteShell} from "./site-shell.js";
import {load,save} from "./storage.js";
import {canReveal} from "./spoilers.js";
import {resource,books,h,sourceLink,locked,volumeFilter,showError} from "./universe-core.js";
initSiteShell();
try{
  const [data,volumes]=await Promise.all([resource("data/world.json"),books()]);
  const filter=document.querySelector("#notebook-volume"),select=document.querySelector("#notebook-index"),spread=document.querySelector("#notebook-spread"),book=document.querySelector("#notebook-book"),cover=document.querySelector("#notebook-cover"),mobile=matchMedia("(max-width:700px)");
  volumeFilter(filter,volumes);let pages=data.notebook,index=Math.max(0,data.notebook.findIndex(p=>p.id===load("notebook.position","")));
  function render(){
    pages=data.notebook.filter(page=>filter.value==="all"||page.source.volume===filter.value);index=Math.min(Math.max(0,index),Math.max(0,pages.length-1));select.replaceChildren();
    pages.forEach((page,i)=>select.add(new Option(`${i+1}. ${canReveal(page.unlock)?page.title:"Закрытая запись"}`,String(i))));select.value=String(index);
    spread.replaceChildren();
    for(let offset=0;offset<(mobile.matches?1:2);offset++){
      const page=pages[index+offset],paper=h("article",{class:`notebook-page ${offset?"second-page":""}`});
      if(!page){paper.append(h("p",{class:"muted",text:"Чистая страница"}));spread.append(paper);continue}
      if(!canReveal(page.unlock)){paper.append(locked(page.source));spread.append(paper);continue}
      paper.append(h("h2",{text:page.title}));
      if(page.blank)paper.append(h("p",{class:"muted",text:"В этой главе запись упомянута, но её точные слова не приведены. Эта страница оставлена без вымышленного текста."}));
      for(const fragment of page.fragments)paper.append(h("p",{class:`handwritten ${fragment.pencil?"pencil":""} ${fragment.strike?"crossed":""}`,text:fragment.text}));
      paper.append(sourceLink(page.source,"Глава-источник"));
      const saved=load("notebook.bookmarks",[]),marked=saved.includes(page.id),button=h("button",{type:"button",text:marked?"Убрать закладку":"Заложить страницу","aria-pressed":String(marked),onclick:()=>{
        const list=load("notebook.bookmarks",[]);save("notebook.bookmarks",list.includes(page.id)?list.filter(id=>id!==page.id):[...list,page.id]);render();
      }});
      paper.append(button,h("p",{class:"page-count",text:`Том ${volumes.find(v=>v.id===page.source.volume).number} · Страница ${index+offset+1}`}));spread.append(paper);
    }
    document.querySelector("#page-prev").disabled=index===0;document.querySelector("#page-next").disabled=index+(mobile.matches?1:2)>=pages.length;
    document.querySelector("#notebook-count").textContent=`${index+1} / ${pages.length}`;
    if(!book.hidden&&pages[index])save("notebook.position",pages[index].id);
    const marks=document.querySelector("#notebook-bookmarks");marks.replaceChildren();
    for(const id of load("notebook.bookmarks",[])){
      const page=data.notebook.find(p=>p.id===id);if(!page||!canReveal(page.unlock))continue;
      marks.append(h("button",{type:"button",text:page.title,onclick:()=>{filter.value="all";index=data.notebook.indexOf(page);render();spread.focus()}}));
    }
    if(!marks.childElementCount)marks.append(h("p",{class:"muted",text:"Закладки на открытых страницах появятся здесь."}));
  }
  const move=d=>{index=Math.max(0,Math.min(pages.length-1,index+d*(mobile.matches?1:2)));render()};
  document.querySelector("#open-notebook").addEventListener("click",()=>{cover.hidden=true;book.hidden=false;render();spread.focus()});
  document.querySelector("#close-notebook").addEventListener("click",()=>{book.hidden=true;cover.hidden=false;document.querySelector("#open-notebook").focus()});
  document.querySelector("#page-prev").addEventListener("click",()=>move(-1));document.querySelector("#page-next").addEventListener("click",()=>move(1));
  select.addEventListener("change",()=>{index=Number(select.value);render()});filter.addEventListener("change",()=>{index=0;render()});mobile.addEventListener("change",render);
  addEventListener("keydown",e=>{if(book.hidden||document.querySelector("dialog[open]")||e.target.matches("input,textarea,select"))return;if(e.key==="ArrowLeft"||e.key==="ArrowRight"){e.preventDefault();move(e.key==="ArrowRight"?1:-1)}});
  for(const event of ["spoilerchange","readingchange","storage"])addEventListener(event,render);
  render();document.body.dataset.pageReady="true";
}catch(error){showError(error)}
