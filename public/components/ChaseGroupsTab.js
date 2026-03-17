// ChaseGroupsTab.js — Tab showing all chase groups with create functionality
const { useState, useEffect } = React;

function ChaseGroupsTab({ chaseGroups, sequences, rooms, onRefresh }) {
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [selectedMembers, setSelectedMembers] = useState([]); // [{ type, id, name }]

  // Get all strips from rooms
  const allStrips = [];
  (rooms || []).forEach(room => {
    (room.lights || []).forEach(light => {
      if (light.isStrip || light.isOmniGlow) {
        allStrips.push({ id: light.id, name: light.name, roomName: room.name });
      }
    });
  });

  const toggleMember = (type, id, name) => {
    setSelectedMembers(prev => {
      const exists = prev.find(m => m.type === type && m.id === id);
      if (exists) return prev.filter(m => !(m.type === type && m.id === id));
      return [...prev, { type, id, name }];
    });
  };

  const isMemberSelected = (type, id) => selectedMembers.some(m => m.type === type && m.id === id);

  const createGroup = async () => {
    if (!newName.trim() || selectedMembers.length < 1) return;
    const members = selectedMembers.map(m => ({ type: m.type, id: m.id, name: m.name }));
    try {
      await fetch('/api/chase-groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName.trim(), members })
      });
      setCreating(false);
      setNewName('');
      setSelectedMembers([]);
      onRefresh();
    } catch (err) {
      console.error('Failed to create chase group:', err);
    }
  };

  const handleDelete = async (id) => {
    try {
      await fetch(`/api/chase-groups/${id}`, { method: 'DELETE' });
      onRefresh();
    } catch (err) {
      console.error('Failed to delete chase group:', err);
    }
  };

  const handleUpdate = async (id, updates) => {
    try {
      await fetch(`/api/chase-groups/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates)
      });
      onRefresh();
    } catch (err) {
      console.error('Failed to update chase group:', err);
    }
  };

  const stopAll = async () => {
    try {
      await fetch('/api/chase-groups/stop-all', { method: 'PUT' });
      onRefresh();
    } catch (err) {
      console.error('Failed to stop all:', err);
    }
  };

  return (
    <div className="cg-tab">
      {/* Header bar */}
      <div className="cg-tab-header">
        <button className="cg-create-btn" onClick={() => setCreating(!creating)}>
          <i className={`fas ${creating ? 'fa-times' : 'fa-plus'}`}></i>
          {creating ? ' Cancel' : ' New Chase Group'}
        </button>
        <button className="cg-stop-all-btn" onClick={stopAll} title="Stop all chase groups">
          <i className="fas fa-stop"></i> Stop All
        </button>
      </div>

      {/* Create form */}
      {creating && (
        <div className="cg-create-form">
          <input
            type="text"
            className="cg-create-name"
            placeholder="Chase group name"
            value={newName}
            onChange={e => setNewName(e.target.value)}
          />

          {/* Select sequences */}
          {sequences.length > 0 && (
            <div className="cg-create-section">
              <span className="cg-section-label">Chase Sequences</span>
              {sequences.map(seq => (
                <label key={seq.id} className={`cg-create-option${isMemberSelected('sequence', seq.id) ? ' selected' : ''}`}>
                  <input
                    type="checkbox"
                    checked={isMemberSelected('sequence', seq.id)}
                    onChange={() => toggleMember('sequence', seq.id, seq.name)}
                  />
                  <i className="fas fa-link"></i>
                  <span>{seq.name}</span>
                  <span className="cg-option-detail">{seq.lightIds.length} lights</span>
                </label>
              ))}
            </div>
          )}

          {/* Select strips */}
          {allStrips.length > 0 && (
            <div className="cg-create-section">
              <span className="cg-section-label">Light Strips</span>
              {allStrips.map(strip => (
                <label key={strip.id} className={`cg-create-option${isMemberSelected('strip', strip.id) ? ' selected' : ''}`}>
                  <input
                    type="checkbox"
                    checked={isMemberSelected('strip', strip.id)}
                    onChange={() => toggleMember('strip', strip.id, strip.name)}
                  />
                  <i className="fas fa-grip-lines"></i>
                  <span>{strip.name}</span>
                  <span className="cg-option-detail">{strip.roomName}</span>
                </label>
              ))}
            </div>
          )}

          <button
            className="cg-create-save"
            onClick={createGroup}
            disabled={!newName.trim() || selectedMembers.length < 1}
          >
            <i className="fas fa-check"></i> Create Group ({selectedMembers.length} member{selectedMembers.length !== 1 ? 's' : ''})
          </button>
        </div>
      )}

      {/* Group list */}
      {chaseGroups.length === 0 && !creating ? (
        <div className="empty-state">
          <i className="fas fa-object-group"></i>
          <p>No chase groups yet</p>
          <p className="hint">Create a chase group to control multiple lights together</p>
        </div>
      ) : (
        <div className="cg-list">
          {chaseGroups.map(cg => (
            <ChaseGroupCard
              key={cg.id}
              group={cg}
              onDelete={handleDelete}
              onUpdate={handleUpdate}
            />
          ))}
        </div>
      )}
    </div>
  );
}
