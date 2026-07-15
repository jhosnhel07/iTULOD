require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

async function run() {
  // Sign in to get the real user ID
  const { data, error } = await supabase.auth.signInWithPassword({
    email: 'admin@itulod.local', password: 'admin'
  });

  if (error) {
    console.error('signIn failed:', error.message);
    return;
  }

  const userId = data.user.id;
  console.log('Signed in. User ID:', userId);

  // Now check the profile lookup (exactly as the login route does it)
  const { data: profile, error: profileErr } = await supabase
    .from('profiles')
    .select('role, is_active')
    .eq('id', userId)
    .single();

  console.log('Profile result:', profile);
  console.log('Profile error :', profileErr);

  if (!profile) {
    console.log('\n❌ PROBLEM: No profile found for this user ID!');
    console.log('   The login route will return 401 because profile is null and is_active check fails.');
    console.log('\n   FIX: Run this SQL in Supabase SQL Editor:');
    console.log(`
INSERT INTO public.profiles (id, full_name, email, role, is_active)
VALUES ('${userId}', 'Administrator', 'admin@itulod.local', 'admin', true)
ON CONFLICT (id) DO UPDATE SET role = 'admin', is_active = true, email = 'admin@itulod.local';
    `);
  } else if (!profile.is_active) {
    console.log('\n❌ PROBLEM: Profile exists but is_active = false → causes 403');
    console.log(`   FIX: UPDATE public.profiles SET is_active = true WHERE id = '${userId}';`);
  } else {
    console.log('\n✅ Profile looks good. Role:', profile.role, '| is_active:', profile.is_active);
    console.log('   Login should succeed. Make sure you restarted the server after the last change.');
  }
}

run().catch(console.error);
