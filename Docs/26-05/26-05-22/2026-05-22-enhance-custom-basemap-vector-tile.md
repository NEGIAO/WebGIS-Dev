# WebGIS Maintenance Log

- DateTime: 2026-05-22 09:34
- Topic: Enhance custom basemap URL handling and vector tile support

## Issue Analysis (Event Chain)
- Symptom: Custom basemap URL switching is not robust for all WMS/WMTS/XYZ inputs and lacks vector tile (PBF/MVT) support.
- Root Cause: Auto-detection only produces raster tile sources and cannot create vector tile layers; custom URL reload is only triggered on explicit URL submit, not on layer switching.
- Affected Modules: Tile source factory, basemap layer bootstrap, layer control handlers, basemap constants.
- Risk: Vector tile URLs are detected as XYZ and rendered incorrectly; switching back to custom basemap can leave source empty.

## Changes
- Add vector tile URL detection and VectorTile source creation in the tile source factory.
- Add a basemap layer factory to create raster vs vector tile layers consistently.
- Update basemap bootstrap to use the new factory for vector tile basemaps.
- Update custom URL loading to replace layer types when switching between raster and vector tile sources and to reload on custom selection.
- Add a vector tile test basemap entry using the provided PBF URL.

## Reason
- Ensure custom URL switching can load WMS/WMTS/XYZ and vector tile sources reliably.
- Provide a built-in vector tile test layer for validation.

## Impact Scope
- Frontend basemap pipeline: source detection, layer creation, and custom URL switching.
- No backend changes.

## Solution Summary
- Extend auto-detection with vector tile heuristics and prefer vector tile before XYZ to avoid misclassification.
- Provide a basemap layer factory that creates TileLayer or VectorTileLayer with a safe default style.
- Replace the custom layer instance when vector tile vs raster type changes.
- Ensure custom basemap reloads when user re-selects the custom option.

## Performance
- Not measured (functional change).

## Test Plan
- Use the custom URL input with:
  - Vector tile URL: https://webgis.henu.edu.cn/server/rest/services/Hosted/Border_Vector/VectorTileServer/tile/{z}/{y}/{x}.pbf
  - WMS GetCapabilities URL and WMS GetMap URL (verify auto detection and rendering).
  - WMTS GetCapabilities URL and WMTS GetTile URL (verify auto detection and rendering).
  - Standard XYZ URL with {z}/{x}/{y}.
- Switch away and back to the custom basemap; confirm the source reloads.
- Confirm the new vector tile preset renders on map.

## Modified Files
- d:\Dev\GitHub\WebGIS_Dev\frontend\src\composables\useTileSourceFactory.ts
- d:\Dev\GitHub\WebGIS_Dev\frontend\src\composables\map\features\basemapLayerFactory.js
- d:\Dev\GitHub\WebGIS_Dev\frontend\src\composables\map\features\useBasemapLayerBootstrap.js
- d:\Dev\GitHub\WebGIS_Dev\frontend\src\composables\map\features\useLayerControlHandlers.js
- d:\Dev\GitHub\WebGIS_Dev\frontend\src\components\MapContainer.vue
- d:\Dev\GitHub\WebGIS_Dev\frontend\src\components\LayerControlPanel.vue
- d:\Dev\GitHub\WebGIS_Dev\frontend\src\constants\useBasemapManager.ts
- d:\Dev\GitHub\WebGIS_Dev\README.md
- d:\Dev\GitHub\WebGIS_Dev\frontend\README.md
- d:\Dev\GitHub\WebGIS_Dev\backend\README.md
- d:\Dev\GitHub\WebGIS_Dev\Docs\26-05-22\2026-05-22-enhance-custom-basemap-vector-tile.md
