'use client';
import { useState, useEffect, useCallback } from 'react';
import ParticleBackground from '../components/ParticleBackground';

/* ── Styles ──────────────────────────────────────────────────────────── */
const G = `
  @keyframes pulse { 0%,100%{opacity:.6}50%{opacity:1} }
  @keyframes slideIn { from{opacity:0;transform:translateY(12px)} to{opacity:1;transform:translateY(0)} }
  @keyframes spin { to{transform:rotate(360deg)} }
  .row-in { animation: slideIn .35s ease-out both; }
  .spinner { animation: spin 1s linear infinite; }
`;

const STATUS = {
  ok:      { color: '#00ff88', bg: 'rgba(0,255,136,.1)',  border: 'rgba(0,255,136,.25)', icon: '●', label: 'OK'    },
  error:   { color: '#ff3366', bg: 'rgba(255,51,102,.1)', border: 'rgba(255,51,102,.3)', icon: '✗', label: 'ERROR' },
  running: { color: '#00f0ff', bg: 'rgba(0,240,255,.08)', border: 'rgba(0,240,255,.25)', icon: '◌', label: 'LIVE'  },
  unknown: { color: '#666',    bg: 'rgba(255,255,255,.03)',border: 'rgba(255,255,255,.08)', icon: '?', label: '?'  },
};

