import {escape as e} from './forms.js?v=163a4122f0d9';

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
  '정상 출석':['#e5f5eb','#157044'],'병가':['#e5f0ff','#23559a'],'대리인':['#f1e8fb','#65409b'],
  '조퇴':['#e0f5f2','#126864'],'지각':['#fff0d6','#80530c'],'결석':['#fae5e9','#a41533'],'미확인':['#eceef2','#4d5265'],
};
export async function reportPng({title,date,total,rows,guests}){
  const canvas=document.createElement('canvas');
  const ctx=canvas.getContext('2d');
  const width=760,margin=32,tableWidth=width-margin*2;
  const statusWidth=155,countWidth=85,nameX=margin+statusWidth+countWidth;
  const nameWidth=tableWidth-statusWidth-countWidth;
  const lineHeight=28;
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
  const titleFont='bold 34px system-ui',bodyFont='21px system-ui',labelFont='bold 21px system-ui';
  const titleLines=wrap(title,tableWidth-38,titleFont);
  const headerHeight=62+titleLines.length*44;
  const attendance=rows.map(row=>{
    const lines=wrap(row.names.join(' · ')||'—',nameWidth-32,bodyFont);
    return {...row,lines,height:Math.max(58,24+lines.length*lineHeight)};
  });
  const guestsLayout=guests.map(row=>{
    const lines=wrap(row.names.join(' · '),tableWidth-190,bodyFont);
    return {...row,lines,height:Math.max(55,24+lines.length*lineHeight)};
  });
  const sumHeight=items=>items.reduce((sum,item)=>sum+item.height,0);
  const height=headerHeight+margin+86+26+54+sumHeight(attendance)+
    (guestsLayout.length?26+50+sumHeight(guestsLayout):0)+margin;
  canvas.width=width*2;canvas.height=height*2;
  ctx.scale(2,2);
  ctx.textBaseline='top';
  function rect(x,y,w,h,fill){ctx.fillStyle=fill;ctx.fillRect(x,y,w,h);}
  function text(value,x,y,font=bodyFont,color='#222332'){
    ctx.fillStyle=color;ctx.font=font;ctx.fillText(value,x,y);
  }
  function block(lines,x,y,font=bodyFont,color){
    lines.forEach((line,index)=>text(line,x,y+index*lineHeight,font,color));
  }
  rect(0,0,width,height,'#f6f6fa');
  rect(0,0,width,headerHeight,'#a91436');
  rect(0,0,9,headerHeight,'#e13d61');
  text('BNI MIDAS  /  MEMBERSHIP COMMITTEE',margin,21,'bold 15px system-ui','#ffdce5');
  titleLines.forEach((line,index)=>text(line,margin,48+index*44,titleFont,'white'));
  let y=headerHeight+margin;
  const summaryWidth=(tableWidth-12)/2;
  for(const [index,label,value] of [[0,'주간회의 날짜',date],[1,'총원',total+'명']]){
    const x=margin+index*(summaryWidth+12);
    rect(x,y,summaryWidth,86,'white');rect(x,y,4,86,'#b51232');
    text(label,x+18,y+13,'bold 17px system-ui','#5c6073');
    text(value,x+18,y+39,'bold 30px system-ui');
  }
  y+=112;
  rect(margin,y,tableWidth,54,'#25263c');
  text('출결 구분',margin+16,y+15,labelFont,'white');
  text('인원',margin+statusWidth+16,y+15,labelFont,'white');
  text('정상 출석 외 명단',nameX+16,y+15,labelFont,'white');
  y+=54;
  attendance.forEach(({status,count,lines,height},index)=>{
    const [bg,fg]=reportColors[status];
    rect(margin,y,tableWidth,height,index%2?'#fbfbfe':'white');
    rect(margin+12,y+13,statusWidth-24,32,bg);
    text(status,margin+22,y+17,'bold 18px system-ui',fg);
    text(count+'명',margin+statusWidth+16,y+17,labelFont,fg);
    block(lines,nameX+16,y+15);
    rect(margin+statusWidth,y,1,height,'#e6e7ef');
    rect(nameX,y,1,height,'#e6e7ef');
    rect(margin,y+height-1,tableWidth,1,'#e6e7ef');
    y+=height;
  });
  if(guestsLayout.length){
    y+=26;
    rect(margin,y,tableWidth,50,'#e9eaf3');
    text('디렉터 · 앰버서더 출결',margin+16,y+12,labelFont);
    y+=50;
    for(const {type,lines,height} of guestsLayout){
      rect(margin,y,tableWidth,height,'white');
      text(type,margin+16,y+15,labelFont);
      block(lines,margin+162,y+15);
      rect(margin,y+height-1,tableWidth,1,'#e6e7ef');
      y+=height;
    }
  }
  return new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(Error('보고서 이미지를 만들 수 없습니다.')),'image/png'));
}
