import * as THREE from 'three'
import { getWorldPosition, getWorldQuaternion, getBoneChainToRoot } from './fbx'

export type IKConstraint = {
  effector: THREE.Object3D
  /** 位置ターゲット（posWeight > 0 のとき有効） */
  target: THREE.Vector3
  /** 回転ターゲット（rotWeight > 0 のとき有効） */
  targetRot?: THREE.Quaternion
  /** 位置拘束の重み（0 で無効） */
  posWeight?: number
  /** 回転拘束の重み（0 で無効） */
  rotWeight?: number
  /** ルート（通常 mixamorig:Hips） */
  root: THREE.Object3D
}

// ===== ユーティリティ =====
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

// ---- 位置ヤコビアン（数値微分）----
function jacobianColumnPos(bone: THREE.Object3D, effector: THREE.Object3D, axis: 'x'|'y'|'z', eps=EPS): THREE.Vector3 {
  const p0 = getWorldPosition(effector)
  rotateLocalAxis(bone, axis, eps)
  bone.updateMatrixWorld(true)
  const p1 = getWorldPosition(effector)
  rotateLocalAxis(bone, axis, -eps)
  bone.updateMatrixWorld(true)
  return p1.sub(p0).divideScalar(eps)
}

// ---- 回転ヤコビアン（数値微分：対数写像ベクトル）----
function quatLog(q: THREE.Quaternion): THREE.Vector3 {
  // q = [w, v]（正規化前提）
  const w = q.w
  const v = new THREE.Vector3(q.x, q.y, q.z)
  const s = v.length()
  if (s < 1e-12) return new THREE.Vector3(0, 0, 0)
  const axis = v.divideScalar(s)
  const angle = 2 * Math.atan2(s, w)
  return axis.multiplyScalar(angle)
}

function jacobianColumnRot(bone: THREE.Object3D, effector: THREE.Object3D, axis: 'x'|'y'|'z', eps=EPS): THREE.Vector3 {
  const q0 = getWorldQuaternion(effector)
  rotateLocalAxis(bone, axis, eps)
  bone.updateMatrixWorld(true)
  const q1 = getWorldQuaternion(effector)
  rotateLocalAxis(bone, axis, -eps)
  bone.updateMatrixWorld(true)
  // Δq = q1 * inv(q0)
  const dq = q1.clone().multiply(q0.clone().invert())
  const log = quatLog(dq)
  return log.divideScalar(eps) // 角速度近似 [rad/rad]
}

// ===== CoM 関連（簡易） =====
// Mixamo 名称ベースのざっくり質量重み
function boneWeight(name: string): number {
  const n = name.toLowerCase()
  if (n.includes('hips')) return 10
  if (n.includes('spine')) return 8
  if (n.includes('neck') || n.includes('head')) return 5
  if (n.includes('upperleg') || n.includes('thigh')) return 7
  if (n.includes('lowerleg') || n.includes('calf')) return 5
  if (n.includes('foot') || n.includes('toe')) return 2
  if (n.includes('clavicle') || n.includes('shoulder')) return 2
  if (n.includes('upperarm')) return 4
  if (n.includes('lowerarm') || n.includes('forearm')) return 3
  if (n.includes('hand') || n.includes('wrist')) return 1
  return 1
}

function computeCoM(root: THREE.Object3D): THREE.Vector3 {
  const com = new THREE.Vector3()
  let wsum = 0
  root.traverse(o => {
    if ((o as any).isBone) {
      const w = boneWeight(o.name || '')
      if (w <= 0) return
      com.addScaledVector(getWorldPosition(o), w)
      wsum += w
    }
  })
  if (wsum > 0) com.divideScalar(wsum)
  return com
}

// 2D 変換（XZ 平面）
const v3to2 = (v: THREE.Vector3) => new THREE.Vector2(v.x, v.z)

// 2D 凸包（Andrew の単調鎖）
function convexHull2(pts: THREE.Vector2[]): THREE.Vector2[] {
  if (pts.length <= 1) return pts.slice()
  const a = pts.map(p => p.clone()).sort((p, q) => (p.x === q.x ? p.y - q.y : p.x - q.x))
  const cross = (o: THREE.Vector2, a: THREE.Vector2, b: THREE.Vector2) =>
    (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x)
  const lower: THREE.Vector2[] = []
  for (const p of a) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop()
    lower.push(p)
  }
  const upper: THREE.Vector2[] = []
  for (let i = a.length - 1; i >= 0; i--) {
    const p = a[i]
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop()
    upper.push(p)
  }
  upper.pop(); lower.pop()
  return lower.concat(upper)
}

function isInsideConvex2(p: THREE.Vector2, poly: THREE.Vector2[]): boolean {
  if (poly.length < 3) return false
  let sign = 0
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length]
    const cross = (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x)
    if (Math.abs(cross) < 1e-12) continue
    const s = Math.sign(cross)
    if (sign === 0) sign = s
    else if (s !== sign) return false
  }
  return true
}