function fmtDuration(ms) {
  if (!ms) return '—';
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms/1000).toFixed(1)}s`;
  return `${Math.floor(ms/60000)}m ${Math.round((ms%60000)/1000)}s`;
}

function fmtRelative(iso) {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60000)   return 'just now';
  if (diff < 3600000) return `${Math.round(diff/60000)}m ago`;
  if (diff < 86400000)return `${Math.round(diff/3600000)}h ago`;
  return `${Math.round(diff/86400000)}d ago`;
}

function fmtNext(iso) {
  if (!iso) return '—';
  const diff = new Date(iso).getTime() - Date.now();
  if (diff < 0)        return 'overdue';
  if (diff < 60000)    return `<1m`;
  if (diff < 3600000)  return `in ${Math.round(diff/60000)}m`;
  if (diff < 86400000) return `in ${Math.round(diff/3600000)}h`;
  return `in ${Math.round(diff/86400000)}d`;
}

/* ── Status Badge ────────────────────────────────────────────────────── */
function Badge({ status }) {
  const s = STATUS[status] || STATUS.unknown;
  return (
    <span style={{ display:'inline-flex', alignItems:'center', gap:5,
      padding:'3px 10px', borderRadius:20, fontSize:11, fontFamily:'monospace', fontWeight:'bold',
      background:s.bg, border:`1px solid ${s.border}`, color:s.color }}>
      <span style={{ animation: status==='ok' ? 'pulse 2s infinite' : 'none' }}>{s.icon}</span>
      {s.label}
    </span>
  );
}

/* ── Cron Row ────────────────────────────────────────────────────────── */
function CronRow({ job, idx }) {
  const [expanded, setExpanded] = useState(false);
  const s = STATUS[job.status] || STATUS.unknown;

  return (
    <div className="row-in" style={{ animationDelay:`${idx*40}ms`,
      borderBottom:'1px solid rgba(255,255,255,.05)', cursor:'pointer' }}
      onClick={() => setExpanded(x => !x)}>
      <div style={{ display:'grid', gridTemplateColumns:'24px 1fr 90px 80px 90px 90px',
        gap:12, padding:'12px 16px', alignItems:'center', transition:'background .2s',
        background: expanded ? 'rgba(0,240,255,.03)' : 'transparent' }}>
        {/* Expand chevron */}
        <span style={{ color:'rgba(255,255,255,.2)', fontSize:10, fontFamily:'monospace',
          transform: expanded ? 'rotate(90deg)' : 'none', transition:'transform .2s' }}>▶</span>

        {/* Name + schedule */}
        <div>
          <div style={{ fontFamily:'monospace', fontSize:13, color:'#fff', fontWeight:600 }}>
            {job.name}
            {job.consecutiveErrors >= 2 && (
              <span style={{ marginLeft:8, background:'rgba(255,51,102,.2)', color:'#ff3366',
                border:'1px solid rgba(255,51,102,.4)', borderRadius:4, fontSize:9,
                padding:'1px 5px', fontFamily:'monospace' }}>⚠ {job.consecutiveErrors} ERRORS</span>
            )}
          </div>
          <div style={{ fontSize:10, color:'rgba(255,255,255,.3)', fontFamily:'monospace', marginTop:2 }}>
            {job.schedule} · agent:{job.agentId}
          </div>
        </div>

        {/* Status */}
        <div><Badge status={job.status} /></div>

        {/* Duration */}
        <div style={{ fontFamily:'monospace', fontSize:11, color:'rgba(255,255,255,.4)', textAlign:'right' }}>
          {fmtDuration(job.lastDurationMs)}
        </div>

        {/* Last run */}
        <div style={{ fontFamily:'monospace', fontSize:11, color:'rgba(255,255,255,.35)', textAlign:'right' }}>
          {fmtRelative(job.lastRunAt)}
        </div>

        {/* Next run */}
        <div style={{ fontFamily:'monospace', fontSize:11, color:
          job.nextRunAt && new Date(job.nextRunAt) < Date.now() ? '#f0a000' : 'rgba(255,255,255,.35)',
          textAlign:'right' }}>
          {fmtNext(job.nextRunAt)}
        </div>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div style={{ padding:'0 16px 14px 52px', fontSize:12, fontFamily:'monospace' }}>
          {job.lastError && (
            <div style={{ color:'#ff3366', background:'rgba(255,51,102,.08)',
              border:'1px solid rgba(255,51,102,.2)', borderRadius:6,
              padding:'8px 12px', marginBottom:8, lineHeight:1.5 }}>
              ✗ {job.lastError}
            </div>
          )}
          <div style={{ display:'flex', gap:24, flexWrap:'wrap', color:'rgba(255,255,255,.4)' }}>
            <span>ID: <span style={{color:'rgba(255,255,255,.6)'}}>{job.id?.slice(0,8)}</span></span>
            <span>Schedule: <span style={{color:'rgba(255,255,255,.6)'}}>{job.schedule}</span></span>
            <span>Last run: <span style={{color:'rgba(255,255,255,.6)'}}>{job.lastRunAt ? new Date(job.lastRunAt).toUTCString().slice(0,22) : '—'}</span></span>
            <span>Next: <span style={{color:'rgba(255,255,255,.6)'}}>{job.nextRunAt ? new Date(job.nextRunAt).toUTCString().slice(0,22) : '—'}</span></span>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Stat Card ───────────────────────────────────────────────────────── */
function StatCard({ label, value, sub, color = '#00f0ff' }) {
  return (
    <div style={{ background:'rgba(255,255,255,.02)', border:'1px solid rgba(255,255,255,.06)',
      borderRadius:10, padding:'14px 18px', flex:1, minWidth:140 }}>
      <div style={{ fontSize:28, fontFamily:'monospace', fontWeight:'bold', color }}>{value}</div>
      <div style={{ fontSize:10, color:'rgba(255,255,255,.35)', fontFamily:'monospace',
        textTransform:'uppercase', marginTop:3 }}>{label}</div>
      {sub && <div style={{ fontSize:10, color:'rgba(255,255,255,.2)', fontFamily:'monospace', marginTop:2 }}>{sub}</div>}
    </div>
  );
}

/* ── Main Page ───────────────────────────────────────────────────────── */
export default function MissionControlPage() {
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);
  const [refresh, setRefresh] = useState(0);
  const [lastSync,setLastSync]= useState(null);

  const load = useCallback(() => {
    setLoading(true);
    fetch(`/data/mission-control.json?t=${Date.now()}`)
      .then(r => r.json())
      .then(d => { setData(d); setLastSync(new Date()); setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });
  }, []);

  useEffect(() => { load(); }, [load, refresh]);

  /* Auto-refresh every 2 min */
  useEffect(() => {
    const t = setInterval(() => setRefresh(x => x+1), 120000);
    return () => clearInterval(t);
  }, []);

  const crons     = data?.crons || [];
  const healthy   = crons.filter(c => c.status === 'ok').length;
  const errored   = crons.filter(c => c.status === 'error').length;
  const signals   = data?.signals || {};
  const genAt     = data?.generated_at ? new Date(data.generated_at) : null;
  const dataAge   = genAt ? Math.round((Date.now() - genAt.getTime()) / 60000) : null;

  return (
    <>
      <style>{G}</style>
      <div style={{ minHeight:'100vh', background:'#0a0a0f', color:'#fff', paddingTop:80 }}>
        <ParticleBackground />

        {/* Header */}
        <div style={{ position:'relative', zIndex:10, maxWidth:1100, margin:'0 auto', padding:'0 24px' }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:32 }}>
            <div>
              <div style={{ fontFamily:'monospace', fontSize:11, color:'rgba(0,240,255,.5)',
                letterSpacing:'0.3em', marginBottom:6 }}>PRESCIENCE COMMAND</div>
              <h1 style={{ fontFamily:'monospace', fontSize:32, fontWeight:'bold', margin:0 }}>
                Mission Control
              </h1>
              <div style={{ fontSize:12, color:'rgba(255,255,255,.3)', fontFamily:'monospace', marginTop:6 }}>
                {lastSync ? `Fetched ${fmtRelative(lastSync.toISOString())}` : ''}{' '}
                {dataAge !== null && (
                  <span style={{ color: dataAge > 15 ? '#f0a000' : 'rgba(255,255,255,.3)' }}>
                    · Data {dataAge === 0 ? 'fresh' : `${dataAge}m old`}
                  </span>
                )}
              </div>
            </div>

            <button onClick={() => setRefresh(x => x+1)}
              style={{ background:'rgba(0,240,255,.08)', border:'1px solid rgba(0,240,255,.2)',
                color:'#00f0ff', fontFamily:'monospace', fontSize:12, padding:'8px 16px',
                borderRadius:8, cursor:'pointer', letterSpacing:'0.1em' }}>
              {loading ? '⟳ LOADING...' : '⟳ REFRESH'}
            </button>
          </div>

          {/* Stats row */}
          <div style={{ display:'flex', gap:12, marginBottom:28, flexWrap:'wrap' }}>
            <StatCard label="Crons Total"    value={crons.length}   color="#00f0ff" />
            <StatCard label="Healthy"        value={healthy}        color="#00ff88" />
            <StatCard label="Errored"        value={errored}        color={errored > 0 ? '#ff3366' : '#666'} />
            <StatCard label="Signals Queued" value={signals.total_queued ?? '—'} color="#f0a000" />
            <StatCard label="Signals Posted" value={signals.total_posted ?? '—'} color="#00f0ff" />
            <StatCard label="Pro Subs"       value={signals.pro_subscribers ?? 0} color="#00ff88"
              sub={signals.pro_subscribers > 0 ? '🟢 paying' : 'none yet'} />
          </div>

          {/* Alerts */}
          {errored > 0 && (
            <div style={{ background:'rgba(255,51,102,.07)', border:'1px solid rgba(255,51,102,.2)',
              borderRadius:10, padding:'12px 16px', marginBottom:20, fontFamily:'monospace', fontSize:12 }}>
              <span style={{ color:'#ff3366', fontWeight:'bold' }}>⚠ {errored} cron{errored>1?'s':''} in error state</span>
              {' — '}<span style={{ color:'rgba(255,255,255,.5)' }}>Check individual rows for details</span>
            </div>
          )}

          {/* Cron table */}
          <div style={{ background:'rgba(255,255,255,.02)', border:'1px solid rgba(255,255,255,.06)',
            borderRadius:12, overflow:'hidden', marginBottom:32 }}>

            {/* Table header */}
            <div style={{ display:'grid', gridTemplateColumns:'24px 1fr 90px 80px 90px 90px',
              gap:12, padding:'10px 16px', borderBottom:'1px solid rgba(255,255,255,.08)',
              fontSize:10, fontFamily:'monospace', color:'rgba(255,255,255,.25)',
              textTransform:'uppercase', letterSpacing:'0.1em' }}>
              <div/>
              <div>Job</div>
              <div>Status</div>
              <div style={{textAlign:'right'}}>Duration</div>
              <div style={{textAlign:'right'}}>Last Run</div>
              <div style={{textAlign:'right'}}>Next Run</div>
            </div>

            {loading ? (
              <div style={{ padding:40, textAlign:'center', color:'rgba(255,255,255,.2)',
                fontFamily:'monospace', fontSize:13 }}>
                <span className="spinner" style={{ display:'inline-block', marginRight:8 }}>◌</span>
                Loading...
              </div>
            ) : error ? (
              <div style={{ padding:40, textAlign:'center', color:'#ff3366',
                fontFamily:'monospace', fontSize:13 }}>
                ✗ Failed to load: {error}
              </div>
            ) : crons.length === 0 ? (
              <div style={{ padding:40, textAlign:'center', color:'rgba(255,255,255,.2)',
                fontFamily:'monospace', fontSize:13 }}>
                No cron jobs found.
              </div>
            ) : (
              crons
                .sort((a,b) => {
                  // Errors first, then by name
                  if (a.status === 'error' && b.status !== 'error') return -1;
                  if (b.status === 'error' && a.status !== 'error') return  1;
                  return (a.name||'').localeCompare(b.name||'');
                })
                .map((job, i) => <CronRow key={job.id || job.name} job={job} idx={i} />)
            )}
          </div>

          {/* Signal pipeline status */}
          <div style={{ background:'rgba(255,255,255,.02)', border:'1px solid rgba(255,255,255,.06)',
            borderRadius:12, padding:'20px 24px', marginBottom:32 }}>
            <div style={{ fontFamily:'monospace', fontSize:11, color:'rgba(0,240,255,.4)',
              letterSpacing:'0.2em', marginBottom:14 }}>SIGNAL PIPELINE</div>
            <div style={{ display:'flex', gap:32, flexWrap:'wrap' }}>
              {[
                { label:'Scanner',   icon:'◉', color:'#00ff88', note:'Hourly' },
                { label:'1hr Delay', icon:'◉', color:'#00ff88', note:'Every 30min' },
                { label:'Pro DMs',   icon:'◉', color:'#00f0ff', note:'Instant' },
                { label:'Tracker',   icon:'◉', color:'#00ff88', note:'Every 6h' },
                { label:'Scorecard', icon:'◉', color:'#00ff88', note:'prescience.markets/scorecard' },
              ].map(({ label, icon, color, note }) => (
                <div key={label} style={{ display:'flex', alignItems:'center', gap:8 }}>
                  <span style={{ color, animation:'pulse 2.5s infinite', fontSize:10 }}>{icon}</span>
                  <div>
                    <div style={{ fontFamily:'monospace', fontSize:12, color:'rgba(255,255,255,.8)' }}>{label}</div>
                    <div style={{ fontFamily:'monospace', fontSize:10, color:'rgba(255,255,255,.3)' }}>{note}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Footer */}
          <div style={{ textAlign:'center', fontFamily:'monospace', fontSize:11,
            color:'rgba(255,255,255,.15)', paddingBottom:40 }}>
            Data snapshot · Updates on Vercel redeploy or manual sync
            {genAt && ` · Last snapshot: ${genAt.toUTCString().slice(0,22)}`}
          </div>
        </div>
      </div>
    </>
  );
}
