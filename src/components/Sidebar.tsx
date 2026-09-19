import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { User } from '@supabase/supabase-js';

export default function Sidebar({ onSelectProject }: { onSelectProject: (code: string) => void }) {
  const [user, setUser] = useState<User | null>(null);
  const [projects, setProjects] = useState<any[]>([]);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState('');
  
  const supabase = createClient();

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (session?.user) fetchProjects(session.user.id);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (session?.user) fetchProjects(session.user.id);
      else setProjects([]);
    });

    const handleProjectSaved = () => {
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (session?.user) fetchProjects(session.user.id);
      });
    };
    window.addEventListener('project-saved', handleProjectSaved);

    return () => {
      subscription.unsubscribe();
      window.removeEventListener('project-saved', handleProjectSaved);
    };
  }, []);

  async function fetchProjects(userId: string) {
    const { data, error } = await supabase
      .from('projects')
      .select('*')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false });
    
    if (data) setProjects(data);
  }

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setAuthError('Email and password are required.');
      return;
    }
    setAuthError('');
    const { error } = await supabase.auth.signUp({ email, password });
    if (error) setAuthError(error.message);
    else alert('Check your email for the confirmation link!');
  };

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setAuthError('Email and password are required.');
      return;
    }
    setAuthError('');
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setAuthError(error.message);
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
  };

  if (loading) return <div style={{ width: '260px', padding: '20px', color: '#8b8bab' }}>Loading...</div>;

  return (
    <div style={{ width: '260px', flexShrink: 0, display: 'flex', flexDirection: 'column', borderRight: '1px solid rgba(255,255,255,0.06)', background: 'rgba(10,10,15,1)' }}>
      {/* Sidebar Header */}
      <div style={{ padding: '20px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <h2 style={{ fontSize: '14px', fontWeight: 600, color: '#e4e4f0', margin: 0 }}>My Projects</h2>
      </div>

      {/* Projects List or Auth UI */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>
        {!user ? (
          <form style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <p style={{ fontSize: '12px', color: '#8b8bab', margin: '0 0 8px 0' }}>Sign in to save your UI components.</p>
            <input 
              type="email" 
              placeholder="Email" 
              value={email}
              onChange={e => setEmail(e.target.value)}
              style={{ padding: '10px', borderRadius: '6px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', fontSize: '13px' }}
            />
            <input 
              type="password" 
              placeholder="Password" 
              value={password}
              onChange={e => setPassword(e.target.value)}
              style={{ padding: '10px', borderRadius: '6px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', fontSize: '13px' }}
            />
            {authError && <div style={{ color: '#ef4444', fontSize: '12px' }}>{authError}</div>}
            <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
              <button onClick={handleSignIn} style={{ flex: 1, padding: '8px', borderRadius: '6px', background: 'rgba(255,255,255,0.1)', border: 'none', color: '#fff', cursor: 'pointer', fontSize: '13px' }}>Log In</button>
              <button onClick={handleSignUp} style={{ flex: 1, padding: '8px', borderRadius: '6px', background: 'rgba(99,102,241,0.2)', border: '1px solid rgba(99,102,241,0.3)', color: '#a5b4fc', cursor: 'pointer', fontSize: '13px' }}>Sign Up</button>
            </div>
          </form>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {projects.length === 0 ? (
              <div style={{ fontSize: '13px', color: '#6b6b8a' }}>No projects yet. Build something!</div>
            ) : (
              projects.map(p => (
                <div 
                  key={p.id} 
                  onClick={() => onSelectProject(p.code)}
                  style={{ padding: '12px', borderRadius: '8px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)', cursor: 'pointer', transition: 'background 0.2s' }}
                >
                  <div style={{ fontSize: '13px', color: '#e4e4f0', fontWeight: 500 }}>{p.title}</div>
                  <div style={{ fontSize: '11px', color: '#6b6b8a', marginTop: '4px' }}>{new Date(p.updated_at).toLocaleDateString()}</div>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* User Footer */}
      {user && (
        <div style={{ padding: '16px 20px', borderTop: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: '12px', color: '#8b8bab', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '140px' }}>
            {user.email}
          </div>
          <button onClick={handleSignOut} style={{ background: 'transparent', border: 'none', color: '#ef4444', fontSize: '12px', cursor: 'pointer' }}>
            Logout
          </button>
        </div>
      )}
    </div>
  );
}
