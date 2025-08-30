import './globals.css'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Fullbody Pose Maker',
  description: 'IK-based pose editor for Mixamo rigs'
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  )
}

