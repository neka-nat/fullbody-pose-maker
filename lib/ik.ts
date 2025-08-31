import * as THREE from 'three'
import { getWorldPosition, getBoneChainToRoot } from './fbx'

export type IKConstraint = {
  effector: THREE.Object3D
  target: THREE.Vector3
  weight?: number
  root: THREE.Object3D
}

// ワールドΔを obj のローカル位置へ適用するユーティリティ
function addWorldTranslation(obj: THREE.Object3D, deltaWorld: THREE.Vector3) {
  if (!obj.parent) {
    obj.position.add(deltaWorld)
    return
  }
  const w = new THREE.Vector3()
  obj.getWorldPosition(w)
  w.add(deltaWorld)
  obj.position.copy(obj.parent.worldToLocal(w))
}

const EPS = 1e-3

function rotateLocalAxis(obj: THREE.Object3D, axis: 'x'|'y'|'z', angle: number) {
  if (axis === 'x') obj.rotateX(angle)
  else if (axis === 'y') obj.rotateY(angle)
  else obj.rotateZ(angle)
}

function jacobianColumn(bone: THREE.Object3D, effector: THREE.Object3D, axis: 'x'|'y'|'z', eps=EPS): THREE.Vector3 {
  const p0 = getWorldPosition(effector)
  rotateLocalAxis(bone, axis, eps)
  bone.updateMatrixWorld(true)
  const p1 = getWorldPosition(effector)
  rotateLocalAxis(bone, axis, -eps)
  bone.updateMatrixWorld(true)
  return p1.sub(p0).divideScalar(eps)
}

// 追加: オプションで並進係数などを調整可能（呼び出し側は省略可）
type SolveOpts = {
  allowRootTranslation?: boolean      // 既定 true
  rootStep?: number                   // 既定: step と同じ
  rootClamp?: number                  // 既定: 1反復あたり最大移動 0.08m
}

export function solveIK(
  constraints: IKConstraint[],
  iterations = 8,
  step = 0.15,
  opts: SolveOpts = {}
) {
  if (!constraints.length) return

  const allowRootTranslation = opts.allowRootTranslation ?? true
  const rootStep = opts.rootStep ?? step
  const rootClamp = opts.rootClamp ?? 0.08

  // エフェクタ→ルートの鎖（ボーンのみ）
  const chains: THREE.Object3D[][] = constraints.map(c => getBoneChainToRoot(c.effector, c.root))

  for (let iter = 0; iter < iterations; iter++) {
    // 反復ごとにワールド行列を更新
    for (const c of constraints) c.root.updateWorldMatrix(true, true)

    const rotDelta = new Map<THREE.Object3D, THREE.Vector3>()   // 回転Δ
    const trsDelta = new Map<THREE.Object3D, THREE.Vector3>()   // 並進Δ（root用）

    constraints.forEach((c, ci) => {
      const weight = c.weight ?? 1
      const p = getWorldPosition(c.effector)
      const e = c.target.clone().sub(p)
      if (e.lengthSq() < 1e-8) return

      // 回転 Jacobian
      const chain = chains[ci]
      for (const bone of chain) {
        const jx = jacobianColumn(bone, c.effector, 'x')
        const jy = jacobianColumn(bone, c.effector, 'y')
        const jz = jacobianColumn(bone, c.effector, 'z')
        const d = rotDelta.get(bone) ?? new THREE.Vector3()
        d.x += step * weight * jx.dot(e)
        d.y += step * weight * jy.dot(e)
        d.z += step * weight * jz.dot(e)
        rotDelta.set(bone, d)
      }

      // ルートの並進（Jacobian=I）
      if (allowRootTranslation) {
        const t = trsDelta.get(c.root) ?? new THREE.Vector3()
        t.addScaledVector(e, rootStep * weight)
        trsDelta.set(c.root, t)
      }
    })

    // 回転適用（小さくクランプ）
    rotDelta.forEach((d, bone) => {
      const dx = THREE.MathUtils.clamp(d.x, -0.2, 0.2)
      const dy = THREE.MathUtils.clamp(d.y, -0.2, 0.2)
      const dz = THREE.MathUtils.clamp(d.z, -0.2, 0.2)
      if (Math.abs(dx) > 1e-6) bone.rotateX(dx)
      if (Math.abs(dy) > 1e-6) bone.rotateY(dy)
      if (Math.abs(dz) > 1e-6) bone.rotateZ(dz)
    })

    // 並進適用（ワールドΔ→ローカル座標へ変換して適用）
    trsDelta.forEach((t, root) => {
      if (t.lengthSq() < 1e-12) return
      const clamped = t.clone()
      if (clamped.length() > rootClamp) clamped.setLength(rootClamp) // 暴れ防止
      addWorldTranslation(root, clamped)
    })

    // 更新
    constraints.forEach(c => c.root.updateWorldMatrix(true, true))
  }
}
