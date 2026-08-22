/**
 * 功能名称：UI 航点动作 ↔ WPML actionGroup 编解码
 * 日    期：2026/07/20
 *
 * 对应文档：40.common-element.md actionGroup / action
 */

import type { PayloadLensSetting, UavActionItem, WpmlAction, WpmlActionGroup } from './types';
import { DEFAULT_PAYLOAD_POSITION_INDEX } from './constants';
import { ensureOrientedShootFields } from './orientedShoot';

interface EncodeContext {
	pointIndex: number;
	/** 全部航点动作列表，用于查找结束间隔拍照 */
	allPointActions: UavActionItem[][];
}

/**
 * 镜头 setting → payloadLensIndex 字符串
 */
export function settingToPayloadLensIndex(setting?: PayloadLensSetting): string {
	const parts: string[] = [];
	if (setting?.kjgptz) parts.push('visable');
	if (setting?.bjptz) parts.push('zoom');
	if (setting?.gjptz) parts.push('wide');
	if (setting?.hwptz) parts.push('ir');
	return parts.length > 0 ? parts.join(',') : 'visable';
}

/**
 * payloadLensIndex → UI setting
 */
export function payloadLensIndexToSetting(payloadLensIndex?: string): PayloadLensSetting {
	const setting: PayloadLensSetting = {
		kjgptz: false,
		bjptz: false,
		gjptz: false,
		hwptz: false,
	};
	if (!payloadLensIndex) return setting;
	const parts = String(payloadLensIndex)
		.toLowerCase()
		.split(',')
		.map((s) => s.trim());
	parts.forEach((key) => {
		if (key === 'visable') setting.kjgptz = true;
		else if (key === 'ir') setting.hwptz = true;
		else if (key === 'zoom') setting.bjptz = true;
		else if (key === 'wide') setting.gjptz = true;
	});
	return setting;
}

/**
 * 查找间隔拍照结束航点下标
 */
function findEndIntervalIndex(startIndex: number, allPointActions: UavActionItem[][]): number {
	for (let i = startIndex; i < allPointActions.length; i++) {
		const actions = allPointActions[i] ?? [];
		for (let j = 0; j < actions.length; j++) {
			if (actions[j].field === 'isEndIntervalPhoto') {
				return i;
			}
		}
	}
	return allPointActions.length > 0 ? allPointActions.length - 1 : startIndex;
}

/**
 * 将单个 UI 动作转为 WPML action（reachPoint 组内）
 */
