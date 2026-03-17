// LogPanel.js — fetch interceptor + debug modal
const { useState, useEffect, useRef } = React;

// Global log store
window._hueLog = window._hueLog || [];
window._hueLogListeners = window._hueLogListeners || [];

function hueLog(level, message, detail) {
  const entry = {
    id: Date.now() + Math.random(),
    time: new Date().toLocaleTimeString(),
    level,
    message,
    detail: detail || null
  };
  window._hueLog.push(entry);
  if (window._hueLog.length > 200) window._hueLog.shift();
  window._hueLogListeners.forEach(fn => fn([...window._hueLog]));
}

// Intercept fetch to log all API calls
const _originalFetch = window.fetch;
window.fetch = async function(url, opts) {
  if (typeof url === 'string' && url.startsWith('/api/')) {
    const method = (opts && opts.method) || 'GET';
    const body = opts && opts.body;
    const shortUrl = url.replace('/api/', '');
    hueLog('info', `${method} ${shortUrl}`, body ? JSON.parse(body) : null);
    try {
      const resp = await _originalFetch.call(this, url, opts);
      if (!resp.ok) {
        let errDetail = null;
        try { errDetail = await resp.clone().json(); } catch(e) {}
        const errMsg = errDetail && errDetail.message ? errDetail.message : `HTTP ${resp.status}`;
        hueLog('error', `${method} ${shortUrl} → ${resp.status}: ${errMsg}`, errDetail);
      } else {
        hueLog('success', `${method} ${shortUrl} → ${resp.status}`);
      }
      return resp;
    } catch (err) {
      hueLog('error', `${method} ${shortUrl} failed: ${err.message}`);
      throw err;
    }
  }
  return _originalFetch.call(this, url, opts);
};

// Debug modal component
function DebugModal({ onClose }) {
  const [logs, setLogs] = useState([...window._hueLog]);
  const [filter, setFilter] = useState('all');
  const [copiedId, setCopiedId] = useState(null);
  const scrollRef = useRef(null);

  useEffect(() => {
    const listener = (newLogs) => setLogs(newLogs);
    window._hueLogListeners.push(listener);
    return () => {
      window._hueLogListeners = window._hueLogListeners.filter(fn => fn !== listener);
    };
  }, []);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs]);

  // Close on Escape
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const filtered = filter === 'all' ? logs : logs.filter(l => {
    if (filter === 'error') return l.level === 'error' || l.level === 'warn';
    return l.level === filter;
  });

  const errorCount = logs.filter(l => l.level === 'error').length;

  const clearLogs = () => {
    window._hueLog = [];
    setLogs([]);
  };

  const copyEntry = (entry) => {
    const text = `[${entry.time}] ${entry.message}${entry.detail ? '\n' + (typeof entry.detail === 'string' ? entry.detail : JSON.stringify(entry.detail, null, 2)) : ''}`;
    navigator.clipboard.writeText(text).then(() => {
      setCopiedId(entry.id);
      setTimeout(() => setCopiedId(null), 1500);
    });
  };

  const levelIcon = (level) => {
    switch (level) {
      case 'error': return '✕';
      case 'warn': return '⚠';
      case 'success': return '✓';
      default: return '→';
    }
  };

  const levelColor = (level) => {
    switch (level) {
      case 'error': return '#ef4444';
      case 'warn': return '#f59e0b';
      case 'success': return '#22c55e';
      default: return '#60a5fa';
    }
  };

  return (
    <div className="debug-overlay" onClick={onClose}>
      <div className="debug-modal" onClick={e => e.stopPropagation()}>
        <div className="debug-header">
          <div className="debug-header-left">
            <i className="fas fa-bug" style={{ color: 'var(--accent-purple)', marginRight: 8 }}></i>
            <span className="debug-title">Debug Log</span>
            {errorCount > 0 && <span className="log-error-badge">{errorCount}</span>}
          </div>
          <div className="debug-header-right">
            <select className="log-filter" value={filter} onChange={e => setFilter(e.target.value)}>
              <option value="all">All</option>
              <option value="error">Errors</option>
              <option value="info">Requests</option>
              <option value="success">Success</option>
            </select>
            <button className="log-clear-btn" onClick={clearLogs} title="Clear logs">
              <i className="fas fa-trash-alt"></i>
            </button>
            <button className="debug-close-btn" onClick={onClose} title="Close">
              <i className="fas fa-times"></i>
            </button>
          </div>
        </div>
        <div className="debug-body" ref={scrollRef}>
          {filtered.length === 0 && <div className="log-empty">No log entries yet.</div>}
          {filtered.map(entry => (
            <div key={entry.id} className={`log-entry log-${entry.level}`}>
              <span className="log-time">{entry.time}</span>
              <span className="log-icon" style={{ color: levelColor(entry.level) }}>{levelIcon(entry.level)}</span>
              <span className="log-message">{entry.message}</span>
              {entry.detail && (
                <span className="log-detail">{typeof entry.detail === 'string' ? entry.detail : JSON.stringify(entry.detail)}</span>
              )}
              {(entry.level === 'error' || entry.level === 'warn') && (
                <button className="log-copy-btn" onClick={() => copyEntry(entry)} title="Copy error">
                  <i className={`fas ${copiedId === entry.id ? 'fa-check' : 'fa-copy'}`}></i>
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
