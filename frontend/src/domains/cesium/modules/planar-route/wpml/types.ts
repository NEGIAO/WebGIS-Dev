/**
 * 功能名称：点状航线 WPML 类型定义（对齐 DJIWayLine 文档）
 * 日    期：2026/07/20
 *
 * 属性名 = WPML 元素名去掉 wpml: 前缀的 camelCase
 * 对应文档：20.template-kml.md / 30.waylines-wpml.md / 40.common-element.md
 */

/** 飞向首航点模式 */
export type FlyToWaylineMode = 'safely' | 'pointToPoint';

/** 航线结束动作 */
export type FinishAction = 'goHome' | 'noAction' | 'autoLand' | 'gotoFirstWaypoint';

/** 失控是否继续执行航线 */
export type ExitOnRCLost = 'goContinue' | 'executeLostAction';

/** 失控动作类型 */
export type ExecuteRCLostAction = 'goBack' | 'landing' | 'hover';

/** template 航点高程参考平面 */
export type TemplateHeightMode = 'EGM96' | 'relativeToStartPoint' | 'aboveGroundLevel';

/** waylines 执行高度模式 */
export type ExecuteHeightMode = 'WGS84' | 'relativeToStartPoint' | 'realTimeFollowSurface';

/** 云台俯仰角控制模式 */
export type GimbalPitchMode = 'manual' | 'usePointSetting';

/** 飞行器偏航角模式 */
export type WaypointHeadingMode = 'followWayline' | 'manually' | 'fixed' | 'smoothTransition' | 'towardPOI';

/** 偏航角转动方向 */
export type WaypointHeadingPathMode = 'clockwise' | 'counterClockwise' | 'followBadArc';

/** 航点转弯模式 */
export type WaypointTurnMode = 'coordinateTurn' | 'toPointAndStopWithDiscontinuityCurvature' | 'toPointAndStopWithContinuityCurvature' | 'toPointAndPassWithContinuityCurvature';

/** 动作触发器类型 */
export type ActionTriggerType = 'reachPoint' | 'betweenAdjacentPoints' | 'multipleTiming' | 'multipleDistance';

/** 动作执行器类型（点状常用子集） */
export type ActionActuatorFunc =
	| 'takePhoto'
	| 'startRecord'
	| 'stopRecord'
	| 'focus'
	| 'zoom'
	| 'customDirName'
	| 'gimbalRotate'
	| 'rotateYaw'
	| 'hover'
	| 'gimbalEvenlyRotate'
	| 'orientedShoot'
	| 'panoShot';

/** 机型信息 */
export interface DroneInfo {
	droneEnumValue: number;
	droneSubEnumValue: number;
}

/** 负载信息 */
export interface PayloadInfo {
	payloadEnumValue: number;
	payloadPositionIndex: number;
	payloadSubEnumValue?: number;
}

/** 航线绕行（WPML autoRerouteInfo，支持机型 M3D/M3TD） */
export interface AutoRerouteInfo {
	/** 任务航线绕行：0 关闭 / 1 开启 */
	missionAutoRerouteMode: 0 | 1;
	/** 过渡航线绕行：0 关闭 / 1 开启 */
	transitionalAutoRerouteMode: 0 | 1;
}

/** 偏航角参数 */
export interface WaypointHeadingParam {
	waypointHeadingMode: WaypointHeadingMode;
	waypointHeadingAngle?: number;
	waypointPoiPoint?: string;
	waypointHeadingPathMode?: WaypointHeadingPathMode;
	waypointHeadingAngleEnable?: number;
}

/** 转弯参数 */
export interface WaypointTurnParam {
	waypointTurnMode: WaypointTurnMode;
	waypointTurnDampingDist?: number;
	useStraightLine?: 0 | 1;
}

/** 动作触发器 */
export interface ActionTrigger {
	actionTriggerType: ActionTriggerType;
	actionTriggerParam?: number;
}

/** 动作参数（扁平导出用，写入 XML 时再拆分） */
export interface WpmlAction {
	actionId: number;
	actionActuatorFunc: ActionActuatorFunc;
	/** 动作参数键值，由编解码器填充 */
	params: Record<string, string | number | boolean>;
}

