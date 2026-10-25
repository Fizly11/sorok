import {initAtmosphere} from "./site-shell.js";
import {recordRead,recordVisit,isRead} from "./reading-state.js";
import {load,save} from "./storage.js";
import {canReveal} from "./spoilers.js";
import {initMusicPlayer} from "./music-player.js";
const music=initMusicPlayer();
initAtmosphere();
const $=(s,r=document)=>r.querySelector(s), root=document.documentElement;
const DEFAULTS={size:20,lh:1.8,width:680,font:"serif",theme:"dark",focus:false};
const FONTS={serif:'"PT Serif",Georgia,serif',sans:'"Manrope",system-ui,sans-serif',display:'"Cormorant Garamond",Georgia,serif'};
const settings={...DEFAULTS,...load("reader.settings",{})};
let volumes=[],flat=[],cur=null,blocks=[],loading=false,requestId=0;
history.scrollRestoration="manual";
let readingGesture=false,enteredAt=performance.now();
for(const event of ["wheel","touchmove","keydown"])addEventListener(event,e=>{if(!loading&&cur&&!e.target.closest?.("#panel,dialog,input,textarea,select")&&(event!=="keydown"||["ArrowDown","PageDown","End"," "].includes(e.key)))readingGesture=true},{passive:true});
const barHeight=()=>$(".rbar").getBoundingClientRect().height+12;
new ResizeObserver(()=>root.style.setProperty("--bar-height",barHeight()+"px")).observe($(".rbar"));
const localPath=src=>typeof src==="string"&&/^(?:assets|books)\/[a-z0-9_./% -]+$/i.test(src)&&!src.split("/").includes("..");

/* ---------- Sanitizer: only whitelisted tags/classes, relative image paths ---------- */
const ALLOWED=new Set(["H2","H3","P","EM","I","STRONG","B","HR","BLOCKQUOTE","FIGURE","IMG","FIGCAPTION","BR","SPAN"]);
const CLASSES=new Set(["dialog","blank"]);
const DROP=new Set(["SCRIPT","STYLE","IFRAME","OBJECT","EMBED","LINK","META"]);
function clean(node){
  const out=document.createDocumentFragment();
  for(const n of node.childNodes){
    if(n.nodeType===3){out.append(n.textContent);continue}
    if(n.nodeType!==1||DROP.has(n.tagName))continue;
    if(!ALLOWED.has(n.tagName)){out.append(clean(n));continue}   // unwrap unknown tag, keep its text
    const el=document.createElement(n.tagName.toLowerCase());
    el.className=[...n.classList].filter(c=>CLASSES.has(c)).join(" ");
    if(/^\d+$/.test(n.dataset.paragraph||""))el.dataset.paragraph=n.dataset.paragraph;
    if(n.tagName==="IMG"){
      const src=n.getAttribute("src")||"";
      if(localPath(src))el.src=src;  // relative only
      el.alt=n.getAttribute("alt")||"";el.loading="lazy";
    }else el.append(clean(n));
    out.append(el);
  }
  return out;
}

