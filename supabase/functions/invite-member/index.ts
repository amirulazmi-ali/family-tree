import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors={ 'Access-Control-Allow-Origin':'*', 'Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods':'POST, OPTIONS' }
Deno.serve(async (req)=>{
  if(req.method==='OPTIONS') return new Response('ok',{headers:cors})
  if(req.method!=='POST') return Response.json({error:'Method not allowed'},{status:405,headers:cors})
  try {
    const url=Deno.env.get('SUPABASE_URL')!
    const publishableKeys=JSON.parse(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS')??'{}')
    const secretKeys=JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS')??'{}')
    const anon=publishableKeys.default??Deno.env.get('SUPABASE_ANON_KEY')!
    const service=secretKeys.default??Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const authorization=req.headers.get('Authorization')
    if(!authorization?.startsWith('Bearer ')) return Response.json({error:'Authentication required'},{status:401,headers:cors})
    const caller=createClient(url,anon,{global:{headers:{Authorization:authorization}}})
    const {data:{user},error:authError}=await caller.auth.getUser()
    if(authError||!user) return Response.json({error:'Invalid session'},{status:401,headers:cors})
    const {member_id,email}=await req.json()
    if(typeof member_id!=='string'||typeof email!=='string'||!email.includes('@')) return Response.json({error:'Member and valid email are required'},{status:400,headers:cors})
    const admin=createClient(url,service,{auth:{autoRefreshToken:false,persistSession:false}})
    const {data:member,error:memberError}=await admin.from('family_members').select('id,family_id,user_id').eq('id',member_id).single()
    if(memberError||!member) return Response.json({error:'Member not found'},{status:404,headers:cors})
    const {data:role}=await admin.from('family_admins').select('user_id').eq('family_id',member.family_id).eq('user_id',user.id).maybeSingle()
    if(!role) return Response.json({error:'Family admin access required'},{status:403,headers:cors})
    if(member.user_id) return Response.json({error:'This member already has a linked account'},{status:409,headers:cors})
    const redirectTo=Deno.env.get('INVITE_REDIRECT_URL')
    const {data:invite,error}=await admin.auth.admin.inviteUserByEmail(email,{...(redirectTo?{redirectTo}:{}),data:{family_member_id:member.id}})
    if(error||!invite.user) return Response.json({error:error?.message??'Invite failed'},{status:400,headers:cors})
    const {error:linkError}=await admin.from('family_members').update({user_id:invite.user.id}).eq('id',member.id).is('user_id',null)
    if(linkError){await admin.auth.admin.deleteUser(invite.user.id);return Response.json({error:'Could not link invited account'},{status:500,headers:cors})}
    return Response.json({ok:true},{headers:cors})
  } catch { return Response.json({error:'Invalid request'},{status:400,headers:cors}) }
})
