<template>
    <div class="info-panel" :class="{ 'collapsed': isCollapsed, 'in-dihuan': props.locationInfo.isInDihuan }">
        <!-- 折叠开关 -->
        <div class="toggle-handle" @click="$emit('toggle-panel')" :title="isCollapsed ? '展开面板' : '收起面板'">
            <span class="handle-icon">{{ isCollapsed ? '◀' : '▶' }}</span>
        </div>

        <!-- 面板内容区域 -->
        <div class="panel-content" v-show="!isCollapsed" :class="{ 'no-padding': activeTab === 'chat' }">
            
            <!-- 模式 1: AI 聊天 -->
            <ChatPanelContent v-if="activeTab === 'chat'" @close-chat="$emit('close-chat')" />

            <!-- 模式 2: 新闻展示 (默认) -->
            <div v-else class="info-content">
                <!-- 顶部 Logo 栏 -->
                <div class="panel-header">
                    <img :src="resolvePath('images/院徽.png')" class="logo" alt="河南大学地理科学学院Logo">
                    <div class="title-wrapper">
                        <a :href="LINKS.MAIN_NEWS" target="_blank" class="main-title">地科院新闻</a>
                    </div>
                </div>

                <!-- 新闻标题 -->
                <div class="news-header">
                    <a :href="displayData.href" :target="displayData.isExternal ? '_blank' : '_self'">
                        {{ displayData.title }}
                    </a>
                </div>

                <!-- 图片展示区 -->
                <div class="image-container">
                    <img :src="displayData.image" class="news-image" :alt="displayData.title">
                </div>

                <!-- 文本内容 -->
                <div class="text-content" v-html="displayData.text"></div>

                <!-- 交互按钮 -->
                <button class="action-button" @click="nextNews" title="切换下一条新闻">
                    点击，新闻++
                </button>

                <!-- 插槽：允许父组件插入额外内容 -->
                <slot name="extra-content"></slot>

                <!-- 底部链接 -->
                <div class="panel-footer">
                    <a :href="LINKS.MAIN_NEWS" target="_blank">河南大学地理科学学院！</a>
                </div>
            </div>
        </div>
    </div>
</template>

<script setup>
/**
 * SidePanel.vue - 可折叠侧边栏组件
 * 
 * 功能：
 * - 新闻展示模式 (info)
 * - AI 聊天模式 (chat)
 * - 支持折叠/展开
 * - 移动端自适应
 */
import { ref, computed } from 'vue';
import ChatPanelContent from './ChatPanelContent.vue';

// ========== 1. 常量定义 ==========
const LINKS = {
    MAIN_NEWS: "https://cep.henu.edu.cn/zhxw/xyxw.htm"
};

// ========== 2. Props & Emits ==========
const props = defineProps({
    locationInfo: {
        type: Object,
        default: () => ({ isInDihuan: false, lonLat: [0, 0] })
    },
    selectedImage: {
        type: String,
        default: ''
    },
    activeTab: {
        type: String,
        default: 'info' // 'info' or 'chat'
    }
});

const emit = defineEmits(['news-changed', 'toggle-panel', 'close-chat']);

// ========== 3. 工具函数 ==========
const baseUrl = import.meta.env.BASE_URL || '/';
const resolvePath = (path) => {
    const base = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
    return `${base}${path}`;
};

// ========== 4. 新闻数据源 ==========
const NEWS_LIST = [
    {
        title: "4.22地球日，地环院开展系列活动",
        text: "春风拂绿野，万物竞芳华。在第56个世界地球日来临之际，4月21日上午，由河南大学相关单位主办，在金明校区马可广场举行。学校相关职能部门领导，地理科学与工程学部委员，地理科学学院全体班子成员和师生代表...",
        image: "images/地球日活动.jpg",
        href: "https://cep.henu.edu.cn/info/1022/13421.htm"
    },
    {
        title: "地理科学与工程学部首届大会召开",
        text: "2025年2月23日，河南大学地理科学与工程学部首届大会在河南大学金明校区锥形报告厅顺利召开。中国工程院院士、空间基准全国重点实验室学术带头人王家耀等职能部门有关领导...",
        image: "images/学部大会.png",
        href: "https://cep.henu.edu.cn/info/1022/12491.htm"
    },
    {
        title: "2023级本科生年级大会召开",
        text: "为助力我院2023级本科生厘清学术培养路径，系统提升科研素养与安全防范能力，树立科学的学术发展与职业规划意识，5月29日下午，我院于金明校区综合教学楼2306教室召开...",
        image: "images/年级大会.jpg",
        href: "https://cep.henu.edu.cn/info/1022/14001.htm"
    },
];

const DEFAULT_STATE = {
    title: "地科院新闻",
    text: "请将鼠标移动到地科院区域<br>查看新闻内容<br><br>在左侧地图中放大<br>可以查看地科院的照片！<br><br>下方还有内容哦！<br>请鼠标下滑",
    image: "images/院徽.png",
    href: LINKS.MAIN_NEWS,
    isExternal: true
};

// ========== 5. 状态管理 ==========
const currentNewsIndex = ref(0);

// ========== 6. 计算属性 ==========
/**
 * 核心逻辑：统一决定当前应该显示什么数据
 * - 如果不在指定区域，显示默认提示
 * - 如果在区域内，显示当前新闻
 */
const displayData = computed(() => {
    if (!props.locationInfo.isInDihuan) {
        return {
            ...DEFAULT_STATE,
            image: props.selectedImage || resolvePath(NEWS_LIST[currentNewsIndex.value].image)
        };
    }

    const currentItem = NEWS_LIST[currentNewsIndex.value];
    return {
        title: currentItem.title,
        text: currentItem.text,
        image: props.selectedImage || resolvePath(currentItem.image),
        href: currentItem.href,
        isExternal: true
    };
});

