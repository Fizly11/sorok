import {initSiteShell} from "./site-shell.js";
import {canReveal} from "./spoilers.js";
import {resource,books,h,sourceLink,sourceText,locked,image,volumeFilter,dialogShell,showError} from "./universe-core.js";
initSiteShell();
try{
  const [data,volumes]=await Promise.all([resource("data/world.json"),books()]);
  const viewer=dialogShell("Материал мира романа");let revision=0;
  viewer.dialog.addEventListener("close",()=>{revision++;viewer.body.replaceChildren()});
  async function detail(item){
    const token=++revision;viewer.body.replaceChildren();
    if(!canReveal(item.unlock)){viewer.body.append(locked(item.source));viewer.open();return}
    const volume=volumes.find(v=>v.id===item.source.volume),chapter=volume.chapters.find(c=>c.id===item.source.chapter);
    viewer.body.append(h("p",{class:"eyebrow",text:`Том ${volume.number}`}),h("h2",{text:item.title}),h("p",{text:item.description}),sourceLink(item.source,chapter.title));
    const picture=item.portrait?{src:item.portrait,alt:`${item.title} — предоставленная иллюстрация персонажа`,width:1086,height:1448}:chapter.illustrations?.[0];
    if(picture)viewer.body.append(image(picture.src,picture.alt,{width:picture.width,height:picture.height}));
    viewer.open();const quote=await sourceText(item.source);
    if(token===revision&&viewer.dialog.open&&canReveal(item.unlock)&&quote)viewer.body.append(h("blockquote",{class:"source-quote",text:quote}),h("p",{class:"muted",text:`Источник: ${chapter.title}, абзац ${item.source.paragraph.replace("p","")}.`}));
  }
  const canvas=document.querySelector("#map-canvas"),list=document.querySelector("#map-list");
  for(const place of data.locations){
    const button=h("button",{type:"button",class:"map-pin",text:place.title,onclick:()=>detail(place)});
    button.style.left=place.x+"%";button.style.top=place.y+"%";canvas.append(button);
    list.append(h("button",{type:"button",text:place.title,onclick:()=>detail(place)}));
  }
  const filter=document.querySelector("#timeline-volume");volumeFilter(filter,volumes);
  function render(){
    const timeline=document.querySelector("#timeline-list");timeline.replaceChildren();
    data.events.filter(event=>filter.value==="all"||event.source.volume===filter.value).forEach((event,index)=>{
      const open=canReveal(event.unlock),card=h("article",{class:"panel"});
      if(open){
        const v=volumes.find(v=>v.id===event.source.volume);
        card.append(h("p",{class:"eyebrow",text:`Том ${v.number}`}),h("h3",{text:event.title}),h("p",{text:event.description}),h("button",{type:"button",text:"Источник и подробности",onclick:()=>detail(event)}));
      }else card.append(h("h3",{text:`Событие ${String(index+1).padStart(2,"0")}`}),locked(event.source));
      timeline.append(h("li",{},card));
    });
    const nodes=document.querySelector("#board-nodes"),lines=document.querySelector("#board-lines");nodes.replaceChildren();lines.replaceChildren();
    data.nodes.forEach(node=>{
      const open=canReveal(node.unlock);
      const card=h("button",{type:"button",class:"evidence-node",dataset:{nodeId:node.id,unlocked:String(open)},onclick:()=>detail(node)},h("span",{text:open?node.title:"Нераскрытая связь"}),h("small",{text:open?"Открыть источник":"Откроется по мере чтения"}));
      if(open&&node.portrait)card.prepend(image(node.portrait,`${node.title} — иллюстрация персонажа`,{width:120,height:160}));
      nodes.append(card);
    });
    const point=id=>{const i=data.nodes.findIndex(n=>n.id===id);return {x:125+i%4*250,y:100+Math.floor(i/4)*200}};
    for(const edge of data.edges){
      if(!canReveal(edge.unlock)||![edge.from,edge.to].every(id=>canReveal(data.nodes.find(n=>n.id===id).unlock)))continue;
      const a=point(edge.from),b=point(edge.to),line=document.createElementNS("http://www.w3.org/2000/svg","line");
      for(const [key,value] of Object.entries({x1:a.x,y1:a.y,x2:b.x,y2:b.y,stroke:"var(--wine)","stroke-width":3}))line.setAttribute(key,value);
      lines.append(line);
    }
  }
  filter.addEventListener("change",render);
  for(const event of ["spoilerchange","readingchange","storage"])addEventListener(event,()=>{if(viewer.dialog.open)viewer.dialog.close();render()});
  render();document.body.dataset.pageReady="true";
}catch(error){showError(error)}
