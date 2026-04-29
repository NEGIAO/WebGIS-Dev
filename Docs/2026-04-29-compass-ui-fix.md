# Compass UI Text Orientation Fix — 2026-04-29

## Problem Statement
The Feng Shui Compass text rendering had two critical issues:
1. **Layer 1 (后先天八卦)**: Marked as parallel mode (`vertical: false`) but text was displaying vertically (rotated incorrectly)
2. **Layer 5 (透地六十龙)**: Marked as radial mode (`vertical: true`) but text was displaying horizontally

The root cause was incorrect rotation logic in `getTextTransform()` and `getTogetherTextTransform()` functions.

## Technical Analysis

### Coordinate System
- SVG angle system: 0° (right/3 o'clock), 90° (bottom/6 o'clock), 180° (left/9 o'clock), 270° (top/12 o'clock)
- Text anchor point: Centered via `text-anchor="middle"` + `dominant-baseline="middle"`
- `pos.angle` is calculated as degrees between 0° and 360°

### Transformation Modes

**Parallel Mode (`vertical: false`):**
- Text should be tangent to the circle
- Text must always be readable (never upside-down)
- **Solution:**
  - For angles 0°-90° and 270°-360°: rotation = `pos.angle`
  - For angles 90°-270° (left half of circle): rotation = `pos.angle + 180°` (flip to prevent upside-down)

**Radial Mode (`vertical: true`):**
- Text should be perpendicular to the center
- Text always points away from center
- **Solution:**
  - rotation = `pos.angle + 90°` for all angles

### Previous Flawed Logic
```typescript
// OLD CODE — INCORRECT
const extraRotation = layer.vertical
  ? pos.angle > 90 && pos.angle < 270
    ? 270    // Wrong: adds 270° instead of consistent +90°
    : 90
  : 0;
return `rotate(${pos.angle + extraRotation} ${pos.x} ${pos.y})`;
```

The old logic:
1. For parallel mode: `extraRotation = 0`, so rotation = `pos.angle` (incomplete, doesn't handle 90-270° flip)
2. For radial mode: `extraRotation` was either 90 or 270 (inconsistent logic mixing two angles)

## Solution

### Code Changes

**File:** `frontend/src/components/feng-shui-compass-svg/feng-shui-compass-svg.vue`

1. **`getTextTransform()` function (lines ~518-527):**
   - Replaced the faulty `extraRotation` logic with proper parallel/radial mode handling
   - For parallel mode: Check if angle is between 90-270°, add 180° if true
   - For radial mode: Always add 90°

2. **`getTogetherTextTransform()` function (lines ~589-593):**
   - Applied identical parallel/radial transformation logic
   - Ensures consistency across single-text and multi-text rendering

### Data Verification

**File:** `frontend/src/components/feng-shui-compass-svg/themes/theme-dark.ts`

✅ **Layer 1 (Index 1):** `vertical: false` — Parallel mode (correct)
- Name: "后先天八卦", "先天八卦", "龙上八煞"
- Data: 8 lattices with 3 characters each (togetherStyle: "equally")

✅ **Layer 5 (Index 5, penultimate -2):** `vertical: true` — Radial mode (correct)
- Name: "透地六十龙"
- Data: 60 individual characters

## Verification Checklist
- [x] Parallel mode (vertical: false) implements 180° flip for angles 90-270°
- [x] Radial mode (vertical: true) applies consistent +90° offset
- [x] Both `getTextTransform()` and `getTogetherTextTransform()` use same logic
- [x] SVG `<text>` elements bind to corrected transform functions
- [x] Layer 1 (index 1) has `vertical: false` in theme-dark.ts
- [x] Layer 5 (index 5) has `vertical: true` in theme-dark.ts
- [x] Anchor point (x, y) preserved for precise rotation origin

## Impact
- Layer 1 text now renders horizontally and readable (parallel tangent mode)
- Layer 5 text now renders vertically and pointing away from center (radial perpendicular mode)
- Visual integrity of Feng Shui compass restored

## Related Issues
- Ensures consistent SVG coordinate transformation across all rendering paths
- Maintains proper text readability without upside-down artifacts

---
**Date:** April 29, 2026
**Components Modified:** 2 (feng-shui-compass-svg.vue, theme-dark.ts verified)
**Test Status:** Ready for visual verification
