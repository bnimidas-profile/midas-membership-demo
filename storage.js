import {applyChanges,demoChapterRole,seed} from './model.js?v=d40d9b42d6be';
const key='midas-fictional-v1';
export async function openStore() {
  const config=await fetch('./deployment.json',{cache:'no-store'}).then(response=>{if(!response.ok) throw Error('배포 설정을 읽을 수 없습니다.'); return response.json();});
  if(config.mode==='demo') {
    let state=JSON.parse(localStorage.getItem(key)||'null')||seed();
    state.members=state.members.map(member=>{
      const id=/^demo-(\d+)$/.exec(member.id);
      return id?{chapterRole:demoChapterRole(Number(id[1])),listeningNumber:Number(id[1])+1,...member}:member;
    });
    return {demo:true,role:'admin',state,save(changes){
      const current=JSON.parse(localStorage.getItem(key)||'null');
      if(current && current.audit.length!==state.audit.length) throw Error('다른 탭에서 변경했습니다. 새로고침 후 다시 시도하세요.');
      state=applyChanges(state,changes,'가상 위원');
      localStorage.setItem(key,JSON.stringify(state));
      return state;
    },ballot(id,choice){
      const agenda=state.votes.find(row=>row.id===id&&!row.deleted);
      if(!agenda) throw Error('투표 안건을 찾을 수 없습니다.');
      const ballots=JSON.parse(localStorage.getItem(key+'-ballots')||'[]');
      const own=ballots.find(row=>row.id===id);
      if(choice){
        if(own) throw Error('이미 제출한 투표입니다.');
        if(agenda.status!=='진행 중') throw Error('진행 중인 안건만 투표할 수 있습니다.');
        ballots.push({id,choice});
        localStorage.setItem(key+'-ballots',JSON.stringify(ballots));
      }
      const selected=own?.choice||choice;
      return {status:agenda.status,choice:selected,total:Number(Boolean(selected)),
        yes:Number(selected==='찬성'),no:Number(selected==='반대'),abstain:Number(selected==='기권')};
    }};
  }
  if(!config.supabaseUrl||!config.publishableKey) throw Error('공동 사용 환경 설정이 필요합니다.');
  const {createClient}=await import('./supabase-client.js?v=d40d9b42d6be');
  const client=createClient(config.supabaseUrl,config.publishableKey);
  const login=async()=>{
    const {error}=await client.auth.signInWithOAuth({provider:'google',options:{redirectTo:location.href.split('#')[0]}});
    if(error) throw error;
  };
  const logout=async()=>{await client.auth.signOut(); location.replace(location.href.split('#')[0]);};
  const {data:{session}}=await client.auth.getSession();
  if(!session) return {login};
  const {data,error}=await client.rpc('membership_read');
  if(error) return {denied:true,logout};
  let revision=data.revision;
  const rpc=async(name,args)=>{const {data,error}=await client.rpc(name,args);if(error)throw Error(error.message);return data;};
  return {userId:session.user.id,role:data.role,state:data.state,logout,async ballot(id,choice=null){
    const {data,error}=await client.rpc('membership_ballot',{vote_id:id,ballot_choice:choice});
    if(error) throw Error(error.code==='PGRST202'?'공동 투표를 사용하려면 Supabase에 투표 설정을 적용해야 합니다.':error.message);
    return data;
  },roles:()=>rpc('membership_roles'),setRoles:changes=>rpc('membership_set_roles',{changes}),async save(changes){
    const {data,error}=await client.rpc('membership_write',{expected_revision:revision,changes});
    if(error) throw Error(error.code==='40001'?'다른 위원이 먼저 수정했습니다. 새로고침 후 다시 시도하세요.':error.message);
    revision=data.revision;
    return data.state;
  }};
}
