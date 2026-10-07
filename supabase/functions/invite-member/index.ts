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
    if(typeof member_id!=='string'||typeof email!=='string'||!email.includes('@')) {
      return Response.json({error:'Member and valid email are required'},{status:400,headers:cors})
    }

    const admin=createClient(url,service,{auth:{autoRefreshToken:false,persistSession:false}})
    const {data:member,error:memberError}=await admin.from('family_members').select('id,family_id,user_id').eq('id',member_id).single()
    if(memberError||!member) return Response.json({error:'Member not found'},{status:404,headers:cors})

    const {data:role}=await admin.from('family_admins').select('user_id').eq('family_id',member.family_id).eq('user_id',user.id).maybeSingle()
    if(!role) return Response.json({error:'Family admin access required'},{status:403,headers:cors})
    if(member.user_id) return Response.json({error:'This member already has a linked account'},{status:409,headers:cors})

    const redirectTo=Deno.env.get('INVITE_REDIRECT_URL')??'https://family-tree.amirulazmi-ali.workers.dev'
    const brevoApiKey=Deno.env.get('BREVO_API_KEY')
    const brevoSenderEmail=Deno.env.get('BREVO_SENDER_EMAIL')
    const brevoSenderName=Deno.env.get('BREVO_SENDER_NAME')??'Salasilah Keluarga'

    // Preferred path: generate the Supabase invite link without using Supabase SMTP,
    // then send the message directly through Brevo's transactional email API.
    if(brevoApiKey&&brevoSenderEmail){
      const {data:generated,error:generateError}=await admin.auth.admin.generateLink({
        type:'invite',
        email,
        redirectTo,
        data:{family_member_id:member.id},
      })

      if(generateError||!generated?.user||!generated.properties?.action_link){
        return Response.json({error:generateError?.message??'Gagal menghasilkan pautan jemputan'},{status:400,headers:cors})
      }

      const {error:linkError}=await admin
        .from('family_members')
        .update({user_id:generated.user.id})
        .eq('id',member.id)
        .is('user_id',null)

      if(linkError){
        await admin.auth.admin.deleteUser(generated.user.id)
        return Response.json({error:`Gagal memautkan akaun jemputan: ${linkError.message}`},{status:500,headers:cors})
      }

      const actionLink=generated.properties.action_link
      const htmlContent=`<!doctype html>
<html><body style="font-family:Arial,sans-serif;line-height:1.6;color:#333">
  <h2>Jemputan Salasilah Keluarga</h2>
  <p>Anda telah dijemput untuk menyertai keluarga dalam aplikasi Salasilah Keluarga.</p>
  <p><a href="${actionLink}" style="display:inline-block;padding:11px 18px;background:#333;color:#fff;text-decoration:none;border-radius:6px">Terima Jemputan</a></p>
  <p>Pautan ini akan membawa anda ke aplikasi untuk menetapkan kata laluan akaun anda.</p>
  <p style="font-size:12px;color:#777">Jika anda tidak menjangka jemputan ini, abaikan email ini.</p>
</body></html>`

      const brevoResponse=await fetch('https://api.brevo.com/v3/smtp/email',{
        method:'POST',
        headers:{
          accept:'application/json',
          'api-key':brevoApiKey,
          'content-type':'application/json',
        },
        body:JSON.stringify({
          sender:{email:brevoSenderEmail,name:brevoSenderName},
          to:[{email}],
          subject:'Jemputan Salasilah Keluarga',
          htmlContent,
          textContent:`Anda telah dijemput untuk menyertai Salasilah Keluarga. Terima jemputan: ${actionLink}`,
          tags:['family-tree-invite'],
        }),
      })

      if(!brevoResponse.ok){
        const detail=await brevoResponse.text()
        await admin.from('family_members').update({user_id:null}).eq('id',member.id).eq('user_id',generated.user.id)
        await admin.auth.admin.deleteUser(generated.user.id)
        return Response.json({error:`Email gagal dihantar melalui Brevo: ${detail.slice(0,500)}`},{status:502,headers:cors})
      }

      return Response.json({ok:true,provider:'brevo'},{headers:cors})
    }

    // Compatibility fallback: use Supabase's configured SMTP if Brevo API secrets
    // have not been configured yet.
    const {data:invite,error}=await admin.auth.admin.inviteUserByEmail(email,{
      redirectTo,
      data:{family_member_id:member.id},
    })
    if(error||!invite.user) return Response.json({error:error?.message??'Invite failed'},{status:400,headers:cors})

    const {error:linkError}=await admin.from('family_members').update({user_id:invite.user.id}).eq('id',member.id).is('user_id',null)
    if(linkError) return Response.json({error:`Gagal memautkan akaun jemputan: ${linkError.message}`},{status:500,headers:cors})

    return Response.json({ok:true,provider:'supabase'},{headers:cors})
  } catch(error) {
    return Response.json({error:error instanceof Error?error.message:'Invalid request'},{status:400,headers:cors})
  }
})
