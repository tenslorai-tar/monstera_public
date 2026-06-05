import { usePdfStore } from '../store/usePdfStore'

export default function LayersPanel() {
  const layers              = usePdfStore(s => s.layers)
  const toggleLayerVisibility = usePdfStore(s => s.toggleLayerVisibility)

  return (
    <div className="side-panel" style={{ width: 240, borderLeft: '1px solid var(--border)' }}>
      <div className="side-panel-header">
        <span>Layers ({layers.length})</span>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>
        {layers.length === 0 && (
          <div style={{ padding: '12px 10px', fontSize: 12, opacity: 0.5 }}>
            This document has no layers (Optional Content Groups).
          </div>
        )}
        {layers.map(layer => (
          <div key={layer.id} style={{ padding: '5px 10px', display: 'flex', alignItems: 'center', gap: 8,
            borderBottom: '1px solid var(--border)', fontSize: 13 }}>
            <input
              type="checkbox"
              checked={layer.visible}
              onChange={() => toggleLayerVisibility(layer.id)}
              style={{ cursor: 'pointer', accentColor: 'var(--accent, #4a9eff)' }}
            />
            <span style={{ flex: 1, opacity: layer.visible ? 1 : 0.45,
              textDecoration: layer.visible ? 'none' : 'line-through',
              cursor: 'pointer', userSelect: 'none' }}
              onClick={() => toggleLayerVisibility(layer.id)}>
              {layer.name}
            </span>
            <span style={{ fontSize: 10, opacity: 0.4 }}>{layer.visible ? 'on' : 'off'}</span>
          </div>
        ))}
      </div>
      {layers.length > 0 && (
        <div style={{ padding: '6px 10px', borderTop: '1px solid var(--border)', display: 'flex', gap: 6 }}>
          <button className="annot-tool-btn" style={{ fontSize: 11, padding: '3px 8px' }}
            title="Show all layers"
            onClick={() => layers.filter(l => !l.visible).forEach(l => toggleLayerVisibility(l.id))}>
            Show All
          </button>
          <button className="annot-tool-btn" style={{ fontSize: 11, padding: '3px 8px' }}
            title="Hide all layers"
            onClick={() => layers.filter(l => l.visible).forEach(l => toggleLayerVisibility(l.id))}>
            Hide All
          </button>
        </div>
      )}
    </div>
  )
}
