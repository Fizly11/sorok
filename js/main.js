import {initSiteShell} from "./site-shell.js";
import {load,save} from "./storage.js";
import {applySpoilerGates} from "./spoilers.js";
applySpoilerGates();
const $=(s,r=document)=>r.querySelector(s), $$=(s,r=document)=>[...r.querySelectorAll(s)];
const reduce=matchMedia("(prefers-reduced-motion: reduce)").matches;

initSiteShell();

// Reveal on scroll
const io=new IntersectionObserver(es=>es.forEach(e=>{if(e.isIntersecting){e.target.classList.add("in");io.unobserve(e.target)}}),{threshold:.15});
$$(".reveal").forEach(el=>io.observe(el));

// Active nav item
const links=$$('#menu a[href^="#"]');
const navIO=new IntersectionObserver(es=>es.forEach(e=>{if(e.isIntersecting)links.forEach(a=>a.classList.toggle("active",a.hash==="#"+e.target.id))}),{rootMargin:"-45% 0px -50%"});
links.forEach(a=>{const s=$(a.hash);if(s)navIO.observe(s)});

// Parallax: background moves slower than content
const scene=$("[data-parallax]");
if(scene&&!reduce){let t=false;addEventListener("scroll",()=>{if(t)return;t=true;requestAnimationFrame(()=>{scene.style.transform=`translate3d(0,${scrollY*.25}px,0)`;t=false})},{passive:true})}

// Volumes from JSON (needs an HTTP server, not file://)
const shelf=$("#shelf"), progress=load("progress",{});
fetch("data/books.json").then(r=>{if(!r.ok)throw 0;return r.json()}).then(({volumes})=>{
  shelf.innerHTML="";
  for(const v of volumes){
    const p=progress[v.id]||0, el=document.createElement("article");el.className="vol";el.id=v.id;
    el.innerHTML=`<div class="cover"><small>Том ${v.number}</small><span></span><small class="cover-author">Joe</small></div><h3></h3><p class="muted"></p><div class="bar" role="progressbar" aria-label="Прогресс чтения" aria-valuenow="${p}" aria-valuemin="0" aria-valuemax="100"><i style="width:${p}%"></i></div><div class="act"></div>`;
    $(".cover span",el).textContent=v.title;$("h3",el).textContent=v.title;$("p.muted",el).textContent=[v.titleEn,`Автор: ${v.author} · ${v.chapterCount} глав`].filter(Boolean).join(" · ");
    const status=document.createElement("p");status.className="muted";status.textContent=`Доступен полностью · Прочитано ${p}%`;el.append(status);
    if(v.cover){
      const cover=$(".cover",el),img=document.createElement("img");
      img.src=v.cover;img.alt=`Постер тома ${v.number} «${v.title}» · Joe`;img.loading="lazy";img.decoding="async";
      if(v.coverWidth&&v.coverHeight){img.width=v.coverWidth;img.height=v.coverHeight}
      cover.classList.add("has-image");cover.prepend(img);
      img.addEventListener("error",()=>{img.remove();cover.classList.remove("has-image")},{once:true});
    }
    const act=$(".act",el);
    if(v.chapters?.length){
      const link=(label,query)=>{const a=document.createElement("a");a.className="btn primary";a.href=`reader.html?v=${encodeURIComponent(v.id)}&${query}`;a.textContent=label;act.append(a)};
      link("Читать",`c=${encodeURIComponent(v.chapters[0].id)}&start=1`);
      const pos=load("reader.positions",{})[v.id]||load("reader.pos",null);
      if(pos?.v===v.id&&v.chapters.some(c=>c.id===pos.c))link("Продолжить","resume=1");
      else{const pending=document.createElement("button");pending.className="btn";pending.disabled=true;pending.textContent="Продолжить";pending.title="Чтение ещё не начато";act.append(pending)}
      const details=document.createElement("details"), summary=document.createElement("summary"), list=document.createElement("ul");
      summary.textContent=`Оглавление · ${v.chapterCount||v.chapters.length} глав`;details.append(summary,list);
      for(const c of v.chapters){
        if(c.part){const part=document.createElement("li");part.className="toc-part";part.textContent=c.part;list.append(part)}
        const li=document.createElement("li"), a=document.createElement("a");a.href=`reader.html?v=${encodeURIComponent(v.id)}&c=${encodeURIComponent(c.id)}`;a.textContent=(load("reader.read",[]).includes(v.id+"/"+c.id)?"✓ ":"")+c.title;li.append(a);list.append(li);
      }
      el.append(details);
    }
    else{act.className="demo";act.textContent="Главы появятся позже."}
    shelf.append(el);
  }
}).catch(()=>{shelf.innerHTML='<p class="muted" role="alert">Не удалось загрузить список книг. Проверьте подключение и обновите страницу.</p>'});

// Resume button when a reading position exists
if(load("reader.pos",null)){const c=$("#continue");c.textContent="Продолжить чтение"}
