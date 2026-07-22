/* global process */
import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return res.status(500).json({ error: 'Supabase credentials missing on server environment' });
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  // Validate authorization and user role
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ error: 'Unauthorized: Missing token' });
  }
  const token = authHeader.split(' ')[1];
  if (!token) {
    return res.status(401).json({ error: 'Unauthorized: Invalid token format' });
  }
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) {
    return res.status(401).json({ error: 'Unauthorized: Invalid session' });
  }
  const { data: profile, error: profileErr } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();
  if (profileErr || !profile || !profile.role) {
    return res.status(403).json({ error: 'Forbidden: Missing user role' });
  }

  const role = profile.role;
  if (role !== 'Super Admin') {
    return res.status(403).json({ error: 'Forbidden: Unauthorized access' });
  }

  try {
    // Connect with admin client to bypass RLS
    const supabaseAdmin = serviceKey ? createClient(supabaseUrl, serviceKey) : supabase;
    const { data: logs, error: logsError } = await supabaseAdmin
      .from('audit_logs')
      .select('*')
      .order('timestamp', { ascending: false })
      .limit(300);

    if (logsError) throw logsError;

    // Filter logs secure checks
    let visibleLogs = logs || [];

    if (role === 'Admin') {
      // Admin cannot see Super Admin actions or details
      const { data: superAdmins } = await supabaseAdmin
        .from('profiles')
        .select('email')
        .eq('role', 'Super Admin');
      
      const superAdminEmails = new Set((superAdmins || []).map(u => u.email));
      
      visibleLogs = visibleLogs.filter(log => 
        log.role !== 'Super Admin' && 
        !superAdminEmails.has(log.performed_by)
      );
    }

    return res.status(200).json(visibleLogs);
  } catch (err) {
    console.error('API audit logs fetch failed:', err);
    return res.status(500).json({ error: 'Failed to fetch audit logs: ' + err.message });
  }
}