function encodeReachPointAction(item: UavActionItem, actionId: number, pointIndex: number): WpmlAction | null {
	const field = item.field;
	const baseParams: Record<string, string | number | boolean> = {
		payloadPositionIndex: DEFAULT_PAYLOAD_POSITION_INDEX,
	};

	switch (field) {
		case 'isSnapshot':
		case 'F': {
			const lens = settingToPayloadLensIndex(item.setting);
			if (field === 'F') {
				ensureOrientedShootFields(item);
				const heading = item.heading ?? 0;
				const pitch = item.miniPitch ?? item.pitch ?? 0;
				const gimbalYaw = item.gimbalYaw ?? heading;
				return {
					actionId,
					actionActuatorFunc: 'orientedShoot',
					params: {
						...baseParams,
						gimbalPitchRotateAngle: pitch,
						gimbalYawRotateAngle: gimbalYaw,
						focusX: item.focusX ?? 480,
						focusY: item.focusY ?? 360,
						focusRegionWidth: item.focusRegionWidth ?? 384,
						focusRegionHeight: item.focusRegionHeight ?? 288,
						focalLength: item.focalLength ?? 120,
						aircraftHeading: heading,
						accurateFrameValid: item.accurateFrameValid ?? 0,
						payloadLensIndex: lens,
						useGlobalPayloadLensIndex: 0,
						targetAngle: item.targetAngle ?? 0,
						actionUUID: item.actionUUID ?? '',
						imageWidth: item.imageWidth ?? 960,
						imageHeight: item.imageHeight ?? 720,
						AFPos: 0,
						gimbalPort: 0,
						orientedCameraType: 81,
						orientedFilePath: '',
						orientedFileMD5: '',
						orientedFileSize: 0,
						orientedFileSuffix: item.orientedFileSuffix ?? item.fileSuffix ?? `${pointIndex + 1}-${actionId + 1}`,
						orientedCameraApertue: 0,
						orientedCameraLuminance: 0,
						orientedCameraShutterTime: 0,
						orientedCameraISO: 0,
						orientedPhotoMode: 'normalPhoto',
					},
				};
			}
			return {
				actionId,
				actionActuatorFunc: 'takePhoto',
				params: {
					...baseParams,
					fileSuffix: item.fileSuffix ?? `${pointIndex + 1}-${actionId + 1}`,
					payloadLensIndex: lens,
					useGlobalPayloadLensIndex: 0,
				},
			};
		}
		case 'G':
			return {
				actionId,
				actionActuatorFunc: 'panoShot',
				params: {
					...baseParams,
					useGlobalPayloadLensIndex: 1,
					payloadLensIndex: 'visable',
					panoShotSubMode: 'panoShot_360',
				},
			};
		case 'isStartRecord':
			return {
				actionId,
				actionActuatorFunc: 'startRecord',
				params: {
					...baseParams,
					fileSuffix: item.fileSuffix ?? `${pointIndex + 1}-${actionId + 1}`,
					payloadLensIndex: settingToPayloadLensIndex(item.setting),
					useGlobalPayloadLensIndex: 0,
				},
			};
		case 'isEndRecord':
			return {
				actionId,
				actionActuatorFunc: 'stopRecord',
				params: { ...baseParams },
			};
		case 'isAirHover':
			return {
				actionId,
				actionActuatorFunc: 'hover',
				params: { hoverTime: Number(item.value) || 1 },
			};
		case 'heading':
			return {
				actionId,
				actionActuatorFunc: 'rotateYaw',
				params: {
					aircraftHeading: Number(item.value) || 0,
					aircraftPathMode: 'followBadArc',
				},
			};
		case 'ptzPitch':
			return {
				actionId,
				actionActuatorFunc: 'gimbalRotate',
				params: {
					...baseParams,
					gimbalHeadingYawBase: 'north',
					gimbalRotateMode: 'absoluteAngle',
					gimbalPitchRotateEnable: 1,
					gimbalPitchRotateAngle: Number(item.value) || 0,
					gimbalRollRotateEnable: 0,
					gimbalRollRotateAngle: 0,
					gimbalYawRotateEnable: 0,
					gimbalYawRotateAngle: 0,
					gimbalRotateTimeEnable: 0,
					gimbalRotateTime: 0,
				},
			};
		case 'ptz':
			return {
				actionId,
				actionActuatorFunc: 'zoom',
				params: {
					...baseParams,
					focalLength: Number(item.value) * 24 || 120,
				},
			};
		case 'isEndIntervalPhoto':
		case 'isIntervalPhoto':
		case 'isDistanceIntervalPhoto':
		case 'ptzHeading':
		case 'attitude':
		case 'isCreateFile':
			return null;
		default:
			return null;
	}
}

/**
 * 将航点 UI 动作列表编码为 WPML actionGroup 列表
 */
export function encodeActionGroups(list: UavActionItem[], ctx: EncodeContext): WpmlActionGroup[] {
	const actionGroupList: WpmlActionGroup[] = [];
	let nextGroupId = 0;
	const reachActions: WpmlAction[] = [];
	let reachActionId = 0;

	for (let index = 0; index < list.length; index++) {
		const item = list[index];
		const field = item.field;

		if (field === 'isIntervalPhoto' || field === 'isDistanceIntervalPhoto') {
			const endIndex = findEndIntervalIndex(ctx.pointIndex, ctx.allPointActions);
			const triggerType = field === 'isIntervalPhoto' ? 'multipleTiming' : 'multipleDistance';
			actionGroupList.push({
				actionGroupId: nextGroupId++,
				actionGroupStartIndex: ctx.pointIndex,
				actionGroupEndIndex: endIndex,
				actionGroupMode: 'sequence',
				actionTrigger: {
					actionTriggerType: triggerType,
					actionTriggerParam: Number(item.value) || 1,
				},
				actions: [
					{
						actionId: 0,
						actionActuatorFunc: 'takePhoto',
						params: {
							payloadPositionIndex: DEFAULT_PAYLOAD_POSITION_INDEX,
							payloadLensIndex: settingToPayloadLensIndex(item.setting),
							useGlobalPayloadLensIndex: 0,
							fileSuffix: `${ctx.pointIndex + 1}-interval`,
						},
					},
				],
			});
			continue;
		}

		const encoded = encodeReachPointAction(item, reachActionId, ctx.pointIndex);
		if (encoded) {
			reachActions.push(encoded);
			reachActionId += 1;
		}
	}

	if (reachActions.length > 0) {
		actionGroupList.push({
			actionGroupId: nextGroupId,
			actionGroupStartIndex: ctx.pointIndex,
			actionGroupEndIndex: ctx.pointIndex,
			actionGroupMode: 'sequence',
			actionTrigger: { actionTriggerType: 'reachPoint' },
			actions: reachActions,
		});
	}

	return actionGroupList;
}

