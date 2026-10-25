import {load,save} from "./storage.js";
import {installSpoilerControls} from "./spoilers.js";
const themes=["night","sunset","rain","silence"];
export function setAtmosphere(value){
  if(!themes.includes(value))value="night";
  document.documentElement.dataset.atmosphere=value;
  document.querySelectorAll("[data-set]").forEach(button=>button.setAttribute("aria-pressed",String(button.dataset.set===value)));
  const select=document.querySelector("#reader-atmosphere");if(select)select.value=value;
  save("atmosphere",value);
}
export function initAtmosphere(){
  document.querySelectorAll("[data-set]").forEach(button=>{if(button.dataset.bound)return;button.dataset.bound="true";button.addEventListener("click",()=>setAtmosphere(button.dataset.set))});
  const select=document.querySelector("#reader-atmosphere");if(select&&!select.dataset.bound){select.dataset.bound="true";select.addEventListener("change",()=>setAtmosphere(select.value))}
  setAtmosphere(load("atmosphere","night"));
}
export function initSiteShell(){
  const root=document.querySelector("#nav");
  if(root&&!root.dataset.initialized){
    root.dataset.initialized="true";root.className="nav";
    root.innerHTML=`<a class="brand" href="index.html">Сорок минут до дома</a><button class="burger" id="burger" aria-expanded="false" aria-controls="menu" aria-label="Открыть меню"><span></span><span></span></button><nav id="menu" aria-label="Основная навигация"><a href="index.html#books">Книги</a><a href="index.html#characters">Персонажи</a><a href="world.html">Мир романа</a><a href="soundtracks.html">Саундтреки</a><a href="gallery.html">Галерея</a><a href="notebook.html">Тетрадь</a><a href="diary.html">Дневник</a><a href="author.html">Автор</a><div class="atmo" role="group" aria-label="Атмосфера"><button data-set="night">Ночь</button><button data-set="sunset">Закат</button><button data-set="rain">Дождь</button><button data-set="silence">Тишина</button></div></nav>`;
    const button=root.querySelector("#burger"),menu=root.querySelector("#menu"),mobile=matchMedia("(max-width:1200px)");
    const setMenu=open=>{menu.classList.toggle("open",open);button.setAttribute("aria-expanded",String(open));button.setAttribute("aria-label",open?"Закрыть меню":"Открыть меню");document.body.classList.toggle("menu-open",open);if(open)menu.querySelector("a").focus()};
    button.addEventListener("click",()=>setMenu(button.getAttribute("aria-expanded")!=="true"));
    menu.addEventListener("click",e=>{if(e.target.closest("a"))setMenu(false)});
    addEventListener("keydown",e=>{
      if(button.getAttribute("aria-expanded")!=="true")return;
      if(e.key==="Escape"){setMenu(false);button.focus()}
      if(e.key==="Tab"){
        const elements=[button,...menu.querySelectorAll("a,button")],first=elements[0],last=elements.at(-1);
        if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus()}
        if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus()}
      }
    });
    mobile.addEventListener("change",()=>setMenu(false));
    root.querySelectorAll("a").forEach(a=>{if(a.getAttribute("href").split("#")[0]===location.pathname.split("/").at(-1))a.setAttribute("aria-current","page")});
  }
  initAtmosphere();installSpoilerControls();
}
