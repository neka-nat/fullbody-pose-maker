import * as THREE from 'three'
import { getWorldPosition, getBoneChainToRoot } from './fbx'

export type IKConstraint = {
  effector: THREE.Object3D
  target: THREE.Vector3
  weight?: number
  root: THREE.Object3D
}

const EPS = 1e-3

function rotateLocalAxis(obj: THREE.Object3D, axis: 'x'|'y'|'z', angle: number) {
  if (axis === 'x') obj.rotateX(angle)
  else if (axis === 'y') obj.rotateY(angle)
  else obj.rotateZ(angle)
}

// 数値微分でヤコビアンの各列を求める（ボーン局所軸の微小回転）
function jacobianColumn(bone: THREE.Object3D, effector: THREE.Object3D, axis: 'x'|'y'|'z', eps=EPS): THREE.Vector3 {
  const p0 = getWorldPosition(effector)
  rotateLocalAxis(bone, axis, eps)
  bone.updateMatrixWorld(true)
  const p1 = getWorldPosition(effector)
  rotateLocalAxis(bone, axis, -eps)
  bone.updateMatrixWorld(true)
  return p1.sub(p0).divideScalar(eps)
}

export function solveIK(constraints: IKConstraint[], iterations = 8, step = 0.15) {
  if (!constraints.length) return

  // 事前にエフェクタ→ルートのボーン鎖を作る
  const chains: THREE.Object3D[][] = constraints.map(c => getBoneChainToRoot(c.effector, c.root))

  for (let iter = 0; iter < iterations; iter++) {
    // 毎反復前にワールド行列を更新
    for (const c of constraints) c.root.updateWorldMatrix(true, true)

    const deltaMap = new Map<THREE.Object3D, THREE.Vector3>() // x,y,z の角度デルタ蓄積

    constraints.forEach((c, ci) => {
      const weight = c.weight ?? 1
      const p = getWorldPosition(c.effector)
      const e = c.target.clone().sub(p) // 位置誤差
      if (e.lengthSq() < 1e-8) return

      const chain = chains[ci]
      for (const bone of chain) {
        const jx = jacobianColumn(bone, c.effector, 'x')
        const jy = jacobianColumn(bone, c.effector, 'y')
        const jz = jacobianColumn(bone, c.effector, 'z')
        const d = deltaMap.get(bone) ?? new THREE.Vector3()
        d.x += step * weight * jx.dot(e)
        d.y += step * weight * jy.dot(e)
        d.z += step * weight * jz.dot(e)
        deltaMap.set(bone, d)
      }
    })

    // まとめて適用（安定化のためクランプ）
    deltaMap.forEach((d, bone) => {
      const dx = THREE.MathUtils.clamp(d.x, -0.2, 0.2)
      const dy = THREE.MathUtils.clamp(d.y, -0.2, 0.2)
      const dz = THREE.MathUtils.clamp(d.z, -0.2, 0.2)
      if (Math.abs(dx) > 1e-6) bone.rotateX(dx)
      if (Math.abs(dy) > 1e-6) bone.rotateY(dy)
      if (Math.abs(dz) > 1e-6) bone.rotateZ(dz)
    })

    constraints.forEach(c => c.root.updateWorldMatrix(true, true))
  }
}