/** 动作组 */
export interface WpmlActionGroup {
	actionGroupId: number;
	actionGroupStartIndex: number;
	actionGroupEndIndex: number;
	actionGroupMode: 'sequence';
	actionTrigger: ActionTrigger;
	actions: WpmlAction[];
}

/** 导出用航点（中间模型） */
export interface ExportWaypointPoint {
	index: number;
	longitude: number;
	latitude: number;
	/** template 编辑高度（EGM96 / 相对起飞点 / AGL） */
	height: number;
	/** 椭球高（与 height 双轨表达） */
	ellipsoidHeight: number;
	/** waylines 执行高度 */
	executeHeight: number;
	useGlobalHeight: 0 | 1;
	useGlobalSpeed: 0 | 1;
	waypointSpeed: number;
	useGlobalHeadingParam: 0 | 1;
	waypointHeadingParam: WaypointHeadingParam;
	useGlobalTurnParam: 0 | 1;
	waypointTurnParam: WaypointTurnParam;
	useStraightLine?: 0 | 1;
	gimbalPitchAngle: number;
	actionGroups: WpmlActionGroup[];
}

/** UI 镜头开关（司空2 式） */
export interface PayloadLensSetting {
	kjgptz?: boolean;
	bjptz?: boolean;
	gjptz?: boolean;
	hwptz?: boolean;
}

/** 编辑态航点动作项 */
export interface UavActionItem {
	name: string;
	field: string;
	value?: number | string;
	icon?: string;
	unit?: string;
	min?: number;
	max?: number;
	label?: string;
	setting?: PayloadLensSetting & { isFlyLine?: boolean };
	fileSuffix?: string;
	/** 飞行器偏航角（度，相对正北，司空 aircraftHeading） */
	heading?: number;
	/** 云台俯仰角（度，司空 gimbalPitchRotateAngle） */
	miniPitch?: number;
	/** 云台偏航角（度，司空 gimbalYawRotateAngle；M3TD 与 heading 一致） */
	gimbalYaw?: number;
	miniHeading?: number;
	type?: string;
	/** 定向拍照：逻辑画幅与框选（WPML orientedShoot） */
	imageWidth?: number;
	imageHeight?: number;
	focusX?: number;
	focusY?: number;
	focusRegionWidth?: number;
	focusRegionHeight?: number;
	accurateFrameValid?: number;
	targetAngle?: number;
	actionUUID?: string;
	focalLength?: number;
	orientedFileSuffix?: string;
	pitch?: number;
}

/** 导出任务配置（从编辑态汇总） */
export interface WaypointExportMission {
	author?: string;
	flyToWaylineMode: FlyToWaylineMode;
	finishAction: FinishAction;
	exitOnRCLost: ExitOnRCLost;
	executeRCLostAction: ExecuteRCLostAction;
	takeOffSecurityHeight: number;
	globalTransitionalSpeed: number;
	globalRTHHeight: number;
	takeOffRefPoint: string;
	takeOffRefPointAGLHeight: number;
	droneInfo: DroneInfo;
	payloadInfo: PayloadInfo;
	/** 航线绕行（司空2 高级设置开关） */
	autoRerouteInfo: AutoRerouteInfo;
	templateId: number;
	autoFlightSpeed: number;
	globalHeight: number;
	templateHeightMode: TemplateHeightMode;
	executeHeightMode: ExecuteHeightMode;
	gimbalPitchMode: GimbalPitchMode;
	globalWaypointHeadingParam: WaypointHeadingParam;
	globalWaypointTurnMode: WaypointTurnMode;
	globalUseStraightLine: 0 | 1;
	imageFormat: string;
	waypoints: ExportWaypointPoint[];
}

/** 导出可选覆盖参数 */
export interface WaypointExportOptions {
	droneEnumValue?: number;
	droneSubEnumValue?: number;
	payloadEnumValue?: number;
	payloadPositionIndex?: number;
	waypointTurnDampingDist?: number;
	waypointPoiPoint?: string;
	type?: 'json' | 'kmz';
}
