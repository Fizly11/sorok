import {initSiteShell} from "./site-shell.js";
import {load,save} from "./storage.js";
import {books,h,chapterURL,showError} from "./universe-core.js";
initSiteShell();
try{
  const volumes=await books(),form=document.querySelector("#note-form"),volumeSelect=document.querySelector("#note-volume"),chapterSelect=document.querySelector("#note-chapter"),list=document.querySelector("#saved-list");
  let view="notes",editing=null;
  const names={notes:"reader.notes",quotes:"reader.quotes",bookmarks:"reader.bookmarks",history:"reader.history",favorites:"reader.favorites"};
  const get=key=>{const value=load(key,[]);return Array.isArray(value)?value:[]};
  volumes.forEach(v=>volumeSelect.add(new Option(`Том ${v.number}`,v.id)));
  function fillChapters(){
    chapterSelect.replaceChildren();const volume=volumes.find(v=>v.id===volumeSelect.value);chapterSelect.disabled=!volume;
    if(!volume){chapterSelect.add(new Option("Выберите том",""));return}
    volume.chapters.forEach(c=>chapterSelect.add(new Option(c.title,c.id)));
  }
  volumeSelect.addEventListener("change",fillChapters);fillChapters();
  const query=new URLSearchParams(location.search);if(volumes.some(v=>v.id===query.get("v"))){volumeSelect.value=query.get("v");fillChapters();if([...chapterSelect.options].some(o=>o.value===query.get("c")))chapterSelect.value=query.get("c")}
  function reset(){editing=null;form.reset();fillChapters();document.querySelector("#cancel-note").hidden=true;document.querySelector("#save-note").textContent="Сохранить заметку"}
  form.addEventListener("submit",e=>{
    e.preventDefault();if(!form.reportValidity())return;
    const notes=get("reader.notes"),previous=notes.find(n=>n.id===editing),note={id:editing||crypto.randomUUID(),title:document.querySelector("#note-title").value.trim(),text:document.querySelector("#note-text").value.trim(),v:volumeSelect.value||null,c:chapterSelect.value||null,at:previous?.at||new Date().toISOString(),updatedAt:new Date().toISOString()};
    if(!note.title||!note.text)return;
    const index=notes.findIndex(n=>n.id===editing);if(index<0)notes.unshift(note);else notes[index]=note;
    save("reader.notes",notes);reset();view="notes";render();document.querySelector("#note-status").textContent="Заметка сохранена в этом браузере.";
  });
  document.querySelector("#cancel-note").addEventListener("click",reset);
  function summary(){
    const box=document.querySelector("#diary-summary"),positions=load("reader.positions",{}),legacy=load("reader.pos",null),progress=load("progress",{});box.replaceChildren();
    for(const volume of volumes){
      const pos=positions[volume.id]||(legacy?.v===volume.id?legacy:null),chapter=volume.chapters.find(c=>c.id===pos?.c),percent=Math.max(0,Math.min(100,Number(progress[volume.id])||0));
      const bar=h("div",{class:"bar",role:"progressbar","aria-label":`Том ${volume.number}: прочитано`,"aria-valuenow":percent,"aria-valuemin":0,"aria-valuemax":100},h("i"));bar.firstChild.style.width=percent+"%";
      box.append(h("article",{class:"panel"},h("p",{class:"eyebrow",text:`Том ${volume.number}`}),h("h2",{text:volume.title}),bar,h("p",{text:`Прочитано ${percent}%`}),h("p",{class:"muted",text:chapter?chapter.title:"Чтение ещё не начато"}),h("a",{class:"text-link",href:`reader.html?v=${volume.id}${chapter?"&resume=1":""}`,text:chapter?"Продолжить чтение":"Открыть том"})));
    }
  }
  function reference(record){
    const volume=volumes.find(v=>v.id===record.v),chapter=volume?.chapters.find(c=>c.id===record.c);
    return volume&&chapter?{label:`Том ${volume.number} · ${chapter.title}`,url:chapterURL({v:record.v,c:record.c,paragraph:record.b})}:null;
  }
  function render(){
    document.querySelectorAll("#diary-tabs [data-view]").forEach(button=>button.setAttribute("aria-pressed",String(button.dataset.view===view)));list.replaceChildren();const rows=get(names[view]);
    rows.forEach((raw,index)=>{
      const record=typeof raw==="string"?{v:raw.split("/")[0],c:raw.split("/")[1]}:raw,ref=reference(record),card=h("article",{class:"saved-card"});
      card.append(h("h3",{text:record.title||(view==="history"?"Открытая страница":view==="favorites"?"Любимая глава":ref?.label||"Сохранённая запись")}));
      if(record.text||record.snippet)card.append(h(view==="quotes"?"blockquote":"p",{class:"user-text",text:record.text||record.snippet}));
      if(record.at){const date=new Date(record.at);if(!Number.isNaN(date.valueOf()))card.append(h("time",{dateTime:record.at,text:new Intl.DateTimeFormat("ru",{dateStyle:"medium",timeStyle:"short"}).format(date)}))}
      if(ref)card.append(h("p",{},h("a",{class:"text-link",href:ref.url,text:ref.label})));
      const actions=h("div",{class:"actions"});
      if(view==="notes")actions.append(h("button",{type:"button",text:"Редактировать",onclick:()=>{
        editing=record.id;document.querySelector("#note-title").value=record.title;document.querySelector("#note-text").value=record.text;volumeSelect.value=record.v||"";fillChapters();if(record.c)chapterSelect.value=record.c;document.querySelector("#cancel-note").hidden=false;document.querySelector("#save-note").textContent="Сохранить изменения";form.scrollIntoView({block:"start"});document.querySelector("#note-title").focus();
      }}));
      actions.append(h("button",{type:"button",text:"Удалить","aria-label":`Удалить ${view==="notes"?"заметку":view==="bookmarks"?"закладку":"запись"}`,onclick:()=>{const records=get(names[view]);records.splice(index,1);save(names[view],records);render()}}));card.append(actions);list.append(card);
    });
    if(!rows.length)list.append(h("p",{class:"empty-state",text:view==="quotes"?"Выделите фразу в читалке и нажмите «Сохранить цитату».":view==="favorites"?"Любимые главы можно отметить в инструментах читалки.":view==="history"?"История открытых страниц появится после чтения. Открытие страницы не считается прочтением.":view==="bookmarks"?"Ваши закладки из читалки появятся здесь.":"Пока нет заметок. Сохраните первое впечатление от прочитанного."}));
  }
  document.querySelector("#diary-tabs").addEventListener("click",e=>{const button=e.target.closest("[data-view]");if(button){view=button.dataset.view;render()}});
  function exportData(type){
    const data={exportedAt:new Date().toISOString(),notes:get("reader.notes"),quotes:get("reader.quotes"),bookmarks:get("reader.bookmarks"),favorites:get("reader.favorites")};
    const text=type==="json"?JSON.stringify(data,null,2):["Сорок минут до дома · Дневник читателя",...data.notes.map(n=>`${n.title}\n${n.text}\n${n.at}`),...data.quotes.map(q=>`${q.text}\n${q.v} / ${q.c}`),...data.bookmarks.map(b=>`Закладка: ${b.title}\n${b.snippet}`),...data.favorites.map(f=>`Любимая глава: ${f}`)].join("\n\n");
    const url=URL.createObjectURL(new Blob([text],{type:type==="json"?"application/json;charset=utf-8":"text/plain;charset=utf-8"})),link=h("a",{href:url,download:`forty-minutes-diary.${type}`});document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  document.querySelector("#export-json").addEventListener("click",()=>exportData("json"));document.querySelector("#export-txt").addEventListener("click",()=>exportData("txt"));
  addEventListener("storage",()=>{summary();render()});summary();render();document.body.dataset.pageReady="true";
}catch(error){showError(error)}
