import { create } from 'zustand'
import * as THREE from 'three'

export type ControlKey = 'LeftHand' | 'RightHand' | 'LeftFoot' | 'RightFoot'

export type ControlPoint = {
  key: ControlKey
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
  controls: Record<ControlKey, ControlPoint>
  showGizmos: boolean
}

type Actions = {
  setModelRoot: (root: THREE.Object3D | null) => void
  setSkeletonRoot: (root: THREE.Object3D | null) => void
  setBones: (bones: string[]) => void
  setSelectedBone: (name: string | null) => void
  setModelName: (name: 'XBot' | 'YBot') => void
  mapControlBone: (key: ControlKey, boneName: string | null) => void
  toggleControl: (key: ControlKey) => void
  setControlTarget: (key: ControlKey, pos: THREE.Vector3) => void
  toggleGizmos: () => void
  saveImage: (canvas?: HTMLCanvasElement) => Promise<void>
  copyImage: (canvas?: HTMLCanvasElement) => Promise<void>
}

const v3 = (x=0,y=0,z=0)=> new THREE.Vector3(x,y,z)

export const useUIStore = create<State & Actions>((set, get) => ({
  modelRoot: null,
  skeletonRoot: null,
  bones: [],
  selectedBone: null,
  modelName: 'XBot',
  controls: {
    LeftHand: { key: 'LeftHand', boneName: null, enabled: true, target: v3() },
    RightHand: { key: 'RightHand', boneName: null, enabled: true, target: v3() },
    LeftFoot: { key: 'LeftFoot', boneName: null, enabled: true, target: v3() },
    RightFoot: { key: 'RightFoot', boneName: null, enabled: true, target: v3() }
  },
  showGizmos: true,

  setModelRoot: (root) => set({ modelRoot: root }),
  setSkeletonRoot: (root) => set({ skeletonRoot: root }),
  setBones: (bones) => set({ bones }),
  setSelectedBone: (name) => set({ selectedBone: name }),
  setModelName: (name) => set({ modelName: name }),
  mapControlBone: (key, boneName) => set(state => ({ controls: { ...state.controls, [key]: { ...state.controls[key], boneName } } })),
  toggleControl: (key) => set(state => ({ controls: { ...state.controls, [key]: { ...state.controls[key], enabled: !state.controls[key].enabled } } })),
  setControlTarget: (key, pos) => {
    const cur = get().controls[key].target
    if (cur.distanceToSquared(pos) < 1e-10) return
    set(state => ({ controls: { ...state.controls, [key]: { ...state.controls[key], target: pos.clone() } } }))
  },
  toggleGizmos: () => set(state => ({ showGizmos: !state.showGizmos })),

  saveImage: async (canvas) => {
    const el = canvas || (document.querySelector('canvas') as HTMLCanvasElement | null)
    if (!el) return

    // まず toBlob、ダメなら dataURL→Blob にフォールバック
    let blob: Blob | null = await new Promise<Blob | null>(resolve => {
      // Safari でも基本OK（nullの可能性は一応ケア）
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
    // すぐ revoke すると一部ブラウザでDLが失敗するので少し遅らせる
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  },

  copyImage: async (canvas) => {
    const el = canvas || (document.querySelector('canvas') as HTMLCanvasElement | null)
    if (!el) return

    // 画像Blob化
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
    // フォールバック：dataURL をテキストとしてコピー（貼り付け先により扱えます）
    try {
      const dataUrl = el.toDataURL('image/png')
      await navigator.clipboard.writeText(dataUrl)
    } catch (e) {
      console.error('Clipboard write failed:', e)
    }
  }
}))
