import {getPaletteSync} from 'colorthief';
import {polar} from './color.mjs';

export function extractRoles(image) {
  const size=128;
  const canvas=document.createElement('canvas');canvas.width=canvas.height=size;
  const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.fillStyle='#ffffff';ctx.fillRect(0,0,size,size);ctx.drawImage(image,0,0,size,size);
  const data=ctx.getImageData(0,0,size,size).data;
  const lab=rgb=>{const [l,c,h]=polar(...rgb);return [l,c*Math.cos(h),c*Math.sin(h)];};
  const distance=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]);
  const palette=getPaletteSync(canvas,{colorCount:16,quality:1,colorSpace:'oklch',ignoreWhite:false}).map(c=>{
    const rgb=c.array();return {rgb,lab:lab(rgb),count:0,edge:0,salience:0,snap:Infinity,left:0,right:0};
  });
  const pixels=[];let chromatic=0,inside=0,ambientL=0,ambientA=0,ambientB=0;
  for(let i=0;i<size*size;i++){
    const rgb=[data[i*4],data[i*4+1],data[i*4+2]],p=lab(rgb);pixels.push(p);
    if(Math.hypot(p[1],p[2])>.04)chromatic++;
    const x=i%size,y=Math.floor(i/size);
    if(x>=16&&y>=16&&x<size-16&&y<size-16){inside++;ambientL+=p[0];ambientA+=p[1];ambientB+=p[2];}
  }
  for(let i=0;i<pixels.length;i++){
    const p=pixels[i],x=i%size,y=Math.floor(i/size);
    let nearest=0,min=Infinity;
    for(let c=0;c<palette.length;c++){const d=distance(p,palette[c].lab);if(d<min){min=d;nearest=c;}}
    const c=palette[nearest];c.count++;
    if(x<8)c.left++;if(x>=size-8)c.right++;
    if(x<8||y<8||x>=size-8||y>=size-8)c.edge++;
    const neighbors=[Math.max(0,y-4)*size+x,Math.min(size-1,y+4)*size+x,y*size+Math.max(0,x-4),y*size+Math.min(size-1,x+4)];
    c.salience+=neighbors.reduce((s,n)=>s+distance(p,pixels[n]),0)/neighbors.length;
    if(min<c.snap){c.snap=min;c.source=[data[i*4],data[i*4+1],data[i*4+2]];}
  }
  const colors=palette.filter(c=>c.count).map(c=>{
    const [l,chroma,h]=polar(...c.source);
    return {rgb:c.source,l,c:chroma,h:(h*180/Math.PI+360)%360,p:c.count/(size*size),edge:c.edge/(size*size),salience:c.salience/c.count,left:c.left/(size*8),right:c.right/(size*8)};
  });
  colors.sort((a,b)=>b.p-a.p);
  const background=colors.reduce((a,b)=>b.edge>a.edge?b:a,colors[0]);
  const ranked=colors.map(c=>({...c,score:Math.sqrt(c.p)*c.c*(.5+distance(lab(c.rgb),lab(background.rgb)))*(1+Math.min(1,c.salience/.08))})).sort((a,b)=>b.score-a.score);
  const expressive=ranked.filter(c=>c.c>.025&&c.p>.005);
  const neutral=colors.filter(c=>c.c<.035).sort((a,b)=>a.l-b.l)[0]||colors[0];
  const first=expressive[0];
  const lowConfidence=!first||(chromatic/(size*size)<.06&&first.c<.08);
  const accent=lowConfidence?neutral:first;
  const secondary=expressive.find(c=>c.p>.03&&c.c>.04&&distance(lab(c.rgb),lab(accent.rgb))>.1&&Math.abs(((c.h-accent.h+540)%360)-180)>45)||accent;
  let interior=[ambientL/inside,ambientA/inside,ambientB/inside];
  for(let iteration=0;iteration<24;iteration++){
    let total=0,l=0,a=0,b=0;
    for(let y=16;y<size-16;y++)for(let x=16;x<size-16;x++){
      const p=pixels[y*size+x],w=1/Math.max(1e-6,distance(p,interior));
      total+=w;l+=p[0]*w;a+=p[1]*w;b+=p[2]*w;
    }
    const next=[l/total,a/total,b/total];
    const movement=distance(interior,next);interior=next;
    if(movement<1e-5)break;
  }
  const ambient=colors.reduce((a,b)=>distance(lab(a.rgb),interior)<distance(lab(b.rgb),interior)?a:b);
  const base=lab(ambient.rgb);base[0]=interior[0];
  const baseChroma=Math.hypot(base[1],base[2]);
  const warmSubject=Math.max(0,base[2])/(Math.abs(base[2])+.01);
  let all=0,opposed=0,a=0,b=0;
  for(const color of colors){
    const target=lab(color.rgb),chroma=Math.hypot(target[1],target[2]);
    let left=0,right=0;
    for(const other of colors){const kernel=Math.exp(-(distance(target,lab(other.rgb))**2)/(2*.05**2));left+=other.left*kernel;right+=other.right*kernel;}
    const support=left*right;
    const coolContext=Math.max(0,-target[2])/(Math.abs(target[2])+.01);
    const separation=(baseChroma*chroma-(base[1]*target[1]+base[2]*target[2]))/(2*(baseChroma*chroma+.0001))*warmSubject*coolContext;
    const relevance=support*chroma*chroma;
    const weight=relevance*separation;
    all+=relevance+.0001*support;opposed+=weight;a+=target[1]*weight;b+=target[2]*weight;
  }
  const weight=all?1-(1-opposed/all)**4:0;
  const context=opposed?[base[0],a/opposed,b/opposed]:base;
  const mixed=base.map((v,i)=>v*(1-weight)+context[i]*weight);
  const contextChroma=Math.hypot(context[1],context[2]),chroma=baseChroma*(1-weight)+contextChroma*weight;
  for(const i of [1,2])mixed[i]=(base[i]/Math.max(1e-9,baseChroma)*(1-weight)+context[i]/Math.max(1e-9,contextChroma)*weight)*chroma;
  return {ambient:{l:interior[0],c:Math.hypot(mixed[1],mixed[2]),h:(Math.atan2(mixed[2],mixed[1])*180/Math.PI+360)%360},accent,secondary};
}