// ========== 7. 事件处理 ==========
/** 切换到下一条新闻 */
function nextNews() {
    currentNewsIndex.value = (currentNewsIndex.value + 1) % NEWS_LIST.length;
    emit('news-changed', currentNewsIndex.value);
}
</script>

<style scoped>
/* 布局容器 */
.info-panel {
    display: flex;
    flex-direction: row;
    height: 100%;
    background: #fff;
    overflow: hidden;
    box-shadow: 2px 0 8px rgba(0, 0, 0, 0.1);
    transition: width 0.3s ease;
}

/* 折叠手柄 */
.toggle-handle {
    width: 24px;
    height: 60px;
    align-self: center;
    background: #14c259;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    border-radius: 12px 0 0 12px;
    transition: all 0.2s ease;
    z-index: 10;
}

.toggle-handle:hover {
    background: #10a049;
    width: 28px;
}

.handle-icon {
    font-size: 12px;
    color: #fff;
    font-weight: bold;
}

/* 内容区域 */
.panel-content {
    flex: 1;
    /* padding: 20px;  Removed: Moved to .info-content */
    /* overflow-y: auto; Removed: Moved to .info-content */
    display: flex;
    flex-direction: column;
    min-width: 300px;
    height: 100%;
    overflow: hidden;
}

.panel-content.no-padding {
    padding: 0;
}

.info-content {
    flex: 1;
    padding: 20px;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
}

/* 头部 */
.panel-header {
    display: flex;
    align-items: center;
    margin-bottom: 15px;
    border-bottom: 2px solid #f0f0f0;
    padding-bottom: 10px;
}

.logo {
    width: 50px;
    height: 50px;
    object-fit: contain;
    margin-right: 15px;
}

.main-title {
    font-family: 'Courier New', Courier, monospace;
    font-size: 25px;
    color: #1f5eac;
    text-decoration: none;
    font-weight: 700;
}

/* 新闻标题 */
.news-header {
    font-size: 18px;
    margin: 10px 0;
    font-weight: bold;
    line-height: 1.4;
    min-height: 50px;
    /* 保持高度稳定，防止跳动 */
}

.news-header a {
    color: #2746ae;
    text-decoration: none;
    transition: color 0.2s;
}

.news-header a:hover {
    color: #1a2f75;
    text-decoration: underline;
}

/* 图片 */
.image-container {
    width: 100%;
    border-radius: 8px;
    /* 不裁剪图片，改为居中显示完整图片 */
    overflow: visible;
    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
    margin-bottom: 15px;
    display: flex;
    align-items: center;
    justify-content: center;
}

.news-image {
    width: 100%;
    height: auto;
    /* 始终完整显示（不裁剪） */
    object-fit: contain;
    display: block;
    transition: transform 0.25s ease, max-height 0.25s ease;
    max-height: 60vh;
}

.news-image:hover {
    transform: scale(1.01);
}

/* 文本 */
.text-content {
    font-size: 14px;
    color: #444;
    line-height: 1.6;
    margin-bottom: 15px;
    flex-grow: 1;
}

/* 按钮 */
.action-button {
    background-color: #4CAF50;
    color: white;
    border: none;
    padding: 12px;
    font-size: 16px;
    cursor: pointer;
    border-radius: 6px;
    transition: background-color 0.2s, transform 0.1s;
    box-shadow: 0 2px 4px rgba(76, 175, 80, 0.3);
}

.action-button:hover {
    background-color: #43a047;
}

.action-button:active {
    transform: translateY(1px);
}

/* 底部 */
.panel-footer {
    margin-top: auto;
    text-align: center;
    padding-top: 15px;
    border-top: 1px solid #eee;
    font-size: 12px;
}

.panel-footer a {
    color: #999;
    text-decoration: none;
    transition: color 0.2s;
}

.panel-footer a:hover {
    color: #1c8ae4;
}

/* 移动端适配 */
@media (max-width: 768px) {
    .info-panel {
        flex-direction: column;
        /* 垂直排列 */
        width: 100% !important;
        transition: transform 0.3s ease;
        /* 改为 transform 动画更流畅 */
        /* 关键修复：移动端允许内容溢出，防止按钮被切掉 */
        overflow: visible;
    }

    /* 收起状态下的特殊处理 */
    .info-panel.collapsed {
        /* 这里假设你的面板是在底部，收起时往下移，只保留按钮高度 */
        /* 如果你的面板是根据高度变化的，请保留 height: auto */
        height: auto;
    }

    .toggle-handle {
        width: 80px;
        /* 加宽一点，方便手指点击 */
        height: 30px;
        /*稍微增高 */
        align-self: center;
        /* 水平居中 */
        border-radius: 15px 15px 0 0;
        /* 上圆角 */

        /* 关键修复：去掉之前的 margin-top: -24px */
        margin-top: 0;
        margin-bottom: 0;

        /* 确保按钮在 flex 布局的最上方 */
        order: -1;
    }

    .handle-icon {
        /* 旋转箭头方向，使其指向合适的方向 */
        transform: rotate(90deg);
        font-size: 14px;
    }

    .panel-content {
        min-width: unset;
        /* padding: 15px; Removed */
        max-height: 60vh;
        /* overflow-y: auto; Removed */
    }

    .info-content {
        padding: 15px;
        overflow-y: auto;
    }
}
</style>