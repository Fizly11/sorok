import {load,save} from "./storage.js";
export const isRead=(v,c)=>load("reader.read",[]).includes(v+"/"+c);
export function recordRead(v,c,volumes){
  const volume=volumes.find(book=>book.id===v),chapter=volume?.chapters.find(ch=>ch.id===c);
  if(!chapter||chapter.kind==="frontmatter")return false;
  const read=load("reader.read",[]),key=v+"/"+c;
  if(read.includes(key))return false;
  read.push(key);save("reader.read",read);
  const sections=volume.chapters.filter(ch=>ch.kind!=="frontmatter");
  const progress=load("progress",{});progress[v]=Math.round(sections.filter(ch=>read.includes(v+"/"+ch.id)).length/sections.length*100);save("progress",progress);
  dispatchEvent(new Event("readingchange"));return true;
}
export function recordVisit(v,c){
  const history=load("reader.history",[]),last=history[0];
  if(last?.v===v&&last?.c===c)return;
  history.unshift({v,c,at:new Date().toISOString()});save("reader.history",history.slice(0,200));
}
