# 2026-05-04 Maintenance Log - Tile Engine Core

## Date and Time
2026-05-04 14:30

## Event Chain Analysis
- Symptom: basemap source list was disconnected from basemap manager, bbox CRS handling produced invalid GeoTIFFs, and progress was not synced to backend state.
- Root cause: frontend used hardcoded presets, backend assumed EPSG:4326 only, and tile stitching loop did not report progress.
- Impacted modules: frontend downloader panel/store, backend download API/tile engine, and map interaction flow.
- Solution outline: source presets from useBasemapManager, add bbox CRS conversion server-side, implement progress callbacks, and add map rectangle selection.

## Modification Content
- MapDownloader now loads basemap presets from useBasemapManager while preserving custom URL input.
- Backend accepts bbox CRS and converts EPSG:3857 to EPSG:4326 before tile math.
- Tile engine reports progress to backend; polling now reflects real download progress.
- Added map drag-box selection to capture bbox from MapContainer.
- Added task ID lookup and expiry metadata for 30-minute retention.

## Modification Reason
- Provide a stable, reusable core for the async online basemap export pipeline.

## Impact Scope
- backend/api/download.py
- backend/core/tile_engine.py
- frontend/src/components/MapDownloader.vue
- frontend/src/components/TOCPanel.vue
- frontend/src/components/SidePanel.vue
- frontend/src/views/HomeView.vue
- frontend/src/components/ControlsPanel.vue
- frontend/src/components/MapContainer.vue
- frontend/src/stores/useDownloadStore.ts
- frontend/src/utils/gis/mapRuntimeDeps.js
- Docs/26-05-04/2026-05-04-tile-engine-core.md

## Optimization Solution
1. Pull basemap options from useBasemapManager to keep UI and map presets in sync.
2. Normalize bbox on the backend with CRS-aware conversion for EPSG:3857.
3. Stream progress updates from tile stitching to the task status table.
4. Add map rectangle picking to reduce manual bbox input errors.
5. Expose expiry metadata and task lookup for robust task tracking.

## Performance Metrics
- N/A (core scaffolding only, no benchmarks run).

## Test Plan
1. POST /api/download/tasks with EPSG:3857 bbox and confirm output GeoTIFF renders.
2. Verify progress updates as tiles are processed (poll status endpoint).
3. Use MapDownloader “地图框选范围” to populate bbox and start download.
4. Query an existing task ID and ensure expired tasks return 410 or status=expired.

## Modified Files
- d:\Dev\GitHub\WebGIS_Dev\backend\api\download.py
- d:\Dev\GitHub\WebGIS_Dev\backend\core\tile_engine.py
- d:\Dev\GitHub\WebGIS_Dev\frontend\src\components\MapDownloader.vue
- d:\Dev\GitHub\WebGIS_Dev\frontend\src\components\TOCPanel.vue
- d:\Dev\GitHub\WebGIS_Dev\frontend\src\components\ControlsPanel.vue
- d:\Dev\GitHub\WebGIS_Dev\frontend\src\components\SidePanel.vue
- d:\Dev\GitHub\WebGIS_Dev\frontend\src\views\HomeView.vue
- d:\Dev\GitHub\WebGIS_Dev\frontend\src\components\MapContainer.vue
- d:\Dev\GitHub\WebGIS_Dev\frontend\src\stores\useDownloadStore.ts
- d:\Dev\GitHub\WebGIS_Dev\frontend\src\utils\gis\mapRuntimeDeps.js
- d:\Dev\GitHub\WebGIS_Dev\Docs\26-05-04\2026-05-04-tile-engine-core.md