/* ---------- Settings ---------- */
function applySettings(){
  const anchor=!loading&&blocks.length?topBlock():null, offset=anchor?anchor.getBoundingClientRect().top-barHeight():0;
  root.style.setProperty("--fs",settings.size+"px");root.style.setProperty("--lh",settings.lh);
  root.style.setProperty("--w",settings.width+"px");root.style.setProperty("--ff",FONTS[settings.font]||FONTS.serif);
  root.dataset.theme=settings.theme;document.body.classList.toggle("focus",settings.focus);
  $("#s-size").value=settings.size;$("#s-lh").value=settings.lh;$("#s-w").value=settings.width;$("#s-font").value=settings.font;$("#s-focus").checked=settings.focus;
  document.querySelectorAll("#themes button").forEach(b=>b.classList.toggle("on",b.dataset.theme===settings.theme));
  save("reader.settings",settings);
  if(anchor){scrollTo(0,scrollY+anchor.getBoundingClientRect().top-barHeight()-offset);onScroll()}
}
const bind=(id,key,conv=Number)=>$(id).addEventListener("input",e=>{settings[key]=conv(e.target.type==="checkbox"?e.target.checked:e.target.value);applySettings()});
bind("#s-size","size");bind("#s-lh","lh");bind("#s-w","width");bind("#s-font","font",String);bind("#s-focus","focus",Boolean);
$("#themes").addEventListener("click",e=>{if(e.target.dataset.theme){settings.theme=e.target.dataset.theme;applySettings()}});
$("#setbtn").addEventListener("click",()=>{const p=$("#panel");p.hidden=!p.hidden;$("#setbtn").setAttribute("aria-expanded",!p.hidden)});
addEventListener("keydown",e=>{if(e.key==="Escape"&&!$("#panel").hidden){$("#panel").hidden=true;$("#setbtn").setAttribute("aria-expanded","false")}});
if(!document.fullscreenEnabled)$("#fs").hidden=true;
$("#fs").addEventListener("click",()=>document.fullscreenElement?document.exitFullscreen():root.requestFullscreen().catch(()=>{}));

/* ---------- Figures & lightbox ---------- */
function placeholder(fig,img){
  const d=document.createElement("div");d.className="ph";d.setAttribute("role","img");
  d.setAttribute("aria-label",img?.alt||"Место для иллюстрации");d.textContent="Иллюстрация появится здесь";
  img?img.replaceWith(d):fig.prepend(d);
}
function setupFigures(box){
  box.querySelectorAll("figure").forEach(fig=>{
    const img=fig.querySelector("img");
    if(!img||!img.getAttribute("src"))placeholder(fig,img);else img.addEventListener("error",()=>placeholder(fig,img),{once:true});
    fig.tabIndex=0;
    const open=()=>{const cap=fig.querySelector("figcaption");
      $("#lbc").replaceChildren(fig.querySelector("img,.ph").cloneNode(true),...(cap?[cap.cloneNode(true)]:[]));$("#lb").showModal()};
    fig.addEventListener("click",open);fig.addEventListener("keydown",e=>{if(e.key==="Enter")open()});
  });
}
$("#lbx").addEventListener("click",()=>$("#lb").close());
$("#lb").addEventListener("click",e=>{if(e.target.id==="lb")$("#lb").close()});

