import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: cors })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  try {
    const url = Deno.env.get('SUPABASE_URL')!
    const publishableKeys = JSON.parse(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS') ?? '{}')
    const secretKeys = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') ?? '{}')
    const anon = publishableKeys.default ?? Deno.env.get('SUPABASE_ANON_KEY')!
    const service = secretKeys.default ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    const authorization = req.headers.get('Authorization')
    if (!authorization?.startsWith('Bearer ')) {
      return json({ error: 'Authentication required' }, 401)
    }

    const caller = createClient(url, anon, {
      global: { headers: { Authorization: authorization } },
    })
    const { data: { user }, error: authError } = await caller.auth.getUser()
    if (authError || !user) return json({ error: 'Invalid session' }, 401)

    const { member_id, email } = await req.json()
    if (
      typeof member_id !== 'string' ||
      typeof email !== 'string' ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
    ) {
      return json({ error: 'Member and valid email are required' }, 400)
    }

    const normalizedEmail = email.trim().toLowerCase()
    const admin = createClient(url, service, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    const { data: member, error: memberError } = await admin
      .from('family_members')
      .select('id, family_id, user_id, full_name')
      .eq('id', member_id)
      .single()

    if (memberError || !member) return json({ error: 'Member not found' }, 404)

    // Always verify the caller's family-admin role before looking up or linking accounts.
    const { data: role } = await admin
      .from('family_admins')
      .select('user_id')
      .eq('family_id', member.family_id)
      .eq('user_id', user.id)
      .maybeSingle()

    if (!role) return json({ error: 'Family admin access required' }, 403)
    if (member.user_id) return json({ error: 'This member already has a linked account' }, 409)

    // Find an existing Auth user first. Supabase does not allow inviting an email
    // that is already registered, so existing accounts must be linked instead.
    let targetUser: { id: string; email?: string } | null = null
    const perPage = 1000
    for (let page = 1; page <= 100; page++) {
      const { data, error } = await admin.auth.admin.listUsers({ page, perPage })
      if (error) return json({ error: `Failed to look up existing account: ${error.message}` }, 502)

      const users = data.users ?? []
      const match = users.find((candidate) =>
        candidate.email?.trim().toLowerCase() === normalizedEmail
      )

      if (match) {
        targetUser = { id: match.id, email: match.email }
        break
      }
      if (users.length < perPage) break
    }

    let provider: 'existing-account' | 'supabase-invite' = 'existing-account'
    if (!targetUser) {
      const redirectTo = Deno.env.get('INVITE_REDIRECT_URL')
        ?? 'https://family-tree.amirulazmi-ali.workers.dev'

      // New accounts still use Supabase Auth's built-in invitation email system.
      const { data: invite, error } = await admin.auth.admin.inviteUserByEmail(normalizedEmail, {
        redirectTo,
        data: { family_member_id: member.id },
      })

      if (error || !invite.user) {
        return json({ error: error?.message ?? 'Invite failed' }, 400)
      }
      targetUser = { id: invite.user.id, email: invite.user.email }
      provider = 'supabase-invite'
    }

    // Never attach one Auth account to two family-member records.
    const { data: existingLink, error: existingLinkError } = await admin
      .from('family_members')
      .select('id, full_name')
      .eq('user_id', targetUser.id)
      .maybeSingle()

    if (existingLinkError) {
      return json({ error: `Failed to check account link: ${existingLinkError.message}` }, 500)
    }
    if (existingLink && existingLink.id !== member.id) {
      return json({
        error: `This account is already linked to another family member (${existingLink.full_name}).`,
      }, 409)
    }

    const { data: linkedMember, error: linkError } = await admin
      .from('family_members')
      .update({ user_id: targetUser.id })
      .eq('id', member.id)
      .is('user_id', null)
      .select('id')
      .maybeSingle()

    if (linkError) {
      if (linkError.code === '23505') {
        return json({ error: 'This account is already linked to another family member.' }, 409)
      }
      return json({ error: `Gagal memautkan akaun: ${linkError.message}` }, 500)
    }
    if (!linkedMember) {
      return json({ error: 'The member record changed before linking. Refresh and try again.' }, 409)
    }

    return json({ ok: true, provider, linkedExistingAccount: provider === 'existing-account' })
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Invalid request' }, 400)
  }
})
