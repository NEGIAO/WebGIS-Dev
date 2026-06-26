import type { Cartesian3, Viewer } from "cesium";

// ==================== 碰撞体来源 ====================

// glTF/glb 碰撞源:运行时 fetch + 解析出三角网
export type GltfCollider = {
    type: "gltf";
    url: string;
    // 模型在 ECEF 中的摆放点(与视觉模型一致)。不传则按 modelMatrix;都不传则视几何已在 ECEF。
    position?: Cartesian3;
    // 仅在用 position 摆放时生效;传了 modelMatrix 则忽略。
    rotation?: { heading?: number; pitch?: number; roll?: number };
    // 统一缩放倍率,默认 1。仅在用 position 摆放时生效。
    scale?: number;
    modelMatrix?: number[]; // 16 元素,列主序 ECEF;传了则忽略 position/rotation/scale
};

// Cesium 地形 → 采样成高度场
export type TerrainCollider = {
    type: "terrain";
    // 采样矩形范围 [west, south, east, north](弧度)
    rectangle: [number, number, number, number];
    // 采样网格分辨率,默认 64x64
    resolution?: number;
};

export type ColliderSource =
    | GltfCollider
    | TerrainCollider;

// ==================== 动态物体形状  ====================
// 受物理模拟、可被角色推动的动态物体的几何

export type DynamicShape =
    // 球：radius 米
    | { kind: "ball"; radius: number }
    // 方块：half 为 ENU 三轴半边长（米）
    | { kind: "box"; half: { e: number; n: number; u: number } }
    // 圆柱：轴沿 ENU Up，halfHeight 半高 + radius 半径（米）
    | { kind: "cylinder"; halfHeight: number; radius: number }
    // 圆锥：轴沿 ENU Up（尖朝上），halfHeight 半高 + radius 底半径（米）
    | { kind: "cone"; halfHeight: number; radius: number };

// ==================== 玩家配置 ====================
export type PlayerModelOptions = {
    url: string; // 模型路径(GLB/GLTF）
    scale: number; // 角色尺度倍率
    idleAnim: string; // 静止动画名
    walkAnim: string; // 行走动画名
    runAnim: string; // 跑步动画名
    jumpAnim: string | [startAnim: string, loopAnim: string, endAnim: string]; // 跳跃;或三段 [起跳,循环,落地]
    leftWalkAnim?: string; // 左移动画,默认复用 walkAnim
    rightWalkAnim?: string; // 右移动画,默认复用 walkAnim
    backwardAnim?: string; // 后退动画,默认复用 walkAnim
    flyAnim?: string; // 飞行动画,默认复用 idleAnim
    flyIdleAnim?: string; // 飞行待机,默认复用 idleAnim
    flyHoverForwardAnim?: string; // 飞行前进悬停
    flyHoverBackAnim?: string; // 飞行后退悬停
    flyHoverLeftAnim?: string; // 飞行左移悬停
    flyHoverRightAnim?: string; // 飞行右移悬停
    flyHoverUpAnim?: string; // 飞行上升悬停
    flyHoverDownAnim?: string; // 飞行下降悬停
    gravity?: number; // 重力基准(按 scale 缩放),默认 -2400
    jumpHeight?: number; // 跳跃初速度基准(按 scale 缩放),默认 600
    speed?: number; // 行走速度基准(按 scale 缩放),默认 300
    flySpeed?: number; // 飞行速度基准(按 scale 缩放),默认 2100
    rotateY?: number; // 人物初始朝向(弧度),默认 0
    facingOffset?: number; // 模型正面轴校正(弧度):正面 +Y 用 0,+X 用 -π/2,-Y 用 π,-X 用 π/2
    firstPersonCameraOffset?: [number, number, number]; // 第一人称相机局部偏移(基于胶囊顶部,玩家朝向系 x=右/y=前/z=上,随 yaw 转动,按 scale 缩放),默认 [0,0,0]
    capsuleRadiusRatio?: number; // 胶囊体半径倍率,默认 1
    acceleration?: number; // XZ 加速响应速度,默认 30
    deceleration?: number; // XZ 减速响应速度,默认 30
};

// 可重映射的输入动作
export type KeyAction =
    | "forward" | "backward" | "left" | "right"
    | "sprint" | "jump" | "toggleView" | "toggleFly";

export type KeyMap = Partial<Record<KeyAction, string | string[] | null>>;

export type MobileControlsOptions = {
    joystick?: boolean;
    jump?: boolean;
    fly?: boolean;
    view?: boolean;
};

// ==================== 主初始化选项 ====================
export type PlayerControllerOptions = {
    viewer: Viewer; // Cesium Viewer
    playerModelConfig: PlayerModelOptions; // 角色模型与参数
    initPos: Cartesian3; // 初始出生点(ECEF)
    staticCollider?: ColliderSource | ColliderSource[]; // 静态碰撞源
    kinematicCollider?: ColliderSource | ColliderSource[]; // 运动学碰撞源(移动平台)
    mouseSensitivity?: number; // 鼠标灵敏度,默认 5
    minCamDistance?: number; // 第三人称最小镜头距,默认 100
    maxCamDistance?: number; // 第三人称最大镜头距,默认 440
    camLookAtHeightRatio?: number; // 相机看向点高度比例,默认 0.8
    thirdMouseMode?: 0 | 1 | 2 | 3 | 4 | 5; // 第三人称鼠标模式,默认 1
    enableZoom?: boolean; // 是否允许滚轮缩放,默认 false
    enableOverShoulderView?: boolean; // 是否启用过肩视角,默认 false
    isFirstPerson?: boolean; // 初始是否第一人称,默认 false
    enableSpringCamera?: boolean; // 是否启用弹簧相机,默认 false
    springCameraTime?: number; // 弹簧相机平滑时间(秒),默认 0.05
    timeScale?: number; // 时间缩放系数,默认 1
    keyMap?: KeyMap; // 自定义键位
    isShowMobileControls?: boolean; // 移动端是否显示虚拟 UI,默认 true
    mobileControls?: MobileControlsOptions; // 移动端按钮显隐
};
