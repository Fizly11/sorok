import {load,save} from "./storage.js";
export const spoilersEnabled=()=>load("reader.spoilers",false)===true;
export const canReveal=rule=>!rule||spoilersEnabled()||(Array.isArray(rule)?rule.every(canReveal):load("reader.read",[]).includes(rule.volume+"/"+rule.chapter));
export function installSpoilerControls(scope=document){
  for(const box of scope.querySelectorAll("[data-spoiler-controls]")){
    if(box.dataset.ready)continue;box.dataset.ready="true";
    const note=document.createElement("span"),button=document.createElement("button");button.type="button";
    box.append(note,button);
    const update=()=>{note.textContent=spoilersEnabled()?"Все сюжетные материалы открыты.":"Сюжетные материалы открываются по прочитанным главам.";button.textContent=spoilersEnabled()?"Скрывать спойлеры":"Показать все спойлеры"};
    button.addEventListener("click",()=>{
      if(spoilersEnabled()){save("reader.spoilers",false);dispatchEvent(new Event("spoilerchange"));return}
      const dialog=document.createElement("dialog");dialog.className="content-dialog spoiler-confirm";
      dialog.setAttribute("aria-label","Подтверждение показа спойлеров");
      const title=document.createElement("h2"),text=document.createElement("p"),yes=document.createElement("button"),no=document.createElement("button");
      title.textContent="Открыть всю историю?";text.textContent="Будут видны события, записи и иллюстрации из всех трёх томов, включая финал. Это не изменит ваш прогресс чтения.";
      yes.textContent="Да, показать все спойлеры";no.textContent="Продолжить без спойлеров";
      yes.addEventListener("click",()=>{save("reader.spoilers",true);dialog.close();dispatchEvent(new Event("spoilerchange"))});
      no.addEventListener("click",()=>dialog.close());dialog.addEventListener("close",()=>{dialog.remove();button.focus()},{once:true});
      dialog.append(title,text,no,yes);document.body.append(dialog);dialog.showModal();no.focus();
    });
    addEventListener("spoilerchange",update);addEventListener("storage",update);update();
  }
}
// Keep future character details, quotations and gallery images in inert templates.
// Their content and media are mounted only after the required chapter is read.
export function applySpoilerGates(scope=document){
  scope.querySelectorAll("template[data-spoiler-volume][data-spoiler-chapter]").forEach(template=>{
    const rule={volume:template.dataset.spoilerVolume,chapter:template.dataset.spoilerChapter};
    if(!template.gate){
      const holder=document.createElement("div");holder.className="spoiler-content";template.after(holder);template.gate={holder,open:null};
    }
    const open=canReveal(rule);if(template.gate.open===open)return;template.gate.open=open;
    if(open)template.gate.holder.replaceChildren(template.content.cloneNode(true));
    else{const note=document.createElement("p");note.className="spoiler-note muted";note.textContent="Материал откроется после чтения соответствующей главы.";template.gate.holder.replaceChildren(note)}
  });
}
addEventListener("storage",()=>applySpoilerGates());
addEventListener("spoilerchange",()=>applySpoilerGates());
