import {attendanceFor,attendanceTotals,config,entries,live,localDate,menus,nextMeeting,renewalTargets,reportFor,scoreInfo,statuses} from './model.js';
import {escape as e,fields,formFields,readFields} from './forms.js';
import {openStore} from './storage.js';

const app=document.querySelector('#app');
const dialog=document.querySelector('#dialog');
let store,state,meeting,query='',report='',mpeMember='',attendanceMode='meeting',historyMode='meetings';
let promptInstall;
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
const canOpen=id=>['home','all','alerts'].includes(id)||id==='history'&&admin()||id==='settings'&&admin()||visible().includes(id);
function notify(message){
  const toast=document.querySelector('#toast');
  toast.textContent=message;
  clearTimeout(toastTimer);
  toastTimer=setTimeout(()=>toast.textContent='',4000);
}
function closeDialog(){if(dialog.open) dialog.close();}
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
}
async function save(changes){
  state=await store.save(changes);
  render();
  notify('저장했습니다.');
}
const upsert=(table,row)=>({table,row});
function header(){
  return `<header class="top"><div class="top-inner"><button class="brand" data-action="go:home" aria-label="홈"><span class="mark">M</span><span><strong>BNI MIDAS</strong><small>멤버십위원회 워크스페이스</small></span></button><div class="top-actions"><button class="icon-button bell" data-action="go:alerts" aria-label="알림"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9m-8 12a2 2 0 0 0 4 0"/></svg></button> <button class="icon-button" data-action="go:all" aria-label="전체 메뉴">☰</button></div></div></header>`;
}
function nav(){
  return `<nav class="bottom" aria-label="주 메뉴"><div>${[['home','홈','⌂'],['board','업무','▤'],['members','멤버','♙'],['mpe','심사','☆'],['all','전체','⊞']].filter(([id])=>canOpen(id)).map(([id,label,symbol])=>`<button data-action="go:${id}" ${route()===id?'aria-current="page"':''}>${icon(symbol)}<span>${label}</span></button>`).join('')}</div></nav>`;
}
const heading=(title,description='')=>`<div class="page-head"><h1>${title}</h1>${description?`<p>${description}</p>`:''}</div>`;
const section=(title,body,extra='')=>`<section><div class="section-head"><h2>${title}</h2>${extra}</div>${body}</section>`;
const prettyDate=date=>date?new Intl.DateTimeFormat('ko-KR',{month:'long',day:'numeric',weekday:'short',timeZone:'UTC'}).format(new Date(date+'T00:00:00Z')):'미정';
const statusPill=status=>status?`<span class="pill ${['완료','승인','참석','활동'].includes(status)?'green':''}">${e(status)}</span>`:'';
function rowCard(title,sub,action,end=''){
  return `<button class="list-row" data-action="${e(action)}"><span><strong>${e(title)}</strong><small>${e(sub)}</small></span><span class="row-end">${end}<span class="chevron">›</span></span></button>`;
}
const urgent=()=>[...live(state.board),...live(state.issues)].filter(row=>row.priority==='긴급'&&!['완료','해결'].includes(row.status));
function dashboard(){
  const date=config(state).next||nextMeeting();
  const members=live(state.members).filter(row=>row.status==='활동');
  const board=live(state.board);
  const waiting=renewalTargets(state).filter(member=>!live(state.mpe).some(row=>row.member===member.id&&row.cycle===member.expiry&&row.status==='완료'));
  const {counts}=attendanceTotals(state,date);
  const metrics=[
    ['members','전체 멤버',members.length,'명','♙','활동 멤버 기준'],
    ['admissions','신규 입회 심사',live(state.admissions).filter(row=>['검토 중','보류'].includes(row.status)).length,'건','＋','검토 또는 보류'],
    ['renewals','갱신 대상 멤버',renewalTargets(state).length,'명','↻','만료 90일 이내 및 만료 멤버'],
    ['mpe','MPE 평가 대기',waiting.length,'명','☆','완료되지 않은 평가'],
    ['visitors','비지터 참석 예정',live(state.visitors).filter(row=>row.date===date&&row.type==='비지터'&&row.status==='참석 예정').length,'명','↗','다음 주간회의'],
    ['attendance','출결 미확인',counts['미확인'],'명','◷','다음 주간회의'],
    ['board','진행 중인 업무',board.filter(row=>row.status==='진행 중').length,'건','▤','업무보드'],
    ['board','완료된 업무',board.filter(row=>row.status==='완료').length,'건','✓','업무보드'],
  ];
  return `<div class="welcome"><div><h1>멤버십 대시보드</h1><p>미다스챕터 멤버십위원회 전용 업무관리 서비스</p></div>${statusPill(store.demo?'가상 데이터':admin()?'관리자':'위원')}</div>${store.demo?'<p class="demo-note">시연 모드 · 실제 회원 정보는 입력하지 마세요.</p>':''}
  <div class="hero"><div class="hero-art" aria-hidden="true"></div><div class="hero-info"><span class="hero-label">◷　다음 주간회의</span><h2>${prettyDate(date)}</h2><p>이번 회의 출결과 방문 일정을 정리하세요.</p></div><div class="hero-actions">${canOpen('attendance')?btn('출결 기록　→','go:attendance','hero-button'):''}${btn('주간보고 만들기　↗','report','hero-outline')}</div></div>
  ${section('운영 현황',`<div class="metrics">${metrics.filter(([id])=>canOpen(id)).map(([id,label,value,unit,symbol,detail])=>`<button class="metric" data-action="go:${id}" aria-label="${label} ${value}${unit}"><div class="metric-top">${icon(symbol)}<span class="chevron">↗</span></div><span class="metric-label">${label}</span><strong>${value}<small>${unit}</small></strong><span class="metric-detail">${detail}</span></button>`).join('')}</div>`)}
  <div class="lower-grid">${section('긴급 확인 사항',urgent().length?urgent().slice(0,3).map(row=>rowCard(row.name,row.due||row.date||'일정 미정','go:alerts',statusPill('긴급'))).join(''):empty('긴급 확인 사항이 없습니다.'),btn('전체 보기','go:alerts','text-button'))}
  ${section('최근 수정 이력',state.audit.length?state.audit.slice(-3).reverse().map(row=>rowCard(row.after?.name||nameOf(row.after?.member)||labelOf(row.table),new Date(row.date).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'})+' · '+row.actor,'audit:'+row.id)).join(''):empty('아직 수정 이력이 없습니다.'),canOpen('history')?btn('전체 보기','history:all','text-button'):'')}</div>`;
}
const labelOf=id=>entries.find(([key])=>key===id)?.[1]||({leaves:'병가',guests:'디렉터·앰버서더'})[id]||id;
function allMenus(){
  return heading('전체 메뉴')+menus.map(([group,items])=>section(group,`<div class="menu-grid">${[...items].sort((a,b)=>visible().indexOf(a[0])-visible().indexOf(b[0])).filter(([id])=>visible().includes(id)||id==='settings'&&admin()).map(([id,label,symbol])=>btn(icon(symbol)+e(label),'go:'+id,'menu-tile')).join('')}</div>`)).join('');
}
function listContent(table){
  const filtered=live(state[table]).filter(row=>[row.name,nameOf(row.member),row.company,row.status,row.type,row.date,row.notes].join(' ').toLowerCase().includes(query.toLowerCase()));
  return filtered.length?filtered.map(row=>rowCard(row.name||nameOf(row.member)||'기록',[row.type,row.date||row.due,row.company||row.owner].filter(Boolean).join(' · '),'edit:'+table+':'+row.id,statusPill(row.status))).join(''):empty('표시할 기록이 없습니다.');
}
function generic(table){
  const targets=table==='renewals'?section('갱신 대상 멤버',renewalTargets(state).map(row=>rowCard(row.name,'만료일 '+row.expiry,'renewal:'+row.id)).join('')||empty('갱신 대상자가 없습니다.')):'';
  const create=table==='members'&&!admin()?'':btn('＋ 새 기록','edit:'+table,'primary');
  return heading(labelOf(table))+`<div class="toolbar">${search('이름 또는 기록 검색')}${create}</div><div id="results">${listContent(table)}</div>${targets}`;
}
function edit(table,id='',defaults={}){
  const existing=state[table].find(row=>row.id===id);
  if(table==='members'&&!admin()){if(existing) modal(e(existing.name),`<p>${e(existing.company)} · ${e(existing.specialty)}</p><p>갱신 만료일 ${e(existing.expiry||'미등록')}</p>`);return;}
  const row=existing||{id:crypto.randomUUID(),date:meeting,applied:localDate(),...defaults};
  const trash=existing&&admin()?`<div class="editor-meta">등록 ${e(existing.createdBy||'샘플')} · 수정 ${e(existing.updatedBy||'—')} ${btn('휴지통으로 이동','delete:'+table+':'+existing.id,'danger')}</div>`:'';
  modal(e(labelOf(table))+(existing?' 수정':' 등록'),formFields(fields[table],row,state)+trash,async form=>{
    const updated={...row,...readFields(form,fields[table])};
    if('name' in updated&&!updated.name) throw Error('이름 또는 제목을 입력하세요.');
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
    await save([upsert(table,updated)]);
  });
}
function attendance(){
  const members=live(state.members).filter(row=>row.status==='활동');
  const {counts}=attendanceTotals(state,meeting,members);
  let content;
  if(attendanceMode==='leave') content=section('병가 신청',listContent('leaves'),btn('＋ 병가 등록','edit:leaves','primary'));
  else if(attendanceMode==='stats') content=section('개인별 출결 통계',members.map(member=>rowCard(member.name,member.company,'stats:'+member.id)).join('')||empty('멤버를 먼저 등록하세요.'));
  else content=`<div class="toolbar">${dateInput()}${btn('일괄 출석','bulk','secondary')}${btn('주간보고','report','primary')}</div><div class="counts">${statuses.map(status=>`<span>${status} <strong>${counts[status]}</strong></span>`).join('')}</div>`+
    section('멤버 출결',members.map(member=>{const row=attendanceFor(state,meeting,member.id);return rowCard(member.name,[row.proxy,row.early&&row.status==='지각'?'조퇴도 기록됨':''].filter(Boolean).join(' · '),'attendance:'+member.id,statusPill(row.status));}).join('')||empty('멤버를 먼저 등록하세요.'))+
    section('디렉터 · 앰버서더',live(state.guests).filter(row=>row.date===meeting).map(row=>rowCard(row.name,row.type,'edit:guests:'+row.id,statusPill(row.status))).join('')||empty('등록된 참석자가 없습니다.'),btn('＋ 참석자 등록','edit:guests'));
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
    return rowCard(row.name,'만료일 '+(row.expiry||'미등록')+(info?' · '+info.answered+'/'+evaluation.criteria.length+' 항목':''),'mpe:'+row.id,statusPill(evaluation?.status||'미완료'));
  }).join('')||empty('조건에 맞는 갱신 대상자가 없습니다.');
}
function mpeScreen(){
  if(!mpeMember) return heading('갱신심사 및 MPE','갱신 대상 멤버의 평가와 진행 상태를 확인합니다.')+`<div class="toolbar">${search('멤버 이름 검색')}</div><div id="results">${mpeList()}</div>`;
  const member=state.members.find(row=>row.id===mpeMember);
  if(!member) return empty('멤버를 찾을 수 없습니다.');
  const settings=config(state);
  const existing=live(state.mpe).find(row=>row.member===member.id&&row.cycle===member.expiry);
  const row=existing||{id:crypto.randomUUID(),member:member.id,cycle:member.expiry,date:localDate(),criteria:settings.criteria,confirmed:settings.confirmed,scores:{}};
  const info=scoreInfo(row.criteria,row.scores);
  return `${btn('← 평가 대상 목록','mpeback','text-button')}${heading(e(member.name),'갱신 MPE 평가')}${!row.confirmed?'<div class="notice">임시 평가표입니다. 실제 8개 항목과 배점을 확인한 뒤 설정에서 교체하세요.</div>':''}
    <form id="mpe-form" data-member="${e(member.id)}"><div class="panel eval-progress"><div><strong id="score">${info.total} / ${info.max}점</strong><span id="progress-label">${info.answered} / ${row.criteria.length} 항목</span></div><progress id="progress" value="${info.answered}" max="${row.criteria.length||1}"></progress></div>
    ${row.criteria.map((item,i)=>`<fieldset class="panel criterion"><legend>${e(item.name)}</legend><div class="score-options">${item.scores.map(score=>`<label><input type="radio" name="score-${i}" value="${e(score)}" ${row.scores[i]===score?'checked':''}><span>${e(score)}</span></label>`).join('')}</div></fieldset>`).join('')}
    <div class="panel form-panel">${formFields(fields.mpe,row,state)}</div><div class="toolbar">${btn('출결 이력','stats:'+member.id)}${btn('평가 이력','mpehistory:'+member.id)}<button name="mode" value="draft" class="secondary">임시 저장</button><button name="mode" value="complete" class="primary">완료 처리</button></div><p class="form-error" role="alert"></p></form>`;
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
      await save([upsert('settings',{...cfg,criteria,confirmed:data.has('confirmed')})]);
    });
  }
  if(kind==='preferences'){
    modal('회의 및 보고서 설정',`<label class="field"><span>다음 주간회의 날짜</span><input type="date" required name="next" value="${e(cfg.next||nextMeeting())}"></label><label class="field"><span>보고서 제목</span><input name="reportTitle" value="${e(cfg.reportTitle)}" placeholder="미다스챕터 멤버십위원회 주간보고"></label><label class="field"><span>보고서 하단 문구</span><textarea name="report">${e(cfg.report)}</textarea></label>`,async form=>{
      const data=new FormData(form);
      await save([upsert('settings',{...cfg,next:data.get('next'),reportTitle:data.get('reportTitle').trim(),report:data.get('report').trim()})]);
      meeting=data.get('next');
      render();
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
function render(){
  if(!state) return;
  const id=route();
  let body;
  if(!canOpen(id)) body=heading('메뉴를 열 수 없습니다.')+btn('홈으로','go:home');
  else if(id==='home') body=dashboard();
  else if(id==='all') body=allMenus();
  else if(id==='attendance') body=attendance();
  else if(id==='history') body=history();
  else if(id==='mpe') body=mpeScreen();
  else if(id==='settings') body=settings();
  else if(id==='alerts') body=heading('긴급 확인 사항')+(urgent().map(row=>rowCard(row.name,row.due||row.date||'','edit:'+(state.issues.includes(row)?'issues':'board')+':'+row.id,statusPill(row.status))).join('')||empty('긴급 확인 사항이 없습니다.'));
  else body=generic(id);
  app.innerHTML=header()+`<main id="main">${body}</main>`+nav();
}
function showReport(){
  report=reportFor(state,meeting);
  modal('멤버십위원회 주간보고',`<label class="date-field">보고 날짜 <input id="report-date" type="date" value="${e(meeting)}"></label><pre class="report" id="report-text">${e(report)}</pre><div class="toolbar">${btn('보고서 복사','copy','primary')}${btn('공유','share')}</div>`);
}
async function action(value){
  const [type,a,b]=value.split(':');
  if(type==='go'){if(state) return go(a);return;}
  if(!state && !['login','logout'].includes(type)) return;
  if(type==='close') return closeDialog();
  if(type==='edit') return edit(a,b);
  if(type==='mode'){attendanceMode=a;return render();}
  if(type==='renewal') return edit('renewals','',{member:a});
  if(type==='mpe'){mpeMember=a;return render();}
  if(type==='mpeback'){mpeMember='';return render();}
  if(type==='history'){historyMode=a;return go('history');}
  if(type==='stats') return stats(a,Number(b)||1);
  if(type==='attendance'){
    const row=attendanceFor(state,meeting,a);
    if(row.status==='대리인'&&live(state.visitors).some(v=>v.member===a&&v.date===meeting&&v.type==='대리인'&&v.status==='참석')) return modal('대리인 연동',`<p>${e(row.proxy)} 님을 참석 처리한 비지터 기록과 연동되어 있습니다.</p>${btn('비지터관리','visitlink')}`);
    const id=meeting+'-'+a;
    return edit('attendance',id,{id,date:meeting,member:a,status:row.status});
  }
  if(type==='visitlink'){closeDialog();return go('visitors');}
  if(type==='bulk') return modal('전체 멤버 출석 처리','<p>현재 미확인인 활동 멤버를 정상 출석으로 기록합니다. 기존 출결과 승인된 병가를 보존합니다.</p>',async()=>{
    const changes=live(state.members).filter(member=>member.status==='활동'&&attendanceFor(state,meeting,member.id).status==='미확인').map(member=>upsert('attendance',{id:meeting+'-'+member.id,date:meeting,member:member.id,status:'정상 출석'}));
    if(changes.length) await save(changes);else notify('미확인 멤버가 없습니다.');
  },'일괄 출석 처리');
  if(type==='report') return showReport();
  if(type==='copy'){await navigator.clipboard.writeText(report);return notify('보고서를 복사했습니다.');}
  if(type==='share'){if(navigator.share) await navigator.share({text:report});else await action('copy');return;}
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
  if(type==='import') return modal('백업 기록 복구','<p>백업에 있는 기록을 현재 작업 공간에 병합합니다. 같은 ID의 기록은 백업 내용으로 갱신하며, 변경 이력이 새로 남습니다. 현재에만 있는 기록은 보존됩니다.</p><label class="field">백업 파일 <input name="file" type="file" accept=".json,application/json" required></label>',async form=>{
    const file=form.elements.file.files[0];
    if(!file||file.size>8000000) throw Error('8MB 이하의 백업 파일을 선택하세요.');
    const backup=JSON.parse(await file.text());
    const tables=[...Object.keys(fields),'settings'];
    if(backup.version!==1||!tables.every(table=>Array.isArray(backup.state?.[table]))) throw Error('지원하는 백업 파일이 아닙니다.');
    const changes=tables.flatMap(table=>backup.state[table].map(row=>upsert(table,row)));
    if(changes.length>1000||changes.some(({row})=>!row||typeof row!=='object'||!(/^[a-zA-Z0-9_-]{1,128}$/).test(row.id))) throw Error('백업의 기록 형식 또는 개수 제한을 확인하세요.');
    if(changes.length) await save(changes);
  },'병합 복구');
  if(type==='backup'){
    const url=URL.createObjectURL(new Blob([JSON.stringify({version:1,state},null,2)],{type:'application/json'}));
    const link=document.createElement('a');link.href=url;link.download='midas-backup-'+localDate()+'.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
    return notify('백업 파일을 다운로드했습니다.');
  }
}
document.addEventListener('click',event=>{
  const button=event.target.closest('[data-action]');
  if(button) action(button.dataset.action).catch(error=>{if(error.name!=='AbortError')notify(error.message);});
});
document.addEventListener('input',event=>{
  if(event.target.id!=='search')return;
  query=event.target.value;
  document.querySelector('#results').innerHTML=route()==='mpe'?mpeList():listContent(route());
});
document.addEventListener('change',event=>{
  if(event.target.id==='meeting'){if(event.target.value){meeting=event.target.value;render();}return;}
  if(event.target.id==='report-date'&&event.target.value){meeting=event.target.value;report=reportFor(state,meeting);document.querySelector('#report-text').textContent=report;return;}
  const form=event.target.closest('#mpe-form');
  if(form&&event.target.name.startsWith('score-')){
    const member=state.members.find(row=>row.id===mpeMember);
    const criteria=live(state.mpe).find(row=>row.member===mpeMember&&row.cycle===member.expiry)?.criteria||config(state).criteria;
    const info=scoreInfo(criteria,readScores(form,criteria));
    document.querySelector('#score').textContent=info.total+' / '+info.max+'점';
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
  const row=live(state.mpe).find(record=>record.member===member.id&&record.cycle===member.expiry)||{id:crypto.randomUUID(),member:member.id,cycle:member.expiry,criteria:cfg.criteria,confirmed:cfg.confirmed};
  const scores=readScores(form,row.criteria);
  const error=form.querySelector('.form-error');
  if(complete&&scoreInfo(row.criteria,scores).answered!==8){error.textContent='완료하려면 8개 항목을 모두 평가하세요.';return;}
  if(complete&&!form.elements.owner.value.trim()){error.textContent='평가 담당 위원을 입력하세요.';return;}
  const buttons=[...form.querySelectorAll('button[name=mode]')];
  buttons.forEach(button=>button.disabled=true);
  try {await save([upsert('mpe',{...row,...readFields(form,fields.mpe),scores,status:complete?'완료':'임시 저장'})]);}
  catch(failure){error.textContent=failure.message;buttons.forEach(button=>button.disabled=false);}
});
window.addEventListener('hashchange',()=>{query='';mpeMember='';render();window.scrollTo(0,0);});
async function boot(){
  store=await openStore();
  if(!store.state){
    app.innerHTML=header()+`<main>${heading('BNI 미다스 멤버십위원회','승인된 위원 전용 업무 공간')}${store.denied?'<p class="notice">이 계정에 접근 권한이 없습니다.</p>'+btn('로그아웃','logout'):btn('Google 계정으로 로그인','login','primary')}</main>`;
    return;
  }
  state=store.state;meeting=config(state).next||nextMeeting();render();
  if('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(console.warn);
}
boot().catch(error=>{app.textContent='업무 공간을 열 수 없습니다. '+error.message;});
