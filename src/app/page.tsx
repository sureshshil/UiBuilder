'use client';

import { useState, useRef, useEffect, useMemo, Component, ReactNode, ErrorInfo } from 'react';
import dynamic from 'next/dynamic';
import Editor from '@monaco-editor/react';
import Sidebar from '@/components/Sidebar';
import { createClient } from '@/lib/supabase/client';

// Dynamically import Sandpack components to avoid SSR issues
const SandpackProvider = dynamic(
  () => import('@codesandbox/sandpack-react').then(m => m.SandpackProvider),
  { ssr: false }
);
const SandpackLayout = dynamic(
  () => import('@codesandbox/sandpack-react').then(m => m.SandpackLayout),
  { ssr: false }
);
const SandpackPreview = dynamic(
  () => import('@codesandbox/sandpack-react').then(m => m.SandpackPreview),
  { ssr: false, loading: () => <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6b6b8a', height: '100%' }}>Loading sandbox...</div> }
);

class ErrorBoundary extends Component<{children: ReactNode}, {hasError: boolean, error: Error | null}> {
  constructor(props: {children: ReactNode}) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }
  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("ErrorBoundary caught an error", error, errorInfo);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 40, color: 'white', background: '#0a0a0f', height: '100vh' }}>
          <h2>Something went wrong.</h2>
          <pre style={{ color: '#ef4444', whiteSpace: 'pre-wrap' }}>
            {this.state.error?.toString()}
          </pre>
          <button onClick={() => window.location.href = '/'} style={{ marginTop: 20, padding: '10px 20px', cursor: 'pointer' }}>
            Reload Page
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

