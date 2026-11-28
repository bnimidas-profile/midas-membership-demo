import {calendarDays,shiftCalendarMonth,memberPatchChanges,orderedMembers,upcomingMeeting,upcomingMeetingDetails,weeklyMeetingTime,attendanceReport,attendanceFor,attendanceTotals,config,entries,live,localDate,meetingParticipants,menus,nextMeeting,renewalTargets,reportText,scoreInfo,statuses,workbookChanges} from './model.js';
import {escape as e,fields,formFields,readFields,scheduleFields} from './forms.js';
import {openStore} from './storage.js';
import {attachmentFields,readAttachments,reportPng} from './media.js';

const app=document.querySelector('#app');
const dialog=document.querySelector('#dialog');
let store,state,meeting,query='',mpeMember='',attendanceMode='meeting',historyMode='meetings',renewalFilter='all';
let meetingPinned=false,lastUpcoming,calendarMonth;
let promptInstall,reportFile,reportUrl,reportRevision=0;
let toastTimer;
window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();promptInstall=event;});
const admin=()=>store.role==='admin';
const nameOf=id=>state.members.find(row=>row.id===id)?.name||'';
const route=()=>location.hash.slice(1)||'home';
const go=id=>{query='';mpeMember='';if(route()===id)render();else location.hash=id;};
const icon=(symbol)=>`<span class="symbol" aria-hidden="true">${symbol}</span>`;
const btn=(label,action,cls='secondary')=>`<button type="button" class="${cls}" data-action="${e(action)}">${label}</button>`;
const empty=label=>`<div class="empty">${label}</div>`;
const search=label=>`<label class="search"><span aria-hidden="true">⌕</span><input type="search" id="search" placeholder="${label}" aria-label="${label}" value="${e(query)}"></label>`;
const dateInput=()=>`<label class="date-field">주간회의 날짜 <input type="date" id="meeting" value="${e(meeting)}"></label>`;
const visible=()=>config(state).menu.filter(id=>entries.some(([key])=>key===id));
const canOpen=id=>['home','all','alerts','schedule'].includes(id)||id==='history'&&admin()||id==='settings'&&admin()||visible().includes(id);
function notify(message){
  const toast=document.querySelector('#toast');
  toast.textContent=message;
  clearTimeout(toastTimer);
  toastTimer=setTimeout(()=>toast.textContent='',4000);
}
function clearReport(){
  reportRevision++;
  if(reportUrl) URL.revokeObjectURL(reportUrl);
  reportFile=reportUrl=undefined;
}
function closeDialog(){
  if(dialog.querySelector('#report-image')) clearReport();
  if(dialog.open) dialog.close();
}
dialog.addEventListener('close',()=>{if(!dialog.open&&dialog.querySelector('#report-image')) clearReport();updateMeetingDate();});
function modal(title,body,onSubmit,submit='저장'){
  closeDialog();
  dialog.innerHTML=`<form><div class="dialog-head"><h2>${title}</h2>${btn('×','close','icon-button')}</div><div class="dialog-body">${body}</div><div class="form-error" role="alert"></div><footer>${btn('닫기','close')} ${onSubmit?`<button class="primary" type="submit">${submit}</button>`:''}</footer></form>`;
  if(onSubmit) dialog.querySelector('form').onsubmit=async event=>{
    event.preventDefault();
    const button=event.currentTarget.querySelector('[type=submit]');
    button.disabled=true;
    try {await onSubmit(event.currentTarget);closeDialog();}
    catch(error){dialog.querySelector('.form-error').textContent=error.message;button.disabled=false;}
  };
  dialog.showModal();
  dialog.querySelectorAll('textarea[name="agenda-detail"]').forEach(resizeAgenda);
}
async function save(changes){
  state=await store.save(changes);
  render();
  notify('저장했습니다.');
}
const upsert=(table,row)=>({table,row});
function header(){
  return `<header class="top"><div class="top-inner"><button class="brand" data-action="go:home" aria-label="홈"><img class="brand-icon" src="icon-192.png?v=5" alt="BNI membership" width="54" height="54"><span><strong>미다스챕터</strong><small>멤버십위원회</small></span></button><div class="top-actions"><button class="icon-button bell" data-action="go:alerts" aria-label="알림"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9m-8 12a2 2 0 0 0 4 0"/></svg></button> <button class="icon-button" data-action="go:all" aria-label="전체 메뉴">☰</button></div></div></header>`;
}
function nav(){
  return `<nav class="bottom" aria-label="주 메뉴"><div>${[['home','홈','⌂'],['board','업무','▤'],['members','멤버','♙'],['mpe','심사','☆'],['all','전체','⊞']].filter(([id])=>canOpen(id)).map(([id,label,symbol])=>`<button data-action="go:${id}" ${route()===id?'aria-current="page"':''}>${icon(symbol)}<span>${label}</span></button>`).join('')}</div></nav>`;
}
const heading=(title,description='')=>`<div class="page-head"><h1>${title}</h1>${description?`<p>${description}</p>`:''}</div>`;
const section=(title,body,extra='')=>`<section><div class="section-head"><h2>${title}</h2>${extra}</div>${body}</section>`;
const prettyDate=date=>date?new Intl.DateTimeFormat('ko-KR',{month:'long',day:'numeric',weekday:'short',timeZone:'UTC'}).format(new Date(date+'T00:00:00Z')):'미정';
const statusColors={'정상 출석':'green','참석':'green','완료':'green','승인':'green','조건부 승인':'amber','활동':'green','충족':'green','병가':'blue','대리인':'violet','조퇴':'teal','지각':'amber','결석':'red','불참':'red','보완 필요':'red','미확인':'gray'};
const statusPill=status=>status?`<span class="pill ${statusColors[status]||''}">${e(status)}</span>`:'';
function rowCard(title,sub,action,end=''){
  return `<button class="list-row" data-action="${e(action)}"><span><strong>${e(title)}</strong><small>${e(sub)}</small></span><span class="row-end">${end}<span class="chevron">›</span></span></button>`;
}
const urgent=()=>[...live(state.board),...live(state.issues)].filter(row=>row.priority==='긴급'&&!['완료','해결'].includes(row.status));
function metricCard([id,label,value,unit,symbol,detail]){
  return `<button class="metric" data-action="go:${id}" aria-label="${label} ${value}${unit}"><div class="metric-top">${icon(symbol)}<span class="chevron">↗</span></div><span class="metric-label">${label}</span><strong>${value}<small>${unit}</small></strong><span class="metric-detail">${detail}</span></button>`;
}
function dashboard(){
  const planned=upcomingMeetingDetails(state);
  const date=planned.date;
  const members=live(state.members).filter(row=>row.status==='활동');
  const board=live(state.board);
  const waiting=renewalTargets(state).filter(member=>!live(state.mpe).some(row=>row.member===member.id&&row.cycle===member.expiry&&row.status==='완료'));
  const metrics=[
    ['members','전체 멤버',members.length,'명','♙','활동 멤버 기준'],
    ['admissions','신규 입회 심사',live(state.admissions).filter(row=>['검토 중','보류'].includes(row.status)).length,'건','＋','검토 또는 보류'],
    ['renewals','갱신 대상 멤버',renewalTargets(state).length,'명','↻','만료 90일 이내 및 만료 멤버'],
    ['mpe','MPE 평가 대기',waiting.length,'명','☆','완료되지 않은 평가'],

  ];
  return `<div class="welcome"><div><h1>멤버십 대시보드</h1><p>미다스챕터 멤버십위원회 전용 업무관리 서비스</p></div>${statusPill(store.demo?'가상 데이터':admin()?'관리자':'위원')}</div>${store.demo?'<p class="demo-note">시연 모드 · 실제 회원 정보는 입력하지 마세요.</p>':''}
  <div class="hero"><div class="hero-art" aria-hidden="true"></div><div class="hero-info"><span class="hero-label">◷　다음 주간회의</span><h2>${prettyDate(date)} · ${e(planned.time||weeklyMeetingTime)}</h2><p>한국시간 · 주간회의${planned.location?' · '+e(planned.location):''}</p></div><div class="hero-actions">${canOpen('attendance')?btn('출결 기록　→','go:attendance','hero-button'):''}${btn('주간보고 만들기　↗','report','hero-outline')}</div></div>
  ${calendar()}
  ${section('운영 현황',`<div class="metrics">${metrics.filter(([id])=>canOpen(id)).map(metricCard).join('')}</div><div class="dashboard-shortcuts">${[
    ['meetings','멤버십 회의',live(state.meetings).length,'건','▣','회의록 바로 가기'],
    ['board','업무보드',board.length,'건','▤','전체 업무 바로 가기'],
  ].filter(([id])=>canOpen(id)).map(metricCard).join('')}</div>`)}
  <div class="lower-grid">${section('긴급 확인 사항',urgent().length?urgent().slice(0,3).map(row=>rowCard(row.name,row.due||row.date||'일정 미정','go:alerts',statusPill('긴급'))).join(''):empty('긴급 확인 사항이 없습니다.'),btn('전체 보기','go:alerts','text-button'))}
  ${section('최근 수정 이력',state.audit.length?state.audit.slice(-3).reverse().map(row=>rowCard(row.after?.name||nameOf(row.after?.member)||labelOf(row.table),new Date(row.date).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'})+' · '+row.actor,'audit:'+row.id)).join(''):empty('아직 수정 이력이 없습니다.'),canOpen('history')?btn('전체 보기','history:all','text-button'):'')}</div>`;
}
const labelOf=id=>entries.find(([key])=>key===id)?.[1]||({leaves:'병가',guests:'디렉터·앰버서더'})[id]||id;
function allMenus(){
  return heading('전체 메뉴')+`<div class="toolbar">${btn('챕터 일정표','go:schedule')}</div>`+menus.map(([group,items])=>section(group,`<div class="menu-grid">${[...items].sort((a,b)=>visible().indexOf(a[0])-visible().indexOf(b[0])).filter(([id])=>visible().includes(id)||id==='settings'&&admin()).map(([id,label,symbol])=>btn(icon(symbol)+e(label),'go:'+id,'menu-tile')).join('')}</div>`)).join('');
}
function listContent(table){
  const records=table==='members'?orderedMembers(state):live(state[table]).filter(row=>table!=='other'||row.kind!=='chapter-schedule');
  const candidates=table==='renewals'&&renewalFilter==='conditional'?records.filter(row=>row.status==='조건부 승인'):records;
  const filtered=candidates.filter(row=>[row.name,nameOf(row.member),row.listeningNumber,row.company,row.status,row.type,row.date,row.notes].join(' ').toLowerCase().includes(query.toLowerCase()));
  return filtered.length?filtered.map(row=>rowCard((table==='members'&&row.listeningNumber?row.listeningNumber+'. ':'')+(row.name||nameOf(row.member)||'기록'),[row.type,row.date||row.due,row.company||row.owner].filter(Boolean).join(' · '),'edit:'+table+':'+row.id,statusPill(row.status))).join(''):empty('표시할 기록이 없습니다.');
}
function generic(table){
  const targets=table==='renewals'&&renewalFilter==='all'?section('갱신 대상 멤버',renewalTargets(state).map(row=>rowCard(row.name,'만료일 '+row.expiry,'renewal:'+row.id)).join('')||empty('갱신 대상자가 없습니다.')):'';
  const create=table==='members'&&!admin()?'':btn('＋ 새 기록','edit:'+table,'primary');
  const tabs=table==='renewals'?`<div class="tabs">${btn('전체 기록','renewal-filter:all',renewalFilter==='all'?'selected':'secondary')}${btn('조건부 승인','renewal-filter:conditional',renewalFilter==='conditional'?'selected':'secondary')}</div>`:'';
  return heading(labelOf(table))+tabs+`<div class="toolbar">${search('이름 또는 기록 검색')}${create}</div><div id="results">${listContent(table)}</div>${targets}`;
}
function resizeAgenda(input){
  input.style.height='auto';
  const borders=input.offsetHeight-input.clientHeight;
  input.style.height=(input.scrollHeight+borders)+'px';
}
function agendaFields(item={}){
  return `<fieldset class="agenda-item"><legend>안건</legend><label class="field">안건 제목<input name="agenda-title" required value="${e(item.title)}"></label><label class="field">논의 내용 및 결정 사항<textarea name="agenda-detail" rows="3">${e(item.detail)}</textarea></label>${btn('안건 제거','remove-agenda','text-button')}</fieldset>`;
}
function meetingFields(row){
  const checked=new Set(row.attendeeIds||[]);
  const members=meetingParticipants(state);
  const agendas=row.agendas?.length?row.agendas:[{title:row.agenda||(row.notes?'이전 회의 내용':''),detail:row.notes||''}];
  return formFields(fields.meetings,row,state)+
    `<fieldset class="meeting-attendees"><legend>참석자 체크 · 부의장 및 멤버십위원</legend>${members.map(member=>`<label><input type="checkbox" name="attendees" value="${e(member.id)}" ${checked.has(member.id)?'checked':''}> ${e(member.name)} <small>${e([member.chapterRole,member.committeeDuty].filter(Boolean).join(' · '))}</small></label>`).join('')||'<p>멤버현황에서 부의장 또는 멤버십 직무를 지정하세요.</p>'}</fieldset>`+
    (row.attendees?`<p class="muted">이전 참석자 기록 · ${e(row.attendees)}</p>`:'')+
    `<h3>안건별 회의 내용</h3><div id="agendas">${agendas.map(agendaFields).join('')}</div>${btn('＋ 안건 추가','add-agenda')}`+
    (row.sourceHistory?.length?`<details><summary>원본 수정 이력 ${row.sourceHistory.length}건</summary>${row.sourceHistory.map(change=>`<p>${e(change.date)} · ${e(change.field)}<br>수정 전 · ${e(change.before)}<br>수정 후 · ${e(change.after)}</p>`).join('')}</details>`:'');
}
function guestAttendance(){
  const records=live(state.guests);
  const today=records.filter(row=>row.date===meeting);
  const regular=records.filter(row=>!row.date);
  const rows=[...regular.map(person=>({
    person,
    record:today.find(row=>row.guestId===person.id)||today.find(row=>!row.guestId&&row.name===person.name&&row.type===person.type),
  })),...today.filter(row=>!regular.some(person=>row.guestId===person.id||!row.guestId&&row.name===person.name&&row.type===person.type)).map(row=>({person:row,record:row}))];
  return rows.map(({person,record})=>`<div class="guest-row"><div><button type="button" class="text-button guest-name" data-action="edit:guests:${e(person.id)}">${e(person.name)}</button><small>${e(person.type)}</small></div><div class="guest-options" role="group" aria-label="${e(person.name)} 참석 여부">${['참석','불참'].map(status=>`<button type="button" class="secondary guest-choice ${record?.status===status?statusColors[status]:''}" aria-pressed="${record?.status===status}" data-action="guest:${e(person.id)}:${status}">${status}</button>`).join('')}</div></div>`).join('')||empty('이름을 등록하면 회의 날짜별로 참석을 체크할 수 있습니다.');
}
function edit(table,id='',defaults={}){
  const existing=state[table].find(row=>row.id===id);
  if(table==='members'&&!admin()){if(existing) modal(e(existing.name),`<p>${e(existing.company)} · ${e(existing.specialty)}</p><p>경청표 번호 ${e(existing.listeningNumber||'미등록')} · 챕터 직무 ${e(existing.chapterRole||'미등록')} · 갱신월 ${e(existing.renewalMonth||'미등록')}</p><p>갱신 만료일 ${e(existing.expiry||'미등록')}</p>`);return;}
  const row=existing||{id:crypto.randomUUID(),date:meeting,applied:localDate(),...defaults};
  const isSchedule=table==='other'&&row.kind==='chapter-schedule';
  const inputs=isSchedule?scheduleFields:fields[table];
  const weekly=isSchedule&&(row.type==='주간회의'||row.regularDate);
  const meetingOption=weekly?btn(row.cancelled?'주간회의 다시 표시':'이 날 주간회의 없음','weekly-toggle:'+row.date+':'+row.id):'';
  const trash=existing&&admin()&&!weekly?`<div class="editor-meta">등록 ${e(existing.createdBy||'샘플')} · 수정 ${e(existing.updatedBy||'—')} ${btn('휴지통으로 이동','delete:'+table+':'+existing.id,'danger')}</div>`:'';
  modal(e(isSchedule?'챕터 일정':labelOf(table))+(existing||row.regularDate?' 수정':' 등록'),(table==='meetings'?meetingFields(row):formFields(inputs,row,state))+attachmentFields(table,row,store.demo)+meetingOption+trash,async form=>{
    const updated={...row,...readFields(form,inputs)};
    if('name' in updated&&!updated.name) throw Error('이름 또는 제목을 입력하세요.');
    if(table==='members'&&updated.listeningNumber!==null){
      if(!Number.isInteger(updated.listeningNumber)||updated.listeningNumber<1) throw Error('경청표 번호는 1 이상의 정수로 입력하세요.');
      if(live(state.members).some(member=>member.id!==row.id&&Number(member.listeningNumber)===updated.listeningNumber)) throw Error('이미 사용 중인 경청표 번호입니다.');
    }
    if(isSchedule){
      if(weekly&&updated.type!=='주간회의'){
        throw Error('주간회의를 변경하려면 일정 구분을 주간회의로 유지하세요.');
      }
      if(weekly&&!updated.regularDate&&updated.date!==row.date&&new Date(row.date+'T00:00:00Z').getUTCDay()===3){
        updated.regularDate=row.date;
      }
      calendarMonth=updated.date.slice(0,7);
    }
    if(table==='meetings'){
      const data=new FormData(form);
      const eligible=new Set(meetingParticipants(state).map(member=>member.id));
      const previous=(row.attendeeIds||[]).filter(id=>!eligible.has(id));
      updated.attendeeIds=[...new Set([...previous,...data.getAll('attendees').filter(id=>eligible.has(id))])];
      updated.agendas=data.getAll('agenda-title').map((title,index)=>({title:title.trim(),detail:data.getAll('agenda-detail')[index].trim()}));
      if(!updated.agendas.length||updated.agendas.some(item=>!item.title)) throw Error('안건 제목을 하나 이상 입력하세요.');
    }
    if(table==='guests'&&!existing){
      if(live(state.guests).some(record=>!record.date&&record.name===updated.name&&record.type===updated.type)) throw Error('이미 등록된 이름입니다.');
      updated.date='';
    }
    if(table==='visitors'){
      if(updated.type!=='대리인') updated.member='';
      if(updated.type==='대리인'&&!updated.member) throw Error('대리 참석 대상 멤버를 선택하세요.');
      if(updated.type==='대리인'&&updated.status==='참석'&&live(state.visitors).some(v=>v.id!==row.id&&v.type==='대리인'&&v.status==='참석'&&v.date===updated.date&&v.member===updated.member)) throw Error('이 멤버의 대리 참석이 이미 등록되어 있습니다.');
    }
    if(['leaves','renewals','letters'].includes(table)&&!updated.member) throw Error('대상 멤버를 선택하세요.');
    if(table==='leaves'&&updated.end<updated.start) throw Error('종료일은 시작일 이후여야 합니다.');
    if(table==='attendance'){
      updated.early=updated.status==='지각'&&updated.early;
      if(updated.status==='대리인'&&!updated.proxy) throw Error('대리인 성명을 입력하세요.');
    }
    const attachments=await readAttachments(form,table,row.attachments,store.demo);
    if(attachments) updated.attachments=attachments;
    await save([upsert(table,updated)]);
  });
}
function attendance(){
  const members=live(state.members).filter(row=>row.status==='활동');
  const {counts}=attendanceTotals(state,meeting,members);
  let content;
  if(attendanceMode==='leave') content=section('병가 신청',listContent('leaves'),btn('＋ 병가 등록','edit:leaves','primary'));
  else if(attendanceMode==='stats') content=section('개인별 출결 통계',members.map(member=>rowCard(member.name,member.company,'stats:'+member.id)).join('')||empty('멤버를 먼저 등록하세요.'));
  else content=`<div class="toolbar">${dateInput()}${btn('일괄 출석','bulk','secondary')}${btn('주간보고','report','primary')}</div><div class="counts">${statuses.map(status=>`<span class="pill ${statusColors[status]}">${status} <strong>${counts[status]}</strong></span>`).join('')}</div>`+
    section('디렉터 · 앰버서더',guestAttendance(),btn('＋ 이름 등록','edit:guests'))+
    section('멤버 출결',members.map(member=>{const row=attendanceFor(state,meeting,member.id);return rowCard(member.name,[row.proxy,row.early&&row.status==='지각'?'조퇴도 기록됨':''].filter(Boolean).join(' · '),'attendance:'+member.id,statusPill(row.status));}).join('')||empty('멤버를 먼저 등록하세요.'));
  return heading('출결·병가','회의 날짜별 출결과 개인별 이력을 관리합니다.')+`<div class="tabs">${[['meeting','주간 출결'],['leave','병가'],['stats','개인 통계']].map(([id,label])=>btn(label,'mode:'+id,attendanceMode===id?'selected':'secondary')).join('')}</div>`+content;
}
function stats(member,months=1){
  const end=localDate();
  const cutoff=new Date(end+'T00:00:00Z');
  const day=cutoff.getUTCDate();
  cutoff.setUTCDate(1); cutoff.setUTCMonth(cutoff.getUTCMonth()-months);
  const lastDay=new Date(Date.UTC(cutoff.getUTCFullYear(),cutoff.getUTCMonth()+1,0)).getUTCDate();
  cutoff.setUTCDate(Math.min(day,lastDay));
  const start=cutoff.toISOString().slice(0,10);
  const dates=[...new Set([...live(state.attendance),...live(state.visitors),...live(state.guests)].map(row=>row.date))].filter(date=>date>=start&&date<=end).sort().reverse();
  const rows=dates.map(date=>({date,...attendanceFor(state,date,member)}));
  modal(e(nameOf(member))+' 출결 이력',`<div class="tabs">${[1,3,6,12].map(n=>btn(n===12?'1년':n+'개월','stats:'+member+':'+n,n===months?'selected':'secondary')).join('')}</div><div class="counts">${statuses.map(status=>`<span>${status} <strong>${rows.filter(row=>row.status===status).length}</strong></span>`).join('')}</div>`+(rows.map(row=>`<p class="stat-line"><strong>${e(row.date)}</strong> ${e(row.status)} ${row.early&&row.status==='지각'?'· 조퇴':''} ${e(row.proxy||'')}</p>`).join('')||empty('기간 내 회의 기록이 없습니다.')));
}
function mpeList(){
  const members=live(state.members).filter(row=>renewalTargets(state).some(m=>m.id===row.id)||live(state.mpe).some(m=>m.member===row.id));
  return members.filter(row=>row.name.toLowerCase().includes(query.toLowerCase())).map(row=>{
    const evaluation=live(state.mpe).find(m=>m.member===row.id&&m.cycle===row.expiry);
    const info=evaluation?scoreInfo(evaluation.criteria,evaluation.scores):null;
    return rowCard(row.name,'만료일 '+(row.expiry||'미등록')+(info?' · '+info.answered+'/'+evaluation.criteria.length+' 항목':''),'mpe:'+row.id,statusPill(evaluation?.assessment)+statusPill(evaluation?.status||'미완료'));
  }).join('')||empty('조건에 맞는 갱신 대상자가 없습니다.');
}
function mpeScreen(){
  if(!mpeMember) return heading('갱신심사 및 MPE','갱신 대상 멤버의 평가와 진행 상태를 확인합니다.')+`<div class="toolbar">${search('멤버 이름 검색')}</div><div id="results">${mpeList()}</div>`;
  const member=state.members.find(row=>row.id===mpeMember);
  if(!member) return empty('멤버를 찾을 수 없습니다.');
  const settings=config(state);
  const existing=live(state.mpe).find(row=>row.member===member.id&&row.cycle===member.expiry);
  const row=existing||{id:crypto.randomUUID(),member:member.id,cycle:member.expiry,date:localDate(),criteria:settings.criteria,confirmed:settings.confirmed,mpeMinimum:settings.mpeMinimum,scores:{}};
  const info=scoreInfo(row.criteria,row.scores);
  const minimum=row.mpeMinimum;
  return `${btn('← 평가 대상 목록','mpeback','text-button')}${heading(e(member.name),'갱신 MPE 평가')}${!row.confirmed?'<div class="notice">임시 평가표입니다. 실제 8개 항목과 배점을 확인한 뒤 설정에서 교체하세요.</div>':''}
    <form id="mpe-form" data-member="${e(member.id)}"><div class="panel eval-progress"><div><strong id="score">${minimum?'충족 '+info.total+' / '+row.criteria.length+' 항목':info.total+' / '+info.max+'점'}</strong><span id="progress-label">${info.answered} / ${row.criteria.length} 항목</span></div><progress id="progress" value="${info.answered}" max="${row.criteria.length||1}"></progress>${minimum?`<p>스프레드시트 기준 · ${minimum}개 이상 충족</p>`:''}</div>
    ${row.criteria.map((item,i)=>`<fieldset class="panel criterion"><legend>${e(item.name)}</legend><div class="score-options">${item.scores.map(score=>`<label><input type="radio" name="score-${i}" value="${e(score)}" ${row.scores[i]===score?'checked':''}><span>${minimum?(score===1?'충족':'미충족'):e(score)}</span></label>`).join('')}</div></fieldset>`).join('')}
    <div class="panel form-panel"><fieldset class="assessment"><legend>MPE 종합 판정</legend><div class="score-options">${['충족','보완 필요'].map(value=>`<label><input type="radio" name="assessment" value="${value}" ${row.assessment===value?'checked':''}><span class="${statusColors[value]}">${value}</span></label>`).join('')}</div></fieldset>${formFields(fields.mpe,row,state)}${attachmentFields('mpe',row,store.demo)}</div><div class="toolbar">${btn('출결 이력','stats:'+member.id)}${btn('평가 이력','mpehistory:'+member.id)}<button name="mode" value="draft" class="secondary">임시 저장</button><button name="mode" value="complete" class="primary">완료 처리</button></div><p class="form-error" role="alert"></p></form>`;
}
function readScores(form,criteria){
  const data=new FormData(form);
  return Object.fromEntries(criteria.flatMap((_,i)=>data.has('score-'+i)?[[i,Number(data.get('score-'+i))]]:[]));
}
function settings(){
  const cfg=config(state);
  const actions=[['평가 항목과 배점','criteria'],['메뉴 표시와 순서','menu'],['회의 날짜와 보고서 양식','preferences'],['백업 다운로드','backup'],['백업 기록 복구','import'],['휴지통과 복구','trash'],['전체 변경 이력','history:all'],['위원 권한 관리','roles'],['홈 화면에 설치','install']];
  return heading('설정',store.demo?'가상 데이터 작업 공간':'승인된 위원 작업 공간')+
    (admin()?actions.map(([label,action])=>rowCard(label,'',action)).join(''):rowCard('홈 화면에 설치','','install'))+
    (store.logout?rowCard('로그아웃','','logout'):'')+
    `<p class="muted">평가 기준 ${cfg.confirmed?'확정':'임시'} · 서비스 공식 표시와 독립된 위원회 업무 공간</p>`;
}
function settingsModal(kind){
  const cfg=config(state);
  if(kind==='criteria'){
    modal('MPE 평가표',`<p class="notice">변경한 배점은 새 평가에 적용됩니다. 기존 평가에는 당시 기준을 보관합니다.</p>${Array.from({length:8},(_,i)=>`<div class="form-panel"><strong>${i+1}번 항목</strong><label class="field"><span>항목명</span><input required name="title${i}" value="${e(cfg.criteria[i]?.name)}"></label><label class="field"><span>선택 가능한 점수 (쉼표로 구분)</span><input required name="points${i}" value="${e(cfg.criteria[i]?.scores.join(', '))}"></label></div>`).join('')}<label class="field check">실제 평가 기준을 확인했습니다 <input type="checkbox" name="confirmed" ${cfg.confirmed?'checked':''}></label>`,async form=>{
      const data=new FormData(form);
      const criteria=Array.from({length:8},(_,i)=>{
        const name=data.get('title'+i).trim();
        const tokens=data.get('points'+i).split(',').map(value=>value.trim());
        if(!name||tokens.length>30||tokens.some(token=>!/^\d{1,4}(\.\d{1,2})?$/.test(token))) throw Error('항목명과 올바른 배점을 입력하세요.');
        return {name,scores:[...new Set(tokens.map(Number))].sort((a,b)=>a-b)};
      });
      await save([upsert('settings',{...cfg,criteria,confirmed:data.has('confirmed'),mpeMinimum:criteria.every(item=>JSON.stringify(item.scores)==='[0,1]')?cfg.mpeMinimum:undefined})]);
    });
  }
  if(kind==='preferences'){
    modal('회의 및 보고서 설정',`<label class="field"><span>다음 주간회의 날짜</span><input type="date" required name="next" value="${e(cfg.next||nextMeeting())}"></label><label class="field"><span>보고서 제목</span><input name="reportTitle" value="${e(cfg.reportTitle)}" placeholder="미다스챕터 멤버십위원회 주간보고"></label>`,async form=>{
      const data=new FormData(form);
      await save([upsert('settings',{...cfg,next:data.get('next'),reportTitle:data.get('reportTitle').trim()})]);
      updateMeetingDate();
    });
  }
  if(kind==='menu'){
    const ordered=[...cfg.menu,...entries.map(([id])=>id).filter(id=>!cfg.menu.includes(id))];
    modal('메뉴 표시와 순서',ordered.filter(id=>!['home','settings'].includes(id)).map((id,i)=>`<div class="menu-setting"><label><input type="checkbox" name="visible-${id}" ${cfg.menu.includes(id)?'checked':''}> ${labelOf(id)}</label><label>순서 <input type="number" name="order-${id}" required min="1" max="99" value="${i+1}"></label></div>`).join(''),async form=>{
      const data=new FormData(form);
      const menu=['home',...ordered.filter(id=>data.has('visible-'+id)).sort((a,b)=>Number(data.get('order-'+a))-Number(data.get('order-'+b))),'settings'];
      await save([upsert('settings',{...cfg,menu})]);
    });
  }
}
function history(){
  const rows=[...state.audit].reverse().filter(row=>historyMode==='all'||row.table==='meetings');
  return heading('회의록 수정 이력')+`<div class="tabs">${btn('회의록','history:meetings')}${btn('전체 변경','history:all')}</div>`+(rows.map(row=>rowCard(row.after?.name||nameOf(row.after?.member)||labelOf(row.table),new Date(row.date).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'})+' · '+row.actor,'audit:'+row.id)).join('')||empty('기록된 변경이 없습니다.'));
}
const monthLabel=month=>new Intl.DateTimeFormat('ko-KR',{year:'numeric',month:'long',timeZone:'UTC'})
  .format(new Date(month+'-01T00:00:00Z'));
function calendar(){
  const today=localDate();
  const month=calendarMonth||today.slice(0,7);
  const cells=calendarDays(state,month);
  const addDate=today.startsWith(month)?today:month+'-01';
  return `<section class="calendar-panel" aria-labelledby="calendar-title">
    <div class="calendar-header">
      <h2 id="calendar-title">${route()==='schedule'?'월간 일정':'챕터 일정표'}</h2>
      <div class="calendar-month">
        <button type="button" class="text-button" data-action="calendar-month:-1" aria-label="이전 달">‹</button>
        <strong>${e(monthLabel(month))}</strong>
        <button type="button" class="text-button" data-action="calendar-month:1" aria-label="다음 달">›</button>
      </div>
      <div class="calendar-tools">${btn('오늘','calendar-today')}${btn('＋ 일정','calendar-add:'+addDate,'primary')}</div>
    </div>
    <div class="calendar-grid">
      ${['일','월','화','수','목','금','토'].map((label,index)=>`<span class="calendar-weekday ${index===0?'sunday':index===6?'saturday':''}">${label}</span>`).join('')}
      ${cells.map(cell=>`<button type="button" class="calendar-day ${cell.inMonth?'':'outside'} ${cell.weekday===0?'sunday':cell.weekday===6?'saturday':''}" data-action="calendar-day:${cell.date}" aria-label="${cell.date} 일정 ${cell.items.length}건" ${cell.date===today?'aria-current="date"':''}>
        <span class="calendar-number">${cell.day}</span>
        ${cell.items.slice(0,1).map(item=>`<span class="calendar-event ${item.cancelled?'cancelled':item.recurring?'recurring':''}">${e(item.cancelled?'주간회의 없음':item.name)}</span>`).join('')}
        ${cell.items.length>1?`<span class="calendar-more">+${cell.items.length-1}</span>`:''}
      </button>`).join('')}
    </div>
  </section>`;
}
function calendarDay(date){
  return calendarDays(state,date.slice(0,7)).find(cell=>cell.date===date);
}
function showCalendarDay(date){
  const rows=calendarDay(date).items.map(item=>{
    const description=item.cancelled?'취소된 정기 일정':[item.time,item.location,item.type].filter(Boolean).join(' · ');
    return rowCard(item.cancelled?'주간회의 없음':item.name,description,
      item.recurring?'edit-weekly:'+date:'edit-schedule:'+item.id);
  }).join('');
  modal(e(prettyDate(date))+' 일정',`<div class="toolbar">${btn('＋ 일정 등록','calendar-add:'+date,'primary')}</div>`+(rows||empty('등록된 일정이 없습니다.')));
}
function schedule(){
  return heading('챕터 일정표','매주 수요일 08:30 · 한국시간')+calendar();
}
function updateMeetingDate(){
  if(!state||dialog.open) return;
  const date=upcomingMeeting(state);
  if(date===lastUpcoming) return;
  lastUpcoming=date;
  if(!meetingPinned) meeting=date;
  if(['home','attendance'].includes(route())) render();
}
function render(){
  if(!state) return;
  const id=route();
  let body;
  if(!canOpen(id)) body=heading('메뉴를 열 수 없습니다.')+btn('홈으로','go:home');
  else if(id==='home') body=dashboard();
  else if(id==='all') body=allMenus();
  else if(id==='attendance') body=attendance();
  else if(id==='schedule') body=schedule();
  else if(id==='history') body=history();
  else if(id==='mpe') body=mpeScreen();
  else if(id==='settings') body=settings();
  else if(id==='alerts') body=heading('긴급 확인 사항')+(urgent().map(row=>rowCard(row.name,row.due||row.date||'','edit:'+(state.issues.includes(row)?'issues':'board')+':'+row.id,statusPill(row.status))).join('')||empty('긴급 확인 사항이 없습니다.'));
  else body=generic(id);
  app.innerHTML=header()+`<main id="main">${body}</main>`+nav();
}
async function updateReport(date){
  clearReport();
  const revision=reportRevision;
  const image=dialog.querySelector('#report-image');
  const buttons=[...dialog.querySelectorAll('.report-actions button')];
  buttons.forEach(button=>button.disabled=true);
  image.hidden=true;
  image.removeAttribute('src');
  const report=attendanceReport(state,date);
  const blob=await reportPng(report);
  if(revision!==reportRevision||!dialog.open) return;
  reportFile=new File([blob],`midas-attendance-${date}.png`,{type:'image/png'});
  reportUrl=URL.createObjectURL(reportFile);
  image.src=reportUrl;
  image.alt=reportText(report);
  image.hidden=false;
  buttons.forEach(button=>button.disabled=false);
}
function showReport(){
  const date=route()==='home'?upcomingMeeting(state):meeting;
  modal('주간회의 출결 보고',`<label class="date-field">주간회의 날짜 <input id="report-date" type="date" value="${e(date)}"></label><img class="report-image" id="report-image" hidden><div class="toolbar report-actions">${btn('이미지 다운로드','download-report','primary')}${btn('이미지 공유','share-report')}</div>`);
  return updateReport(date);
}
async function action(value){
  const [type,a,b]=value.split(':');
  if(type==='go'){if(state) return go(a);return;}
  if(!state && !['login','logout'].includes(type)) return;
  if(type==='close') return closeDialog();
  if(type==='edit') return edit(a,b);
  if(type==='mode'){attendanceMode=a;return render();}
  if(type==='calendar-month'){calendarMonth=shiftCalendarMonth(calendarMonth||localDate().slice(0,7),Number(a));return render();}
  if(type==='calendar-today'){calendarMonth=localDate().slice(0,7);return render();}
  if(type==='calendar-day') return showCalendarDay(a);
  if(type==='calendar-add') return edit('other','',{kind:'chapter-schedule',date:a});
  if(type==='edit-weekly'){
    const item=calendarDay(a).items.find(row=>row.recurring);
    if(item){
      const {recurring,...defaults}=item;
      return edit('other',item.id,defaults);
    }
  }
  if(type==='weekly-toggle'){
    const saved=live(state.other).find(row=>row.id===b&&row.kind==='chapter-schedule');
    const item=saved||calendarDay(a).items.find(row=>row.id===b&&row.recurring);
    if(!item) return;
    const {recurring,...row}=item;
    const cancelled=!row.cancelled;
    const label=cancelled?'주간회의 없음':'주간회의 다시 표시';
    return modal(label, `<p>${e(prettyDate(a))}의 주간회의를 ${cancelled?'취소합니다.':'다시 표시합니다.'}</p>`,
      ()=>save([upsert('other',{...row,cancelled})]),label);
  }
  if(type==='edit-schedule') return edit('other',a,{kind:'chapter-schedule',date:localDate()});
  if(type==='renewal-filter'){renewalFilter=a;return render();}
  if(type==='renewal') return edit('renewals','',{member:a});
  if(type==='mpe'){mpeMember=a;return render();}
  if(type==='mpeback'){mpeMember='';return render();}
  if(type==='history'){historyMode=a;return go('history');}
  if(type==='stats') return stats(a,Number(b)||1);
  if(type==='guest'){
    const person=live(state.guests).find(row=>row.id===a);
    if(!person||!['참석','불참'].includes(b)) return;
    const records=live(state.guests).filter(row=>row.date===meeting);
    const row=person.date?person:records.find(record=>record.guestId===person.id)||records.find(record=>!record.guestId&&record.name===person.name&&record.type===person.type);
    if(row?.status===b) return;
    return save([upsert('guests',{...row,id:row?.id||crypto.randomUUID(),guestId:person.date?row?.guestId:person.id,name:person.name,type:person.type,date:meeting,status:b})]);
  }
  if(type==='add-agenda'){
    const list=dialog.querySelector('#agendas');
    list.insertAdjacentHTML('beforeend',agendaFields());
    list.lastElementChild.querySelector('input').focus();
    return;
  }
  if(type==='attendance'){
    const row=attendanceFor(state,meeting,a);
    if(row.status==='대리인'&&live(state.visitors).some(v=>v.member===a&&v.date===meeting&&v.type==='대리인'&&v.status==='참석')) return modal('대리인 연동',`<p>${e(row.proxy)} 님을 참석 처리한 비지터 기록과 연동되어 있습니다.</p>${btn('비지터관리','visitlink')}`);
    const id=meeting+'-'+a;
    return edit('attendance',id,{id,date:meeting,member:a,status:row.status});
  }
  if(type==='visitlink'){closeDialog();return go('visitors');}
  if(type==='bulk') return modal('전체 멤버 출석 처리','<p>현재 미확인인 활동 멤버를 정상 출석으로 기록합니다. 기존 출결과 승인된 병가를 보존합니다.</p>',async()=>{
    const changes=live(state.members).filter(member=>member.status==='활동'&&attendanceFor(state,meeting,member.id).status==='미확인').map(member=>{
      const id=meeting+'-'+member.id;
      const existing=live(state.attendance).find(record=>record.id===id);
      return upsert('attendance',{...existing,id,date:meeting,member:member.id,status:'정상 출석'});
    });
    if(changes.length) await save(changes);else notify('미확인 멤버가 없습니다.');
  },'일괄 출석 처리');
  if(type==='report') return showReport();
  if(type==='download-report'&&reportFile){
    const link=document.createElement('a');link.href=reportUrl;link.download=reportFile.name;link.click();return;
  }
  if(type==='share-report'&&reportFile){
    const payload={files:[reportFile]};
    if(navigator.canShare?.(payload)&&navigator.share) return navigator.share(payload);
    return notify('이 브라우저는 이미지 공유를 지원하지 않습니다. 이미지를 다운로드해 공유하세요.');
  }
  if(type==='audit'){
    const row=state.audit.find(item=>item.id===a);
    return modal('변경 내용',`<p>${e(labelOf(row.table))} · ${e(row.actor)} · ${e(new Date(row.date).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'}))}</p><details><summary>수정 전</summary><pre>${e(JSON.stringify(row.before,null,2))}</pre></details><details open><summary>수정 후</summary><pre>${e(JSON.stringify(row.after,null,2))}</pre></details>`);
  }
  if(type==='mpehistory') return modal('평가 이력',state.audit.filter(row=>row.table==='mpe'&&row.after.member===a).reverse().map(row=>rowCard(row.after.status,new Date(row.date).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'})+' · '+row.actor,'audit:'+row.id)).join('')||empty('평가 이력이 없습니다.'));
  if(type==='login') return store.login();
  if(type==='logout') return store.logout();
  if(type==='install'){
    if(!promptInstall) return modal('홈 화면에 설치','<p>iPhone Safari에서는 공유 메뉴의 <strong>홈 화면에 추가</strong>를 선택하세요. Android Chrome에서는 메뉴의 <strong>앱 설치</strong> 또는 <strong>홈 화면에 추가</strong>를 선택하세요.</p>');
    await promptInstall.prompt();promptInstall=null;return;
  }
  if(!admin()) return;
  if(['criteria','preferences','menu'].includes(type)) return settingsModal(type);
  if(type==='roles'){
    if(store.demo) return modal('위원 권한','<p>가상 작업 공간입니다. 공동 사용 환경에서는 승인된 Google 계정에 관리자 또는 위원 역할을 설정합니다.</p>');
    const rows=await store.roles();
    return modal('위원 권한',rows.map(row=>`<label class="field"><span>${e(row.email)}</span><select name="role-${e(row.user_id)}" ${row.user_id===store.userId?'disabled':''}>${['admin','member','revoked'].map(role=>`<option ${row.role===role?'selected':''} value="${role}">${{admin:'관리자',member:'위원',revoked:'접근 차단'}[role]}</option>`).join('')}</select></label>`).join(''),async form=>{
      const data=new FormData(form);
      const changes=rows.filter(row=>data.has('role-'+row.user_id)&&data.get('role-'+row.user_id)!==row.role).map(row=>({user_id:row.user_id,role:data.get('role-'+row.user_id)}));
      if(changes.length){await store.setRoles(changes);location.reload();}
      notify('권한을 저장했습니다.');
    });
  }
  if(type==='delete'||type==='restore'){
    const row=state[a].find(item=>item.id===b);
    return modal(type==='delete'?'휴지통으로 이동':'기록 복구','<p>변경 이력에 작업을 기록합니다.</p>',()=>save([upsert(a,{...row,deleted:type==='delete'})]),type==='delete'?'휴지통으로 이동':'기록 복구');
  }
  if(type==='trash') return modal('휴지통',Object.keys(fields).flatMap(table=>(state[table]||[]).filter(row=>row.deleted).map(row=>rowCard(row.name||nameOf(row.member)||labelOf(table),labelOf(table),'restore:'+table+':'+row.id))).join('')||empty('삭제된 기록이 없습니다.'));
  if(type==='import') return modal('백업 기록 복구','<p>백업에 있는 기록을 현재 작업 공간에 병합합니다. 같은 ID의 기록은 백업 내용으로 갱신하며, 변경 이력이 새로 남습니다. 현재에만 있는 기록은 보존됩니다.</p><label class="field">백업 파일 <input name="file" type="file" accept=".json,application/json"></label><label class="field">또는 JSON 내용 붙여넣기<textarea name="backupText" rows="4" spellcheck="false"></textarea></label>',async form=>{
    const file=form.elements.file.files[0];
    const text=file?await file.text():form.elements.backupText.value.trim();
    if(!text||new Blob([text]).size>8000000) throw Error('8MB 이하의 백업 파일을 선택하거나 JSON 내용을 붙여넣으세요.');
    const backup=JSON.parse(text);
    const tables=[...Object.keys(fields),'settings'];
    if((backup.privateRoster||backup.workbookImport||backup.memberPatches)&&store.demo) throw Error('실제 명단은 승인된 공동 사용 환경에서만 등록할 수 있습니다.');
    if(backup.version===1&&backup.memberPatches){
      const pending=memberPatchChanges(state,backup.memberPatches);
      if(pending.length) await save(pending);else notify('이미 반영된 멤버 수정입니다.');
      return;
    }
    if(backup.version!==1||!tables.every(table=>Array.isArray(backup.state?.[table]))) throw Error('지원하는 백업 파일이 아닙니다.');
    const changes=tables.flatMap(table=>backup.state[table].map(row=>upsert(table,row)));
    if(changes.length>1000||changes.some(({row})=>!row||typeof row!=='object'||!(/^[a-zA-Z0-9_-]{1,128}$/).test(row.id))) throw Error('백업의 기록 형식 또는 개수 제한을 확인하세요.');
    const pending=backup.workbookImport?workbookChanges(state,changes,backup.workbookCriteria):changes;
    if(pending.length) await save(pending);else notify('이미 가져온 기록입니다.');
  },'병합 복구');
  if(type==='backup'){
    const url=URL.createObjectURL(new Blob([JSON.stringify({version:1,state},null,2)],{type:'application/json'}));
    const link=document.createElement('a');link.href=url;link.download='midas-backup-'+localDate()+'.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
    return notify('백업 파일을 다운로드했습니다.');
  }
}
document.addEventListener('click',event=>{
  const button=event.target.closest('[data-action]');
  if(button?.dataset.action==='remove-agenda'){
    const list=dialog.querySelector('#agendas');
    if(list.children.length>1) button.closest('fieldset').remove();
    else notify('안건을 하나 이상 남겨 주세요.');
    return;
  }
  if(button) action(button.dataset.action).catch(error=>{if(error.name!=='AbortError')notify(error.message);});
});
document.addEventListener('input',event=>{
  if(event.target.matches('textarea[name="agenda-detail"]')) return resizeAgenda(event.target);
  if(event.target.id!=='search')return;
  query=event.target.value;
  document.querySelector('#results').innerHTML=route()==='mpe'?mpeList():listContent(route());
});
document.addEventListener('change',event=>{
  if(event.target.id==='meeting'){if(event.target.value){meeting=event.target.value;meetingPinned=true;render();}return;}
  if(event.target.id==='report-date'&&event.target.value){updateReport(event.target.value).catch(error=>notify(error.message));return;}
  const form=event.target.closest('#mpe-form');
  if(form&&event.target.name.startsWith('score-')){
    const member=state.members.find(row=>row.id===mpeMember);
    const evaluation=live(state.mpe).find(row=>row.member===mpeMember&&row.cycle===member.expiry)||config(state);
    const criteria=evaluation.criteria;
    const info=scoreInfo(criteria,readScores(form,criteria));
    document.querySelector('#score').textContent=evaluation.mpeMinimum?'충족 '+info.total+' / '+criteria.length+' 항목':info.total+' / '+info.max+'점';
    document.querySelector('#progress-label').textContent=info.answered+' / '+criteria.length+' 항목';
    document.querySelector('#progress').value=info.answered;
  }
});
document.addEventListener('submit',async event=>{
  const form=event.target;
  if(form.id!=='mpe-form') return;
  event.preventDefault();
  const submitter=event.submitter;
  const complete=submitter?.value==='complete';
  const member=state.members.find(row=>row.id===form.dataset.member);
  const cfg=config(state);
  const row=live(state.mpe).find(record=>record.member===member.id&&record.cycle===member.expiry)||{id:crypto.randomUUID(),member:member.id,cycle:member.expiry,criteria:cfg.criteria,confirmed:cfg.confirmed,mpeMinimum:cfg.mpeMinimum};
  const scores=readScores(form,row.criteria);
  const error=form.querySelector('.form-error');
  if(complete&&scoreInfo(row.criteria,scores).answered!==8){error.textContent='완료하려면 8개 항목을 모두 평가하세요.';return;}
  if(complete&&!form.elements.owner.value.trim()){error.textContent='평가 담당 위원을 입력하세요.';return;}
  const assessment=new FormData(form).get('assessment')||'';
  if(complete&&!assessment){error.textContent='MPE 종합 판정을 선택하세요.';return;}
  const buttons=[...form.querySelectorAll('button[name=mode]')];
  buttons.forEach(button=>button.disabled=true);
  try {
    const attachments=await readAttachments(form,'mpe',row.attachments,store.demo);
    await save([upsert('mpe',{...row,...readFields(form,fields.mpe),scores,assessment,attachments,status:complete?'완료':'임시 저장'})]);
  }
  catch(failure){error.textContent=failure.message;buttons.forEach(button=>button.disabled=false);}
});
window.addEventListener('hashchange',()=>{query='';mpeMember='';render();window.scrollTo(0,0);});
async function boot(){
  store=await openStore();
  if(!store.state){
    app.innerHTML=header()+`<main>${heading('BNI 미다스 멤버십위원회','승인된 위원 전용 업무 공간')}${store.denied?'<p class="notice">이 계정에 접근 권한이 없습니다.</p>'+btn('로그아웃','logout'):btn('Google 계정으로 로그인','login','primary')}</main>`;
    return;
  }
  state=store.state;meeting=lastUpcoming=upcomingMeeting(state);render();
  setInterval(updateMeetingDate,15000);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden) updateMeetingDate();});
  if(store.demo&&'serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(console.warn);
}
boot().catch(error=>{app.textContent='업무 공간을 열 수 없습니다. '+error.message;});
