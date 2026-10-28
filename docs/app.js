"use strict";
const slides=[
  "MediSync AI","발표 순서","주제 선정 이유","복약 관리에서 겪는 두 가지 어려움",
  "주요 기능","주요 기능 상세","개발 환경","개발 도구","4주 개발 계획","감사합니다"
];
const image=document.getElementById("slide"), counter=document.getElementById("counter");
const title=document.getElementById("slide-title"), previous=document.getElementById("previous"), next=document.getElementById("next");
const viewer=document.getElementById("viewer"), list=document.getElementById("slide-list");
const listButton=document.getElementById("toggle-list"), fullscreen=document.getElementById("fullscreen");
const errorMessage=document.getElementById("image-error"), notice=document.getElementById("notice");
let current=0, touchStart=null;
const path=i=>"slides/slide-"+String(i+1).padStart(2,"0")+".png";
function fromHash(){const m=location.hash.match(/^#slide-(\d+)$/);return m?Math.min(slides.length-1,Math.max(0,Number(m[1])-1)):0;}
function show(index,updateHash=true){
  current=Math.min(slides.length-1,Math.max(0,index));errorMessage.hidden=true;
  image.src=path(current);image.alt=(current+1)+"장: "+slides[current];
  counter.textContent=(current+1)+" / "+slides.length;title.textContent=slides[current];
  previous.disabled=current===0;next.disabled=current===slides.length-1;
  list.querySelectorAll("button").forEach((b,i)=>b.setAttribute("aria-current",String(i===current)));
  if(updateHash)history.replaceState(null,"","#slide-"+(current+1));
  if(current+1<slides.length){const preload=new Image();preload.src=path(current+1);}
}
slides.forEach((name,i)=>{
  const button=document.createElement("button");button.type="button";button.setAttribute("aria-label",(i+1)+"장: "+name);
  const thumb=document.createElement("img");thumb.src=path(i);thumb.alt="";thumb.loading="lazy";thumb.width=1280;thumb.height=720;
  const text=document.createElement("span");text.textContent=String(i+1).padStart(2,"0")+"  "+name;
  button.append(thumb,text);button.addEventListener("click",()=>show(i));list.append(button);
});
previous.addEventListener("click",()=>show(current-1));next.addEventListener("click",()=>show(current+1));
listButton.addEventListener("click",()=>{list.hidden=!list.hidden;listButton.setAttribute("aria-expanded",String(!list.hidden));});
image.addEventListener("error",()=>{errorMessage.hidden=false;});
window.addEventListener("hashchange",()=>show(fromHash(),false));
document.addEventListener("keydown",event=>{
  if(event.altKey||event.ctrlKey||event.metaKey||/INPUT|TEXTAREA|SELECT/.test(event.target.tagName))return;
  const actions={ArrowRight:()=>show(current+1),ArrowLeft:()=>show(current-1),Home:()=>show(0),End:()=>show(slides.length-1)};
  if(actions[event.key]){event.preventDefault();actions[event.key]();}
});
const stage=document.getElementById("stage");
stage.addEventListener("touchstart",e=>{touchStart=e.touches.length===1?{x:e.touches[0].clientX,y:e.touches[0].clientY}:null;},{passive:true});
stage.addEventListener("touchend",e=>{if(!touchStart)return;const dx=e.changedTouches[0].clientX-touchStart.x,dy=e.changedTouches[0].clientY-touchStart.y;if(Math.abs(dx)>55&&Math.abs(dx)>Math.abs(dy)*1.5)show(current+(dx<0?1:-1));touchStart=null;},{passive:true});
if(!document.fullscreenEnabled||!viewer.requestFullscreen)fullscreen.hidden=true;
fullscreen.addEventListener("click",async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await viewer.requestFullscreen();notice.textContent="";}catch{notice.textContent="이 브라우저에서 전체 화면을 열 수 없습니다.";}});document.addEventListener("fullscreenchange",()=>{fullscreen.textContent=document.fullscreenElement?"전체 화면 종료":"전체 화면";});
show(fromHash(),false);

