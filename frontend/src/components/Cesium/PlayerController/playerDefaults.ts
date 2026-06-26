/**
 * playerDefaults.ts
 * 人物漫游控制器默认配置
 *
 * 集成自 cesium-player-controller（https://github.com/hh-hang/cesium-player-controller）
 * 提供 WASD 移动、第一/第三人称切换、碰撞检测、飞行模式等功能。
 */
import type { PlayerControllerOptions } from './types';

/** 默认人物模型配置（UAL1_Standard.glb 动画名） */
export const DEFAULT_PLAYER_MODEL_CONFIG = {
    url: './glb/player/UAL1_Standard.glb',
    scale: 0.01,
    idleAnim: 'Idle_Loop',
    walkAnim: 'Walk_Loop',
    runAnim: 'Sprint_Loop',
    jumpAnim: ['Jump_Start', 'Jump_Loop', 'Jump_Land'],
    flyAnim: 'fly',
    flyIdleAnim: 'flyIdle',
    flyHoverForwardAnim: 'flyHoverForward',
    flyHoverBackAnim: 'flyHoverBack',
    flyHoverLeftAnim: 'flyHoverLeft',
    flyHoverRightAnim: 'flyHoverRight',
    flyHoverUpAnim: 'flyHoverUp',
    flyHoverDownAnim: 'flyHoverDown',
    rotateY: -Math.PI / 2,
    facingOffset: Math.PI / 2,
};

/** 默认物理参数 */
export const DEFAULT_PHYSICS_CONFIG = {
    gravity: -2400,
    jumpHeight: 600,
    speed: 300,
    flySpeed: 55000,
    acceleration: 30,
    deceleration: 30,
};

/** 默认相机参数 */
export const DEFAULT_CAMERA_CONFIG: Partial<PlayerControllerOptions> = {
    minCamDistance: 100,
    maxCamDistance: 800,
    camLookAtHeightRatio: 0.8,
    thirdMouseMode: 1,
    enableZoom: true,
    enableOverShoulderView: false,
    isFirstPerson: false,
    enableSpringCamera: true,
    springCameraTime: 0.015, // 飞行速度 10 倍后，相机跟随时效从 0.05 加快到 0.015
};

/** 默认键位映射 */
export const DEFAULT_KEY_MAP = {
    forward: ['KeyW', 'ArrowUp'],
    backward: ['KeyS', 'ArrowDown'],
    left: ['KeyA', 'ArrowLeft'],
    right: ['KeyD', 'ArrowRight'],
    sprint: ['ShiftLeft', 'ShiftRight'],
    jump: ['Space'],
    toggleView: ['KeyV'],
    toggleFly: ['KeyF'],
};

/** 默认鼠标灵敏度 */
export const DEFAULT_MOUSE_SENSITIVITY = 5;
