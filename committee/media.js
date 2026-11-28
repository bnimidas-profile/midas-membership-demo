import {escape as e} from './forms.js?v=ccdca8ff78fa';

const maxImageLength=300000;
const maxAttachments=10;
const attachable=new Set(['attendance','leaves','admissions','renewals','mpe']);
const validImage=value=>typeof value==='string'&&value.length<=maxImageLength&&/^data:image\/jpeg;base64,[A-Za-z0-9+/]+=*$/.test(value);

export function attachmentFields(table,row,demo){
  if(!attachable.has(table)) return '';
  const items=(row.attachments||[]).filter(item=>validImage(item.data));
  return `<fieldset class="attachments"><legend>이미지 첨부</legend>${items.map(item=>`<details><summary>${e(item.name)} 보기</summary><img src="${e(item.data)}" alt="${e(item.name)}" loading="lazy"><label class="field check"><input type="checkbox" name="remove-image" value="${e(item.id)}"> 저장할 때 이 이미지 제거</label></details>`).join('')}${demo?'<label class="field check"><input type="checkbox" name="sample-image"> 가상 샘플 이미지 추가</label>':'<label class="field"><span>이미지 선택</span><input name="images" type="file" accept="image/*" multiple></label><p>기록당 이미지 최대 10장. 의사소견서 등은 권한 있는 위원만 열람할 수 있습니다.</p>'}</fieldset>`;
}
async function jpeg(file){
  if(!file.type.startsWith('image/')||file.size>15_000_000) throw Error('15MB 이하의 이미지 파일을 선택하세요.');
  const url=URL.createObjectURL(file);
  try{
    const img=new Image();
    img.src=url;
    await img.decode().catch(()=>{throw Error('이미지를 열 수 없습니다. JPG 또는 PNG로 다시 선택하세요.');});
    const canvas=document.createElement('canvas');
    const context=canvas.getContext('2d');
    for(const size of [1600,1280,960]){
      const scale=Math.min(1,size/Math.max(img.width,img.height));
      canvas.width=Math.max(1,Math.round(img.width*scale));
      canvas.height=Math.max(1,Math.round(img.height*scale));
      context.fillStyle='white';
      context.fillRect(0,0,canvas.width,canvas.height);
      context.drawImage(img,0,0,canvas.width,canvas.height);
      const data=canvas.toDataURL('image/jpeg',0.78);
      if(validImage(data)) return data;
    }
    throw Error('이미지가 너무 복잡합니다. 문서 영역만 잘라 다시 선택하세요.');
  } finally {URL.revokeObjectURL(url);}
}
function sampleImage(){
  const canvas=document.createElement('canvas');
  canvas.width=600;canvas.height=220;
  const ctx=canvas.getContext('2d');
  ctx.fillStyle='#f5f5f8';ctx.fillRect(0,0,600,220);
  ctx.fillStyle='#ad1734';ctx.font='bold 32px system-ui';ctx.fillText('가상 첨부 이미지',36,90);
  ctx.fillStyle='#242433';ctx.font='22px system-ui';ctx.fillText('시연용 문서 · 실제 개인정보 없음',36,143);
  return canvas.toDataURL('image/jpeg',0.8);
}
export async function readAttachments(form,table,existing=[],demo){
  if(!attachable.has(table)) return undefined;
  const data=new FormData(form);
  const removed=data.getAll('remove-image');
  const keep=existing.filter(item=>!removed.includes(item.id));
  const inputs=demo?[]:data.getAll('images').filter(file=>file.size>0);
  const sample=demo&&data.has('sample-image');
  if(keep.length+inputs.length+Number(sample)>maxAttachments) throw Error('이미지는 기록당 최대 10장까지 첨부할 수 있습니다.');
  if(sample) keep.push({id:crypto.randomUUID(),name:'가상 첨부 이미지.jpg',data:sampleImage()});
  for(const file of inputs) keep.push({id:crypto.randomUUID(),name:file.name.slice(0,120),data:await jpeg(file)});
  return keep;
}
const reportColors={
  '정상 출석':['#e5f4eb','#176742'],'병가':['#e6f0fb','#24558c'],'대리인':['#f0e8fc','#593786'],
  '조퇴':['#e4f5f1','#1b6a5d'],'지각':['#fff0d9','#7d520f'],'결석':['#fae9ee','#972340'],
};
const meetingDateFormat=new Intl.DateTimeFormat('ko-KR',{
  year:'numeric',month:'long',day:'numeric',weekday:'short',timeZone:'UTC',
});
export async function reportPng({title,date,total,rows,guests}){
  const canvas=document.createElement('canvas');
  canvas.lang='ko';
  const ctx=canvas.getContext('2d');
  const width=720,margin=34,gap=16,cardWidth=(width-margin*2-gap)/2;
  const lineHeight=28,bodyFont='21px system-ui',labelFont='bold 20px system-ui';
  const titleFont='bold 39px system-ui';
  function wrap(value,maxWidth,font){
    ctx.font=font;
    const lines=[];
    let line='';
    for(const part of value.split(/(?<=\s)/u)){
      if(line&&ctx.measureText(line+part).width>maxWidth){lines.push(line.trimEnd());line='';}
      for(const char of part){
        if(line&&ctx.measureText(line+char).width>maxWidth){lines.push(line.trimEnd());line='';}
        if(line||char!==' ') line+=char;
      }
    }
    return [...lines,line.trimEnd()];
  }
  const titleLines=wrap(title,width-margin*2-56,titleFont);
  const headerHeight=220+Math.max(0,titleLines.length-1)*48;
  const makeGrid=items=>{
    const grid=[];
    for(let i=0;i<items.length;i+=2){
      const cards=items.slice(i,i+2).map(item=>({
        ...item,lines:wrap(item.names.join(' · ')||'—',cardWidth-44,bodyFont),
      }));
      const height=Math.max(163,...cards.map(({lines})=>118+lines.length*lineHeight));
      grid.push({cards,height});
    }
    return grid;
  };
  const attendanceGrid=makeGrid(rows);
  const guestsGrid=makeGrid(guests);
  const gridHeight=grid=>grid.reduce((height,row)=>height+row.height+gap,0);
  const guestsHeadingHeight=52;
  const height=32+headerHeight+20+gridHeight(attendanceGrid)+
    (guestsGrid.length?guestsHeadingHeight+gridHeight(guestsGrid):0)+margin-gap;
  canvas.width=width*2;
  canvas.height=height*2;
  ctx.scale(2,2);
  ctx.textBaseline='top';
  function roundedRect(x,y,w,h,radius,fill,outline){
    ctx.beginPath();
    ctx.roundRect(x,y,w,h,radius);
    ctx.fillStyle=fill;
    ctx.fill();
    if(outline){ctx.strokeStyle=outline;ctx.lineWidth=2;ctx.stroke();}
  }
  function text(value,x,y,font,color,align='left'){
    ctx.fillStyle=color;
    ctx.font=font;
    ctx.textAlign=align;
    ctx.fillText(value,x,y);
  }
  ctx.fillStyle='#f7f3f5';
  ctx.fillRect(0,0,width,height);
  roundedRect(margin,32,width-margin*2,headerHeight,26,'#ab1232');
  const headerX=margin+28,right=width-headerX;
  text('BNI',headerX,55,'bold 29px system-ui','white');
  text('membership',headerX+69,63,'bold 18px system-ui','white');
  titleLines.forEach((line,index)=>text(line,headerX,106+index*48,titleFont,'white'));
  const meeting=new Date(date+'T00:00:00Z');
  const formattedDate=Number.isNaN(meeting.getTime())?date:meetingDateFormat.formatToParts(meeting)
    .map(({type,value})=>type==='weekday'?'('+value+')':value).join('');
  text(formattedDate,headerX,headerHeight-39,'22px system-ui','#f9dfe8');
  text('총원 '+total+'명',right,headerHeight-43,'bold 26px system-ui','white','right');

  let y=32+headerHeight+20;
  function drawGrid(grid){
    for(const row of grid){
      row.cards.forEach(({status,type,count,lines},index)=>{
        const title=status||type;
        const [bg,fg]=reportColors[title]||['#f9edf1','#ab1232'];
        const x=margin+index*(cardWidth+gap);
        roundedRect(x,y,cardWidth,row.height,22,'white','#e9e2e6');
        roundedRect(x+19,y+19,140,39,14,bg);
        text(title,x+89,y+27,labelFont,fg,'center');
        if(count!==undefined) text(count+'명',x+cardWidth-23,y+20,'bold 27px system-ui',fg,'right');
        lines.forEach((line,index)=>text(line,x+22,y+94+index*lineHeight,bodyFont,'#514b54'));
      });
      y+=row.height+gap;
    }
  }
  drawGrid(attendanceGrid);
  if(guestsGrid.length){
    text('디렉터 · 앰버서더 출결',margin,y+7,'bold 24px system-ui','#241e26');
    y+=guestsHeadingHeight;
    drawGrid(guestsGrid);
  }
  return new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(Error('보고서 이미지를 만들 수 없습니다.')),'image/png'));
}
