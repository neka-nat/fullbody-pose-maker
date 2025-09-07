"use client"
import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { TransformControls, Grid, GizmoHelper, GizmoViewport } from '@react-three/drei'
import * as THREE from 'three'
import { FBXLoader } from 'three-stdlib'
import { useUIStore } from '@/lib/store'
import { findObjectByName, getWorldPosition, getWorldQuaternion, listBones, findSkeletonTopBone } from '@/lib/fbx'
import { solveIK, IKConstraint } from '@/lib/ik'

export function Scene() {
  const groupRef = useRef<THREE.Group>(null)
  const modelRef = useRef<THREE.Group>(null)
  const skeletonRoot = useRef<THREE.Object3D | null>(null)
  const { gl } = useThree()

  const showGizmos = useUIStore(s => s.showGizmos)
  const controls = useUIStore(s => s.controls)
  const setModelRoot = useUIStore(s => s.setModelRoot)
  const setSkeletonRoot = useUIStore(s => s.setSkeletonRoot)
  const setBones = useUIStore(s => s.setBones)
  const setControlTarget = useUIStore(s => s.setControlTarget)
  const setControlTargetRot = useUIStore(s => s.setControlTargetRot)
  const mapControlBone = useUIStore(s => s.mapControlBone)
  const modelName = useUIStore(s => s.modelName)

  const modelRoot = useUIStore(s => s.modelRoot)
  const skeletonFromStore = useUIStore(s => s.skeletonRoot)

  useEffect(() => {
    gl.setClearColor(0xffffff, 1)
  }, [gl])

  // FBX ロード
  useEffect(() => {
    const loader = new FBXLoader()
    const url = `/models/${modelName}.fbx`
    let cancelled = false

    loader.load(
      url,
      async (scene) => {
        if (cancelled || !modelRef.current) return
        modelRef.current.clear()

        // 約1.7mに正規化して原点に置く
        const box = new THREE.Box3().setFromObject(scene as unknown as THREE.Object3D)
        const size = new THREE.Vector3()
        const center = new THREE.Vector3()
        box.getSize(size)
        box.getCenter(center)
        const targetHeight = 1.7
        const scale = size.y > 0 ? targetHeight / size.y : 1
        scene.scale.setScalar(scale)

        const box2 = new THREE.Box3().setFromObject(scene as unknown as THREE.Object3D)
        const size2 = new THREE.Vector3()
        const center2 = new THREE.Vector3()
        box2.getSize(size2)
        box2.getCenter(center2)
        scene.position.x -= center2.x
        scene.position.z -= center2.z
        scene.position.y -= box2.min.y

        scene.updateMatrixWorld(true)

        modelRef.current.add(scene)
        scene.traverse(o => { (o as any).frustumCulled = false })

        // スケルトン最上位Boneを検出
        const topBone = findSkeletonTopBone(scene)
        skeletonRoot.current = topBone || scene
        setModelRoot(scene)
        setSkeletonRoot(skeletonRoot.current)
        setBones(listBones(skeletonRoot.current!))

        // ボーン名の推定
        let names: string[] = []
        for (const path of ['/models/bonelist.txt', '/bonelist.txt']) {
          try {
            const res = await fetch(path)
            if (res.ok) {
              const text = await res.text()
              names = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean)
              if (names.length) break
            }
          } catch {}
        }
        if (!names || names.length === 0) names = listBones(scene)
        const lower = names.map(n => ({ n, l: n.toLowerCase() }))
        const pick = (patterns: string[], exacts: string[] = []) => {
          for (const ex of exacts) { const idx = names.indexOf(ex); if (idx >= 0) return names[idx] }
          for (const p of patterns) { const idx = lower.findIndex(x => x.l.includes(p)); if (idx >= 0) return lower[idx].n }
          return null
        }
        const leftHand = pick(['mixamorig:leftHand','lefthand','left_hand','left hand','wrist.l','leftwrist','hand_l','hand.l'].map(s=>s.toLowerCase()), ['mixamorig:LeftHand','LeftHand'])
        const rightHand = pick(['mixamorig:rightHand','righthand','right_hand','right hand','wrist.r','rightwrist','hand_r','hand.r'].map(s=>s.toLowerCase()), ['mixamorig:RightHand','RightHand'])
        const leftFoot = pick(['mixamorig:leftFoot','leftfoot','left_foot','left foot','ankle.l','leftankle','foot_l','foot.l','lefttoe','left_toe','left toe'].map(s=>s.toLowerCase()), ['mixamorig:LeftFoot','LeftFoot','mixamorig:LeftToeBase','LeftToeBase'])
        const rightFoot = pick(['mixamorig:rightFoot','rightfoot','right_foot','right foot','ankle.r','rightankle','foot_r','foot.r','righttoe','right_toe','right toe'].map(s=>s.toLowerCase()), ['mixamorig:RightFoot','RightFoot','mixamorig:RightToeBase','RightToeBase'])

        // 既定の4点にボーンを割当（IDは LeftHand/RightHand/LeftFoot/RightFoot）
        if (leftHand)  mapControlBone('LeftHand', leftHand)
        if (rightHand) mapControlBone('RightHand', rightHand)
        if (leftFoot)  mapControlBone('LeftFoot', leftFoot)
        if (rightFoot) mapControlBone('RightFoot', rightFoot)

        // 現在のエフェクタ位置/回転を初期ターゲットに
        const skel = skeletonRoot.current || scene
        for (const [id, name] of [['LeftHand', leftHand], ['RightHand', rightHand], ['LeftFoot', leftFoot], ['RightFoot', rightFoot]] as const) {
          const eff = name ? findObjectByName(skel, name) : null
          if (eff) {
            setControlTarget(id, getWorldPosition(eff))
            setControlTargetRot(id, getWorldQuaternion(eff))
          }
        }
      },
      () => {},
      (err) => { console.error('FBX load error:', err) }
    )

    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modelName])

  // IK 制約（全コントロール対象）
  const constraints = useMemo(() => {
    const sceneRoot = modelRoot
    const root = (skeletonFromStore || skeletonRoot.current || sceneRoot)
    if (!sceneRoot || !root) return [] as IKConstraint[]
    const out: IKConstraint[] = []
    for (const cp of controls) {
      if (!cp.boneName) continue
      if (!cp.posEnabled && !cp.rotEnabled) continue
      const eff = findObjectByName(root, cp.boneName)
      if (!eff) continue

      let targetRot: THREE.Quaternion | undefined
      if (cp.rotEnabled) {
        const t = cp.targetRot
        const isIdentity =
          Math.abs(t.x) < 1e-8 && Math.abs(t.y) < 1e-8 &&
          Math.abs(t.z) < 1e-8 && Math.abs(t.w - 1) < 1e-8
        targetRot = isIdentity ? getWorldQuaternion(eff) : t
      }

      out.push({
        effector: eff,
        target: cp.target,
        targetRot,
        posWeight: cp.posEnabled ? 1 : 0,
        rotWeight: cp.rotEnabled ? 1 : 0,
        root
      })
    }
    return out
  }, [controls, modelRoot, skeletonFromStore])

  // IK 実行＋CoMバイアス（足系コントロールから支持点を作る）
  useFrame(() => {
    if (constraints.length) {
      const base = skeletonFromStore || skeletonRoot.current || modelRef.current
      const supportPts: THREE.Vector3[] = []
      if (base) {
        controls.forEach(cp => {
          if (!cp.boneName) return
          if (!/foot|toe/i.test(cp.boneName)) return
          if (cp.posEnabled) {
            supportPts.push(cp.target.clone())
          } else {
            const eff = findObjectByName(base, cp.boneName)
            if (eff) supportPts.push(getWorldPosition(eff))
          }
        })
      }
      solveIK(constraints, 6, 0.2, {
        rootStep: 0.15,
        rootClamp: 0.06,
        comSupport: supportPts,
        comGain: 0.03,
        rotGain: 0.6,
      })
    }
  })

  return (
    <group ref={groupRef}>
      <ambientLight intensity={0.6} />
      <directionalLight position={[5, 6, 4]} intensity={0.8} castShadow />
      <Grid infiniteGrid fadeDistance={40} fadeStrength={1} position={[0, -1, 0]} />

      <group ref={modelRef} name="ModelRoot" />

      {/* Gizmos */}
      {showGizmos && controls.map(cp => (
        <ControlGizmo key={cp.id} controlId={cp.id} modelRef={modelRef} />
      ))}

      <GizmoHelper alignment="bottom-right" margin={[80, 80]}>
        <GizmoViewport axisColors={["#ff3653", "#8adb00", "#2c8fff"]} labelColor="black" />
      </GizmoHelper>
    </group>
  )
}

