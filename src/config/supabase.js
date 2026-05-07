// src/config/supabase.js
const { createClient } = require('@supabase/supabase-js');

const { SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY } = process.env;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('Missing Supabase env vars. Check your .env file.');
}

const normalizeSupabaseUrl = (url) => {
  try {
    const parsed = new URL(url);
    return parsed.origin;
  } catch (err) {
    return url.replace(/\/rest\/v1\/?$/, '');
  }
};

const baseUrl = normalizeSupabaseUrl(SUPABASE_URL);

// Public client — respects RLS (customer-facing reads)
const supabase = createClient(baseUrl, SUPABASE_ANON_KEY, {
  auth: { persistSession: false },
});

// Admin client — bypasses RLS (all server-side writes)
const supabaseAdmin = createClient(baseUrl, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

module.exports = { supabase, supabaseAdmin };
