import {load,save} from "./storage.js";
import {tracks,chapterTracks,musicScenes} from "./music-config.js";

const clamp=n=>Math.max(0,Math.min(1,Number.isFinite(Number(n))?Number(n):.25));
// Encode each path segment: spaces, Cyrillic and literal # belong to filenames.
export const musicURL=path=>new URL(path.split("/").map(encodeURIComponent).join("/"),document.baseURI).href;
const audioOwners=new WeakMap();
let activePlayer=null;

export class MusicPlayer {
  constructor(root,{audio=root.querySelector("audio"),fadeOut=650,fadeIn=850}={}){
    if(root.musicPlayer&&!root.musicPlayer.destroyed)return root.musicPlayer;
    const owner=audioOwners.get(audio);if(owner&&!owner.destroyed)return owner;
    this.root=root;this.audio=audio;this.fadeOut=fadeOut;this.fadeIn=fadeIn;
    root.musicPlayer=this;audioOwners.set(audio,this);
    const saved=load("music.settings",{});
    this.volume=clamp(saved?.volume??.25);
    this.wanted=false;this.authorized=false;this.entry=null;this.track=null;this.loaded=null;
    this.revision=0;this.frame=null;this.finishFade=null;this.scene=null;this.error="";this.busy=false;
    this.destroyed=false;this.listeners=[];
    const positions=load("music.positions",{});
    this.positions=positions&&typeof positions==="object"&&!Array.isArray(positions)?positions:{};
    this.mediaVersion=0;this.intentVersion=0;this.pendingPlay=null;this.restorePending=null;this.positionReady=false;this.lastPositionSave=0;
    this.button=root.querySelector("[data-music-toggle]");this.slider=root.querySelector("[data-music-volume]");
    this.audio.loop=true;this.audio.preload="none";this.audio.volume=this.volume;
    this.listen(this.button,"click",()=>this.toggle());
    this.listen(this.slider,"input",()=>this.setVolume(Number(this.slider.value)/100));
    this.seek=root.querySelector("[data-music-progress]");
    if(this.seek){
      this.listen(this.seek,"input",()=>{if(Number.isFinite(audio.duration)&&audio.duration>0){audio.currentTime=audio.duration*Number(this.seek.value)/100;this.rememberPosition();this.updateProgress()}});
    }
    // Exactly one metadata listener for the lifetime of this audio element.
    this.listen(audio,"loadedmetadata",()=>{this.restorePosition();this.updateProgress()});
    this.listen(audio,"timeupdate",()=>{this.rememberPosition(false);this.updateProgress()});
    this.listen(audio,"durationchange",()=>this.updateProgress());
    for(const event of ["playing","pause","waiting","canplay"]){
      this.listen(audio,event,()=>{
        if(event==="playing")this.enforceIntent();
        if(event==="pause")this.rememberPosition();
        this.render();
      });
    }
    // Native loop normally prevents ended. If a browser emits it, only repeat
    // this exact source; there is deliberately no playlist/next-track action.
    this.listen(audio,"ended",()=>{
      if(!this.enforceIntent())return;
      audio.loop=true;audio.currentTime=0;this.rememberPosition();
      void this.play(this.revision);
    });
    this.listen(audio,"error",()=>{
      if(!audio.error||!this.loaded)return;
      this.revision++;this.cancelFade();this.busy=false;
      this.error="Не удалось загрузить аудио. Попробуйте ещё раз.";
      this.intentVersion++;this.wanted=false;audio.pause();this.persist();this.render();
    });
    this.listen(window,"pagehide",()=>this.suspend());
    this.listen(window,"pageshow",event=>{if(event.persisted)this.render()});
    this.render();
  }
  listen(target,event,listener){target.addEventListener(event,listener);this.listeners.push(()=>target.removeEventListener(event,listener))}
  persist(){save("music.settings",{enabled:this.wanted,paused:!this.wanted,volume:this.volume})}
  rememberPosition(force=true){
    if(!this.loaded||!this.positionReady||this.audio.src!==this.loaded.url)return;
    const time=this.audio.currentTime,now=performance.now();
    if(!Number.isFinite(time)||time<0||(!force&&now-this.lastPositionSave<5000))return;
    // Zero is a real saved position, never a request to reuse an older value.
    this.positions[this.loaded.id]=time;this.lastPositionSave=now;save("music.positions",this.positions);
  }
  restorePosition(){
    const pending=this.restorePending,audio=this.audio;
    if(!pending||pending.version!==this.mediaVersion||audio.src!==pending.url||audio.readyState<1)return;
    const saved=this.positions[pending.id],time=Number.isFinite(saved)&&saved>=0?saved:0;
    try{audio.currentTime=Number.isFinite(audio.duration)&&time>=audio.duration?0:time}
    catch{return} // Retry on the next actual metadata event, without a new listener.
    this.restorePending=null;this.positionReady=true;
  }
  enforceIntent(){
    const owner=audioOwners.get(this.audio);
    if(owner&&owner!==this)return owner.enforceIntent();
    const allowed=!this.destroyed&&this.wanted&&this.authorized&&activePlayer===this&&this.scene?.action!=="pause"&&this.loaded?.id===this.track?.id&&this.audio.src===this.loaded?.url;
    if(!allowed&&!this.audio.paused)this.audio.pause();
    return allowed;
  }
  get gain(){return this.volume*(this.scene?.action==="duck"?clamp(this.scene.gain):1)}
  cancelFade(){
    if(this.frame!==null)cancelAnimationFrame(this.frame);
    this.frame=null;
    if(this.finishFade){const finish=this.finishFade;this.finishFade=null;finish(false)}
  }
  fade(target,duration,revision){
    this.cancelFade();
    if(revision!==this.revision||this.destroyed)return Promise.resolve(false);
    const value=()=>typeof target==="function"?target():target;
    if(duration<=0){this.audio.volume=clamp(value());return Promise.resolve(true)}
    const start=this.audio.volume,time=performance.now();
    return new Promise(resolve=>{
      this.finishFade=resolve;
      const step=now=>{
        if(revision!==this.revision||this.destroyed){this.finishFade=null;this.frame=null;resolve(false);return}
        const fraction=Math.min(1,(now-time)/duration);
        this.audio.volume=clamp(start+(value()-start)*fraction);
        if(fraction<1)this.frame=requestAnimationFrame(step);
        else{this.finishFade=null;this.frame=null;resolve(true)}
      };
      this.frame=requestAnimationFrame(step);
    });
  }
  source(track){return track?.sources.find(source=>this.audio.canPlayType(source.type))||null}
  async play(revision){
    let task;
    try{
      if(this.destroyed||!this.wanted||!this.authorized||revision!==this.revision)return false;
      const previous=activePlayer;activePlayer=this;
      if(previous&&previous!==this)previous.suspend();
      task=this.pendingPlay;
      if(!task||task.media!==this.mediaVersion||task.intent!==this.intentVersion){
        task={media:this.mediaVersion,intent:this.intentVersion,promise:this.audio.play()};this.pendingPlay=task;
      }
      await task.promise;
      // Check the CURRENT intent even for an obsolete play promise. Checking
      // revision first used to leave delayed playback running after Pause.
      if(!this.enforceIntent())return false;
      if(revision!==this.revision||this.destroyed)return false;
      return true;
    }catch(error){
      if(revision!==this.revision||this.destroyed)return false;
      this.wanted=false;this.busy=false;
      this.error=error.name==="NotAllowedError"?"Нажмите «Включить музыку», чтобы начать.":"Не удалось воспроизвести аудио. Попробуйте ещё раз.";
      this.audio.pause();this.persist();this.render();return false;
    }finally{if(task&&this.pendingPlay===task)this.pendingPlay=null}
  }
  async setChapter(entry){
    if(this.destroyed)return;
    const oldKey=this.entry&&`${this.entry.v}/${this.entry.c}`;
    const key=entry&&`${entry.v}/${entry.c}`;
    if(key!==oldKey)this.scene=null;
    this.entry=entry;
    const trackId=entry?.mode==="library"?entry.trackId:chapterTracks[entry?.v]?.[entry?.c];
    const track=tracks[trackId]||null,source=this.source(track);
    this.rememberPosition();
    const revision=++this.revision;this.cancelFade();this.track=track;
    this.error="";this.busy=true;this.render();
    try{
      const same=source&&this.loaded?.id===track.id&&this.loaded.url===musicURL(source.path)&&!this.audio.error;
      const shouldPlay=this.wanted&&this.authorized&&this.scene?.action!=="pause";
      if(same){
        // The two Self Love chapters, for example, share the ongoing playback.
        if(shouldPlay){
          if(this.audio.paused&&!await this.play(revision))return;
          if(!await this.fade(()=>this.gain,this.fadeIn,revision))return;
        }else{
          if(!this.audio.paused&&!await this.fade(0,this.fadeOut,revision))return;
          if(revision!==this.revision)return;
          this.audio.pause();this.audio.volume=this.gain;
        }
      }else{
        if(!this.audio.paused&&!await this.fade(0,this.fadeOut,revision))return;
        if(revision!==this.revision)return;
        const previous=this.loaded?.id||null;
        this.audio.pause();this.positionReady=false;this.restorePending=null;
        this.mediaVersion++;this.pendingPlay=null;this.loaded=null;this.audio.removeAttribute("src");this.audio.load();
        if(source){
          this.loaded={id:track.id,url:musicURL(source.path)};
          this.restorePending={...this.loaded,version:this.mediaVersion};
          this.audio.src=this.loaded.url;this.audio.loop=true;this.audio.volume=0;
          if(previous!==track.id)console.info("[music] track-change",{from:previous,to:track.id,mode:entry?.mode||"chapter",chapter:entry?.mode==="library"?null:key,revision});
          if(shouldPlay){
            if(!await this.play(revision))return;
            if(!await this.fade(()=>this.gain,this.fadeIn,revision))return;
          }else this.audio.volume=this.gain;
        }else{
          if(previous)console.info("[music] track-change",{from:previous,to:null,chapter:key,revision});
          if(track)this.error=track.sources.length?"Браузер не поддерживает этот аудиоформат.":"Файл композиции пока отсутствует.";
        }
      }
    }catch(error){
      if(revision!==this.revision)return;
      this.error="Музыка недоступна. Чтение можно продолжать.";
      this.audio.pause();this.wanted=false;this.persist();
    }finally{
      if(revision===this.revision){this.busy=false;this.render()}
    }
  }
  toggle(){
    if(this.destroyed||!this.track||!this.source(this.track))return Promise.resolve();
    this.intentVersion++;
    if(this.wanted){
      this.wanted=false;this.rememberPosition();this.audio.pause();
    }else{
      this.authorized=true;this.wanted=true;
      // A failed source is reloaded only in response to another user action.
      if(this.audio.error)this.loaded=null;
    }
    this.persist();return this.setChapter(this.entry);
  }
  selectTrack(id){
    if(this.destroyed||!tracks[id])return Promise.resolve();
    if(this.entry?.mode==="library"&&this.track?.id===id&&this.wanted)return this.toggle();
    this.intentVersion++;this.authorized=true;this.wanted=true;this.persist();
    return this.setChapter({v:"library",c:id,mode:"library",trackId:id});
  }
  updateProgress(){
    if(!this.seek)return;
    const audio=this.audio,duration=Number.isFinite(audio.duration)?audio.duration:0;
    const format=value=>`${Math.floor(value/60)}:${String(Math.floor(value%60)).padStart(2,"0")}`;
    this.seek.disabled=!duration;this.seek.value=duration?audio.currentTime/duration*100:0;
    this.root.querySelector("[data-music-time]").textContent=format(audio.currentTime||0);
    this.root.querySelector("[data-music-duration]").textContent=format(duration);
  }
  setVolume(value){
    this.volume=clamp(value);
    const previous=load("music.settings",{});
    save("music.settings",{...previous,volume:this.volume});
    if(this.frame===null)this.audio.volume=this.gain;
    this.render();
  }
  async enterScene(id){
    const key=this.entry&&`${this.entry.v}/${this.entry.c}`;
    const scene=musicScenes[key]?.find(scene=>scene.id===id);
    if(!scene)return false;
    // A chapter can never be assigned a different track by a scene callback.
    if(scene.action==="track"&&scene.track!==chapterTracks[this.entry?.v]?.[this.entry?.c])return false;
    this.scene=scene;await this.setChapter(this.entry);return true;
  }
  exitScene(){this.scene=null;return this.setChapter(this.entry)}
  suspend(){
    // pagehide cannot await an animation. Pause immediately on leaving the reader.
    this.rememberPosition();this.intentVersion++;this.revision++;this.cancelFade();
    this.authorized=false;this.wanted=false;this.busy=false;this.audio.pause();
    if(activePlayer===this)activePlayer=null;
    this.render();
  }
  render(){
    const root=this.root,track=this.track,playing=!!track&&!this.audio.paused;
    root.hidden=!track;root.dataset.playing=String(playing);root.dataset.busy=String(this.busy);
    root.querySelector("[data-music-title]").textContent=track?track.title+(track.version?` · ${track.version}`:""):"";
    root.querySelector("[data-music-artist]").textContent=track?.artist||"";
    this.button.disabled=!track||!this.source(track);
    this.button.textContent=this.wanted?"❚❚ Пауза":"▶ Включить музыку";
    this.button.setAttribute("aria-label",this.wanted?"Поставить музыку на паузу":"Включить музыку");
    this.button.setAttribute("aria-pressed",String(this.wanted));
    this.slider.value=Math.round(this.volume*100);
    root.querySelector("[data-music-level]").textContent=`${Math.round(this.volume*100)}%`;
    root.querySelector("[data-music-status]").textContent=this.error||(this.busy&&this.wanted?"Плавный переход…":playing?"Играет · повтор":"Музыка на паузе");
    const mode=root.querySelector("[data-music-mode]");if(mode)mode.textContent=this.entry?.mode==="library"?"Ручной выбор · повтор":"Сопровождение главы · повтор";
    this.updateProgress();
    root.dispatchEvent(new CustomEvent("musicchange",{detail:{id:track?.id,playing,wanted:this.wanted,mode:this.entry?.mode||"chapter"}}));
  }
  destroy(){
    if(this.destroyed)return;
    this.destroyed=true;this.suspend();this.listeners.splice(0).forEach(remove=>remove());
    this.restorePending=null;this.pendingPlay=null;this.mediaVersion++;
    this.audio.removeAttribute("src");this.audio.load();
    if(audioOwners.get(this.audio)===this)audioOwners.delete(this.audio);
    if(this.root.musicPlayer===this)delete this.root.musicPlayer;
  }
}

export function initMusicPlayer(root=document.querySelector("#music-player")){
  if(!root)return null;
  return root.musicPlayer||(root.musicPlayer=new MusicPlayer(root));
}
