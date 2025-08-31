# Fullbody Pose Maker (base)

Next.js + TypeScript app scaffold for an IK pose editor targeting Mixamo FBX rigs (X Bot / Y Bot). This base includes:

- Jacobian-transpose based full-body IK (numeric Jacobian)
- Save canvas to PNG and copy to clipboard

## Getting Started

1. Install dependencies:

```bash
npm install
```

2. Run dev server:

```bash
npm run dev
```

3. Open http://localhost:3000, choose the model (XBot/YBot) from the sidebar.
   Drag the gizmo spheres to pose. Enable/disable constraints per control.
