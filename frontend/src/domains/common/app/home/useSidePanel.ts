/**
 * 侧边面板控制逻辑
 * 管理侧边面板的展开/收起、Tab切换、各面板的打开方法
 */

import { ref } from 'vue';

/**
 * 创建侧边面板控制功能
 * @param {Object} deps - 依赖注入
 * @param {Object} deps.compassStore - 罗盘 Store
 * @param {Object} deps.message - 消息系统
 */
export function useSidePanel({ compassStore, message }) {
    const isSidePanelCollapsed = ref(true);
    const shouldLoadSidePanel = ref(false);
    const activeSidePanelTab = ref('chat');

    /** 停止罗盘的临时交互 */
    function stopCompassTransientInteractions() {
        compassStore.setPlacementMode(false);
    }

    /** 切换侧边栏展开/收起 */
    function toggleSidePanel() {
        if (isSidePanelCollapsed.value && !shouldLoadSidePanel.value) {
            shouldLoadSidePanel.value = true;
        }
        isSidePanelCollapsed.value = !isSidePanelCollapsed.value;
        if (isSidePanelCollapsed.value) {
            compassStore.setPlacementMode(false);
        }
        message.soup();
    }

    /** 打开 AI 聊天面板 */
    function openChat() {
        stopCompassTransientInteractions();
        activeSidePanelTab.value = 'chat';
        if (!shouldLoadSidePanel.value) {
            shouldLoadSidePanel.value = true;
        }
        isSidePanelCollapsed.value = false;
    }

    /** 打开工具箱面板 */
    function openToolbox() {
        stopCompassTransientInteractions();
        activeSidePanelTab.value = 'toolbox';
        if (!shouldLoadSidePanel.value) {
            shouldLoadSidePanel.value = true;
        }
        isSidePanelCollapsed.value = false;
    }

    /** 打开罗盘面板：仅展示配置面板，不隐式启用绘制，避免自动写入 cs。 */
    async function openCompassPanel() {
        activeSidePanelTab.value = 'compass';
        if (!shouldLoadSidePanel.value) {
            shouldLoadSidePanel.value = true;
        }
        isSidePanelCollapsed.value = false;
        await compassStore.ensureConfigLoaded();
    }

    /** 打开公交规划面板 */
    function openBusPlanner() {
        stopCompassTransientInteractions();
        activeSidePanelTab.value = 'bus';
        if (!shouldLoadSidePanel.value) {
            shouldLoadSidePanel.value = true;
        }
        isSidePanelCollapsed.value = false;
    }

    /** 打开驾车规划面板 */
    function openDrivePlanner() {
        stopCompassTransientInteractions();
        activeSidePanelTab.value = 'drive';
        if (!shouldLoadSidePanel.value) {
            shouldLoadSidePanel.value = true;
        }
        isSidePanelCollapsed.value = false;
    }

    /**
     * 处理侧边面板 Tab 切换
     * @param {string} tab - Tab 名称
     */
    function handleSwitchSidePanelTab(tab) {
        if (tab === 'compass') {
            openCompassPanel();
        } else if (tab === 'chat') {
            openChat();
        } else if (tab === 'toolbox') {
            openToolbox();
        } else if (tab === 'bus') {
            openBusPlanner();
        } else if (tab === 'drive') {
            openDrivePlanner();
        } else {
            activeSidePanelTab.value = tab;
            if (!shouldLoadSidePanel.value) {
                shouldLoadSidePanel.value = true;
            }
            isSidePanelCollapsed.value = false;
        }
    }

    /**
     * 处理控制面板打开 Tab 的请求
     * @param {string} tab - Tab 名称
     */
    function handleControlsOpenTab(tab) {
        if (tab === 'compass') {
            openCompassPanel();
        } else if (tab === 'chat') {
            openChat();
        } else if (tab === 'toolbox') {
            openToolbox();
        } else {
            handleSwitchSidePanelTab(tab);
        }
    }

    /**
     * 处理控制面板打开工具箱 Tab 的请求
     * @param {string} tab - 工具箱内的 Tab
     */
    function handleControlsOpenToolboxTab(_tab) {
        openToolbox();
        // 可以进一步切换工具箱内的 Tab
    }

    return {
        isSidePanelCollapsed,
        shouldLoadSidePanel,
        activeSidePanelTab,
        toggleSidePanel,
        openChat,
        openToolbox,
        openCompassPanel,
        openBusPlanner,
        openDrivePlanner,
        handleSwitchSidePanelTab,
        handleControlsOpenTab,
        handleControlsOpenToolboxTab,
        stopCompassTransientInteractions,
    };
}