export default function Home() {
  const [messages, setMessages] = useState<ChatMessage[]>([
    { id: '1', role: 'assistant', content: 'Hi! I am your AI Web Builder Copilot. Describe the UI you want me to build — a dashboard, a login form, a card component, anything!' }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [generatedCode, setGeneratedCode] = useState('');
  const [activeTab, setActiveTab] = useState<'preview' | 'code'>('preview');
  const [isDeploying, setIsDeploying] = useState(false);
  const [deployedUrl, setDeployedUrl] = useState('');
  const [selectedFile, setSelectedFile] = useState('/App.tsx');

  const sandpackFiles = useMemo(() => {
    if (!generatedCode) return {};
    
    const files: Record<string, { code: string, active?: boolean }> = {
      "/styles.css": { code: "body { margin: 0; padding: 0; box-sizing: border-box; font-family: sans-serif; }" }
    };
    
    const fileRegex = /<file path="([^"]+)">([\s\S]*?)<\/file>/g;
    let match;
    let foundFiles = false;
    
    while ((match = fileRegex.exec(generatedCode)) !== null) {
      foundFiles = true;
      const path = match[1].startsWith('/') ? match[1] : `/${match[1]}`;
      files[path] = { 
        code: match[2].trim(),
        active: path === '/App.tsx'
      };
    }
    
    // Backward compatibility for old single-file projects
    if (!foundFiles) {
      files["/App.tsx"] = { code: generatedCode, active: true };
    }
    
    return files;
  }, [generatedCode]);

  const deployProject = async () => {
    if (!sandpackFiles || Object.keys(sandpackFiles).length === 0) return;
    setIsDeploying(true);
    setDeployedUrl('');
    
    try {
      const response = await fetch('/api/deploy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ files: sandpackFiles, name: 'web-builder-copilot-app' })
      });
      
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to deploy');
      
      setDeployedUrl(data.url);
      setMessages(prev => [...prev, { id: Date.now().toString(), role: 'assistant', content: `🚀 Deployment successful! Your app is live at:\n\n${data.url}` }]);
    } catch (err: any) {
      alert(`Deployment failed: ${err.message}`);
    } finally {
      setIsDeploying(false);
    }
  };

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || isLoading) return;

    const userMsg: ChatMessage = { id: Date.now().toString(), role: 'user', content: text };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput('');
    setIsLoading(true);

    // Build API messages - inject current code as context in last user message
    const apiMessages = newMessages.map(m => ({ role: m.role, content: m.content }));
    apiMessages[apiMessages.length - 1].content += `\n\n[Current Code (use as starting point if modifying)]:\n${generatedCode}`;

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: apiMessages }),
      });

      if (!response.ok) throw new Error(`API error: ${response.status}`);

      let fullCode = await response.text();

      // Strip markdown code fences if the model adds them despite instructions
      if (fullCode.startsWith('```')) {
        fullCode = fullCode.replace(/^```[a-z]*\n?/, '');
      }
      if (fullCode.endsWith('```')) {
        fullCode = fullCode.replace(/\n?```$/, '');
      }
      fullCode = fullCode.trim();
      setGeneratedCode(fullCode);
      setMessages(prev => [...prev, { id: Date.now().toString(), role: 'assistant', content: '✅ Done! Your component is ready in the preview panel. Ask me to change anything!' }]);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      setMessages(prev => [...prev, { id: Date.now().toString(), role: 'assistant', content: `Sorry, something went wrong: ${msg}` }]);
    } finally {
      setIsLoading(false);
      inputRef.current?.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const handleDownload = () => {
    if (!generatedCode) return;
    const blob = new Blob([generatedCode], { type: 'text/typescript' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'App.tsx';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleSaveProject = async () => {
    if (!generatedCode) return;

    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    
    if (!session?.user) {
      alert("Please sign in from the sidebar to save projects.");
      return;
    }

    const title = prompt("Enter a title for this project:");
    if (!title) return;

    let payload = generatedCode;
    try {
      const historyStr = btoa(encodeURIComponent(JSON.stringify(messages)));
      payload = `/* --- CHAT_HISTORY_BASE64 ---\n${historyStr}\n--- END_CHAT_HISTORY_BASE64 --- */\n` + generatedCode;
    } catch (e) {
      console.warn("Failed to stringify/encode chat history for saving", e);
    }

    const { error } = await supabase.from('projects').insert({
      user_id: session.user.id,
      title,
      code: payload
    });

    if (error) {
      alert("Error saving: " + error.message);
    } else {
      alert("Project saved successfully!");
      window.dispatchEvent(new Event('project-saved'));
    }
  };

  const handleNewProject = () => {
    if (isLoading) return;
    setMessages([{ id: '1', role: 'assistant', content: 'Starting fresh! Describe the UI you want me to build.' }]);
    setInput('');
    setGeneratedCode('');
    setActiveTab('preview');
    inputRef.current?.focus();
  };

  return (
    <ErrorBoundary>
      <div style={{ display: 'flex', height: '100vh', width: '100vw', background: '#0a0a0f', color: '#e4e4f0', fontFamily: "'Inter', -apple-system, sans-serif", overflow: 'hidden' }}>
      
        <Sidebar 
          onSelectProject={(rawCode) => {
            let code = rawCode;
            let loadedMessages: ChatMessage[] | null = null;
            
            // Strip embedded chat history if present
            const match = rawCode.match(/\/\* --- CHAT_HISTORY_BASE64 ---\n([\s\S]*?)\n--- END_CHAT_HISTORY_BASE64 --- \*\/\n/);
            if (match) {
              try {
                loadedMessages = JSON.parse(decodeURIComponent(atob(match[1])));
                code = rawCode.replace(match[0], '').trim();
              } catch (e) {
                console.error('Failed to parse chat history', e);
                code = rawCode.replace(match[0], '').trim();
              }
            }

            // Detect old JSON-format projects (saved before the TSX migration)
            const trimmed = code.trim();
            if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
              setMessages([{ id: Date.now().toString(), role: 'assistant', content: '⚠️ This project was saved in the old JSON format and cannot be loaded in the new system. Please describe what you want to build and I will recreate it!' }]);
              setActiveTab('preview');
              inputRef.current?.focus();
              return;
            }

            setGeneratedCode(trimmed);
            setActiveTab('preview');
            
            if (loadedMessages) {
              setMessages([
                ...loadedMessages,
                { id: Date.now().toString(), role: 'assistant', content: '✅ Project and chat history loaded! What would you like to build next?' }
              ]);
            } else {
              setMessages([{ id: Date.now().toString(), role: 'assistant', content: '✅ Project loaded! Ask me to change anything.' }]);
            }
            inputRef.current?.focus();
          }} 
        />

      <div style={{ width: '420px', flexShrink: 0, display: 'flex', flexDirection: 'column', borderRight: '1px solid rgba(255,255,255,0.06)', background: 'rgba(15,15,25,0.95)', backdropFilter: 'blur(20px)' }}>
        <div style={{ padding: '20px 24px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', gap: '12px', background: 'rgba(255,255,255,0.02)' }}>
          <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px', flexShrink: 0 }}>✦</div>
          <div>
            <div style={{ fontWeight: 700, fontSize: '15px', letterSpacing: '-0.3px', color: '#f0f0ff' }}>Builder Copilot</div>
            <div style={{ fontSize: '11px', color: '#6b6b8a', marginTop: '1px' }}>Powered by Gemini on Vertex AI</div>
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <button
              onClick={handleNewProject}
              disabled={isLoading}
              title="New Project"
              style={{
                padding: '5px 10px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)',
                background: 'rgba(255,255,255,0.05)', color: '#8b8bab', fontSize: '12px',
                cursor: isLoading ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center',
                gap: '5px', transition: 'all 0.2s',
              }}
              onMouseOver={e => { if (!isLoading) e.currentTarget.style.background = 'rgba(255,255,255,0.1)'; }}
              onMouseOut={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
            >
              <span style={{ fontSize: '14px' }}>＋</span> New
            </button>
            <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: isLoading ? '#f59e0b' : '#22c55e', boxShadow: `0 0 8px ${isLoading ? '#f59e0b' : '#22c55e'}` }} />
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {messages
            .filter(m => !(m.role === 'assistant' && m.id !== '1' && m.content.includes('import ')))
            .map((m, i) => (
            <div key={m.id || i} style={{ display: 'flex', gap: '10px', flexDirection: m.role === 'user' ? 'row-reverse' : 'row' }}>
              <div style={{
                width: '30px', height: '30px', borderRadius: '50%', flexShrink: 0,
                background: m.role === 'user' ? 'linear-gradient(135deg, #6366f1, #8b5cf6)' : 'rgba(255,255,255,0.08)',
                border: m.role === 'user' ? 'none' : '1px solid rgba(255,255,255,0.1)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px'
              }}>
                {m.role === 'user' ? '👤' : '✦'}
              </div>
              <div style={{
                maxWidth: '78%', padding: '10px 14px', borderRadius: m.role === 'user' ? '16px 4px 16px 16px' : '4px 16px 16px 16px',
                background: m.role === 'user' ? 'linear-gradient(135deg, #6366f1, #7c3aed)' : 'rgba(255,255,255,0.06)',
                border: m.role === 'user' ? 'none' : '1px solid rgba(255,255,255,0.08)',
                fontSize: '13px', lineHeight: '1.5', color: m.role === 'user' ? '#fff' : '#c4c4d8'
              }}>
                {m.content}
              </div>
            </div>
          ))}

          {isLoading && (
            <div style={{ display: 'flex', gap: '10px', flexDirection: 'row', alignItems: 'center' }}>
              <div style={{ width: '30px', height: '30px', borderRadius: '50%', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', flexShrink: 0 }}>✦</div>
              <div style={{ padding: '10px 14px', borderRadius: '4px 16px 16px 16px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)', fontSize: '13px', color: '#6366f1', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ display: 'inline-block', animation: 'pulse 1.2s infinite' }}>⚡</span> Writing Code...
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        <div style={{ padding: '16px', borderTop: '1px solid rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.01)' }}>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Describe the UI..."
              disabled={isLoading}
              autoFocus
              style={{
                flex: 1, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: '12px', padding: '12px 16px', fontSize: '13px', color: '#e4e4f0',
                outline: 'none', transition: 'border-color 0.2s',
                opacity: isLoading ? 0.5 : 1
              }}
              onFocus={e => e.target.style.borderColor = 'rgba(99,102,241,0.6)'}
              onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.1)'}
            />
            <button
              onClick={sendMessage}
              disabled={!input.trim() || isLoading}
              style={{
                width: '42px', height: '42px', borderRadius: '12px', flexShrink: 0,
                background: !input.trim() || isLoading ? 'rgba(255,255,255,0.06)' : 'linear-gradient(135deg, #6366f1, #7c3aed)',
                border: 'none', cursor: !input.trim() || isLoading ? 'not-allowed' : 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px',
                transition: 'all 0.2s', color: !input.trim() || isLoading ? '#4a4a6a' : '#fff'
              }}
            >
              ➤
            </button>
          </div>
        </div>
      </div>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: '#0d0d18' }}>
        <div style={{ padding: '14px 24px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', gap: '12px', background: 'rgba(255,255,255,0.02)' }}>
          <div style={{ display: 'flex', gap: '6px', marginRight: '12px' }}>
            <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: '#ff5f57' }} />
            <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: '#febc2e' }} />
            <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: '#28c840' }} />
          </div>
          
          <div style={{ display: 'flex', background: 'rgba(0,0,0,0.2)', borderRadius: '6px', padding: '4px' }}>
            <button 
              onClick={() => setActiveTab('preview')}
              style={{ padding: '4px 12px', borderRadius: '4px', border: 'none', background: activeTab === 'preview' ? 'rgba(255,255,255,0.1)' : 'transparent', color: activeTab === 'preview' ? '#fff' : '#6b6b8a', fontSize: '13px', cursor: 'pointer', transition: 'all 0.2s' }}
            >
              Live Preview
            </button>
            <button 
              onClick={() => setActiveTab('code')}
              style={{ padding: '4px 12px', borderRadius: '4px', border: 'none', background: activeTab === 'code' ? 'rgba(255,255,255,0.1)' : 'transparent', color: activeTab === 'code' ? '#fff' : '#6b6b8a', fontSize: '13px', cursor: 'pointer', transition: 'all 0.2s' }}
            >
              React TSX Code
            </button>
          </div>

          {generatedCode && (
            <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px', alignItems: 'center' }}>
              {deployedUrl && (
                <a href={deployedUrl} target="_blank" rel="noopener noreferrer" style={{ color: '#a5b4fc', fontSize: '12px', textDecoration: 'none', marginRight: '8px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#28c840', animation: 'pulse 2s infinite' }} />
                  Live URL
                </a>
              )}
              <button
                onClick={deployProject}
                disabled={isDeploying}
                style={{ padding: '6px 12px', borderRadius: '6px', background: isDeploying ? 'rgba(99,102,241,0.2)' : 'linear-gradient(135deg, #6366f1, #8b5cf6)', border: 'none', color: '#fff', fontSize: '12px', cursor: isDeploying ? 'wait' : 'pointer', transition: 'opacity 0.2s', opacity: isDeploying ? 0.7 : 1, fontWeight: 500 }}
              >
                {isDeploying ? 'Deploying...' : 'Publish to Web'}
              </button>
              <button
                onClick={() => navigator.clipboard.writeText(generatedCode)}
                style={{ padding: '6px 12px', borderRadius: '6px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: '#8b8bab', fontSize: '12px', cursor: 'pointer', transition: 'background 0.2s' }}
                onMouseOver={e => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}
                onMouseOut={e => e.currentTarget.style.background = 'rgba(255,255,255,0.06)'}
              >
                Copy
              </button>
              <button
                onClick={handleSaveProject}
                style={{ padding: '6px 12px', borderRadius: '6px', background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.2)', color: '#4ade80', fontSize: '12px', cursor: 'pointer', transition: 'background 0.2s' }}
                onMouseOver={e => e.currentTarget.style.background = 'rgba(34,197,94,0.15)'}
                onMouseOut={e => e.currentTarget.style.background = 'rgba(34,197,94,0.1)'}
              >
                Save
              </button>
              <button
                onClick={() => {
                  const blob = new Blob([generatedCode], { type: 'text/typescript' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = 'App.tsx';
                  a.click();
                  URL.revokeObjectURL(url);
                }}
                style={{ padding: '6px 12px', borderRadius: '6px', background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.2)', color: '#a5b4fc', fontSize: '12px', cursor: 'pointer', transition: 'background 0.2s' }}
                onMouseOver={e => e.currentTarget.style.background = 'rgba(99,102,241,0.15)'}
                onMouseOut={e => e.currentTarget.style.background = 'rgba(99,102,241,0.1)'}
              >
                Download TSX
              </button>
            </div>
          )}
        </div>

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {generatedCode ? (
          <>
            <div style={{ flex: 1, width: '100%', height: '100%', display: activeTab === 'preview' ? 'flex' : 'none', flexDirection: 'column' }}>
              <SandpackProvider
                key={`sp-${generatedCode.length}-${Object.keys(sandpackFiles).length}`}
                template="react-ts"
                theme="dark"
                files={sandpackFiles}
                options={{
                  externalResources: ["https://cdn.tailwindcss.com"],
                }}
                  customSetup={{
                    dependencies: {
                      // Icons
                      "lucide-react": "^0.292.0",
                      // Charts
                      "recharts": "^2.10.0",
                      // Animations
                      "framer-motion": "^11.0.0",
                      // Routing
                      "react-router-dom": "^6.22.0",
                      // Forms & Validation
                      "react-hook-form": "^7.50.0",
                      "zod": "^3.22.0",
                      "@hookform/resolvers": "^3.3.0",
                      // Date utilities
                      "date-fns": "^3.3.0",
                      // Radix UI primitives
                      "@radix-ui/react-dialog": "^1.0.5",
                      "@radix-ui/react-dropdown-menu": "^2.0.6",
                      "@radix-ui/react-select": "^2.0.0",
                      "@radix-ui/react-tabs": "^1.0.4",
                      "@radix-ui/react-tooltip": "^1.0.7",
                      "@radix-ui/react-switch": "^1.0.3",
                      "@radix-ui/react-slider": "^1.1.2",
                      "@radix-ui/react-progress": "^1.0.3",
                      "@radix-ui/react-avatar": "^1.0.4",
                      "@radix-ui/react-checkbox": "^1.0.4",
                      "@radix-ui/react-label": "^2.0.2",
                      "@radix-ui/react-separator": "^1.0.3",
                      "@radix-ui/react-popover": "^1.0.7",
                      "@radix-ui/react-accordion": "^1.1.2",
                      "@radix-ui/react-alert-dialog": "^1.0.5",
                      "@radix-ui/react-toast": "^1.1.5",
                      // Headless UI
                      "@headlessui/react": "^2.0.0",
                      // Utilities
                      "clsx": "^2.1.0",
                      "uuid": "^9.0.0",
                      "class-variance-authority": "^0.7.0",
                    }
                  }}
                >
                  <SandpackLayout style={{ flex: 1, height: '100%', width: '100%', border: 'none', background: 'transparent', borderRadius: 0 }}>
                    <SandpackPreview
                      style={{ flex: 1, height: '100%', width: '100%' }}
                      showOpenInCodeSandbox={false}
                      showRefreshButton={true}
                    />
                  </SandpackLayout>
                </SandpackProvider>
              </div>
            <div style={{ flex: 1, display: activeTab === 'code' ? 'flex' : 'none', width: '100%', height: '100%' }}>
              {/* File Explorer Sidebar */}
              <div style={{ width: '220px', background: '#0a0a0f', borderRight: '1px solid rgba(255,255,255,0.06)', display: 'flex', flexDirection: 'column' }}>
                <div style={{ padding: '12px 16px', fontSize: '12px', fontWeight: 600, color: '#6b6b8a', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Files</div>
                <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflowY: 'auto' }}>
                  {Object.keys(sandpackFiles).map(path => (
                    <button
                      key={path}
                      onClick={() => setSelectedFile(path)}
                      style={{
                        padding: '8px 16px',
                        border: 'none',
                        background: selectedFile === path ? 'rgba(99,102,241,0.1)' : 'transparent',
                        color: selectedFile === path ? '#a5b4fc' : '#8b8bab',
                        textAlign: 'left',
                        fontSize: '13px',
                        cursor: 'pointer',
                        fontFamily: 'monospace',
                        transition: 'all 0.2s',
                        borderLeft: `2px solid ${selectedFile === path ? '#6366f1' : 'transparent'}`
                      }}
                      onMouseOver={e => { if (selectedFile !== path) e.currentTarget.style.background = 'rgba(255,255,255,0.02)' }}
                      onMouseOut={e => { if (selectedFile !== path) e.currentTarget.style.background = 'transparent' }}
                    >
                      {path}
                    </button>
                  ))}
                </div>
              </div>
              {/* Code Editor */}
              <div style={{ flex: 1, height: '100%' }}>
                <Editor
                  height="100%"
                  language={selectedFile.endsWith('.css') ? 'css' : 'typescript'}
                  theme="vs-dark"
                  value={sandpackFiles[selectedFile]?.code || ''}
                  options={{
                    readOnly: true,
                    minimap: { enabled: false },
                    fontSize: 13,
                    wordWrap: 'on'
                  }}
                />
              </div>
            </div>
          </>
        ) : (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '16px', color: '#3a3a5a' }}>
              <div style={{ fontSize: '64px', opacity: 0.3 }}>✦</div>
              <div style={{ fontSize: '16px', fontWeight: 600, color: '#5a5a7a' }}>Your UI will appear here</div>
              <div style={{ fontSize: '13px', color: '#3a3a5a', textAlign: 'center', maxWidth: '320px', lineHeight: '1.6' }}>
                Type a description in the chat panel on the left to generate a fully functional React component.
              </div>
            </div>
          )}
        </div>
      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 4px; }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
        input::placeholder { color: #3a3a5a !important; }
        
        /* Sandpack full-height overrides */
        .sp-wrapper, .sp-layout { height: 100% !important; width: 100% !important; border-radius: 0 !important; }
        .sp-preview { height: 100% !important; flex: 1 !important; }
        .sp-preview-container { height: 100% !important; }
        .sp-preview-iframe { height: 100% !important; width: 100% !important; border: none !important; }
      `}</style>
      </div>
    </ErrorBoundary>
  );
}
