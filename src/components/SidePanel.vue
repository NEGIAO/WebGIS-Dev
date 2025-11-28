<template>
    <div class="info-container">
        <div class="top">
            <img :src="`${normalizedBase}images/院徽.png`" class="logo" alt="Logo">
            <div class="title-container">
                <a href="https://cep.henu.edu.cn/zhxw/xyxw.htm" class="main-title">地科院新闻</a>
            </div>
        </div>

        <div class="header">
            <a :href="currentNewsHref" target="_blank">{{ currentNewsTitle }}</a>
        </div>

        <img :src="currentNewsImage" class="news-image" alt="News Image">

        <div class="text-content" v-html="currentDisplayText"></div>

        <button class="action-button" @click="changeNews">
            点击，新闻++
        </button>

        <slot name="extra-content"></slot>

        <div class="footer">
            <a href="https://cep.henu.edu.cn/zhxw/xyxw.htm" target="_blank">河南大学地理科学学院！</a>
        </div>
    </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue';

const props = defineProps({
    locationInfo: {
        type: Object,
        default: () => ({ isInDihuan: false, lonLat: [0, 0] })
    },
    selectedImage: {
        type: String,
        default: ''
    }
});

const emit = defineEmits(['news-changed']);

const currentNewsIndex = ref(0);
const baseUrl = import.meta.env.BASE_URL || '/';
const normalizedBase = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;

const newsData = {
    titles: [
        "4.22地球日，地环院开展系列活动",
        "地理科学与工程学部首届大会召开",
        "2023级本科生年级大会召开",
    ],
    texts: [
        "春风拂绿野，万物竞芳华。在第56个世界地球日来临之际，4月21日上午，由河南大学相关单位主办，在金明校区马可广场举行。学校相关职能部门领导，地理科学与工程学部委员，地理科学学院全体班子成员和师生代表，河南省环保联合会工作人员，河南大学附属小学（金明校区）部分师生参加活动。开幕式由学院党委副书记徐小军主持......",
        "2025年2月23日，河南大学地理科学与工程学部首届大会在河南大学金明校区锥形报告厅顺利召开。中国工程院院士、空间基准全国重点实验室学术带头人王家耀等职能部门有关领导，地理科学与工程学部委员，地理科学学院负责人，以及地理科学与工程学部全体教师和部分学生代表参会。开幕式由傅声雷主持......",
        "为助力我院2023级本科生厘清学术培养路径，系统提升科研素养与安全防范能力，树立科学的学术发展与职业规划意识，5月29日下午，我院于金明校区综合教学楼2306教室召开2023级本科生年级大会。学院2023级全体本科生积极参加，会议由2023级辅导员屈利铭主持......",
    ],
    images: [
        `${normalizedBase}images/地球日活动.jpg`,
        `${normalizedBase}images/学部大会.png`,
        `${normalizedBase}images/年级大会.jpg`,
    ],
    hrefs: [
        "https://cep.henu.edu.cn/info/1022/13421.htm",
        "https://cep.henu.edu.cn/info/1022/12491.htm",
        "https://cep.henu.edu.cn/info/1022/14001.htm",
    ]
};

const defaultText = "请将鼠标移动到地科院区域<br>查看新闻内容<br><br>在左侧地图中放大<br>可以查看地科院的照片！<br><br>下方还有内容哦！<br>请鼠标下滑";

const currentNewsTitle = computed(() => {
    if (props.locationInfo.isInDihuan) {
        return newsData.titles[currentNewsIndex.value];
    }
    return "地科院新闻"; // Default title when not in area
});

const currentNewsHref = computed(() => {
    if (props.locationInfo.isInDihuan) {
        return newsData.hrefs[currentNewsIndex.value];
    }
    return "https://cep.henu.edu.cn/zhxw/xyxw.htm";
});

const currentNewsImage = computed(() => {
    return props.selectedImage || newsData.images[currentNewsIndex.value];
});

const currentDisplayText = computed(() => {
    if (props.locationInfo.isInDihuan) {
        return newsData.texts[currentNewsIndex.value];
    } else {
        return defaultText;
    }
});

function changeNews() {
    currentNewsIndex.value = (currentNewsIndex.value + 1) % newsData.titles.length;
    emit('news-changed', currentNewsIndex.value);
}
</script>

<style scoped>
.info-container {
    display: flex;
    flex-direction: column;
    height: 100%;
    padding: 20px;
    box-sizing: border-box;
    overflow-y: auto;
    background: #fff;
}

.top {
    display: flex;
    align-items: center;
    margin-bottom: 15px;
}

.logo {
    width: 60px;
    height: 60px;
    object-fit: contain;
    margin-right: 15px;
}

.title-container {
    flex: 1;
}

.main-title {
    font-family: 'Courier New', Courier, monospace;
    font-size: 24px;
    color: #1f5eac;
    text-decoration: none;
    font-weight: bold;
}

.header {
    font-size: 18px;
    margin: 10px 0;
    font-weight: bold;
    min-height: 24px;
}

.header a {
    color: #2746ae;
    text-decoration: none;
}

.header a:hover {
    text-decoration: underline;
}

.news-image {
    width: 100%;
    height: auto;
    max-height: 250px;
    object-fit: cover;
    border-radius: 8px;
    margin: 10px 0;
    box-shadow: 0 2px 5px rgba(0,0,0,0.1);
}

.text-content {
    font-size: 14px;
    color: #333;
    line-height: 1.6;
    margin: 10px 0;
    flex: 1; /* Allow text to take available space */
}

.action-button {
    background-color: #4CAF50;
    border: none;
    color: white;
    padding: 12px;
    text-align: center;
    text-decoration: none;
    display: block;
    width: 100%;
    font-size: 16px;
    margin: 15px 0;
    cursor: pointer;
    border-radius: 5px;
    transition: background-color 0.3s;
}

.action-button:hover {
    background-color: #45a049;
}

.footer {
    margin-top: auto;
    text-align: center;
    padding-top: 15px;
    border-top: 1px solid #eee;
    font-size: 12px;
    color: #999;
}

.footer a {
    color: #1c8ae4;
}

/* Mobile adjustments */
@media (max-width: 768px) {
    .info-container {
        padding: 15px;
    }

    .main-title {
        font-size: 20px;
    }

    .logo {
        width: 50px;
        height: 50px;
        margin-right: 10px;
    }
}
</style>
