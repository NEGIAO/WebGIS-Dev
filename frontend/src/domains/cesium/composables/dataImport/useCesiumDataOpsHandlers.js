/**
 * Cesium 数据导入/操作事件处理器（自 CesiumContainer 抽离，行为保持一致）。
 *
 * 职责：把 CesiumToolPanel / 拖拽导入 / GLTF 坐标弹窗发出的数据操作事件
 * 转发到 useCesiumDataImport 实例，容器组件仅做一次工厂装配。
 *
 * 依赖注入：
 * - dataImport：useCesiumDataImport 实例
 * - repositionTargetRef：当前待调整位置的模型（computed ref）
 * - getCesium：Cesium 运行时获取函数
 * - isComponentUnmounted：宿主组件卸载标记 getter（卸载后拒绝异步操作）
 */
import { setTilesetMaterialMode } from './dataSourceDisplay.js';

export function createCesiumDataOpsHandlers({
    dataImport,
    repositionTargetRef,
    getCesium,
    isComponentUnmounted,
}) {
    /** 面板/拖拽导入数据文件（内部已有失败提示） */
    async function handleDataImport({ files }) {
        if (isComponentUnmounted()) return;
        try {
            await dataImport.loadDataFiles(Array.from(files));
        } catch {
            // loadDataFiles 内部已通过 message.error 提示
        }
    }

    /**
     * 移除单个已加载数据源
     * @param {{ id: string }} payload
     */
    function handleDataRemove({ id }) {
        dataImport.removeDataSource(id);
    }

    /**
     * 定位/缩放到指定数据源
     * @param {{ id: string }} payload
     */
    function handleDataFlyTo({ id }) {
        dataImport.flyToDataSource(id);
    }

    /** 清除所有已加载数据源 */
    function handleDataClearAll() {
        dataImport.clearAllDataSources();
    }

    /**
     * 调整 GLTF 模型位置
     * @param {{ id: string }} payload
     */
    function handleDataReposition({ id }) {
        dataImport.startGltfReposition(id);
    }

    /** 拉伸 GeoTIFF 单波段到高程 */
    async function handleDataStretchHeight({ id }) {
        if (isComponentUnmounted()) return;
        try {
            await dataImport.stretchRasterToHeight(id);
        } catch {
            // stretchRasterToHeight 内部已通过 message 提示
        }
    }

    /** 手动设置 3D Tiles 贴地高度（滑杆） */
    function handleDataSetHeight({ id, height }) {
        if (isComponentUnmounted()) return;
        dataImport.setTilesetHeight(id, height);
    }

    /**
     * 加载样例数据。
     * @param {Object} [payload]
     * @param {string} [payload.type] - 'city' | 'ion' | 'i3s'
     */
    async function handleImportTilesetSample(payload) {
        if (isComponentUnmounted()) return;
        const type = payload?.type || 'city';
        try {
            if (type === 'ion') {
                await dataImport.loadSampleIonTileset();
            } else if (type === 'i3s') {
                await dataImport.loadSampleI3sTileset();
            } else if (type === 'discreteLOD') {
                await dataImport.loadSampleDiscreteLODTileset();
            } else if (type === 'baimo') {
                await dataImport.loadSampleBaimoTileset();
            } else {
                await dataImport.loadSampleTileset();
            }
        } catch {
            // 内部已提示
        }
    }

    /**
     * 切换 3D Tiles 材质模式（P1-2：经合成器保留当前透明度，材质与透明度互不覆盖）
     */
    function handleDataSetMaterial({ id, mode }) {
        if (isComponentUnmounted()) return;
        const CesiumRuntime = getCesium();
        if (!CesiumRuntime) return;
        const record = dataImport.loadedDataSources.value.find(ds => ds.id === id);
        if (!record || record.type !== '3dtiles') return;
        setTilesetMaterialMode(CesiumRuntime, record, mode);
        record.materialMode = mode;
        // tileset.style 直改不经 Cesium 自动触发通道，按需渲染模式下补一帧（连续模式无害）
        dataImport.getViewer?.()?.scene?.requestRender?.();
    }

    /**
     * 打开文件选择器选择 3D Tiles ZIP 包
     * 选中后通过 loadDataFile 自动路由到 loadTilesetFromZip
     * 注意：input 必须挂载到 DOM 中才能可靠触发 click 事件
     */
    function handleImportTilesetZip() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.zip';
        input.style.display = 'none';
        document.body.appendChild(input);

        /** 清理 DOM 中的 input 元素 */
        function cleanup() {
            if (input.parentNode) {
                document.body.removeChild(input);
            }
        }

        input.onchange = async (e) => {
            cleanup();
            const file = e.target?.files?.[0];
            if (!file) return;
            try {
                await dataImport.loadDataFile(file);
            } catch {
                // 内部已提示
            }
        };

        // 用户取消选择：通过 window focus 事件检测
        const onFocus = () => {
            window.removeEventListener('focus', onFocus);
            setTimeout(() => {
                if (!input.files || input.files.length === 0) {
                    cleanup();
                }
            }, 300);
        };
        window.addEventListener('focus', onFocus);

        input.click();
    }

    /**
     * 打开系统目录选择器，选取 3D Tiles 文件夹
     * 使用 File System Access API（showDirectoryPicker）
     */
    async function handleImportTilesetFolder() {
        try {
            await dataImport.importTilesetFromDirectory();
        } catch {
            // 内部已提示
        }
    }

    /**
     * GLTF 坐标弹窗确认回调
     * 同时处理：首次导入坐标确认（pendingGltfFile）和已加载模型位置调整（repositionTarget）
     * @param {{ lng: number, lat: number, height: number }} coords
     */
    async function handleGltfCoordConfirm(coords) {
        if (isComponentUnmounted()) return;
        try {
            if (repositionTargetRef.value) {
                await dataImport.confirmGltfReposition(coords);
            } else {
                await dataImport.loadGltfWithUserCoords(coords);
            }
        } catch {
            // 内部已通过 message.error 提示用户
        }
    }

    /** GLTF 坐标弹窗取消回调 */
    function handleGltfCoordCancel() {
        if (repositionTargetRef.value) {
            dataImport.cancelGltfReposition();
        } else {
            dataImport.cancelPendingGltf();
        }
    }

    return {
        handleDataImport,
        handleDataRemove,
        handleDataFlyTo,
        handleDataClearAll,
        handleDataReposition,
        handleDataStretchHeight,
        handleDataSetHeight,
        handleImportTilesetSample,
        handleDataSetMaterial,
        handleImportTilesetZip,
        handleImportTilesetFolder,
        handleGltfCoordConfirm,
        handleGltfCoordCancel,
    };
}
