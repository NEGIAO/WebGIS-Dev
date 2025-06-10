<template>
    <div class="info-container">

        <div class="top">
            <img src='/images/院徽.png' class="logo" alt="Image">
            <div id="Title">
                <a href="https://cep.henu.edu.cn/zhxw/xyxw.htm" id="title">地科院新闻</a>
            </div>
        </div><!-- 头部信息 -->

        <div id="header" class="header">
            <!-- 预留空间，动态放置标题 -->
        </div>
        <img :src="currentNewsImage" id="News" class="News" alt="">
            <!-- 预留空间，动态放置新闻图片 -->
        <div id="text" class="text">
            <!-- 预留空间，动态放置新闻内容 -->
        </div>

        <button id="button" class="button" @click="changeNews">
            点击，新闻++
        </button>

        <slot name="extra-content"></slot><!-- 使用插槽，放置父类的内容 -->

        <div  class="footer">
            <a href="https://cep.henu.edu.cn/zhxw/xyxw.htm">河南大学地理科学学院！</a>
        </div>
    </div>
</template>

<script>
export default {
    props: {
        locationInfo: {
            type: Object,
            default: () => ({ isInDihuan: false, lonLat: [0, 0] })
        },
        selectedImage: {
            type: String,
            default: ''
        }
    },//props:接受父组件传来的数据
    data() {
        return {
            currentNewsIndex: 0,
            news_title: [
                "4.22地球日，地环院开展系列活动",
                "地理科学与工程学部首届大会召开",
                "2023级本科生年级大会召开",
            ],
            news_text: [
                "春风拂绿野，万物竞芳华。在第56个世界地球日来临之际，4月21日上午，由河南大学相关单位主办，在金明校区马可广场举行。学校相关职能部门领导，地理科学与工程学部委员，地理科学学院全体班子成员和师生代表，河南省环保联合会工作人员，河南大学附属小学（金明校区）部分师生参加活动。开幕式由学院党委副书记徐小军主持......",
                "2025年2月23日，河南大学地理科学与工程学部首届大会在河南大学金明校区锥形报告厅顺利召开。中国工程院院士、空间基准全国重点实验室学术带头人王家耀等职能部门有关领导，地理科学与工程学部委员，地理科学学院负责人，以及地理科学与工程学部全体教师和部分学生代表参会。开幕式由傅声雷主持......",
                "为助力我院2023级本科生厘清学术培养路径，系统提升科研素养与安全防范能力，树立科学的学术发展与职业规划意识，5月29日下午，我院于金明校区综合教学楼2306教室召开2023级本科生年级大会。学院2023级全体本科生积极参加，会议由2023级辅导员屈利铭主持......",
            ],
            news_image: [
                "/images/地球日活动.jpg",
                "/images/学部大会.png",
                "/images/年级大会.jpg",
            ],
            new_title_href: [
                "https://cep.henu.edu.cn/info/1022/13421.htm",
                "https://cep.henu.edu.cn/info/1022/12491.htm",
                "https://cep.henu.edu.cn/info/1022/14001.htm",
            ],
            defaultText: "请将鼠标移动到地科院区域查看新闻内容",
            dihuanText: "请点击图片查看大图<br>或点击按钮查看下一条新闻<h2>4.22地球日</h2><h2>首届大会召开</h2><h2>23级年级大会召开</h2>"
        };
    },//新闻的标题，内容，图片都用数组来存储，方便动态更新
    computed: {
        // 保持计算属性不变
        currentNewsTitle() {
            return this.news_title[this.currentNewsIndex];
        },
        currentNewsHref() {
            return this.new_title_href[this.currentNewsIndex];
        },
        currentNewsImage() {
            return this.selectedImage || this.news_image[this.currentNewsIndex];
        },
        currentDisplayText() {
            if (this.locationInfo.isInDihuan) {
                return this.news_text[this.currentNewsIndex];
            } else {
                return this.defaultText;
            }
        }
    },
    methods: {
        changeNews() {
            // 更新索引
            this.currentNewsIndex = (this.currentNewsIndex + 1) % this.news_title.length;
            
            // 1. 更新图片
            document.getElementById('News').src = this.news_image[this.currentNewsIndex];
            
            // 2. 更新标题（包括超链接）
            const nextHref = this.new_title_href[this.currentNewsIndex];
            document.getElementById('header').innerHTML = 
                `<a href="${nextHref}">${this.news_title[this.currentNewsIndex]}</a>`;
            
            // 3. 如果当前在地环院范围内，也更新文本内容
            if (this.locationInfo.isInDihuan) {
                document.getElementById('text').innerHTML = this.news_text[this.currentNewsIndex];
            }
            
            //自定义事件，子组件将事件信息传递给父组件，父组件绑定响应函数来处理
            this.$emit('news-changed', this.currentNewsIndex);
        }
    },
    watch: {
        // 监听位置信息变化
        locationInfo: {
            handler(newInfo) {
                if (newInfo.isInDihuan) {
                    // 只在进入地环院范围时才更新文本内容
                    document.getElementById('header').innerHTML = 
                        `<a href="${this.currentNewsHref}">${this.currentNewsTitle}</a>`;
                    document.getElementById('text').innerHTML = this.news_text[this.currentNewsIndex];
                } else {
                    // 离开地环院区域时，清除或显示默认信息
                    document.getElementById('text').innerHTML = this.defaultText;
                }
            },
            deep: true
        },
        // 监听选中的图片变化
        selectedImage(newImage) {
            if (newImage) {
                document.getElementById('News').src = newImage;
            }
        }
    },
    mounted() {
        // 初始化标题（包括超链接）
        const headerElement = document.getElementById('header');
        if (headerElement) {
            headerElement.innerHTML = 
                `<a href="${this.currentNewsHref}">${this.currentNewsTitle}</a>`;
        }
        
        // 初始化图片
        const newsImage = document.getElementById('News');
        if (newsImage && !newsImage.src) {
            newsImage.src = this.news_image[0];
        }
        
        // 初始化文本
        const textElement = document.getElementById('text');
        if (textElement) {
            textElement.innerHTML = this.defaultText;
        }
    }
}
</script>

