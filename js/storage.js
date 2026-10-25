const KEY="f40:";
export const load=(k,d)=>{try{const v=localStorage.getItem(KEY+k);return v===null?d:JSON.parse(v)}catch{return d}};
export const save=(k,v)=>{try{localStorage.setItem(KEY+k,JSON.stringify(v))}catch{}};
