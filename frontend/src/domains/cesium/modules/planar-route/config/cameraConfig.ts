/**
 * 功能名称：航线相机参数
 * 日    期：2026/07/17
 */
import { translate as t } from '@common/app/useLocale';

export interface CameraPhotoSpecification {
	model: string;
	lens: string;
	diagonalFovDegrees: number;
	photoWidthPixels: number;
	photoHeightPixels: number;
}

export interface CameraFieldOfView {
	horizontalDegrees: number;
	verticalDegrees: number;
}

/** M3TD 广角照片规格，82° 为对角视场角。 */
export const M3TD_WIDE_CAMERA: CameraPhotoSpecification = {
	model: 'M3TD',
	lens: 'wide',
	diagonalFovDegrees: 82,
	photoWidthPixels: 4032,
	photoHeightPixels: 3024,
};

/**
 * 根据对角 FOV 和照片纵横比推导水平、垂直 FOV。
 */
export function calculateCameraFieldOfView(specification: CameraPhotoSpecification): CameraFieldOfView {
	if (specification.diagonalFovDegrees <= 0 || specification.diagonalFovDegrees >= 180) {
		throw new Error(t('cesium.module.planarRoute.err.invalidDiagonalFov'));
	}
	if (specification.photoWidthPixels <= 0 || specification.photoHeightPixels <= 0) {
		throw new Error(t('cesium.module.planarRoute.err.invalidPhotoSize'));
	}

	const diagonalPixels = Math.hypot(specification.photoWidthPixels, specification.photoHeightPixels);
	const diagonalHalfTangent = Math.tan((specification.diagonalFovDegrees * Math.PI) / 360);
	const horizontalHalfTangent = diagonalHalfTangent * (specification.photoWidthPixels / diagonalPixels);
	const verticalHalfTangent = diagonalHalfTangent * (specification.photoHeightPixels / diagonalPixels);

	return {
		horizontalDegrees: (2 * Math.atan(horizontalHalfTangent) * 180) / Math.PI,
		verticalDegrees: (2 * Math.atan(verticalHalfTangent) * 180) / Math.PI,
	};
}
