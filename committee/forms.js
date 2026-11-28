import {visitorTypes,statuses,live} from './model.js?v=5c8210c6bbe1';
const f=(key,label,type='text',options)=>({key,label,type,options});
const name=(label='제목')=>f('name',label);
const date=(label='날짜')=>f('date',label,'date');
const notes=(label='특이사항')=>f('notes',label,'textarea');
const select=(key,label,...options)=>f(key,label,'select',options);
const member=(label='대상 멤버')=>f('member',label,'member');
const task=[name(),select('status','진행 상태','대기','진행 중','완료'),f('owner','담당 위원'),f('due','기한','date'),select('priority','우선순위','일반','긴급'),notes()];
export const scheduleFields=[name('일정명'),date('시작 날짜'),f('time','시작 시간','time'),f('endDate','종료 날짜','date'),f('endTime','종료 시간','time'),select('type','일정 구분','주간회의','멤버십 회의','챕터 행사','기타'),f('location','장소'),f('owner','담당'),notes('일정 메모')];
export const fields={
  board:task,other:task,
  meetings:[date('회의 날짜'),name('회의 제목')],
  members:[name('이름'),f('listeningNumber','경청표 번호','number'),f('company','회사명'),f('specialty','전문분야'),f('chapterRole','챕터 직무'),select('renewalMonth','갱신월','',...Array.from({length:12},(_,index)=>(index+1)+'월')),select('status','상태','활동','휴회','탈퇴'),f('joined','입회일','date'),f('expiry','갱신 만료일','date'),notes()],
  visitors:[name('성명'),date('주간회의 날짜'),select('type','방문 유형',...visitorTypes),f('company','회사명'),f('specialty','전문분야'),f('inviter','초청 멤버','member'),member('대리 참석 대상 멤버'),select('status','참석 상태','참석 예정','참석','불참'),notes(),f('followup','후속 관리','textarea')],
  attendance:[select('status','출결 상태',...statuses),f('early','지각과 동시에 조퇴','checkbox'),f('proxy','대리인 성명'),notes()],
  leaves:[member(),f('applied','신청일','date'),f('start','시작일','date'),f('end','종료일','date'),select('status','승인 여부','검토 중','승인','반려'),notes()],
  guests:[name('성명'),select('type','구분','디렉터','앰버서더')],
  admissions:[name('신청자'),date('심사 날짜'),f('company','회사명'),f('specialty','전문분야'),select('status','심사 상태','검토 중','승인','보류','반려'),f('owner','담당 위원'),notes('심사 의견')],
  renewals:[member(),date('결정 날짜'),select('status','갱신 상태','검토 중','승인','조건부 승인','보류','반려'),f('owner','담당 위원'),notes('승인 의견 및 조건')],
  votes:[name('투표 안건'),date('투표 날짜'),select('status','진행 상태','예정','진행 중','완료'),f('yes','찬성','number'),f('no','반대','number'),f('abstain','기권','number'),notes('결과 및 비고')],
  letters:[name('제목'),member(),date('발송 예정일'),select('status','진행 상태','작성 중','검토 중','발송 완료'),notes('레터 내용')],
  issues:[name('이슈 제목'),date('등록일'),member('관련 멤버'),select('status','진행 상태','접수','검토 중','해결'),select('priority','우선순위','일반','긴급'),f('owner','담당 위원'),notes('내용 및 조치')],
  visits:[name('챕터 또는 행사명'),date('방문 날짜'),member('참여 멤버'),select('type','구분','자방','개방'),select('status','상태','예정','완료','취소'),notes()],
  mpe:[date('평가 날짜'),f('owner','평가 담당 위원'),select('decision','갱신 승인 여부','미결정','승인','조건부 승인','보류','반려'),notes('인터뷰 내용'),f('opinion','평가 의견 및 특이사항','textarea')],
};
export const escape = value => String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
export function formFields(items,row,state){
  return items.map(field=>{
    const {key,label,type}=field;
    const value=row[key]??'';
    const required=['name','date','applied','start','end'].includes(key)?'required':'';
    let input;
    if(type==='textarea') input=`<textarea name="${key}" rows="3">${escape(value)}</textarea>`;
    else if(type==='member'||type==='select'){
      const options=type==='member'?[['','선택'],...live(state.members).map(m=>[m.id,m.name])]:field.options.map(label=>[label,label]);
      input=`<select name="${key}">${options.map(([id,label])=>`<option value="${escape(id)}" ${id===value?'selected':''}>${escape(label||'미등록')}</option>`).join('')}</select>`;
    } else if(type==='checkbox') input=`<input name="${key}" type="checkbox" ${value?'checked':''}>`;
    else input=`<input name="${key}" type="${type}" value="${escape(value)}" ${required} ${type==='number'?'min="0" step="1"':''}>`;
    return `<label class="field ${type==='checkbox'?'check':''}"><span>${label}</span>${input}</label>`;
  }).join('');
}
export function readFields(form,items){
  const data=new FormData(form);
  return Object.fromEntries(items.map(({key,type})=>[key,type==='checkbox'?data.has(key):type==='number'?(key==='listeningNumber'&&!data.get(key)?null:Number(data.get(key))):String(data.get(key)??'').trim()]));
}
