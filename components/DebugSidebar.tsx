"use client"
import { useEffect, useMemo, useState } from 'react'
import * as THREE from 'three'
import { useUIStore } from '@/lib/store'
import { findObjectByName, getWorldPosition } from '@/lib/fbx'

export function DebugSidebar() {
  const bones = useUIStore(s => s.bones)
  const modelRoot = useUIStore(s => s.modelRoot)
  const setSelectedBone = useUIStore(s => s.setSelectedBone)
  const controls = useUIStore(s => s.controls)
  const toggleControl = useUIStore(s => s.toggleControl)
  const mapControlBone = useUIStore(s => s.mapControlBone)
  const setControlLabel = useUIStore(s => s.setControlLabel)
  const addControlFromBone = useUIStore(s => s.addControlFromBone)
  const removeControl = useUIStore(s => s.removeControl)
  const setControlTarget = useUIStore(s => s.setControlTarget)

  const modelName = useUIStore(s => s.modelName)
  const setModelName = useUIStore(s => s.setModelName)

  const [filter, setFilter] = useState('')
  const filtered = useMemo(() => bones.filter(b => b.toLowerCase().includes(filter.toLowerCase())), [bones, filter])

  // Helpers: 目立たせ用
  useEffect(() => {
    if (!modelRoot) return
    const helpers: THREE.AxesHelper[] = []
    modelRoot.traverse(obj => {
      if ((obj as any).isBone) {
        const h = new THREE.AxesHelper(0.05)
        h.visible = false
        obj.add(h)
        helpers.push(h)
      }
    })
    return () => {
      helpers.forEach(h => h.parent?.remove(h))
    }
  }, [modelRoot])

  const handleAdd = (boneName: string) => {
    if (!modelRoot) return
    const eff = findObjectByName(modelRoot, boneName)
    const p = eff ? getWorldPosition(eff) : new THREE.Vector3()
    addControlFromBone(boneName, boneName.replace(/^mixamorig:/i, ''), p)
  }

  return (
    <div className="sidebar">
      <div className="section">
        <strong>Model</strong>
        <div className="row">
          <label>Select</label>
          <select value={modelName} onChange={(e) => setModelName(e.target.value as 'XBot' | 'YBot')}>
            <option value="XBot">XBot</option>
            <option value="YBot">YBot</option>
          </select>
        </div>
      </div>

      <div className="section">
        <strong>Control Points</strong>
        {controls.map(cp => (
          <div className="row" key={cp.id} style={{ gap: 6, alignItems: 'center' }}>
            <input
              style={{ width: 110 }}
              value={cp.label}
              onChange={(e) => setControlLabel(cp.id, e.target.value)}
              title="Label"
            />
            <select
              style={{ flex: 1 }}
              value={cp.boneName ?? ''}
              onChange={(e) => {
                const name = e.target.value || null
                mapControlBone(cp.id, name)
                if (name && modelRoot) {
                  const eff = findObjectByName(modelRoot, name)
                  if (eff) setControlTarget(cp.id, getWorldPosition(eff))
                }
              }}
              title="Bone"
            >
              <option value="">(Not Set)</option>
              {bones.map(name => <option key={name} value={name}>{name}</option>)}
            </select>
            <label className="row" style={{ gap: 4 }}>
              <input type="checkbox" checked={cp.enabled} onChange={() => toggleControl(cp.id)} />
              Constraint
            </label>
            <button onClick={() => removeControl(cp.id)} title="Remove">×</button>
          </div>
        ))}
      </div>

      <div className="section">
        <strong>Bone List</strong>
        <div className="row">
          <input placeholder="Filter" value={filter} onChange={e => setFilter(e.target.value)} style={{ width: '100%' }} />
        </div>
        <div style={{ maxHeight: 280, overflow: 'auto', border: '1px solid #eee', borderRadius: 6, padding: 6 }}>
          {filtered.map(name => (
            <div key={name} className="bone-item" onClick={() => setSelectedBone(name)} style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
              <span>{name}</span>
              <button onClick={(e) => { e.stopPropagation(); handleAdd(name) }} title="Add control">＋</button>
            </div>
          ))}
        </div>
      </div>

      <div className="section" style={{ fontSize: 12, color: '#666' }}>
        <div>・Click ＋ to add a control for that bone</div>
        <div>・Drag Gizmos to move effectors</div>
        <div>・When no constraints, the whole body moves</div>
      </div>
    </div>
  )
}
