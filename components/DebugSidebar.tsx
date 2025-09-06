"use client"
import { useEffect, useMemo, useState } from 'react'
import * as THREE from 'three'
import { useUIStore } from '@/lib/store'
import { findObjectByName, getWorldPosition, getWorldQuaternion } from '@/lib/fbx'

export function DebugSidebar() {
  const bones = useUIStore(s => s.bones)
  const modelRoot = useUIStore(s => s.modelRoot)
  const skeletonRoot = useUIStore(s => s.skeletonRoot)

  const setSelectedBone = useUIStore(s => s.setSelectedBone)
  const controls = useUIStore(s => s.controls)

  const toggleControlPos = useUIStore(s => s.toggleControlPos)
  const toggleControlRot = useUIStore(s => s.toggleControlRot)
  const mapControlBone   = useUIStore(s => s.mapControlBone)
  const setControlLabel  = useUIStore(s => s.setControlLabel)
  const addControlFromBone = useUIStore(s => s.addControlFromBone)
  const removeControl    = useUIStore(s => s.removeControl)
  const setControlTarget = useUIStore(s => s.setControlTarget)
  const setControlTargetRot = useUIStore(s => s.setControlTargetRot)

  const modelName = useUIStore(s => s.modelName)
  const setModelName = useUIStore(s => s.setModelName)

  const [filter, setFilter] = useState('')
  const filtered = useMemo(() => bones.filter(b => b.toLowerCase().includes(filter.toLowerCase())), [bones, filter])

  // Helpers: 目立たせ用（省略可能）
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
    const searchRoot = skeletonRoot || modelRoot
    if (!searchRoot) return
    const eff = findObjectByName(searchRoot, boneName)
    const p = eff ? getWorldPosition(eff) : new THREE.Vector3()
    const id = addControlFromBone(boneName, boneName.replace(/^mixamorig:/i, ''), p)
    if (eff) setControlTargetRot(id, getWorldQuaternion(eff))
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
          <div className="control-row" key={cp.id}>
            <input
              className="control-label"
              value={cp.label}
              onChange={(e) => setControlLabel(cp.id, e.target.value)}
              title="Label"
            />
            <select
              className="control-select"
              value={cp.boneName ?? ''}
              onChange={(e) => {
                const name = e.target.value || null
                mapControlBone(cp.id, name)
                const searchRoot2 = skeletonRoot || modelRoot
                if (name && searchRoot2) {
                  const eff = findObjectByName(searchRoot2, name)
                  if (eff) {
                    setControlTarget(cp.id, getWorldPosition(eff))
                    setControlTargetRot(cp.id, getWorldQuaternion(eff))
                  }
                }
              }}
              title="Bone"
            >
              <option value="">(Not Set)</option>
              {bones.map(name => <option key={name} value={name}>{name}</option>)}
            </select>

            {/* 位置拘束 */}
            <label className="checkbox" title="Position constraint">
              <input
                type="checkbox"
                checked={cp.posEnabled}
                onChange={() => toggleControlPos(cp.id)}
              />
              <span>Pos</span>
            </label>

            {/* 角度拘束（ON にした瞬間の現在姿勢をターゲットに反映） */}
            <label className="checkbox" title="Rotation constraint">
              <input
                type="checkbox"
                checked={cp.rotEnabled}
                onChange={(e) => {
                  if (e.target.checked) {
                    const searchRoot3 = skeletonRoot || modelRoot
                    if (cp.boneName && searchRoot3) {
                      const eff = findObjectByName(searchRoot3, cp.boneName)
                      if (eff) setControlTargetRot(cp.id, getWorldQuaternion(eff))
                    }
                  }
                  toggleControlRot(cp.id)
                }}
              />
              <span>Rot</span>
            </label>

            <button className="icon-btn" onClick={() => removeControl(cp.id)} title="Remove">×</button>
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
        <div>・Pos = 位置拘束、Rot = 回転拘束</div>
        <div>・RotをONにすると、その瞬間の姿勢が目標になります</div>
        <div>・No Pos constraints → Gizmo移動で全身が並進</div>
      </div>
    </div>
  )
}