function closestPointOnSegments2(p: THREE.Vector2, poly: THREE.Vector2[]): THREE.Vector2 {
  if (poly.length === 0) return p.clone()
  if (poly.length === 1) return poly[0].clone()
  let best = new THREE.Vector2(), bestD = Infinity
  const segN = poly.length >= 3 ? poly.length : 1
  for (let i = 0; i < segN; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length]
    const ab = b.clone().sub(a)
    const t = THREE.MathUtils.clamp(p.clone().sub(a).dot(ab) / Math.max(ab.lengthSq(), 1e-9), 0, 1)
    const cand = a.clone().addScaledVector(ab, t)
    const d = cand.distanceToSquared(p)
    if (d < bestD) { bestD = d; best = cand }
    if (poly.length === 2) break
  }
  return best
}

// ===== ソルバ =====
type SolveOpts = {
  allowRootTranslation?: boolean
  rootStep?: number          // 既定 step
  rootClamp?: number         // 既定 0.08[m]
  // --- CoM バイアス ---
  comSupport?: THREE.Vector3[]
  comGain?: number
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
  const comGain = opts.comGain ?? 0
  const support2 = (opts.comSupport ?? []).map(v3to2)
  const hull2 = support2.length ? convexHull2(support2) : []

  // エフェクタ→ルートの鎖（ボーンのみ）
  const chains: THREE.Object3D[][] = constraints.map(c => getBoneChainToRoot(c.effector, c.root))

  for (let iter = 0; iter < iterations; iter++) {
    // ワールド行列更新
    for (const c of constraints) c.root.updateWorldMatrix(true, true)

    const rotDelta = new Map<THREE.Object3D, THREE.Vector3>()
    const trsDelta = new Map<THREE.Object3D, THREE.Vector3>() // root への並進Δ

    constraints.forEach((c, ci) => {
      const pw = c.posWeight ?? 1
      const rw = c.rotWeight ?? 0

      const chain = chains[ci]

      // --- 位置誤差 ---
      if (pw > 0) {
        const p = getWorldPosition(c.effector)
        const e = c.target.clone().sub(p).multiplyScalar(pw)
        if (e.lengthSq() > 1e-10) {
          for (const bone of chain) {
            const jx = jacobianColumnPos(bone, c.effector, 'x')
            const jy = jacobianColumnPos(bone, c.effector, 'y')
            const jz = jacobianColumnPos(bone, c.effector, 'z')
            const d = rotDelta.get(bone) ?? new THREE.Vector3()
            d.x += step * jx.dot(e)
            d.y += step * jy.dot(e)
            d.z += step * jz.dot(e)
            rotDelta.set(bone, d)
          }
          if (allowRootTranslation) {
            const t = trsDelta.get(c.root) ?? new THREE.Vector3()
            t.addScaledVector(e, rootStep)
            trsDelta.set(c.root, t)
          }
        }
      }

      // --- 回転誤差 ---
      if (rw > 0 && c.targetRot) {
        const qc = getWorldQuaternion(c.effector)
        const qerr = c.targetRot.clone().multiply(qc.clone().invert()) // q_target * inv(q_current)
        // 小回転ベクトル
        const er = quatLog(qerr).multiplyScalar(rw)
        if (er.lengthSq() > 1e-10) {
          for (const bone of chain) {
            const jx = jacobianColumnRot(bone, c.effector, 'x')
            const jy = jacobianColumnRot(bone, c.effector, 'y')
            const jz = jacobianColumnRot(bone, c.effector, 'z')
            const d = rotDelta.get(bone) ?? new THREE.Vector3()
            d.x += step * jx.dot(er)
            d.y += step * jy.dot(er)
            d.z += step * jz.dot(er)
            rotDelta.set(bone, d)
          }
        }
      }
    })

    // --- CoM バイアス（XZ のみ、root 並進にのみ反映） ---
    if (comGain > 0 && hull2.length) {
      const anyRoot = constraints[0].root
      const com = computeCoM(anyRoot)
      const com2 = v3to2(com)
      let goal2 = com2.clone()
      if (hull2.length >= 3) {
        if (!isInsideConvex2(com2, hull2)) goal2 = closestPointOnSegments2(com2, hull2)
      } else {
        goal2 = closestPointOnSegments2(com2, hull2)
      }
      const delta2 = goal2.sub(com2)
      if (delta2.lengthSq() > 1e-12) {
        const deltaW = new THREE.Vector3(delta2.x, 0, delta2.y).multiplyScalar(comGain)
        const t = trsDelta.get(anyRoot) ?? new THREE.Vector3()
        t.add(deltaW)
        trsDelta.set(anyRoot, t)
      }
    }

    // 回転適用
    rotDelta.forEach((d, bone) => {
      const dx = THREE.MathUtils.clamp(d.x, -0.2, 0.2)
      const dy = THREE.MathUtils.clamp(d.y, -0.2, 0.2)
      const dz = THREE.MathUtils.clamp(d.z, -0.2, 0.2)
      if (Math.abs(dx) > 1e-6) bone.rotateX(dx)
      if (Math.abs(dy) > 1e-6) bone.rotateY(dy)
      if (Math.abs(dz) > 1e-6) bone.rotateZ(dz)
    })

    // 並進適用（クランプ）
    trsDelta.forEach((t, root) => {
      if (t.lengthSq() < 1e-12) return
      if (t.length() > rootClamp) t.setLength(rootClamp)
      addWorldTranslation(root, t)
    })

    constraints.forEach(c => c.root.updateWorldMatrix(true, true))
  }
}