function ControlGizmo({
  controlId,
  modelRef,
}: {
  controlId: string
  modelRef: React.MutableRefObject<THREE.Group | null>
}) {
  const cp = useUIStore(s => s.controls.find(c => c.id === controlId))
  const setControlTarget = useUIStore(s => s.setControlTarget)
  // 「拘束0件なら全身移動」の判定は“位置拘束”だけ見る
  const posEnabledCount = useUIStore(s => s.controls.filter(c => c.posEnabled).length)
  const skeleton = useUIStore(s => s.skeletonRoot)
  const searchRoot = skeleton || modelRef.current
  const showGizmos = useUIStore(s => s.showGizmos)

  const anchorRef = useRef<THREE.Group>(null)
  const tcRef = useRef<any>(null)
  const local = useRef({ lastPos: new THREE.Vector3() })
  const orbit = useThree(state => state.controls) as any
  const dragging = useRef(false)

  // 初回 attach
  useEffect(() => {
    if (tcRef.current && anchorRef.current) {
      tcRef.current.attach(anchorRef.current)
    }
    return () => { if (tcRef.current) tcRef.current.detach() }
  }, [])

  // boneName や表示条件が変化したら re-attach
  useEffect(() => {
    if (!tcRef.current || !anchorRef.current) return
    tcRef.current.detach()
    tcRef.current.attach(anchorRef.current)
    const canShow = showGizmos && (!!cp?.boneName || posEnabledCount === 0)
    tcRef.current.visible = canShow
    tcRef.current.enabled = canShow
  }, [cp?.boneName, posEnabledCount, showGizmos])

  // 初期配置＆ターゲット変更時にアンカー位置を反映（ドラッグ中は無視）
  useEffect(() => {
    if (!cp || dragging.current) return
    if (!searchRoot || !cp.boneName) return
    const eff = findObjectByName(searchRoot, cp.boneName)
    if (!eff) return
    const pos = cp.posEnabled ? cp.target : getWorldPosition(eff)
    if (anchorRef.current) {
      anchorRef.current.position.copy(pos)
      local.current.lastPos.copy(pos)
    }
    if (tcRef.current) tcRef.current.updateMatrixWorld(true)
  }, [cp?.boneName, cp?.posEnabled, cp?.target, modelRef])

  // 位置拘束OFFのときは毎フレームエフェクタ位置に追従
  useFrame(() => {
    if (!cp || !anchorRef.current || !modelRef.current || !cp.boneName || dragging.current) return
    if (!cp.posEnabled) {
      const eff = searchRoot ? findObjectByName(searchRoot, cp.boneName) : null
      if (eff) {
        const p = getWorldPosition(eff)
        anchorRef.current.position.copy(p)
        local.current.lastPos.copy(p)
        if (tcRef.current) tcRef.current.updateMatrixWorld(true)
      }
    }
  })

  const onTransformChange = () => {
    if (!cp || !dragging.current || !anchorRef.current) return
    const w = new THREE.Vector3()
    anchorRef.current.getWorldPosition(w)
    const delta = w.clone().sub(local.current.lastPos)
    local.current.lastPos.copy(w)
    setControlTarget(controlId, w)
    if (posEnabledCount === 0 && modelRef.current) {
      modelRef.current.position.add(delta)
    }
  }

  if (!cp) return null
  const canShow = showGizmos && (!!cp.boneName || posEnabledCount === 0)

  return (
    <>
      <TransformControls
        key={cp.id + ':' + (cp.boneName ?? 'none')}
        ref={tcRef}
        mode="translate"
        space="world"
        visible={canShow}
        enabled={canShow}
        onChange={onTransformChange}
        onMouseDown={() => { dragging.current = true; if (orbit) orbit.enabled = false }}
        onMouseUp={() => { dragging.current = false; if (orbit) orbit.enabled = true }}
        showX showY showZ
      />
      <group ref={anchorRef}>
        <mesh>
          <sphereGeometry args={[0.06, 16, 16]} />
          <meshStandardMaterial
            color={cp.posEnabled ? '#ff4070' : '#999999'}
            depthTest={false}
            depthWrite={false}
          />
        </mesh>
      </group>
    </>
  )
}