/* ---------- Progress, position, bookmarks ---------- */
const topBlock=()=>blocks.find(b=>b.getBoundingClientRect().bottom>barHeight())||blocks[blocks.length-1];
const bookmarks=()=>load("reader.bookmarks",[]);
function markRead(){
  if(!cur||loading||!recordRead(cur.v,cur.c,volumes))return;
  fillChapters(cur.v);syncReadingTools();
}
function syncReadingTools(){
  if(!cur)return;
  const read=isRead(cur.v,cur.c);$("#mark-read").disabled=cur.kind==="frontmatter"||read;
  $("#mark-read").textContent=read?"✓ Глава прочитана":"Отметить главу прочитанной";
  const favorite=load("reader.favorites",[]).includes(cur.v+"/"+cur.c);$("#favorite-chapter").setAttribute("aria-pressed",String(favorite));$("#favorite-chapter").textContent=favorite?"♥ Любимая глава":"♡ Любимая глава";$("#favorite-chapter").disabled=cur.kind==="frontmatter";
  $("#note-link").href=`diary.html?v=${encodeURIComponent(cur.v)}&c=${encodeURIComponent(cur.c)}#note-form`;
}
$("#mark-read").addEventListener("click",()=>{markRead();$("#reader-action-status").textContent="Глава отмечена прочитанной. Связанные материалы открыты."});
$("#favorite-chapter").addEventListener("click",()=>{
  if(!cur)return;const key=cur.v+"/"+cur.c,list=load("reader.favorites",[]);save("reader.favorites",list.includes(key)?list.filter(item=>item!==key):[...list,key]);syncReadingTools();
});
$("#save-quote").addEventListener("click",()=>{
  const selection=getSelection(),box=$("#text"),text=selection?.toString().trim();
  if(!cur||!text||!box.contains(selection.anchorNode)||!box.contains(selection.focusNode)){ $("#reader-action-status").textContent="Сначала выделите фразу в тексте главы.";return}
  if(text.length>4000){$("#reader-action-status").textContent="Выделите фрагмент до 4000 символов.";return}
  const list=load("reader.quotes",[]),block=selection.anchorNode.nodeType===1?selection.anchorNode:selection.anchorNode.parentElement;
  list.unshift({id:crypto.randomUUID(),v:cur.v,c:cur.c,b:block.closest(".blk")?.id,title:cur.title,text,at:new Date().toISOString()});save("reader.quotes",list);$("#reader-action-status").textContent="Цитата сохранена в дневнике читателя.";
});
let ticking=false;
addEventListener("scroll",()=>{if(ticking)return;ticking=true;requestAnimationFrame(()=>{ticking=false;onScroll()})},{passive:true});
function onScroll(){
  if(loading||!cur||!blocks.length)return;
  const max=root.scrollHeight-innerHeight, pct=max>0?scrollY/max:1;
  $("#prog").style.width=pct*100+"%";
  const top=topBlock(), pos={v:cur.v,c:cur.c,b:top.id,offset:Math.round(top.getBoundingClientRect().top-barHeight())};
  save("reader.pos",pos);const positions=load("reader.positions",{});positions[cur.v]=pos;save("reader.positions",positions);
  const mid=innerHeight/2, focused=blocks.find(b=>{const r=b.getBoundingClientRect();return r.top<=mid&&r.bottom>=mid})||top;
  blocks.forEach(b=>b.classList.toggle("cur",b===focused));
  $("#bm").setAttribute("aria-pressed",bookmarks().some(x=>x.v===cur.v&&x.c===cur.c&&x.b===top.id));
  if(pct>=.97&&readingGesture&&performance.now()-enteredAt>=8000&&!$("#toc").open&&$("#panel").hidden&&!$("#lb").open)markRead();
}
$("#bm").addEventListener("click",()=>{
  if(loading||!cur||!blocks.length)return;
  const b=topBlock(), list=bookmarks(), i=list.findIndex(x=>x.v===cur.v&&x.c===cur.c&&x.b===b.id);
  if(i>=0)list.splice(i,1);else list.push({v:cur.v,c:cur.c,b:b.id,title:cur.title,snippet:b.textContent.trim().slice(0,60)});
  save("reader.bookmarks",list);renderBookmarks();onScroll();
});
function renderBookmarks(){
  const ul=$("#bmlist"), list=bookmarks();ul.replaceChildren();
  if(!list.length){const li=document.createElement("li");li.className="muted";li.textContent="Закладок пока нет.";ul.append(li);return}
  list.forEach((bm,i)=>{
    const li=document.createElement("li"), go=document.createElement("button"), del=document.createElement("button");
    go.className="go";go.textContent=`${bm.title}: ${bm.snippet}…`;
    go.addEventListener("click",()=>{const e=flat.find(x=>x.v===bm.v&&x.c===bm.c);if(e)openChapter(e,bm.b)});
    del.textContent="×";del.setAttribute("aria-label","Удалить закладку");
    del.addEventListener("click",()=>{const l=bookmarks();l.splice(i,1);save("reader.bookmarks",l);renderBookmarks();onScroll()});
    li.append(go,del);ul.append(li);
  });
}

