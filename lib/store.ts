import { create } from 'zustand'
import * as THREE from 'three'

export type ControlID = string

export type ControlPoint = {
  id: ControlID
  label: string
  boneName: string | null
  enabled: boolean
  target: THREE.Vector3
}

type State = {
  modelRoot: THREE.Object3D | null
  skeletonRoot: THREE.Object3D | null
  bones: string[]
  selectedBone: string | null
  modelName: 'XBot' | 'YBot'
  controls: ControlPoint[]
  showGizmos: boolean
}

type Actions = {
  setModelRoot: (root: THREE.Object3D | null) => void
  setSkeletonRoot: (root: THREE.Object3D | null) => void
  setBones: (bones: string[]) => void
  setSelectedBone: (name: string | null) => void
  setModelName: (name: 'XBot' | 'YBot') => void

  addControlFromBone: (boneName: string, label?: string, initialTarget?: THREE.Vector3) => string
  removeControl: (id: ControlID) => void
  toggleControl: (id: ControlID) => void
  mapControlBone: (id: ControlID, boneName: string | null) => void
  setControlTarget: (id: ControlID, pos: THREE.Vector3) => void
  setControlLabel: (id: ControlID, label: string) => void

  toggleGizmos: () => void
  saveImage: (canvas?: HTMLCanvasElement) => Promise<void>
  copyImage: (canvas?: HTMLCanvasElement) => Promise<void>
}

const v3 = (x=0,y=0,z=0)=> new THREE.Vector3(x,y,z)
const pretty = (s: string) => s.replace(/^mixamorig:/i, '')

export const useUIStore = create<State & Actions>((set, get) => {
  // 一意なIDを作る
  const uniqueId = (base: string) => {
    const exist = (id: string) => get().controls.some(c => c.id === id)
    let id = base
    let i = 2
    while (exist(id)) id = `${base}#${i++}`
    return id
  }

  return {
    modelRoot: null,
    skeletonRoot: null,
    bones: [],
    selectedBone: null,
    modelName: 'XBot',

    // デフォルト4点（骨は後でSceneが自動割当する）
    controls: [
      { id: 'LeftHand',  label: 'Left Hand',  boneName: null, enabled: true, target: v3() },
      { id: 'RightHand', label: 'Right Hand', boneName: null, enabled: true, target: v3() },
      { id: 'LeftFoot',  label: 'Left Foot',  boneName: null, enabled: true, target: v3() },
      { id: 'RightFoot', label: 'Right Foot', boneName: null, enabled: true, target: v3() },
    ],
    showGizmos: true,

    setModelRoot: (root) => set({ modelRoot: root }),
    setSkeletonRoot: (root) => set({ skeletonRoot: root }),
    setBones: (bones) => set({ bones }),
    setSelectedBone: (name) => set({ selectedBone: name }),
    setModelName: (name) => set({ modelName: name }),

    addControlFromBone: (boneName, label, initialTarget) => {
      const idBase = pretty(label || boneName || 'Control')
      const id = uniqueId(idBase)
      const cp: ControlPoint = {
        id,
        label: idBase,
        boneName,
        enabled: true,
        target: initialTarget ? initialTarget.clone() : v3(),
      }
      set(state => ({ controls: [...state.controls, cp] }))
      return id
    },

    removeControl: (id) =>
      set(state => ({ controls: state.controls.filter(c => c.id !== id) })),

    toggleControl: (id) =>
      set(state => ({ controls: state.controls.map(c => c.id === id ? { ...c, enabled: !c.enabled } : c) })),

    mapControlBone: (id, boneName) =>
      set(state => ({ controls: state.controls.map(c => c.id === id ? { ...c, boneName } : c) })),

    setControlTarget: (id, pos) => {
      set(state => ({
        controls: state.controls.map(c =>
          c.id !== id
            ? c
            : (c.target.distanceToSquared(pos) < 1e-10 ? c : { ...c, target: pos.clone() })
        )
      }))
    },

    setControlLabel: (id, label) =>
      set(state => ({ controls: state.controls.map(c => c.id === id ? { ...c, label } : c) })),

    toggleGizmos: () => set(state => ({ showGizmos: !state.showGizmos })),

    // --- 画像保存/コピーはそのまま（堅牢版） ---
    saveImage: async (canvas) => {
      const el = canvas || (document.querySelector('canvas') as HTMLCanvasElement | null)
      if (!el) return
      let blob: Blob | null = await new Promise<Blob | null>(resolve => {
        el.toBlob(b => resolve(b), 'image/png')
      })
      if (!blob) {
        const dataUrl = el.toDataURL('image/png')
        const res = await fetch(dataUrl)
        blob = await res.blob()
      }
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'pose.png'
      a.style.display = 'none'
      document.body.appendChild(a)
      a.click()
      a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    },

    copyImage: async (canvas) => {
      const el = canvas || (document.querySelector('canvas') as HTMLCanvasElement | null)
      if (!el) return
      let blob: Blob | null = await new Promise<Blob | null>(resolve => {
        el.toBlob(b => resolve(b), 'image/png')
      })
      if (!blob) {
        const dataUrl = el.toDataURL('image/png')
        const res = await fetch(dataUrl)
        blob = await res.blob()
      }
      try {
        await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })])
        return
      } catch (e) {
        console.warn('Image clipboard write failed, fallback to text:', e)
      }
      try {
        const dataUrl = el.toDataURL('image/png')
        await navigator.clipboard.writeText(dataUrl)
      } catch (e) {
        console.error('Clipboard write failed:', e)
      }
    }
  }
})
