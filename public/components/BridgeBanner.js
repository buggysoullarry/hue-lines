// BridgeBanner.js — Bridge connection status, discovery, and pairing
const { useState, useEffect } = React;

function BridgeBanner({ error, onReconnect }) {
  // States: idle, discovering, found, validating, key_invalid, pairing, paired
  const [phase, setPhase] = useState('idle');
  const [bridges, setBridges] = useState([]);
  const [selectedIp, setSelectedIp] = useState('');
  const [manualIp, setManualIp] = useState('');
  const [message, setMessage] = useState('');
  const [pairAttempts, setPairAttempts] = useState(0);

  const discover = async () => {
    setPhase('discovering');
    setMessage('Searching for Hue bridges on your network...');
    try {
      const resp = await fetch('/api/bridge/discover');
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.message || 'Discovery failed');
      if (data.bridges && data.bridges.length > 0) {
        setBridges(data.bridges);
        setSelectedIp(data.bridges[0].ip);
        setPhase('found');
        setMessage(`Found ${data.bridges.length} bridge${data.bridges.length > 1 ? 's' : ''}`);
      } else {
        setPhase('idle');
        setMessage('No bridges found. Try entering the IP manually.');
      }
    } catch (err) {
      setPhase('idle');
      setMessage(`Discovery failed: ${err.message}. Try entering the IP manually.`);
    }
  };

  const validate = async (ip) => {
    setPhase('validating');
    setMessage(`Checking connection to ${ip}...`);
    try {
      const resp = await fetch(`/api/bridge/validate?ip=${encodeURIComponent(ip)}`);
      const data = await resp.json();
      if (data.valid) {
        // Key works — save the new IP and reconnect
        await fetch('/api/bridge/save', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ bridgeIp: ip })
        });
        setPhase('paired');
        setMessage('Connected! Reloading...');
        setTimeout(() => {
          onReconnect();
          setPhase('idle');
        }, 1500);
      } else {
        setPhase('key_invalid');
        setMessage(data.error || 'API key is not valid for this bridge.');
      }
    } catch (err) {
      setPhase('idle');
      setMessage(`Validation failed: ${err.message}`);
    }
  };

  const useIp = (ip) => {
    if (!ip || !ip.trim()) {
      setMessage('Please enter a valid IP address.');
      return;
    }
    setSelectedIp(ip.trim());
    validate(ip.trim());
  };

  const startPairing = () => {
    setPhase('pairing');
    setPairAttempts(0);
    setMessage('Press the link button on your Hue bridge, then click "Pair Now".');
  };

  const pair = async () => {
    setPairAttempts(prev => prev + 1);
    setMessage('Attempting to pair...');
    try {
      const resp = await fetch('/api/bridge/pair', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ip: selectedIp })
      });
      const data = await resp.json();
      if (data.success) {
        setMessage('Paired! Saving credentials...');
        await fetch('/api/bridge/save', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            bridgeIp: selectedIp,
            username: data.username,
            appkey: data.clientkey
          })
        });
        setPhase('paired');
        setMessage('Successfully paired and saved! Reloading...');
        setTimeout(() => {
          onReconnect();
          setPhase('idle');
        }, 2000);
      } else {
        setPhase('pairing');
        if (data.type === 101) {
          setMessage('Link button not pressed yet. Press the button on your bridge, then click "Pair Now".');
        } else {
          setMessage(`Pairing failed: ${data.error}`);
        }
      }
    } catch (err) {
      setPhase('pairing');
      setMessage(`Pairing error: ${err.message}. Try again.`);
    }
  };

  const iconForPhase = () => {
    switch (phase) {
      case 'discovering':
      case 'validating': return 'fa-spinner fa-spin';
      case 'found': return 'fa-check-circle';
      case 'paired': return 'fa-check-circle';
      case 'key_invalid': return 'fa-key';
      case 'pairing': return 'fa-hand-pointer';
      default: return 'fa-exclamation-triangle';
    }
  };

  return (
    <div className="bridge-banner">
      <div className="bridge-banner-icon">
        <i className={`fas ${iconForPhase()}`}></i>
      </div>
      <div className="bridge-banner-content">
        <div className="bridge-banner-title">
          {phase === 'paired' ? 'Bridge Connected' :
           phase === 'pairing' || phase === 'key_invalid' ? 'Bridge Pairing Required' :
           'Cannot Connect to Hue Bridge'}
        </div>
        <div className="bridge-banner-message">
          {message || error.message}
        </div>

        <div className="bridge-banner-actions">
          {/* Idle / Initial state */}
          {phase === 'idle' && (
            <>
              <button className="bridge-btn bridge-btn-primary" onClick={discover}>
                <i className="fas fa-search"></i> Discover Bridge
              </button>
              <div className="bridge-manual-ip">
                <input
                  type="text"
                  className="bridge-ip-input"
                  placeholder="Or enter IP manually"
                  value={manualIp}
                  onChange={e => setManualIp(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && useIp(manualIp)}
                />
                <button className="bridge-btn bridge-btn-secondary" onClick={() => useIp(manualIp)}>
                  Connect
                </button>
              </div>
            </>
          )}

          {/* Discovering */}
          {phase === 'discovering' && (
            <div className="bridge-status-text">Searching...</div>
          )}

          {/* Found bridges */}
          {phase === 'found' && (
            <>
              {bridges.length > 1 ? (
                <select className="bridge-select" value={selectedIp} onChange={e => setSelectedIp(e.target.value)}>
                  {bridges.map(b => (
                    <option key={b.id} value={b.ip}>{b.ip} ({b.id})</option>
                  ))}
                </select>
              ) : (
                <span className="bridge-found-ip">{selectedIp}</span>
              )}
              <button className="bridge-btn bridge-btn-primary" onClick={() => useIp(selectedIp)}>
                <i className="fas fa-plug"></i> Use This Bridge
              </button>
            </>
          )}

          {/* Key invalid — need to pair */}
          {phase === 'key_invalid' && (
            <>
              <button className="bridge-btn bridge-btn-primary" onClick={startPairing}>
                <i className="fas fa-key"></i> Create New Key
              </button>
              <button className="bridge-btn bridge-btn-secondary" onClick={discover}>
                <i className="fas fa-search"></i> Try Different Bridge
              </button>
            </>
          )}

          {/* Pairing mode */}
          {phase === 'pairing' && (
            <>
              <div className="bridge-pair-instructions">
                <div className="bridge-pair-step">
                  <span className="bridge-step-num">1</span>
                  Press the large link button on top of your Hue bridge
                </div>
                <div className="bridge-pair-step">
                  <span className="bridge-step-num">2</span>
                  Then click the button below within 30 seconds
                </div>
              </div>
              <button className="bridge-btn bridge-btn-pair" onClick={pair}>
                <i className="fas fa-link"></i> Pair Now
              </button>
              {pairAttempts > 0 && (
                <span className="bridge-pair-hint">Attempt {pairAttempts} — make sure the button is pressed</span>
              )}
            </>
          )}

          {/* Paired */}
          {phase === 'paired' && (
            <div className="bridge-status-text bridge-success">
              <i className="fas fa-check"></i> Connected successfully
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
