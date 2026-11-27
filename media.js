import {escape as e} from './forms.js';

const maxImageLength=300000;
const maxAttachments=2;
const attachable=new Set(['attendance','leaves','admissions','renewals','mpe']);
const validImage=value=>typeof value==='string'&&value.length<=maxImageLength&&/^data:image\/jpeg;base64,[A-Za-z0-9+/]+=*$/.test(value);

export function attachmentFields(table,row,demo){
  if(!attachable.has(table)) return '';
  const items=(row.attachments||[]).filter(item=>validImage(item.data));
  return `<fieldset class="attachments"><legend>이미지 첨부</legend>${items.map(item=>`<details><summary>${e(item.name)} 보기</summary><img src="${e(item.data)}" alt="${e(item.name)}" loading="lazy"><label class="field check"><input type="checkbox" name="remove-image" value="${e(item.id)}"> 저장할 때 이 이미지 제거</label></details>`).join('')}${demo?'<label class="field check"><input type="checkbox" name="sample-image"> 가상 샘플 이미지 추가</label>':'<label class="field"><span>이미지 선택</span><input name="images" type="file" accept="image/*" multiple></label><p>기록당 이미지 최대 2장. 의사소견서 등은 권한 있는 위원만 열람할 수 있습니다.</p>'}</fieldset>`;
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
  if(keep.length+inputs.length+Number(sample)>maxAttachments) throw Error('이미지는 기록당 최대 2장까지 첨부할 수 있습니다.');
  if(sample) keep.push({id:crypto.randomUUID(),name:'가상 첨부 이미지.jpg',data:sampleImage()});
  for(const file of inputs) keep.push({id:crypto.randomUUID(),name:file.name.slice(0,120),data:await jpeg(file)});
  return keep;
}
export async function reportPng(text){
  const canvas=document.createElement('canvas');
  const ctx=canvas.getContext('2d');
  const width=720,padding=34,lineHeight=41;
  const rows=[];
  const [title,...lines]=text.split('\n');
  function wrap(line,font,color,step){
    ctx.font=font;
    let current='';
    for(const char of line){
      if(current&&ctx.measureText(current+char).width>width-padding*2){
        rows.push({text:current,font,color,step});current='';
      }
      current+=char;
    }
    rows.push({text:current,font,color,step});
  }
  wrap(title,'bold 32px system-ui','#a41533',53);
  for(const line of lines) wrap(line,'24px system-ui','#222233',line?lineHeight:18);
  const height=padding*2+rows.reduce((sum,row)=>sum+row.step,0);
  canvas.width=width*2;canvas.height=height*2;
  ctx.scale(2,2);ctx.fillStyle='white';ctx.fillRect(0,0,width,height);
  ctx.fillStyle='#b51232';ctx.fillRect(0,0,width,8);
  ctx.textBaseline='top';
  let y=padding;
  for(const row of rows){
    ctx.font=row.font;ctx.fillStyle=row.color;ctx.fillText(row.text,padding,y);y+=row.step;
  }
  return new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(Error('보고서 이미지를 만들 수 없습니다.')),'image/png'));
}
