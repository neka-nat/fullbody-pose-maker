"use client"
import { Canvas } from '@react-three/fiber'
import { Suspense, useRef } from 'react'
import { OrbitControls } from '@react-three/drei'
import { Scene } from '@/components/Scene'
import { DebugSidebar } from '@/components/DebugSidebar'
import { useUIStore } from '@/lib/store'

export default function Page() {
  const showGizmos = useUIStore(s => s.showGizmos)
  const toggleGizmos = useUIStore(s => s.toggleGizmos)
  const saveImage = useUIStore(s => s.saveImage)
  const copyImage = useUIStore(s => s.copyImage)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', height: '100dvh' }}>
      <DebugSidebar />
      <div style={{ position: 'relative' }}>
        <div style={{ position: 'absolute', top: 8, left: 8, display: 'flex', gap: 8, zIndex: 10 }}>
          <button onClick={toggleGizmos}>{showGizmos ? 'ギズモ非表示' : 'ギズモ表示'}</button>
          <button onClick={() => saveImage(canvasRef.current || undefined)}>画像保存</button>
          <button onClick={() => copyImage(canvasRef.current || undefined)}>クリップボードにコピー</button>
        </div>
        <Canvas
          gl={{ preserveDrawingBuffer: true, antialias: true, alpha: false, powerPreference: 'high-performance' }}
          onCreated={(state) => {
            canvasRef.current = state.gl.domElement
          }}
          shadows
          camera={{ position: [2.5, 1.6, 3], fov: 50 }}
        >
          <Suspense fallback={null}>
            <Scene />
          </Suspense>
          <OrbitControls makeDefault enableDamping dampingFactor={0.1} />
        </Canvas>
      </div>
    </div>
  )
}

