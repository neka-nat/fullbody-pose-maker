# Fullbody Pose Maker (base)

Next.js + TypeScript app scaffold for an IK pose editor targeting Mixamo FBX rigs (X Bot / Y Bot). This base includes:

- FBX loading (local file input)
- Four control points (both hands/feet) with gizmos
- Per-point position constraints
- Jacobian-transpose based full-body IK (numeric Jacobian)
- Toggle gizmo visibility
- Skeleton debug list and quick assignment of control bones
- Save canvas to PNG and copy to clipboard

## Getting Started

1. Install dependencies:

   npm install

2. Run dev server:

   npm run dev

3. Place your FBX files at `public/models/XBot.fbx` and `public/models/YBot.fbx`.
   Optionally, place `public/models/bonelist.txt` containing bone names (one per line)
   for auto-mapping of the control points.

4. Open http://localhost:3000, choose the model (XBot/YBot) from the sidebar.
   Hand/foot control bones are auto-assigned from `bonelist.txt` when present (fallback to detection by name).
   Drag the gizmo spheres to pose. Enable/disable constraints per control.

Notes:
- The IK solver is a simple numeric Jacobian transpose for clarity. It’s not optimized but works as a base. You can swap in a dedicated solver (e.g. closed-chain-ik) later.
- If no constraints are enabled, dragging any gizmo translates the whole model root.
- Clipboard copy requires browser support for `ClipboardItem`.

## Mixamo Bone Names

Common names include `mixamorig:LeftHand`, `mixamorig:RightHand`, `mixamorig:LeftFoot`, `mixamorig:RightFoot`. Use the debug list to confirm in your FBX, then assign accordingly.

## Structure

- `app/` Next.js app router pages
- `components/Scene.tsx` three.js scene, FBX loading, gizmos, IK loop
- `components/DebugSidebar.tsx` debug panel: load FBX, assign bones, list bones
- `lib/ik.ts` numeric Jacobian transpose solver
- `lib/fbx.ts` helpers
- `lib/store.ts` global UI state (zustand)