/**
 * 将单个 reachPoint 动作解码为 UI 项
 */
function decodeReachPointAction(func: string, params: Record<string, unknown>): UavActionItem | null {
	if (func === 'rotateYaw') {
		const heading = Number(params.aircraftHeading);
		if (Number.isNaN(heading)) return null;
		return {
			name: '飞行器偏航角',
			field: 'heading',
			value: heading,
			icon: 'action_phj',
			unit: '°',
			max: 180,
			min: -180,
		};
	}
	if (func === 'gimbalRotate') {
		const pitch = Number(params.gimbalPitchRotateAngle);
		if (Number.isNaN(pitch)) return null;
		return {
			name: '云台俯仰角',
			field: 'ptzPitch',
			value: pitch,
			icon: 'action_fyj',
			unit: '°',
			max: 45,
			min: -120,
		};
	}
	if (func === 'zoom') {
		const focalLength = Number(params.focalLength);
		if (Number.isNaN(focalLength) || focalLength <= 0) return null;
		return {
			name: '相机变焦',
			field: 'ptz',
			value: focalLength / 24,
			icon: 'fangda',
			unit: 'X',
			max: 200,
			min: 2,
		};
	}
	if (func === 'hover') {
		const hoverTime = Number(params.hoverTime);
		if (Number.isNaN(hoverTime) || hoverTime <= 0) return null;
		return {
			name: '悬停',
			field: 'isAirHover',
			label: '悬停',
			value: hoverTime,
			min: 1,
			max: 900,
			unit: 's',
			icon: 'airHover',
		};
	}
	if (func === 'startRecord') {
		return {
			name: '开始录像',
			field: 'isStartRecord',
			icon: 'startRecording',
			setting: payloadLensIndexToSetting(String(params.payloadLensIndex ?? '')),
		};
	}
	if (func === 'stopRecord') {
		return {
			name: '停止录像',
			field: 'isEndRecord',
			icon: 'endRecording',
		};
	}
	if (func === 'takePhoto' || func === 'orientedShoot') {
		const isOriented = func === 'orientedShoot';
		const item: UavActionItem = {
			name: isOriented ? '定向拍照' : '拍照',
			field: isOriented ? 'F' : 'isSnapshot',
			icon: isOriented ? 'takePictures' : 'snapshot',
			setting: {
				...payloadLensIndexToSetting(String(params.payloadLensIndex ?? '')),
				isFlyLine: true,
			},
			fileSuffix: params.fileSuffix != null ? String(params.fileSuffix) : params.orientedFileSuffix != null ? String(params.orientedFileSuffix) : undefined,
			heading: params.aircraftHeading != null ? Number(params.aircraftHeading) : undefined,
			miniPitch: params.gimbalPitchRotateAngle != null ? Number(params.gimbalPitchRotateAngle) : undefined,
		};
		if (isOriented) {
			item.gimbalYaw = params.gimbalYawRotateAngle != null ? Number(params.gimbalYawRotateAngle) : item.heading;
			item.pitch = item.miniPitch;
			item.focusX = params.focusX != null ? Number(params.focusX) : undefined;
			item.focusY = params.focusY != null ? Number(params.focusY) : undefined;
			item.focusRegionWidth = params.focusRegionWidth != null ? Number(params.focusRegionWidth) : undefined;
			item.focusRegionHeight = params.focusRegionHeight != null ? Number(params.focusRegionHeight) : undefined;
			item.focalLength = params.focalLength != null ? Number(params.focalLength) : undefined;
			item.accurateFrameValid = params.accurateFrameValid != null ? Number(params.accurateFrameValid) : 0;
			item.targetAngle = params.targetAngle != null ? Number(params.targetAngle) : 0;
			item.actionUUID = params.actionUUID != null ? String(params.actionUUID) : undefined;
			item.imageWidth = params.imageWidth != null ? Number(params.imageWidth) : 960;
			item.imageHeight = params.imageHeight != null ? Number(params.imageHeight) : 720;
			item.orientedFileSuffix = params.orientedFileSuffix != null ? String(params.orientedFileSuffix) : item.fileSuffix;
			ensureOrientedShootFields(item);
		}
		return item;
	}
	if (func === 'panoShot') {
		return {
			name: '全景拍照',
			field: 'G',
			icon: 'panoramicPhoto',
		};
	}
	return null;
}

