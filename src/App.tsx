import { FormEvent, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ArrowDown, BookOpen, Heart, Leaf, MapPin, Search, Users, X, LogIn, LogOut, Pencil, Save, UserPlus, ZoomIn, ZoomOut, Maximize2 } from 'lucide-react'
import type { User } from '@supabase/supabase-js'
import { supabase } from './supabase'

type Member = { id: string; family_id: string; user_id: string|null; full_name: string; nickname: string|null; parent_id: string|null; twin_ids: string[]; child_order: number; is_deceased: boolean; birth_year: number|null; death_year: number|null; birthplace: string|null; bio: string|null; gender: string|null }
const familyId='10000000-0000-4000-8000-000000000001'
const sample: Member[] = [
 {id:'mat-isa',family_id:familyId,user_id:null,full_name:'Mat Isa',nickname:null,parent_id:null,twin_ids:[],child_order:0,is_deceased:false,birth_year:null,death_year:null,birthplace:null,bio:'Pangkal salasilah keluarga ini. Kisah dan butiran beliau boleh dilengkapkan oleh keluarga.',gender:'Lelaki'},
 {id:'mat-deah',family_id:familyId,user_id:null,full_name:'Mat Deah',nickname:null,parent_id:'mat-isa',twin_ids:[],child_order:1,is_deceased:false,birth_year:null,death_year:null,birthplace:null,bio:'Anak kepada Mat Isa.',gender:'Tidak diketahui'},
 {id:'tok-awang',family_id:familyId,user_id:null,full_name:'Tok Awang',nickname:null,parent_id:'mat-isa',twin_ids:[],child_order:2,is_deceased:false,birth_year:null,death_year:null,birthplace:null,bio:'Anak kepada Mat Isa.',gender:'Lelaki'},
 {id:'tok-sabah',family_id:familyId,user_id:null,full_name:"Tok Sa'bah",nickname:null,parent_id:'mat-isa',twin_ids:[],child_order:3,is_deceased:false,birth_year:null,death_year:null,birthplace:null,bio:'Anak kepada Mat Isa.',gender:'Perempuan'}]
const initials=(name:string)=>name.split(/\s+/).slice(0,2).map(x=>x[0]).join('').toUpperCase()
const sortChildren=(members:Member[])=>[...members].sort((a,b)=>a.child_order-b.child_order||(a.birth_year??Number.MAX_SAFE_INTEGER)-(b.birth_year??Number.MAX_SAFE_INTEGER)||a.full_name.localeCompare(b.full_name,'ms'))

function branchMatches(member:Member,members:Member[],query:string,seen=new Set<string>()):boolean{
 if(seen.has(member.id))return false
 if(!query||member.full_name.toLowerCase().includes(query.toLowerCase()))return true
 const next=new Set(seen);next.add(member.id)
 return members.some(child=>child.parent_id===member.id&&branchMatches(child,members,query,next))
}
function branchDepth(member:Member,members:Member[],seen=new Set<string>()):number{
 if(seen.has(member.id))return 0
 const next=new Set(seen);next.add(member.id)
 const children=members.filter(child=>child.parent_id===member.id)
 return 1+Math.max(0,...children.map(child=>branchDepth(child,members,next)))
}
function reachableMembers(member:Member,members:Member[],seen=new Set<string>()):Set<string>{
 if(seen.has(member.id))return seen
 seen.add(member.id)
 members.filter(child=>child.parent_id===member.id).forEach(child=>reachableMembers(child,members,seen))
 return seen
}
function twinGroup(member:Member,members:Member[],seen=new Set<string>()):Member[]{
 if(seen.has(member.id))return []
 seen.add(member.id)
 return member.twin_ids.flatMap(id=>{const twin=members.find(m=>m.id===id);return twin?[twin,...twinGroup(twin,members,seen)]:[]})
}