/* ---------- Navigation ---------- */
function fillChapters(volId){
  const read=load("reader.read",[]), sel=$("#chap");sel.replaceChildren();
  flat.filter(e=>e.v===volId).forEach(e=>{const o=new Option((read.includes(e.v+"/"+e.c)?"✓ ":"")+e.title,e.c);sel.add(o)});
  if(cur&&cur.v===volId)sel.value=cur.c;
}
function syncUI(){
  $("#vol").value=cur.v;fillChapters(cur.v);syncReadingTools();
  const i=flat.indexOf(cur),volume=volumes.find(v=>v.id===cur.v),last=volume.chapters.at(-1).id===cur.c;
  $("#prev").disabled=i<=0;$("#next").disabled=i>=flat.length-1;
  $("#prev").textContent=flat[i-1]&&flat[i-1].v!==cur.v?`← К тому ${volumes.find(v=>v.id===flat[i-1].v).number}`:"← Предыдущая глава";
  const following=last&&volumes.slice(volumes.indexOf(volume)+1).find(v=>v.chapters?.length);
  $("#next").textContent=following?`Перейти к тому ${following.number} →`:"Следующая глава →";
  $("#reader-byline").textContent=`Том ${volume.number} · ${volume.title} · Автор: ${volume.author}`;
  $("#volume-end").hidden=!last;
  $("#volume-end-title").textContent=following?`Конец тома ${volume.number}`:"Конец доступной истории";
  $("#volume-end-note").textContent=following?`Продолжение — том ${following.number} «${following.title}».`:"Все три тома романа «Сорок минут до дома» · Joe";
  const link=$("#next-volume");link.hidden=!following;
  if(following){link.href=`?v=${encodeURIComponent(following.id)}&c=${encodeURIComponent(following.chapters[0].id)}&start=1`;link.textContent=`Читать том ${following.number}`}
}
function setupMedia(entry,box){
  for(const item of entry.illustrations||[]){
    if(!localPath(item.src)||!canReveal(item.requiresRead))continue;
    const anchor=[...box.children].find(b=>b.id===item.after);
    if(!anchor)continue;
    const fig=document.createElement("figure"),img=document.createElement("img");img.src=item.src;img.alt=item.alt||"";img.loading="lazy";if(item.width&&item.height){img.width=item.width;img.height=item.height}fig.append(img);
    if(item.caption){const caption=document.createElement("figcaption");caption.textContent=item.caption;fig.append(caption)}
    anchor.after(fig);
  }
}
function renderTOC(){
  const nav=$("#toc-list");nav.replaceChildren();
  $("#toc-title").textContent=volumes.find(v=>v.id===cur.v).title;
  const read=load("reader.read",[]);
  flat.filter(e=>e.v===cur.v).forEach(e=>{
    if(e.part){const p=document.createElement("p");p.className="toc-part";p.textContent=e.part;nav.append(p)}
    const a=document.createElement("a");a.href=`?v=${encodeURIComponent(e.v)}&c=${encodeURIComponent(e.c)}`;a.textContent=(read.includes(e.v+"/"+e.c)?"✓ ":"")+e.title;
    if(e===cur)a.setAttribute("aria-current","page");
    a.addEventListener("click",ev=>{ev.preventDefault();$("#toc").close();openChapter(e)});nav.append(a);
  });
}
const showTOC=()=>{if(cur){renderTOC();$("#toc").showModal()}};
$("#tocbtn").addEventListener("click",showTOC);$("#back-toc").addEventListener("click",showTOC);
$("#toc-close").addEventListener("click",()=>$("#toc").close());
$("#toc").addEventListener("click",e=>{if(e.target.id==="toc")$("#toc").close()});
async function openChapter(entry,blockId,offset=0){
  const id=++requestId;loading=true;blocks=[];cur=entry;
  const box=$("#text");box.textContent="Загрузка…";box.setAttribute("aria-busy","true");$("#prog").style.width="0%";syncUI();
  void music.setChapter(entry);
  try{
    const r=await fetch(entry.file);if(!r.ok)throw new Error(r.status);
    const body=new DOMParser().parseFromString(await r.text(),"text/html").body;
    if(id!==requestId)return;
    box.replaceChildren(clean(body));
  }catch{
    if(id!==requestId)return;
    const p=document.createElement("p");p.textContent=`Не удалось загрузить главу «${entry.title}». Проверьте путь: ${entry.file}`;
    box.replaceChildren(p);loading=false;box.removeAttribute("aria-busy");void music.setChapter(null);return;
  }
  [...box.children].forEach((b,i)=>{b.id=b.dataset.paragraph?"p"+b.dataset.paragraph:"b"+(i+1);b.classList.add("blk")});
  blocks=[...box.children].filter(b=>b.textContent.trim()||b.tagName==="FIGURE"||b.tagName==="HR");
  setupMedia(entry,box);setupFigures(box);syncUI();recordVisit(entry.v,entry.c);
  document.title=`${entry.title} — Том ${volumes.find(v=>v.id===entry.v).number} — Сорок минут до дома · Joe`;
  history.replaceState({reader:true},"",`?v=${encodeURIComponent(entry.v)}&c=${encodeURIComponent(entry.c)}`);
  await document.fonts.ready;await new Promise(resolve=>requestAnimationFrame(resolve));
  if(id!==requestId)return;
  const target=blockId&&document.getElementById(blockId);
  if(target)scrollTo(0,scrollY+target.getBoundingClientRect().top-barHeight()-(Number(offset)||0));else scrollTo(0,0);
  loading=false;readingGesture=false;enteredAt=performance.now();$("#reader-action-status").textContent="";box.removeAttribute("aria-busy");onScroll();
}
addEventListener("pagehide",onScroll);
const step=d=>{const e=flat[flat.indexOf(cur)+d];if(e)openChapter(e)};
$("#prev").addEventListener("click",()=>step(-1));$("#next").addEventListener("click",()=>step(1));
$("#vol").addEventListener("change",e=>{
  const pos=load("reader.positions",{})[e.target.value],f=(pos&&flat.find(x=>x.v===e.target.value&&x.c===pos.c))||flat.find(x=>x.v===e.target.value);
  if(f)openChapter(f,pos?.c===f.c?pos.b:null,pos?.c===f.c?pos.offset:0);
});
$("#chap").addEventListener("change",e=>{const f=flat.find(x=>x.v===cur.v&&x.c===e.target.value);if(f)openChapter(f)});

