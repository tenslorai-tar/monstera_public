import { useState } from 'react'
import { usePdfStore } from '../store/usePdfStore'
import { flattenAllLayers, removeLayer, renameLayer } from '../utils/layerOps'

export default function LayersPanel() {
  const layers              = usePdfStore(s => s.layers)
  const toggleLayerVisibility = usePdfStore(s => s.toggleLayerVisibility)
  const getBakedBytes       = usePdfStore(s => s.getBakedBytes)
  const applyEdit           = usePdfStore(s => s.applyEdit)

  const [busy, setBusy] = useState(false)
  const [editing, setEditing] = useState<string | null>(null)
  const [editName, setEditName] = useState('')

  const runOp = async (fn: (bytes: Uint8Array) => Promise<Uint8Array>) => {
    setBusy(true)
    try {
      const bytes = await getBakedBytes()
      const out = await fn(bytes)
      await applyEdit(out)
    } catch (e: any) {
      alert(`Layer operation failed: ${e?.message ?? 'unknown error'}`)
    }
    setBusy(false)
  }

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
            {editing === layer.id ? (
              <input className="bookmark-edit-input" autoFocus value={editName}
                onChange={e => setEditName(e.target.value)}
                onBlur={() => { setEditing(null); if (editName.trim() && editName !== layer.name) runOp(b => renameLayer(b, layer.name, editName.trim())) }}
                onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setEditing(null) }}
                style={{ flex: 1, fontSize: 12 }} />
            ) : (
              <span style={{ flex: 1, opacity: layer.visible ? 1 : 0.45,
                textDecoration: layer.visible ? 'none' : 'line-through',
                cursor: 'pointer', userSelect: 'none' }}
                onClick={() => toggleLayerVisibility(layer.id)}
                onDoubleClick={() => { setEditing(layer.id); setEditName(layer.name) }}
                title="Double-click to rename">
                {layer.name}
              </span>
            )}
            <button className="bookmark-delete" title="Remove layer (its content becomes permanently visible)"
              disabled={busy}
              onClick={() => { if (confirm(`Remove layer "${layer.name}"? Its content will become permanently visible.`)) runOp(b => removeLayer(b, layer.name)) }}
              style={{ opacity: 1 }}>×</button>
          </div>
        ))}
      </div>
      {layers.length > 0 && (
        <div style={{ padding: '6px 10px', borderTop: '1px solid var(--border)', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
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
          <button className="annot-tool-btn" style={{ fontSize: 11, padding: '3px 8px' }}
            title="Flatten all layers — bake their content permanently into the page (removes layering)"
            disabled={busy}
            onClick={() => { if (confirm('Flatten all layers? All layer content becomes permanently visible and layering is removed.')) runOp(flattenAllLayers) }}>
            ⊞ Flatten All
          </button>
        </div>
      )}
    </div>
  )
}
