import {applyChanges,seed} from './model.js';
const key='midas-fictional-v1';
export async function openStore() {
  const config=await fetch('./deployment.json',{cache:'no-store'}).then(response=>{if(!response.ok) throw Error('배포 설정을 읽을 수 없습니다.'); return response.json();});
  if(config.mode==='demo') {
    let state=JSON.parse(localStorage.getItem(key)||'null')||seed();
    return {demo:true,role:'admin',state,save(changes){
      const current=JSON.parse(localStorage.getItem(key)||'null');
      if(current && current.audit.length!==state.audit.length) throw Error('다른 탭에서 변경했습니다. 새로고침 후 다시 시도하세요.');
      state=applyChanges(state,changes,'가상 위원');
      localStorage.setItem(key,JSON.stringify(state));
      return state;
    }};
  }
  if(!config.supabaseUrl||!config.publishableKey) throw Error('공동 사용 환경 설정이 필요합니다.');
  const {createClient}=await import('./supabase-client.js');
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
  return {userId:session.user.id,role:data.role,state:data.state,logout,roles:()=>rpc('membership_roles'),setRoles:changes=>rpc('membership_set_roles',{changes}),async save(changes){
    const {data,error}=await client.rpc('membership_write',{expected_revision:revision,changes});
    if(error) throw Error(error.code==='40001'?'다른 위원이 먼저 수정했습니다. 새로고침 후 다시 시도하세요.':error.message);
    revision=data.revision;
    return data.state;
  }};
}