function App(){
 const [members,setMembers]=useState<Member[]>([]),[selected,setSelected]=useState<Member|null>(null),[query,setQuery]=useState(''),[loading,setLoading]=useState(true),[dbError,setDbError]=useState(false)
 const [user,setUser]=useState<User|null>(null),[admin,setAdmin]=useState(false),[authOpen,setAuthOpen]=useState(false),[passwordSetup,setPasswordSetup]=useState(false),[edit,setEdit]=useState(false),[busy,setBusy]=useState(false),[notice,setNotice]=useState(''),[treeZoom,setTreeZoom]=useState(1)
 const treeViewportRef=useRef<HTMLDivElement>(null),treeContentRef=useRef<HTMLDivElement>(null)
 const [email,setEmail]=useState(''),[password,setPassword]=useState(''),[inviteMember,setInviteMember]=useState(''),[inviteEmail,setInviteEmail]=useState(''),[newMemberParent,setNewMemberParent]=useState(''),[newChildOrder,setNewChildOrder]=useState('1'),[newMemberTwin,setNewMemberTwin]=useState('')
 useEffect(()=>{if(!supabase)return; if(/type=(invite|recovery)/.test(window.location.hash))setPasswordSetup(true);supabase.auth.getSession().then(({data})=>setUser(data.session?.user??null)); const {data:{subscription}}=supabase.auth.onAuthStateChange((event,s)=>{setUser(s?.user??null);if(event==='PASSWORD_RECOVERY'||(/type=(invite|recovery)/.test(window.location.hash)&&!!s))setPasswordSetup(true)}); return()=>subscription.unsubscribe()},[])
 useEffect(()=>{let alive=true;async function load(){if(!supabase){if(alive){setMembers(sample);setLoading(false)}return};const [{data,error},{data:links,error:linkError}]=await Promise.all([supabase.from('family_members').select('id,family_id,user_id,full_name,nickname,birth_year,death_year,birthplace,bio,gender,child_order,is_deceased').eq('family_id',familyId).order('created_at'),supabase.from('family_relationships').select('member_id,related_member_id,relationship_type').eq('family_id',familyId).in('relationship_type',['parent','twin'])]);if(!alive)return;if(error||linkError){setDbError(true);setMembers(sample)}else setMembers((data??[]).map((m:any)=>{const parent=links?.find((r:any)=>r.relationship_type==='parent'&&r.member_id===m.id);const twinIds=(links??[]).filter((r:any)=>r.relationship_type==='twin'&&(r.member_id===m.id||r.related_member_id===m.id)).map((r:any)=>r.member_id===m.id?r.related_member_id:r.member_id);return {...m,nickname:m.nickname??null,child_order:m.child_order??0,is_deceased:m.is_deceased??Boolean(m.death_year),parent_id:parent?.related_member_id??null,twin_ids:[...new Set(twinIds)]}}));setLoading(false)}void load();return()=>{alive=false}},[])
 useEffect(()=>{async function check(){if(!supabase||!user){setAdmin(false);return};const {data}=await supabase.from('family_admins').select('family_id').eq('family_id',familyId).eq('user_id',user.id).maybeSingle();setAdmin(!!data)}void check()},[user])
 const myProfile=members.find(m=>m.user_id===user?.id)??null
 const prohibitedParentIds=selected?reachableMembers(selected,members):new Set<string>()
 const selectedSiblings=selected?.parent_id?sortChildren(members.filter(m=>m.parent_id===selected.parent_id)):[]
 const selectedChildOrder=selected?.parent_id?Math.max(1,selectedSiblings.findIndex(m=>m.id===selected.id)+1):1
 function fitTree(){const viewport=treeViewportRef.current,content=treeContentRef.current;if(!viewport||!content)return;const minZoom=window.matchMedia('(max-width: 600px)').matches?.62:.45;setTreeZoom(Math.max(minZoom,Math.min(1,(viewport.clientWidth-32)/content.offsetWidth)));viewport.scrollLeft=0;viewport.scrollTop=0}
 useLayoutEffect(()=>{if(loading||!members.length)return;const frame=requestAnimationFrame(fitTree);return()=>cancelAnimationFrame(frame)},[loading,members.length])
 const root=members.find(m=>m.full_name==='Mat Isa')??members[0]??null
 const isTreePage=window.location.pathname.replace(/\/+$/,'')==='/salasilah'
 const reachable=root?reachableMembers(root,members):new Set<string>()
 const unlinked=members.filter(m=>!reachable.has(m.id))
 const generationCount=root?branchDepth(root,members):0
 const hasSearchMatch=members.some(m=>m.full_name.toLowerCase().includes(query.toLowerCase()))
 const rootChildren=root?sortChildren(members.filter(m=>m.parent_id===root.id)):[]
 const homepagePeople=root?[root,...rootChildren.slice(0,4)]:[]
 async function signIn(e:FormEvent){e.preventDefault();if(!supabase)return;setBusy(true);setNotice('');const {error}=await supabase.auth.signInWithPassword({email,password});setNotice(error?.message??'Berjaya log masuk.');setBusy(false);if(!error)setAuthOpen(false)}
 async function setNewPassword(e:FormEvent){e.preventDefault();if(!supabase)return;setBusy(true);const form=new FormData(e.currentTarget as HTMLFormElement);const {error}=await supabase.auth.updateUser({password:String(form.get('new_password'))});setNotice(error?.message??'Kata laluan berjaya ditetapkan.');setBusy(false);if(!error){setPasswordSetup(false);window.history.replaceState({},document.title,window.location.pathname)}}
 async function saveProfile(e:FormEvent){
  e.preventDefault()
  if(!supabase||!selected)return
  setBusy(true);setNotice('')
  const formElement=e.currentTarget as HTMLFormElement
  const form=new FormData(formElement)
  const parentField=formElement.querySelector<HTMLSelectElement>('[name="parent_id"]')
  const deceasedField=formElement.querySelector<HTMLInputElement>('[name="is_deceased"]')
  const parentId=admin&&parentField?(String(form.get('parent_id')||'')||null):selected.parent_id
  const twinOf=admin?(String(form.get('twin_of')||'')||null):(selected.twin_ids[0]??null)
  const patch={full_name:String(form.get('full_name')),nickname:String(form.get('nickname')).trim()||null,birth_year:Number(form.get('birth_year'))||null,death_year:Number(form.get('death_year'))||null,birthplace:String(form.get('birthplace'))||null,bio:String(form.get('bio'))||null,gender:String(form.get('gender'))||null,is_deceased:deceasedField?form.get('is_deceased')==='on'||Number(form.get('death_year'))>0:selected.is_deceased}
  const oldTwinIds=[...selected.twin_ids]
  let insertedParent=false
  let deletedParent=false
  let insertedTwin=false
  let deletedTwins=false

  if(admin&&parentId!==selected.parent_id){
   if(parentId){
    if(prohibitedParentIds.has(parentId)){setNotice('Ibu/bapa tidak boleh menjadi keturunan ahli ini.');setBusy(false);return}
    const {error}=await supabase.from('family_relationships').insert({family_id:familyId,member_id:selected.id,related_member_id:parentId,relationship_type:'parent'})
    if(error){setNotice(`Hubungan ibu/bapa tidak dapat disimpan: ${error.message}`);setBusy(false);return}
    insertedParent=true
   }
   if(selected.parent_id){
    const {error}=await supabase.from('family_relationships').delete().eq('family_id',familyId).eq('member_id',selected.id).eq('related_member_id',selected.parent_id).eq('relationship_type','parent')
    if(error){
     if(insertedParent&&parentId)await supabase.from('family_relationships').delete().eq('family_id',familyId).eq('member_id',selected.id).eq('related_member_id',parentId).eq('relationship_type','parent')
     setNotice(`Ibu/bapa lama tidak dapat diganti: ${error.message}`);setBusy(false);return
    }
    deletedParent=true
   }
  }

  if(admin&&twinOf!==(selected.twin_ids[0]??null)){
   if(twinOf){
    const [a,b]=[selected.id,twinOf].sort()
    const {error}=await supabase.from('family_relationships').insert({family_id:familyId,member_id:a,related_member_id:b,relationship_type:'twin'})
    if(error){
     if(insertedParent&&parentId)await supabase.from('family_relationships').delete().eq('family_id',familyId).eq('member_id',selected.id).eq('related_member_id',parentId).eq('relationship_type','parent')
     if(deletedParent&&selected.parent_id)await supabase.from('family_relationships').insert({family_id:familyId,member_id:selected.id,related_member_id:selected.parent_id,relationship_type:'parent'})
     setNotice(`Hubungan kembar tidak dapat disimpan: ${error.message}`);setBusy(false);return
    }
    insertedTwin=true
   }
   for(const oldTwinId of oldTwinIds){
    const [a,b]=[selected.id,oldTwinId].sort()
    const {error}=await supabase.from('family_relationships').delete().eq('family_id',familyId).eq('member_id',a).eq('related_member_id',b).eq('relationship_type','twin')
    if(error){
     if(insertedTwin&&twinOf){const [x,y]=[selected.id,twinOf].sort();await supabase.from('family_relationships').delete().eq('family_id',familyId).eq('member_id',x).eq('related_member_id',y).eq('relationship_type','twin')}
     for(const restoreId of oldTwinIds){const [x,y]=[selected.id,restoreId].sort();await supabase.from('family_relationships').insert({family_id:familyId,member_id:x,related_member_id:y,relationship_type:'twin'})}
     if(insertedParent&&parentId)await supabase.from('family_relationships').delete().eq('family_id',familyId).eq('member_id',selected.id).eq('related_member_id',parentId).eq('relationship_type','parent')
     if(deletedParent&&selected.parent_id)await supabase.from('family_relationships').insert({family_id:familyId,member_id:selected.id,related_member_id:selected.parent_id,relationship_type:'parent'})
     setNotice(`Hubungan kembar lama tidak dapat dikemas kini: ${error.message}`);setBusy(false);return
    }
    deletedTwins=true
   }
  }

  const {error}=await supabase.from('family_members').update(patch).eq('id',selected.id)
  if(error){
   if(insertedParent&&parentId)await supabase.from('family_relationships').delete().eq('family_id',familyId).eq('member_id',selected.id).eq('related_member_id',parentId).eq('relationship_type','parent')
   if(deletedParent&&selected.parent_id)await supabase.from('family_relationships').insert({family_id:familyId,member_id:selected.id,related_member_id:selected.parent_id,relationship_type:'parent'})
   if(insertedTwin&&twinOf){const [a,b]=[selected.id,twinOf].sort();await supabase.from('family_relationships').delete().eq('family_id',familyId).eq('member_id',a).eq('related_member_id',b).eq('relationship_type','twin')}
   if(deletedTwins)for(const oldTwinId of oldTwinIds){const [a,b]=[selected.id,oldTwinId].sort();await supabase.from('family_relationships').insert({family_id:familyId,member_id:a,related_member_id:b,relationship_type:'twin'})}
   setNotice(error.message)
  }else{
   const updated={...selected,...patch,parent_id:parentId,twin_ids:twinOf?[twinOf]:[]}
   setMembers(ms=>ms.map(m=>m.id===selected.id?updated:m));setSelected(updated);setEdit(false)
   setNotice(admin&&(parentId!==selected.parent_id||twinOf!==(selected.twin_ids[0]??null))?'Profil dan hubungan berjaya dikemas kini.':'Profil berjaya dikemas kini.')
  }
  setBusy(false)
 }
 async function saveChildOrder(e:FormEvent){
  e.preventDefault()
  const client=supabase
  if(!client||!admin||!selected?.parent_id)return
  const form=new FormData(e.currentTarget as HTMLFormElement)
  const requested=Number(form.get('child_order'))||1
  const siblings=sortChildren(members.filter(m=>m.parent_id===selected.parent_id))
  const currentIndex=siblings.findIndex(m=>m.id===selected.id)
  if(currentIndex<0)return
  const [moving]=siblings.splice(currentIndex,1)
  siblings.splice(Math.max(0,Math.min(siblings.length,requested-1)),0,moving)
  const changes=siblings.map((member,index)=>({id:member.id,previous:member.child_order,next:index+1})).filter(change=>change.previous!==change.next)
  setBusy(true);setNotice('')
  const results=await Promise.all(changes.map(change=>client.from('family_members').update({child_order:change.next}).eq('family_id',familyId).eq('id',change.id)))
  const failed=results.findIndex(result=>result.error)
  if(failed>=0){
   await Promise.all(changes.filter((_,index)=>!results[index].error).map(change=>client.from('family_members').update({child_order:change.previous}).eq('family_id',familyId).eq('id',change.id)))
   setNotice(`Susunan anak tidak dapat disimpan: ${results[failed].error?.message??'Ralat pangkalan data.'}`)
  }else{
   const orderById=new Map(siblings.map((member,index)=>[member.id,index+1]))
   setMembers(current=>current.map(member=>orderById.has(member.id)?{...member,child_order:orderById.get(member.id)!}:member))
   setSelected({...selected,child_order:requested})
   setNotice('Susunan anak berjaya dikemas kini.')
  }
  setBusy(false)
 }
 async function addMember(e:FormEvent){
  e.preventDefault()
  if(!supabase)return
  const client=supabase
  const form=e.currentTarget as HTMLFormElement
  const values=new FormData(form)
  const parentId=String(values.get('parent_id')||'')||null
  const twinOf=String(values.get('twin_of')||'')||null
  const siblings=parentId?sortChildren(members.filter(m=>m.parent_id===parentId)):[]
  const childOrder=parentId?Math.max(1,Math.min(siblings.length+1,Number(values.get('child_order'))||siblings.length+1)):0
  const name=String(values.get('full_name')).trim()
  setBusy(true);setNotice('')
  const nickname=String(values.get('nickname')||'').trim()||null
  const {data:created,error}=await client.from('family_members').insert({family_id:familyId,full_name:name,nickname,birth_year:Number(values.get('birth_year'))||null,death_year:Number(values.get('death_year'))||null,birthplace:String(values.get('birthplace')).trim()||null,gender:String(values.get('gender'))||null,bio:String(values.get('bio')).trim()||null,child_order:childOrder,is_deceased:values.get('is_deceased')==='on'||Number(values.get('death_year'))>0}).select('id,family_id,user_id,full_name,nickname,birth_year,death_year,birthplace,bio,gender,child_order,is_deceased').single()
  if(error||!created){setNotice(error?.message??'Ahli keluarga tidak dapat ditambah.');setBusy(false);return}
  if(parentId){
   const {error:relationshipError}=await client.from('family_relationships').insert({family_id:familyId,member_id:created.id,related_member_id:parentId,relationship_type:'parent'})
   if(relationshipError){await client.from('family_members').delete().eq('id',created.id);setNotice(`Ahli tidak ditambah kerana hubungan ibu/bapa gagal disimpan: ${relationshipError.message}`);setBusy(false);return}
   const reordered=[...siblings]
   reordered.splice(childOrder-1,0,{...created,parent_id:parentId,twin_ids:[],child_order:childOrder})
   const changes=reordered.filter(member=>member.id!==created.id).map((member,index)=>({id:member.id,previous:member.child_order,next:index+1})).filter(change=>change.previous!==change.next)
   const results=await Promise.all(changes.map(change=>client.from('family_members').update({child_order:change.next}).eq('family_id',familyId).eq('id',change.id)))
   const failed=results.findIndex(result=>result.error)
   if(failed>=0){
    await Promise.all(changes.filter((_,index)=>!results[index].error).map(change=>client.from('family_members').update({child_order:change.previous}).eq('family_id',familyId).eq('id',change.id)))
    await client.from('family_members').delete().eq('id',created.id)
    setNotice(`Susunan adik-beradik tidak dapat dikemas kini: ${results[failed].error?.message??'Ralat pangkalan data.'}`);setBusy(false);return
   }
   const orderById=new Map(reordered.map((member,index)=>[member.id,index+1]))
   setMembers(current=>[...current.filter(member=>!orderById.has(member.id)),...current.filter(member=>orderById.has(member.id)).map(member=>({...member,child_order:orderById.get(member.id)!})),{...created,parent_id:parentId,twin_ids:twinIds,child_order:childOrder}])
  }
  if(twinOf){const [a,b]=[created.id,twinOf].sort();const {error:twinError}=await client.from('family_relationships').insert({family_id:familyId,member_id:a,related_member_id:b,relationship_type:'twin'});if(twinError){await client.from('family_members').delete().eq('id',created.id);setNotice(`Ahli tidak ditambah kerana hubungan kembar gagal disimpan: ${twinError.message}`);setBusy(false);return}}
  const twinIds=twinOf?[twinOf]:[]
  if(parentId)setMembers(current=>current.map(member=>member.id===created.id?{...created,parent_id:parentId,twin_ids:twinIds,child_order:childOrder}:member))
  else setMembers(current=>[...current,{...created,parent_id:null,twin_ids:twinIds,child_order:0}])
  form.reset();setNewMemberParent('');setNewMemberTwin('');setNewChildOrder('1');setNotice('Ahli keluarga berjaya ditambah mengikut susunan anak yang dipilih.');setBusy(false)
 }
 async function invite(e:FormEvent){e.preventDefault();if(!supabase)return;setBusy(true);setNotice('');const {data:{session}}=await supabase.auth.getSession();const response=await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/invite-member`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${session?.access_token}`,'apikey':import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY},body:JSON.stringify({member_id:inviteMember,email:inviteEmail})});const result=await response.json();setNotice(response.ok?'Jemputan dihantar melalui e-mel.':(result.error??'Jemputan gagal.'));setBusy(false)}
 return <main className={`page-shell${isTreePage?' tree-page-shell':''}`}>
 <header className="topbar"><a className="brand" href="/"><span className="brand-mark"><Leaf size={19}/></span><span>Salasilah<span className="brand-light">Keluarga</span></span></a><nav>{isTreePage?<a href="/">Halaman utama</a>:<><a href="/salasilah" className="active">Salasilah</a><a href="#tentang">Tentang</a></>}</nav><button className="top-action" onClick={()=>user?void supabase?.auth.signOut():setAuthOpen(true)}>{user?<><LogOut size={16}/> Log keluar</>:<><LogIn size={16}/> Log masuk</>}</button>{isTreePage?<a className="top-action tree-back-link" href="/">Kembali <ArrowDown size={15}/></a>:<button className="top-action" onClick={()=>root&&setSelected(root)}>Lihat pangkal keluarga <ArrowDown size={15}/></button>}</header>
 {!isTreePage&&<><section className="hero" id="top"><div className="hero-copy"><div className="eyebrow"><span/> CERITA KELUARGA KITA</div><h1>Setiap nama,<br/><em>ada ceritanya.</em></h1><p>Jejak asal usul keluarga, kenali ikatan yang menghubungkan kita, dan simpan cerita untuk generasi seterusnya.</p><a href="/salasilah" className="primary-button">Teroka salasilah <ArrowDown size={16}/></a><div className="hero-note"><span className="note-avatars">{homepagePeople.slice(0,3).map(member=><i key={member.id}>{initials(member.full_name).slice(0,1)}</i>)}</span><span>Salasilah keluarga <b>{root?.full_name??"keluarga kita"}</b></span></div></div><div className="hero-art"><div className="art-halo"></div><div className="art-line line-a"></div><div className="art-line line-b"></div><div className="art-line line-c"></div><div className="art-center"><Leaf size={36}/><small>AKAR KELUARGA</small></div>{homepagePeople.map((member,index)=><div key={member.id} className={`art-tag tag-${["one","two","three","four","five"][index]}`}>{member.full_name}</div>)}{homepagePeople.map((member,index)=><span key={`dot-${member.id}`} className={`art-dot dot-${["one","two","three","four","five"][index]}`}/>)}<div className="art-caption">Ikatan yang merentasi generasi <Heart size={13} fill="currentColor"/></div></div></section>
 <section className="stats"><div><Users size={19}/><span><strong>{members.length}</strong> ahli keluarga</span></div><div><Leaf size={19}/><span><strong>{generationCount}</strong> generasi direkodkan</span></div><div className="stats-note">Dibina daripada ingatan, dikekalkan bersama.</div></section></>}
 {isTreePage&&<section className="tree-section tree-page-section" id="salasilah"><div className="section-heading"><div><div className="eyebrow">POHON KELUARGA</div><h2>Salasilah <em>Mat Isa</em></h2><p>Setiap cabang membawa kisah tersendiri.</p></div><label className="search"><Search size={16}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Cari nama..." aria-label="Cari ahli keluarga"/>{query&&<button onClick={()=>setQuery('')} aria-label="Padam carian"><X size={14}/></button>}</label></div>
 {dbError&&<div className="notice">Data contoh dipaparkan. Semak konfigurasi Supabase dan SQL persediaan.</div>}{notice&&<div className="notice" role="status">{notice}</div>}
 {loading?<div className="empty">Memuatkan salasilah…</div>:!hasSearchMatch?<div className="empty">Tiada nama ditemui.</div>:<><div className="tree-toolbar"><span>Zum {Math.round(treeZoom*100)}%</span><div><button type="button" onClick={()=>setTreeZoom(z=>Math.max(window.matchMedia('(max-width: 600px)').matches?.62:.45,Math.round((z-.15)*100)/100))} aria-label="Zum keluar" title="Zum keluar"><ZoomOut size={16}/></button><button type="button" onClick={()=>setTreeZoom(z=>Math.min(1.5,Math.round((z+.15)*100)/100))} aria-label="Zum masuk" title="Zum masuk"><ZoomIn size={16}/></button><button type="button" onClick={fitTree} aria-label="Muat penuh" title="Muat penuh"><Maximize2 size={15}/> Muat penuh</button></div></div><div className="tree family-tree-viewport" ref={treeViewportRef}><div className="family-tree-zoom-content" ref={treeContentRef} style={{zoom:treeZoom}}><div className="generation-label"><span>POHON KELUARGA</span><i/></div>{root&&branchMatches(root,members,query)&&<div className="family-tree-root"><FamilyBranch member={root} members={members} query={query} zoom={treeZoom} root onSelect={setSelected}/></div>}{unlinked.some(m=>branchMatches(m,members,query))&&<div className="unlinked-group"><div className="generation-label"><span>AHLI BELUM DIHUBUNGKAN</span><i/></div><div className="unlinked-members">{unlinked.filter(m=>branchMatches(m,members,query)).map(member=><MemberCard key={member.id} member={member} onClick={()=>setSelected(member)}/>)}</div></div>}</div></div></>}
 <div className="tree-foot"><BookOpen size={16}/> <span>Salasilah ini berkembang bersama cerita keluarga.</span></div></section>}
 {!isTreePage&&admin&&<section className="tree-section"><div className="section-heading"><div><div className="eyebrow">PENGURUS KELUARGA</div><h2>Urus ahli keluarga</h2><p>Tambah profil ahli dan jemput mereka menggunakan akaun e-mel.</p></div></div><div className="admin-form-heading"><h3>Tambah ahli keluarga</h3><p>Maklumat e-mel tidak diperlukan untuk menambah profil.</p></div><form className="member-form" onSubmit={addMember}><input required name="full_name" placeholder="Nama penuh"/><input name="nickname" placeholder="Nama panggilan (pilihan)"/><select name="parent_id" value={newMemberParent} onChange={e=>{const parent=e.target.value;setNewMemberParent(parent);setNewChildOrder(String(parent?sortChildren(members.filter(member=>member.parent_id===parent)).length+1:1))}}><option value="">Pilih ibu atau bapa (pilihan)</option>{members.map(m=><option key={m.id} value={m.id}>{m.full_name}</option>)}</select><select name="twin_of" value={newMemberTwin} onChange={e=>setNewMemberTwin(e.target.value)}><option value="">Tiada hubungan kembar</option>{members.filter(m=>m.id!==newMemberTwin).map(m=><option key={m.id} value={m.id}>Kembar dengan {m.full_name}</option>)}</select>{newMemberParent&&<select required name="child_order" value={newChildOrder} onChange={e=>setNewChildOrder(e.target.value)} aria-label="Pilih susunan anak"><option value="" disabled>Pilih anak ke berapa</option>{Array.from({length:sortChildren(members.filter(member=>member.parent_id===newMemberParent)).length+1},(_,index)=><option key={index+1} value={index+1}>Anak ke-{index+1}{index===0?' (sulung)':''}</option>)}</select>}<input name="birth_year" type="number" min="0" max="2100" placeholder="Tahun lahir (pilihan)"/><input name="death_year" type="number" min="0" max="2100" placeholder="Tahun meninggal (pilihan)"/><input name="birthplace" placeholder="Tempat asal (pilihan)"/><select name="gender" defaultValue=""><option value="">Jantina (pilihan)</option><option value="Lelaki">Lelaki</option><option value="Perempuan">Perempuan</option><option value="Tidak diketahui">Tidak diketahui</option></select><label className="member-checkbox"><input type="checkbox" name="is_deceased"/><span>Meninggal dunia</span></label><textarea className="member-bio" name="bio" placeholder="Cerita ringkas (pilihan)"/><button className="primary-button" disabled={busy}><UserPlus size={15}/> Tambah ahli</button></form><div className="admin-form-heading invite-heading"><h3>Jemput ahli log masuk</h3><p>Pilih profil yang telah wujud dan hantar pautan untuk menetapkan kata laluan.</p></div><form className="invite-form" onSubmit={invite}><select required value={inviteMember} onChange={e=>setInviteMember(e.target.value)}><option value="">Pilih profil ahli</option>{members.filter(m=>!m.user_id).map(m=><option key={m.id} value={m.id}>{m.full_name}</option>)}</select><input required type="email" placeholder="E-mel ahli" value={inviteEmail} onChange={e=>setInviteEmail(e.target.value)}/><button className="primary-button" disabled={busy}>Hantar jemputan</button></form></section>}
 {!isTreePage&&<><section className="quote" id="tentang"><span className="quote-mark">“</span><p>Akar yang kita kenali memberi kita tempat untuk bertumbuh.</p><span className="quote-caption">MENYIMPAN CERITA, MENGHUBUNGKAN GENERASI</span><Leaf className="quote-leaf" size={50}/></section><footer><a className="brand" href="/"><span className="brand-mark"><Leaf size={17}/></span><span>Salasilah<span className="brand-light">Keluarga</span></span></a><span>Warisan keluarga, untuk generasi akan datang.</span><span>V0.3 · Mat Isa</span></footer></>}
 {passwordSetup&&<div className="modal-backdrop"><section className="profile-modal" role="dialog" aria-modal="true" aria-label="Tetapkan kata laluan"><div className="profile-avatar"><Leaf/></div><span className="eyebrow">AKAUN AHLI KELUARGA</span><h2>Tetapkan kata laluan</h2><p className="profile-bio">Pautan jemputan berjaya dibuka. Pilih kata laluan baharu untuk akaun anda.</p><form className="auth-form" onSubmit={setNewPassword}><input required name="new_password" type="password" minLength={8} autoComplete="new-password" placeholder="Kata laluan baharu (min 8 aksara)"/><button className="primary-button" disabled={busy}><Save size={15}/> Simpan kata laluan</button></form></section></div>}
 {authOpen&&<div className="modal-backdrop" onClick={()=>setAuthOpen(false)}><section className="profile-modal" role="dialog" aria-modal="true" aria-label="Log masuk" onClick={e=>e.stopPropagation()}><button className="close-button" onClick={()=>setAuthOpen(false)} aria-label="Tutup"><X/></button><span className="eyebrow">AHLI KELUARGA</span><h2>Log masuk</h2><p className="profile-bio">Akaun keluarga dibuat melalui jemputan pentadbir.</p><form className="auth-form" onSubmit={signIn}><input required type="email" autoComplete="email" placeholder="Alamat e-mel" value={email} onChange={e=>setEmail(e.target.value)}/><input required minLength={8} type="password" autoComplete="current-password" placeholder="Kata laluan" value={password} onChange={e=>setPassword(e.target.value)}/><button className="primary-button" disabled={busy}>Log masuk</button></form></section></div>}
 {selected&&<div className="modal-backdrop" onClick={()=>{setSelected(null);setEdit(false)}}><section className="profile-modal" role="dialog" aria-modal="true" aria-label={`Profil ${selected.full_name}`} onClick={e=>e.stopPropagation()}><button className="close-button" onClick={()=>{setSelected(null);setEdit(false)}} aria-label="Tutup"><X/></button><div className="profile-avatar">{initials(selected.full_name)}</div><span className="eyebrow">PROFIL AHLI KELUARGA</span>{edit?<form className="auth-form" onSubmit={saveProfile}><input name="full_name" required defaultValue={selected.full_name} placeholder="Nama penuh"/><input name="nickname" defaultValue={selected.nickname??''} placeholder="Nama panggilan (pilihan)"/>{admin&&<label className="parent-edit-field"><span>Ibu atau bapa</span><select name="parent_id" defaultValue={selected.parent_id??''}><option value="">Tiada hubungan ibu/bapa</option>{members.filter(m=>!prohibitedParentIds.has(m.id)).map(m=><option key={m.id} value={m.id}>{m.full_name}</option>)}</select></label>}{admin&&<label className="parent-edit-field"><span>Kembar dengan</span><select name="twin_of" defaultValue={selected.twin_ids[0]??''}><option value="">Tiada hubungan kembar</option>{members.filter(m=>m.id!==selected.id).map(m=><option key={m.id} value={m.id}>{m.full_name}</option>)}</select></label>}<input name="birth_year" type="number" defaultValue={selected.birth_year??''} placeholder="Tahun lahir"/><input name="death_year" type="number" defaultValue={selected.death_year??''} placeholder="Tahun meninggal"/><input name="birthplace" defaultValue={selected.birthplace??''} placeholder="Tempat asal"/><input name="gender" defaultValue={selected.gender??''} placeholder="Jantina"/>{admin&&<label className="member-checkbox"><input type="checkbox" name="is_deceased" defaultChecked={selected.is_deceased}/><span>Meninggal dunia</span></label>}<textarea name="bio" defaultValue={selected.bio??''} placeholder="Cerita ringkas"/><button className="primary-button" disabled={busy}><Save size={15}/> Simpan</button></form>:<><h2>{selected.full_name}</h2><div className="profile-rel">{selected.parent_id?`Anak kepada ${members.find(m=>m.id===selected.parent_id)?.full_name??'ahli keluarga'}`:'Pangkal salasilah'}</div><div className={`profile-status ${selected.is_deceased?'is-deceased':'is-living'}`}>{selected.is_deceased?'Meninggal dunia':'Masih hidup'}</div>{admin&&selected.parent_id&&<div className="child-order-panel"><span>Susunan anak · 1 ialah sulung</span><form onSubmit={saveChildOrder}><select name="child_order" defaultValue={selectedChildOrder}>{selectedSiblings.map((member,index)=><option key={member.id} value={index+1}>Anak ke-{index+1}</option>)}</select><button className="primary-button" disabled={busy}><Save size={14}/> Simpan susunan</button></form></div>}<div className="profile-facts">{selected.twin_ids.length>0&&<div><span>Kumpulan kembar</span><b>{twinGroup(selected,members).map(m=>m.full_name).join(', ')}</b></div>}{selected.birth_year&&<div><span>Tahun lahir</span><b>{selected.birth_year}</b></div>}{selected.death_year&&<div><span>Tahun meninggal</span><b>{selected.death_year}</b></div>}{selected.gender&&<div><span>Jantina</span><b>{selected.gender}</b></div>}{selected.birthplace&&<div><span>Tempat asal</span><b><MapPin size={14}/>{selected.birthplace}</b></div>}</div><p className="profile-bio">{selected.bio||'Belum ada cerita direkodkan untuk ahli keluarga ini.'}</p><div className="profile-note"><Heart size={15}/> Cerita keluarga disimpan bersama.</div>{(selected.user_id===user?.id||admin)&&<button className="edit-profile" onClick={()=>setEdit(true)}><Pencil size={15}/> Edit profil</button>}</>}</section></div>}
 </main>
}
function MemberCard({member,root=false,onClick}:{member:Member;root?:boolean;onClick:()=>void}){return <button className={`member-card ${root?'root-card':''}`} onClick={onClick}><span className="member-avatar">{initials(member.full_name)}</span><span className="member-info"><small>{root?'PANGKAL KELUARGA':'AHLI KELUARGA'}</small><strong>{member.full_name}</strong>{member.nickname&&<span className="member-nickname">“{member.nickname}”</span>}{member.is_deceased&&<small className="member-status">MENINGGAL DUNIA</small>}<span>{root?'Buka profil':'Lihat profil'} <span aria-hidden>↗</span></span></span><span className="member-leaf"><Leaf size={16}/></span></button>}
function FamilyBranch({member,members,query,zoom,onSelect,root=false,ancestors=[],depth=1}:{member:Member;members:Member[];query:string;zoom:number;onSelect:(member:Member)=>void;root?:boolean;ancestors?:string[];depth?:number}){
 const childrenRef=useRef<HTMLDivElement>(null)
 const [connectors,setConnectors]=useState<{width:number;height:number;path:string}|null>(null)
 const children=sortChildren(members.filter(child=>child.parent_id===member.id&&!ancestors.includes(child.id)&&branchMatches(child,members,query)))
 const childOrderKey=children.map(child=>`${child.id}:${child.child_order}`).join('|')
 useLayoutEffect(()=>{
  const container=childrenRef.current
  if(!container||children.length===0)return
  const update=()=>{
   const bounds=container.getBoundingClientRect()
   const cards=Array.from(container.querySelectorAll<HTMLElement>(':scope > .family-branch > .member-card'))
   const points=cards.map(card=>{const rect=card.getBoundingClientRect();return{x:(rect.left+rect.width/2-bounds.left)/zoom,left:(rect.left-bounds.left)/zoom,y:(rect.top-bounds.top)/zoom,height:rect.height/zoom}})
   if(!points.length)return
   const busY=12
   const path=depth===3?`M ${bounds.width/zoom/2} ${busY} H 12 V ${Math.max(...points.map(point=>point.y+point.height/2))} ${points.map(point=>`M 12 ${point.y+point.height/2} H ${point.left}`).join(' ')}`:`M ${points[0].x} ${busY} H ${points[points.length-1].x} ${points.map(point=>`M ${point.x} ${busY} V ${point.y}`).join(' ')}`
   setConnectors({width:bounds.width/zoom,height:Math.max(32,...points.map(point=>point.y+point.height+2)),path})
  }
  update()
  const observer=new ResizeObserver(update)
  observer.observe(container)
  container.querySelectorAll(':scope > .family-branch > .member-card').forEach(card=>observer.observe(card))
 window.addEventListener('resize',update)
  return()=>{observer.disconnect();window.removeEventListener('resize',update)}
 },[childOrderKey,depth,query,zoom])
 if(ancestors.includes(member.id)||!branchMatches(member,members,query))return null
 return <div className={`family-branch${root?' root-branch':''}`}><MemberCard member={member} root={root} onClick={()=>onSelect(member)}/>{children.length>0&&<div className={`family-children${depth===3?' vertical-children':''}`} ref={childrenRef}>{connectors&&<svg className="family-connectors" width={connectors.width} height={connectors.height} viewBox={`0 0 ${connectors.width} ${connectors.height}`} aria-hidden="true"><path d={connectors.path}/></svg>}{children.map(child=><FamilyBranch key={child.id} member={child} members={members} query={query} zoom={zoom} depth={depth+1} onSelect={onSelect} ancestors={[...ancestors,member.id]}/>)}</div>}</div>
}
export default App
