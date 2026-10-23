/**
 * QA harness, NOT shipped: mounts the real portal screens in a plain page so a browser test can drive them without a Sanity login.
 * The Studio chrome (navigation bar, router, sign-in) is not part of it. The token comes from ?token= (test only).
 */
// The Studio always loads Sanity UI's stylesheet; a bare page must do the same or its overlays (checkbox, text input) cover the page.
import '@sanity/ui/styles.css';
import { studioTheme, ThemeProvider } from '@sanity/ui';
import { StrictMode, useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { createApi } from '../portal/api';
import { Gate } from '../portal/Gate';
import { LeadsApp } from '../portal/LeadsApp';
import { OverviewApp } from '../portal/OverviewApp';
import { StaffApp } from '../portal/StaffApp';

type Tool = 'overview' | 'content' | 'leads' | 'staff';
const tools: Array<{ id: Tool; label: string }> = [
  { id: 'overview', label: 'Tổng quan' },
  { id: 'content', label: 'Quản trị nội dung' },
  { id: 'leads', label: 'Quản lý Lead' },
  { id: 'staff', label: 'Quản trị nhân sự' },
];
const fromHash = (): Tool => (tools.find((t) => `#${t.id}` === location.hash)?.id ?? 'overview');

function App() {
  const token = new URLSearchParams(location.search).get('token') ?? '';
  const api = useMemo(() => createApi(() => token || undefined), [token]);
  const [tool, setTool] = useState<Tool>(fromHash());
  useEffect(() => {
    const onHash = () => setTool(fromHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  const go = (path: '/content' | '/leads' | '/staff') => {
    location.hash = path.slice(1);
  };
  return (
    <ThemeProvider theme={studioTheme}>
      <header style={{ display: 'flex', gap: 8, padding: 8, borderBottom: '1px solid #ccc', flexWrap: 'wrap' }}>
        <nav aria-label="Công cụ" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {tools.map((t) => (
            <a key={t.id} href={`#${t.id}`} aria-current={tool === t.id ? 'page' : undefined} style={{ padding: 8, color: '#101112', fontWeight: tool === t.id ? 700 : 400 }}>
              {t.label}
            </a>
          ))}
        </nav>
      </header>
      <main>
        {tool === 'content' ? <p style={{ padding: 16 }}>Quản trị nội dung (Sanity Studio) — không nằm trong bộ kiểm thử này.</p> : null}
        {tool === 'overview' ? <Gate api={api} title="">{(me) => <OverviewApp api={api} me={me} go={go} />}</Gate> : null}
        {tool === 'leads' ? <Gate api={api} title="">{(me) => <LeadsApp api={api} me={me} />}</Gate> : null}
        {tool === 'staff' ? <Gate api={api} title="">{(me) => <StaffApp api={api} me={me} />}</Gate> : null}
      </main>
    </ThemeProvider>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