async function init(){
  applySettings();renderBookmarks();
  try{const r=await fetch("data/books.json");if(!r.ok)throw 0;volumes=(await r.json()).volumes}
  catch{$("#text").textContent="Не удалось загрузить список книг. Проверьте подключение и обновите страницу.";return}
  flat=volumes.flatMap(v=>(v.chapters||[]).map(c=>({...c,v:v.id,c:c.id})));
  volumes.forEach(v=>{const o=new Option(v.title+(v.chapters?.length?"":" (скоро)"),v.id);o.disabled=!v.chapters?.length;$("#vol").add(o)});
  if(!flat.length){$("#text").textContent="В книги пока не добавлены главы. См. data/books.json.";return}
  // Adding volumes must preserve existing reading data, including legacy reader.pos.
  const versions=load("reader.versions",{}),positions=load("reader.positions",{}),legacy=load("reader.pos",null);
  if(legacy&&!positions[legacy.v]&&flat.some(e=>e.v===legacy.v&&e.c===legacy.c))positions[legacy.v]=legacy;
  for(const v of volumes)if(v.contentVersion)versions[v.id]=v.contentVersion;
  save("reader.positions",positions);save("reader.versions",versions);renderBookmarks();
  const q=new URLSearchParams(location.search), pos=(q.get("v")&&load("reader.positions",{})[q.get("v")])||load("reader.pos",null);
  const resume=history.state?.reader||(!q.has("c")&&!q.has("start"));
  const saved=resume&&pos&&(!q.get("v")||q.get("v")===pos.v)&&flat.find(e=>e.v===pos.v&&e.c===pos.c);
  const entry=flat.find(e=>e.v===q.get("v")&&e.c===q.get("c"))||saved||flat.find(e=>e.v===q.get("v"))||flat[0];
  await openChapter(entry,q.get("b")||(saved===entry?pos.b:null),q.has("b")?0:saved===entry?pos.offset:0);
}
init();
