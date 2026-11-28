export const menus = [
  ['업무관리', [['home','대시보드','⌂'],['board','업무보드','▤'],['meetings','멤버십 회의','▣'],['history','회의록 수정 이력','↺'],['other','기타업무','✓']]],
  ['멤버관리', [['members','멤버현황','♙'],['visitors','비지터관리','↗'],['attendance','출결·병가','◷']]],
  ['입회 및 갱신', [['admissions','신입승인','＋'],['renewals','갱신승인','✓'],['mpe','갱신심사 및 MPE','★'],['votes','투표','☑']]],
  ['위원회 관리', [['letters','컨트롤레터','✉'],['issues','분쟁·이슈','!'],['visits','자방·개방','↔'],['settings','설정','⚙']]],
];
export const entries = menus.flatMap(([, items]) => items);
export const statuses = ['정상 출석','병가','대리인','조퇴','지각','결석','미확인'];
export const visitorTypes = ['비지터','참관인','대리인'];
export const localDate = (date = new Date()) => new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul'}).format(date);
export const weeklyMeetingTime='08:30';
const seoulClock=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Seoul',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
export function nextMeeting(now=new Date()) {
  const date=new Date(localDate(now)+'T00:00:00Z');
  const days=(3-date.getUTCDay()+7)%7;
  date.setUTCDate(date.getUTCDate()+(days===0&&seoulClock.format(now)>=weeklyMeetingTime?7:days));
  return date.toISOString().slice(0,10);
}
function regularMeeting(date){
  return {id:'weekly-'+date,kind:'chapter-schedule',name:'주간회의',date,time:weeklyMeetingTime,
    type:'주간회의',regularDate:date,recurring:true};
}
export function upcomingMeetingDetails(state,now=new Date()){
  const records=chapterSchedule(state).filter(row=>row.type==='주간회의'||row.regularDate);
  const blocked=new Set(records.flatMap(row=>[row.date,row.regularDate].filter(Boolean)));
  const today=localDate(now);
  const time=seoulClock.format(now);
  const future=row=>row.date>today||row.date===today&&(row.time||weeklyMeetingTime)>time;
  const candidates=records.filter(row=>!row.cancelled&&row.type==='주간회의'&&future(row));
  const override=config(state).next;
  const overrideMeeting=regularMeeting(override);
  if(override&&!blocked.has(override)&&future(overrideMeeting)) candidates.push(overrideMeeting);
  const regular=new Date(nextMeeting(now)+'T00:00:00Z');
  let date=regular.toISOString().slice(0,10);
  while(blocked.has(date)){
    regular.setUTCDate(regular.getUTCDate()+7);
    date=regular.toISOString().slice(0,10);
  }
  candidates.push(regularMeeting(date));
  return candidates.sort((a,b)=>(a.date+(a.time||weeklyMeetingTime)).localeCompare(b.date+(b.time||weeklyMeetingTime),'en'))[0];
}
export const upcomingMeeting=(state,now)=>upcomingMeetingDetails(state,now).date;
export const demoChapterRole=index=>index===0?'부의장':index>=1&&index<=4?'멤버십':'';
export const seed = () => {
  const date = nextMeeting();
  return {
    members: Array.from({length:24}, (_,i) => ({id:'demo-'+i,name:'가상 멤버 '+String(i+1).padStart(2,'0'),chapterRole:demoChapterRole(i),listeningNumber:i+1,company:'샘플 기업', specialty:['컨설팅','디자인','교육','IT'][i%4], status:'활동', expiry:i<3?date:''})),
    board:[{id:'task-1',name:'갱신 대상자 인터뷰 일정 확인',status:'진행 중',due:date,priority:'긴급'},{id:'task-2',name:'주간회의 출결 정리',status:'진행 중',due:date},{id:'task-3',name:'위원회 회의 일정 공유',status:'완료',due:date}],
    visitors:[{id:'visit-1',name:'가상 방문자',date,type:'비지터',status:'참석 예정'}],
    admissions:[{id:'new-1',name:'가상 입회 신청자',status:'검토 중',date}],
    renewals:[], mpe:[], attendance:[], guests:[], leaves:[], meetings:[], other:[], votes:[], letters:[], issues:[], visits:[],
    settings:[{id:'main', next:date, report:'', menu:entries.map(([id])=>id), criteria:Array.from({length:8},(_,i)=>({name:'임시 항목 '+(i+1),scores:[0,1,2,3,4,5]})), confirmed:false}],
    audit:[],
  };
};
export const live = rows => (rows || []).filter(row=>!row.deleted);
export function orderedMembers(state){
  const number=row=>Number(row.listeningNumber)>0?Number(row.listeningNumber):Infinity;
  return live(state.members).sort((a,b)=>(number(a)-number(b))||
    a.id.localeCompare(b.id,'en',{numeric:true}));
}
export function chapterSchedule(state){
  return live(state.other).filter(row=>row.kind==='chapter-schedule')
    .sort((a,b)=>(a.date+a.time).localeCompare(b.date+b.time,'en'));
}
export function shiftCalendarMonth(month,offset){
  const date=new Date(month+'-01T00:00:00Z');
  date.setUTCMonth(date.getUTCMonth()+offset);
  return date.toISOString().slice(0,7);
}
export function calendarDays(state,month){
  const start=new Date(month+'-01T00:00:00Z');
  const next=new Date(shiftCalendarMonth(month,1)+'-01T00:00:00Z');
  const records=chapterSchedule(state);
  const day=new Date(start);
  day.setUTCDate(day.getUTCDate()-day.getUTCDay());
  const cells=[];
  do {
    const date=day.toISOString().slice(0,10);
    const weekday=day.getUTCDay();
    const items=records.filter(row=>!row.cancelled&&row.date<=date&&date<=(row.endDate||row.date));
    const cancelled=records.filter(row=>row.cancelled&&row.date===date&&row.type==='주간회의');
    if(weekday===3&&!records.some(row=>row.regularDate===date||row.date===date&&row.type==='주간회의')){
      items.push(regularMeeting(date));
      items.sort((a,b)=>(a.time||'').localeCompare(b.time||'','en'));
    }
    cells.push({date,day:day.getUTCDate(),weekday,inMonth:date.startsWith(month),items,cancelled});
    day.setUTCDate(day.getUTCDate()+1);
  } while(day<next||day.getUTCDay()!==0);
  return cells;
}
const committeeRole=member=>String(member.chapterRole||'').replace(/\s+/g,'');
export function meetingParticipants(state){
  return live(state.members).filter(member=>member.status==='활동'&&
    ['부의장','멤버십','멤버십위원','멤버십위원장'].includes(committeeRole(member)));
}