<style>
.top {
    display: flex;
    align-items: center;
    margin-bottom: 1px;
}

.logo {
    width: 100px;
    height: 100px;
    object-fit: contain;
    margin-bottom: 10px;
}

#Title {
    position: relative;
    top: -10px;
    left: 10px;
    bottom: 0px;
    background-color: rgba(255, 255, 255, 0);
    padding: 1px;
    border-radius: 5px;
    font-family: 'Courier New', Courier, monospace;
    font-size: 35px;
    color: #1f5eac;
}

#title {
    text-decoration: none;
    color: #1f5eac;
}

/* 文本样式 */
.text {
    font-size: 16px;
    color: #666666;
    margin-top: 5px;
    line-height: 1.5;
    min-height: 150px; /* 添加最小高度，避免内容变化导致布局跳动 */
}

#text {
    font-size: 20px;
    color: #000000;
}

/* 标题样式 */
.header {
    font-size: 22px;
    color: #333333;
    margin-top: 10px;
    font-weight: bold;
    min-height: 30px; /* 添加最小高度，避免内容变化导致布局跳动 */
    underline: 1; /* 去掉默认下划线 */
}

.header a {
    color: #2746ae;
}

.header a:hover {
    color: #1f5eac;
    text-decoration: underline;
}

/* 按钮样式 */
.button {
    background-color: #4CAF50; /* 绿色背景 */
    border: none;
    color: white; /* 白色文字 */
    padding: 10px 20px;
    text-align: center;
    text-decoration: none;
    display: inline-block;
    font-size: 16px;
    margin-top: 10px;
    cursor: pointer;
    border-radius: 5px; /* 圆角按钮 */
}

.button:hover {
    background-color: #45a049; /* 悬停时稍微深一点的绿色 */
}

/* 页脚样式 */
.footer {
    position: absolute;
    color: rgb(172, 178, 181);
    font-size: 17px;
    bottom: 10px;
    right: 80px;      /* 靠右 */
    width: auto;      /* 不要设置100%宽度 */
    text-align: center; /* 文字居中对齐 */
}

.footer a {
    color: rgb(28, 138, 228);
    text-decoration: underline;
}

/* 图片样式 */
.News {
    max-width: 100%;
    height: auto;
    margin-top: 10px;
    margin-bottom: 10px;
    border-radius: 5px;
    box-shadow: 0 2px 5px rgba(0,0,0,0.2);
    min-height: 200px; /* 添加最小高度，避免图片加载前布局跳动 */
    object-fit: contain;
}
</style>