require('dotenv').config();
const { supabaseAdmin } = require('./src/config/supabase');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

(async () => {
  console.log('JWT_SECRET present:', !!process.env.JWT_SECRET, 'length:', process.env.JWT_SECRET?.length);
  try {
    const token = jwt.sign({ foo: 'bar' }, process.env.JWT_SECRET, { expiresIn: '24h' });
    console.log('JWT sign ok:', token.slice(0, 20));
  } catch (err) {
    console.error('JWT ERR:', err.message);
  }

  try {
    const { data, error } = await supabaseAdmin
      .from('admins')
      .select('id,email,name,is_active,password_hash')
      .eq('email', 'admin@watchstorepk.com')
      .single();
    console.log('ADMIN QUERY:', { data: { id: data?.id, email: data?.email, name: data?.name, is_active: data?.is_active }, error });
    if (data) {
      const match = await bcrypt.compare('Admin@1234', data.password_hash);
      console.log('PASSWORD MATCH:', match);
    }
  } catch (err) {
    console.error('SUPABASE ERR:', err.message || err);
  }
})();
