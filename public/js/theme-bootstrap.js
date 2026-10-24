"use strict";
(function(root){
 const doc=root.document?.documentElement;if(!doc)return;
 let theme="armory-ember";try{
  const old=root.localStorage.getItem("ocean.theme.v1"),accent=root.localStorage.getItem("ocean.accent.v1")??"cyan";
  theme=old==="ocean-light"?"armory-ivory":["ocean-dark","ocean-dusk"].includes(old)?(["cyan","jade","violet"].includes(accent)?"armory-cast":"armory-ember"):old;
  if(!["armory-ember","armory-cast","armory-ivory"].includes(theme))theme="armory-ember";
  for(const [key,allowed,initial] of [["crest",["keel","wave","anchor"],"keel"],["density",["comfortable","compact"],"comfortable"],["textSize",["default","large"],"default"]]){const value=root.localStorage.getItem("ocean.ui2."+key);doc.dataset[key]=allowed.includes(value)?value:initial;}
 }catch(_){}doc.dataset.theme=theme;
})(globalThis);