export const config = state => live(state.settings)[0] || {...seed().settings[0],next:'',criteria:[]};
export function renewalGroups(state,today=localDate()){
  const day=Number(today.slice(8));
  const month=today.slice(0,7);
  const deadlines=[1,2,3].map(offset=>{
    const target=shiftCalendarMonth(month,offset);
    const [year,monthNumber]=target.split('-').map(Number);
    const monthEnd=new Date(Date.UTC(year,monthNumber,0)).getUTCDate();
    return target+'-'+String(Math.min(day,monthEnd)).padStart(2,'0');
  });
  const groups={one:[],two:[],three:[],expired:[]};
  const members=live(state.members).filter(row=>row.status==='활동'&&row.expiry)
    .sort((a,b)=>a.expiry.localeCompare(b.expiry,'en')||a.name.localeCompare(b.name,'ko'));
  for(const member of members){
    const expiry=member.expiry;
    if(expiry<today) groups.expired.push(member);
    else {
      const index=deadlines.findIndex(deadline=>expiry<=deadline);
      if(index!==-1) groups[['one','two','three'][index]].push(member);
    }
  }
  return groups;
}
export const renewalTargets=(state,today)=>Object.values(renewalGroups(state,today)).flat();
export function attendanceFor(state,date,member) {
  const proxy = live(state.visitors).find(row=>row.date===date && row.member===member && row.type==='대리인' && row.status==='참석');
  const row = live(state.attendance).find(row=>row.date===date && row.member===member);
  const leave = live(state.leaves).find(row=>row.member===member && row.status==='승인' && row.start<=date && date<=row.end);
  if (proxy) return {...row,status:'대리인',proxy:proxy.name};
  return row || {status:leave?'병가':'미확인'};
}
export function attendanceTotals(state,date,members=live(state.members).filter(row=>row.status==='활동')) {
  const counts = Object.fromEntries(statuses.map(status=>[status,0]));
  let both = 0;
  for (const member of members) {
    const row=attendanceFor(state,date,member.id);
    counts[row.status]++;
    if (row.status==='지각' && row.early) both++;
  }
  return {counts,both,total:members.length};
}
export function attendanceReport(state,date) {
  const members=live(state.members).filter(row=>row.status==='활동');
  const {counts,total}=attendanceTotals(state,date,members);
  const names=Object.fromEntries(statuses.map(status=>[status,[]]));
  for(const member of members){
    const row=attendanceFor(state,date,member.id);
    if(row.status==='정상 출석') continue;
    const detail=row.status==='지각'&&row.early?' (조퇴도 해당)':'';
    names[row.status].push(member.name+detail);
  }
  const guests=live(state.guests).filter(row=>row.date===date);
  return {
    title:config(state).reportTitle||'미다스챕터 주간회의 출결 보고',
    date,total,
    rows:statuses.map(status=>({status,count:counts[status],names:names[status]})),
    guests:['디렉터','앰버서더'].flatMap(type=>{
      const records=guests.filter(row=>row.type===type);
      return records.length?[{type,names:records.map(row=>row.name+' '+row.status)}]:[];
    }),
  };
}
export function reportText({title,date,total,rows,guests}){
  return [
    title,`주간회의 날짜  ${date}`,`총원  ${total}명`,'',
    ...rows.flatMap(({status,count,names})=>[`${status} ${count}명`,...(names.length?[names.join(' · ')]:[])]),
    ...guests.map(({type,names})=>type+' · '+names.join(', ')),
  ].join('\n');
}
export const reportFor=(state,date)=>reportText(attendanceReport(state,date));
function importMemberMatches(state,id,name,aliases,listeningNumber){
  const available=live(state.members);
  const byId=available.find(row=>row.id===id);
  if(byId) return [byId];
  const normalize=value=>String(value||'').normalize('NFC').replace(/\s+/g,'');
  const names=new Set([name,...(aliases||[])].map(normalize).filter(Boolean));
  const matches=available.filter(row=>names.has(normalize(row.name)));
  const numbered=listeningNumber?matches.filter(row=>Number(row.listeningNumber)===Number(listeningNumber)):[];
  return numbered.length?numbered:matches;
}
export function workbookChanges(state,changes,criteria){
  const idMap=new Map();
  for(const {row} of changes.filter(change=>change.table==='members')){
    const matches=importMemberMatches(state,row.id,row.name,row.sourceAliases,row.listeningNumber);
    if(matches.length>1) throw Error('같은 회원으로 보이는 기존 기록이 여러 개 있습니다.');
    idMap.set(row.id,matches[0]?.id||row.id);
  }
  if(new Set(idMap.values()).size!==idMap.size) throw Error('여러 명단이 같은 기존 회원과 일치합니다.');
  const output=changes.flatMap(({table,row})=>{
    const translated={...row};
    if(table==='members') translated.id=idMap.get(row.id);
    for(const field of ['member','inviter']){
      if(idMap.has(row[field])) translated[field]=idMap.get(row[field]);
    }
    if(Array.isArray(row.attendeeIds)) translated.attendeeIds=row.attendeeIds.map(id=>idMap.get(id)||id);
    const before=(state[table]||[]).find(item=>item.id===translated.id);
    if(before?.sourceWorkbook||before?.deleted) return [];
    if(table==='mpe'&&live(state.mpe).some(item=>item.member===translated.member&&item.cycle===translated.cycle)) return [];
    return [{table,row:table==='members'?{...before,...translated}:translated}];
  });
  const current=config(state);
  if(!current.confirmed){
    if(!Array.isArray(criteria)||criteria.length!==8||criteria.some(item=>!item?.name||JSON.stringify(item.scores)!=='[0,1]')) {
      throw Error('스프레드시트 평가표 형식이 올바르지 않습니다.');
    }
    output.push({table:'settings',row:{...current,criteria,confirmed:true,mpeMinimum:5}});
  }
  return output;
}
export function memberPatchTargets(state,patches){
  if(!Array.isArray(patches)||!patches.length||patches.length>100||
     patches.some(patch=>!patch||typeof patch!=='object'||!patch.name)){
    throw Error('멤버 수정 파일 형식이 올바르지 않습니다.');
  }
  const targets=patches.map(patch=>{
    const matches=importMemberMatches(state,patch.id,patch.name,patch.aliases,patch.listeningNumber);
    return matches.length===1?matches[0].id:'';
  });
  return targets.map(id=>targets.indexOf(id)===targets.lastIndexOf(id)?id:'');
}
export function memberPatchChanges(state,patches,targetIds){
  const targets=targetIds||memberPatchTargets(state,patches);
  const members=new Map(live(state.members).map(row=>[row.id,row]));
  if(targets.length!==patches.length||new Set(targets).size!==targets.length||targets.some(id=>!members.has(id))){
    throw Error('수정 항목마다 서로 다른 기존 회원을 선택하세요.');
  }
  return patches.map((patch,index)=>{
    const row=members.get(targets[index]);
    const updated={...row};
    if(patch.removeViceChair&&committeeRole(row)==='부의장') updated.chapterRole='';
    for(const field of ['name','chapterRole','committeeDuty','listeningNumber']){
      if(Object.hasOwn(patch,field)) updated[field]=patch[field];
    }
    return {table:'members',row:updated};
  }).filter(({row})=>{
    const previous=state.members.find(member=>member.id===row.id);
    return ['name','chapterRole','committeeDuty','listeningNumber'].some(field=>previous[field]!==row[field]);
  });
}
function auditRecord(row){
  if(!Array.isArray(row?.attachments)) return row;
  return {...row,attachments:row.attachments.map(({data,...metadata})=>metadata)};
}
export function scoreInfo(criteria,scores={}) {
  const selected=criteria.filter((item,i)=>item.scores.includes(scores[i]));
  return {answered:selected.length,total:selected.reduce((sum,item)=>sum+scores[criteria.indexOf(item)],0),max:criteria.reduce((sum,item)=>sum+Math.max(...item.scores),0)};
}
export function applyChanges(state, changes, actor, now=new Date().toISOString()) {
  const next={...state,audit:[...(state.audit||[])]};
  for(const {table,row} of changes) {
    if(table==='audit'||!Array.isArray(next[table])||!row.id) throw Error('잘못된 변경입니다.');
    const before=next[table].find(item=>item.id===row.id)||null;
    const after={...row,createdBy:before?.createdBy||actor,updatedBy:actor,updatedAt:now};
    next[table]=[...next[table].filter(item=>item.id!==row.id),after];
    next.audit.push({id:crypto.randomUUID(),table,actor,date:now,before:auditRecord(before),after:auditRecord(after)});
  }
  return next;
}
