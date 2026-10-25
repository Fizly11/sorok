import {canReveal} from "./spoilers.js";
const cache=new Map();
export function resource(url){
  if(!cache.has(url))cache.set(url,fetch(url).then(r=>{if(!r.ok)throw Error(`Не удалось загрузить ${url}`);return r.json()}));
  return cache.get(url);
}
export const books=()=>resource("data/books.json").then(data=>data.volumes);
export function h(tag,attrs={},...children){
  const node=document.createElement(tag);
  for(const [key,value] of Object.entries(attrs)){
    if(value===null||value===undefined||value===false)continue;
    if(key.startsWith("on"))node.addEventListener(key.slice(2),value);
    else if(key==="class")node.className=value;
    else if(key==="text")node.textContent=value;
    else if(key==="dataset")Object.assign(node.dataset,value);
    else if(key in node&&!["list","form","style"].includes(key))node[key]=value;
    else node.setAttribute(key,value===true?"":value);
  }
  for(const child of children.flat(Infinity))if(child!==null&&child!==undefined)node.append(child instanceof Node?child:String(child));
  return node;
}
export const chapterURL=ref=>`reader.html?v=${encodeURIComponent(ref.volume||ref.v)}&c=${encodeURIComponent(ref.chapter||ref.c)}${ref.paragraph?`&b=${encodeURIComponent(ref.paragraph)}`:""}`;
export const sourceLink=(ref,label="Открыть главу")=>h("a",{class:"text-link",href:chapterURL(ref),text:label});
export function volumeFilter(select,volumes,{all=true}={}){
  if(all)select.append(new Option("Все тома","all"));
  volumes.forEach(v=>select.append(new Option(`Том ${v.number}`,v.id)));
}
export function locked(ref){return h("div",{class:"locked-state"},h("span",{"aria-hidden":"true",text:"◈"}),h("h3",{text:"Материал пока закрыт"}),h("p",{text:"Он откроется после прочтения связанной главы."}),sourceLink(ref,"Перейти к главе"))}
export async function sourceText(ref){
  if(!canReveal(ref))return "";
  const volumes=await books(),chapter=volumes.find(v=>v.id===ref.volume)?.chapters.find(c=>c.id===ref.chapter);
  if(!chapter)return "";
  const r=await fetch(chapter.file);if(!r.ok)return "";
  const doc=new DOMParser().parseFromString(await r.text(),"text/html");
  return canReveal(ref)?doc.querySelector(`[data-paragraph="${ref.paragraph?.replace(/^p/,"")}"]`)?.textContent.trim()||"":"";
}
export function image(src,alt,attrs={}){
  const img=h("img",{src,alt,loading:"lazy",decoding:"async",...attrs});
  img.addEventListener("error",()=>img.replaceWith(h("p",{class:"empty-state",text:"Изображение временно недоступно."})),{once:true});return img;
}
export function dialogShell(label){
  const dialog=h("dialog",{class:"content-dialog","aria-label":label}),body=h("div",{class:"dialog-body"});
  const close=h("button",{class:"dialog-close",type:"button","aria-label":"Закрыть",text:"×",onclick:()=>dialog.close()});
  dialog.append(close,body);dialog.addEventListener("click",e=>{if(e.target===dialog)dialog.close()});document.body.append(dialog);
  return {dialog,body,open(){dialog.showModal();close.focus()}};
}
export function showError(error,root=document.querySelector("#page-content")){
  root.replaceChildren(h("p",{class:"empty-state",role:"alert",text:error.message||"Не удалось загрузить раздел. Обновите страницу."}));
}
