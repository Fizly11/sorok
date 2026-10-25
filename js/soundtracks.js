import {initSiteShell} from "./site-shell.js";
import {tracks,chapterTracks} from "./music-config.js";
import {initMusicPlayer} from "./music-player.js";
import {books,h,chapterURL,volumeFilter,showError} from "./universe-core.js";
initSiteShell();
try{
  const volumes=await books(),player=initMusicPlayer(),filter=document.querySelector("#music-volume-filter"),timelineFilter=document.querySelector("#music-timeline-volume"),grid=document.querySelector("#track-grid");
  volumeFilter(filter,volumes);volumeFilter(timelineFilter,volumes,{all:false});
  const uses=new Map(Object.keys(tracks).map(id=>[id,[]]));
  for(const volume of volumes)for(const chapter of volume.chapters){
    const id=chapterTracks[volume.id]?.[chapter.id];
    if(id)uses.get(id).push({volume,chapter});
  }
  function updateButtons(){
    for(const card of grid.querySelectorAll("[data-track]")){
      const current=player.track?.id===card.dataset.track,playing=current&&!player.audio.paused;
      card.dataset.playing=String(playing);card.querySelector("button").textContent=current&&player.wanted?"❚❚ Пауза":"▶ Слушать";
      card.querySelector("button").setAttribute("aria-pressed",String(current&&player.wanted));
      card.querySelector(".track-status").textContent=playing?"Сейчас играет":current?"Выбрано · на паузе":"";
    }
  }
  function render(){
    grid.replaceChildren();let count=0;
    for(const track of Object.values(tracks)){
      const related=uses.get(track.id),matches=related.filter(ref=>filter.value==="all"||ref.volume.id===filter.value);
      if(!matches.length)continue;count++;
      const card=h("article",{class:"panel track-card",dataset:{track:track.id}},h("h2",{text:track.title}),h("p",{class:"artist",text:track.artist+(track.version?` · ${track.version}`:"")}));
      const list=h("ul",{"aria-label":"Связанные главы"});
      for(const {volume,chapter} of matches)list.append(h("li",{},h("a",{href:chapterURL({v:volume.id,c:chapter.id}),text:`${volume.number} · ${chapter.number}`,title:chapter.title})));
      card.append(list,h("button",{type:"button","aria-label":`Слушать ${track.title}`,onclick:()=>player.selectTrack(track.id),text:"▶ Слушать"}),h("p",{class:"track-status",role:"status"}));grid.append(card);
    }
    document.querySelector("#track-count").textContent=`Композиций: ${count} · Одновременно звучит только одна тема.`;updateButtons();
  }
  function timeline(){
    const list=document.querySelector("#chapter-music-list"),volume=volumes.find(v=>v.id===timelineFilter.value);list.replaceChildren();
    for(const chapter of volume.chapters.filter(c=>c.kind==="chapter")){
      const track=tracks[chapterTracks[volume.id][chapter.id]];
      list.append(h("li",{},h("span",{class:"muted",text:chapter.number}),h("a",{href:chapterURL({v:volume.id,c:chapter.id}),text:chapter.title}),h("div",{class:"music-assignment"},h("span",{text:track.title}),h("small",{text:track.artist}))));
    }
  }
  document.querySelector("#music-player").addEventListener("musicchange",updateButtons);filter.addEventListener("change",render);timelineFilter.addEventListener("change",timeline);
  render();timeline();const first=Object.values(tracks)[0];await player.setChapter({v:"library",c:first.id,mode:"library",trackId:first.id});
  document.body.dataset.pageReady="true";
}catch(error){showError(error)}
