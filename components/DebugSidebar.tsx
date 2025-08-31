"use client"
import { useEffect, useMemo, useState } from 'react'
import * as THREE from 'three'
import { useUIStore, ControlKey } from '@/lib/store'

const CONTROL_LABELS: Record<ControlKey, string> = {
  LeftHand: 'Left Hand',
  RightHand: 'Right Hand',
  LeftFoot: 'Left Foot',
  RightFoot: 'Right Foot'
}

export function DebugSidebar() {
  const bones = useUIStore(s => s.bones)
  const modelRoot = useUIStore(s => s.modelRoot)
  const setSelectedBone = useUIStore(s => s.setSelectedBone)
  const toggleControl = useUIStore(s => s.toggleControl)
  const controls = useUIStore(s => s.controls)
  const modelName = useUIStore(s => s.modelName)
  const setModelName = useUIStore(s => s.setModelName)

  const [filter, setFilter] = useState('')
  const filtered = useMemo(() => bones.filter(b => b.toLowerCase().includes(filter.toLowerCase())), [bones, filter])

  // Helpers: highlight selected bone
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
        {Object.entries(CONTROL_LABELS).map(([key, label]) => (
          <div className="row" key={key}>
            <label style={{ width: 48 }}>{label}</label>
            <input style={{ flex: 1 }} readOnly value={controls[key as ControlKey].boneName || 'Not Set'} />
            <label className="row" style={{ gap: 4 }}>
              <input type="checkbox" checked={controls[key as ControlKey].enabled} onChange={() => toggleControl(key as ControlKey)} />Constraint
            </label>
          </div>
        ))}
      </div>

      <div className="section">
        <strong>Bone List</strong>
        <div className="row"><input placeholder="Filter" value={filter} onChange={e => setFilter(e.target.value)} style={{ width: '100%' }} /></div>
        <div style={{ maxHeight: 280, overflow: 'auto', border: '1px solid #eee', borderRadius: 6, padding: 6 }}>
          {filtered.map(name => (
            <div key={name} className="bone-item" onClick={() => setSelectedBone(name)}>
              {name}
            </div>
          ))}
        </div>
      </div>

      <div className="section" style={{ fontSize: 12, color: '#666' }}>
        <div>Drag Gizmos to move effectors</div>
        <div>When there are no constraints, the whole body moves</div>
      </div>
    </div>
  )
}
