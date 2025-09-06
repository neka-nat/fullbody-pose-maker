import * as THREE from 'three'

export function listBones(root: THREE.Object3D): string[] {
  const names = new Set<string>()
  root.traverse(obj => {
    if ((obj as any).isBone) {
      names.add(obj.name || '(unnamed)')
    }
  })
  return Array.from(names)
}

export function findObjectByName(root: THREE.Object3D, name: string | null): THREE.Object3D | null {
  if (!root || !name) return null
  let found: THREE.Object3D | null = null
  root.traverse(obj => {
    if (!found && obj.name === name) found = obj
  })
  return found
}

export function getWorldPosition(obj: THREE.Object3D): THREE.Vector3 {
  const v = new THREE.Vector3()
  obj.updateWorldMatrix(true, false)
  return obj.getWorldPosition(v)
}

export function getWorldQuaternion(obj: THREE.Object3D): THREE.Quaternion {
  const q = new THREE.Quaternion()
  obj.updateWorldMatrix(true, false)
  return obj.getWorldQuaternion(q)
}

export function findSkeletonTopBone(root: THREE.Object3D): THREE.Object3D | null {
  const bones: THREE.Object3D[] = []
  root.traverse(o => { if ((o as any).isBone) bones.push(o) })
  if (!bones.length) return null
  const tops = bones.filter(b => !((b.parent as any)?.isBone))
  return tops[0] || bones[0]
}

/** bone から root.parent までの “Bone だけ” の鎖を返す */
export function getBoneChainToRoot(bone: THREE.Object3D, root: THREE.Object3D): THREE.Object3D[] {
  const chain: THREE.Object3D[] = []
  let cur: THREE.Object3D | null = bone
  while (cur && cur !== root.parent) {
    if ((cur as any).isBone) chain.push(cur)
    cur = cur.parent
  }
  return chain
}