/**
 * 将导入的 Placemark.actionGroup 转为 UI uavActionList
 * （兼容 parseKmz 解析结果：action 可能是数组）
 */
export function buildUavActionListFromTemplateWaypoint(waypoint: Record<string, unknown>, waypointIndex?: number, placemarks?: Record<string, unknown>[]): UavActionItem[] {
	const list: UavActionItem[] = [];
	const actionGroups = Array.isArray(waypoint?.actionGroup) ? (waypoint.actionGroup as Record<string, unknown>[]) : [];

	// 结束间隔拍照（含 multipleDistance）
	if (typeof waypointIndex === 'number' && Array.isArray(placemarks) && placemarks.length > 0) {
		for (const pm of placemarks) {
			const groups = Array.isArray(pm?.actionGroup) ? (pm.actionGroup as Record<string, unknown>[]) : [];
			for (const g of groups) {
				const trigger = (g?.actionTrigger ?? {}) as Record<string, unknown>;
				const triggerType = trigger?.actionTriggerType;
				if (triggerType !== 'multipleTiming' && triggerType !== 'multipleDistance') continue;
				const endIdx = Number(g?.actionGroupEndIndex);
				if (Number.isNaN(endIdx) || endIdx !== waypointIndex) continue;
				list.push({
					name: '结束间隔拍照',
					field: 'isEndIntervalPhoto',
					icon: 'endIntervalPhoto',
				});
				break;
			}
		}
	}

	for (const g of actionGroups) {
		const trigger = (g?.actionTrigger ?? {}) as Record<string, unknown>;
		const triggerType = trigger?.actionTriggerType;
		const actions = Array.isArray(g?.action) ? (g.action as Record<string, unknown>[]) : [];

		if (triggerType === 'multipleTiming' || triggerType === 'multipleDistance') {
			const interval = Number(trigger?.actionTriggerParam ?? 0);
			if (interval > 0) {
				const hasTakePhoto = actions.some((a) => a?.actionActuatorFunc === 'takePhoto');
				if (hasTakePhoto) {
					const isTiming = triggerType === 'multipleTiming';
					list.push({
						name: isTiming ? '等时间隔拍照' : '等距间隔拍照',
						field: isTiming ? 'isIntervalPhoto' : 'isDistanceIntervalPhoto',
						value: interval,
						min: 1,
						max: isTiming ? 3600 : 10000,
						unit: isTiming ? 's' : 'm',
						icon: 'intervalPhoto',
						setting: payloadLensIndexToSetting(String((actions[0]?.actionActuatorFuncParam as Record<string, unknown>)?.payloadLensIndex ?? '')),
					});
				}
			}
			continue;
		}

		for (const a of actions) {
			const func = String(a?.actionActuatorFunc ?? '');
			const p = (a?.actionActuatorFuncParam ?? {}) as Record<string, unknown>;
			const item = decodeReachPointAction(func, p);
			if (item) list.push(item);
		}
	}

	return list;
}

/**
 * 兼容旧 map.ts 导出名
 */
export { buildUavActionListFromTemplateWaypoint as decodeActionGroupsFromWaypoint };
