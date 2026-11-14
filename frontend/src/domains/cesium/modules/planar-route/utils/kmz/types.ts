import Cesium from 'cesium';
import { CartesianRouteSegment } from '../planarTerrain';


export interface PlanarKmzRoute {
	id: number;
	headingDegrees?: number;
	gimbalPitchDegrees: number;
	segments: CartesianRouteSegment[];
}


export interface PlanarKmzExportOptions {
	isOblique: boolean;
	polygonPositions: Cesium.Cartesian3[];
	takeoffPosition: Cesium.Cartesian3;
	routes: PlanarKmzRoute[];
	lineAngle: number;
	lineHeight: number;
	heightType: number;
	flightSpeed: number;
	transitionalSpeed: number;
	overlapW: number;
	overlapH: number;
	gimbalPitchDegrees: number;
	photoTriggerMode: 'time' | 'distance';
	photoDistance: number;
}


export interface ExportWaypoint {
	longitude: number;
	latitude: number;
	height: number;
}


export interface CaptureRange {
	id: number;
	startIndex: number;
	endIndex: number;
}


export interface ExportRouteData {
	id: number;
	headingDegrees?: number;
	gimbalPitchDegrees: number;
	waypoints: ExportWaypoint[];
	captureRanges: CaptureRange[];
	distance: number;
}
