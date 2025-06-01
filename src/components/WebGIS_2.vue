<template>
    <div class="content-row"> 
        <div class="map-container">
            <div id="map"></div>
            <!-- 图片集合容器 -->
            <div class="imageset" id="dihuan_imageset"></div>
            <!-- 大图片展示 -->
            <img id="large-image" src="" alt="Large Image">

            <!-- 图层选择器 -->
            <div id="layer-switcher">
                <select id="layer-select">
                    <option value="local">本地瓦片</option>
                    <option value="tianDiTu_vec">天地图矢量</option>
                    <option value="tianDiTu">天地图影像</option>
                    <option value="google">Google</option>
                    <option value="esri">ESRI</option>
                    <option value="osm">OSM</option>
                    <option value="amap">高德地图</option>
                    <option value="tengxun">腾讯地图</option>
                </select>
            </div>
            <!-- 坐标信息显示 -->
            <div id="mouse-position"></div>
        </div>
        <!--
        =====================================================================================================
        右侧信息容器，以模板形式呈现，便于后续在js中动态更新内容
        ======================================================================================================
        -->
        <div class="info-container">
            <div class="top">
                <img src='/images/院徽.png' class="logo" alt="Image">
                <div id="Title">
                    <a href="https://cep.henu.edu.cn/zhxw/xyxw.htm" id="title">地科院新闻 </a>
                </div>
            </div>
            <div id="header" class="header">
                <a href="https://cep.henu.edu.cn/info/1022/14001.htm">新闻一</a>
            </div>
            <img src=""  id ="News" class="News" alt="">
            <div id="text" class="text">
                请将移动到地图中
            </div>
            <button id="button" class="button" @click="changeNews">
                点击，新闻++
            </button>
            <div id="footer" class="footer">
                <a href="https://cep.henu.edu.cn/zhxw/xyxw.htm">河南大学地理科学学院！</a>
            </div>
        </div>
    </div>
</template>

<script>
// 导入 OpenLayers 相关模块
import Map from 'ol/Map';
import View from 'ol/View';
import TileLayer from 'ol/layer/Tile';
import XYZ from 'ol/source/XYZ';
import OSM from 'ol/source/OSM';
import { fromLonLat, get, toLonLat } from 'ol/proj';
import MousePosition from 'ol/control/MousePosition';
import { createStringXY } from 'ol/coordinate';
import ScaleLine from 'ol/control/ScaleLine';
import { defaults as defaultControls } from 'ol/control';

export default {
    mounted() {
        // 1. 定义图层源
        const sources = {
            local: new XYZ({
                url: 'http://localhost:5173/tiles/{z}/{x}/{y}.png'
            }),
            osm: new OSM(),  // OpenStreetMap数据源
            amap: new XYZ({ url: 'https://webrd0{1-4}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}', maxZoom: 20 }),  // 高德地图数据源
            google: new XYZ({ url: 'https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}', maxZoom: 20 }),  // 谷歌地图数据源
            esri: new XYZ({ url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', maxZoom: 20 }),  // ESRI地图数据源
            tengxun: new XYZ({ url: 'http://rt0.map.gtimg.com/realtimerender?z={z}&x={x}&y={-y}&type=vector&style=0', maxZoom: 20 }),  // 腾讯地图数据源
            tianDiTu: new XYZ({ url: 'http://t0.tianditu.gov.cn/img_w/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=img&STYLE=default&TILEMATRIXSET=w&FORMAT=tiles&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}&tk=4267820f43926eaf808d61dc07269beb', maxZoom: 20 }),  // 天地图影像图层
            tianDiTu_vec: new XYZ({ url: 'http://t0.tianditu.gov.cn/vec_w/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=vec&STYLE=default&TILEMATRIXSET=w&FORMAT=tiles&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}&tk=4267820f43926eaf808d61dc07269beb', maxZoom: 20 }),  // 天地图矢量图层
            label_tianditu: new XYZ({ url: 'http://t0.tianditu.gov.cn/cia_w/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=cia&STYLE=default&TILEMATRIXSET=w&FORMAT=tiles&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}&tk=4267820f43926eaf808d61dc07269beb', maxZoom: 20 }),  // 天地图注记图层
        };

        // 2. 创建基础图层和标注图层
        const baseLayer = new TileLayer({
            source: sources['local']
        });
        
        const labelLayer = new TileLayer({
            source: null,
            zIndex: 1, // 确保标注图层在基础图层之上
            visible: false
        });

        // 3. 创建地图控件  
        // 经纬度信息和比例尺
        const mousePositionControl = new MousePosition({
            coordinateFormat: createStringXY(4),
            projection: 'EPSG:4326',  // 使用WGS84经纬度
            target: document.getElementById('mouse-position'),
            undefinedHTML: '&nbsp;'
        });

        const scaleLineControl = new ScaleLine({
            units: 'metric',  // 使用公制单位
            bar: true,
            steps: 4,
            minWidth: 140
        });

        // 4. 初始化地图
        const map = new Map({
            target: 'map',
            layers: [baseLayer, labelLayer], // 添加基础图层和标注图层
            view: new View({
                center: fromLonLat([114.302, 34.8146]),
                zoom: 17
            }),
            controls: defaultControls().extend([
                mousePositionControl,
                scaleLineControl
            ])
        });

        // 5. 获取DOM元素
        const layerSelect = document.getElementById('layer-select');
        const dihuan_imageset = document.getElementById('dihuan_imageset');
        const largeImage = document.getElementById('large-image');
        const mapContainer = document.getElementById('map');
        let currentMousePosition = { x: 0, y: 0 };

        // 6. 设置图片集合
        const images = [
            'images/地理与环境学院标志牌.jpg',
            'images/地理与环境学院入口.jpg',
            'images/地学楼.jpg',
            'images/教育部重点实验室.jpg',
            'images/四楼逃生图.jpg',
            'images/学院楼单侧.jpg',
        ];

        // 7. 渲染图片缩略图
        dihuan_imageset.innerHTML = '';
        images.forEach(function (imageSrc, index) {
            const img = document.createElement('img');
            img.src = imageSrc;
            img.style.marginRight = '5px';
            img.style.maxWidth = '100px';
            img.style.maxHeight = '100px';

            if (index === images.length - 1) {
                img.style.marginRight = '0';
            }

            img.addEventListener('click', function (event) {
                largeImage.src = this.src;
                largeImage.style.display = 'block';
                largeImage.style.left = event.clientX + 'px';
                largeImage.style.top = event.clientY + 'px';
            });

            dihuan_imageset.appendChild(img);
        });

        // 8. 图层切换功能
        layerSelect.addEventListener('change', function() {
            const selectedValue = this.value;
            
            // 重置标注图层
            labelLayer.setVisible(false);
            labelLayer.setSource(null);
            
            // 根据选择的图层进行特殊处理
            switch(selectedValue) {
                case 'tianDiTu_vec':
                case 'tianDiTu':
                case 'google':
                case 'esri':
                    baseLayer.setSource(sources[selectedValue]);
                    labelLayer.setSource(sources['label_tianditu']);
                    labelLayer.setVisible(true);
                    break;
                default:
                    baseLayer.setSource(sources[selectedValue]);
                    break;
            }
        });

        // 9. 地图交互处理函数
        function startListening() {
            const zoom = map.getView().getZoom();
            if (zoom >= 18) {
                dihuan_imageset.style.display = 'block';
                dihuan_imageset.style.left = currentMousePosition.x + 'px';
                dihuan_imageset.style.top = currentMousePosition.y + 'px';
            } else {
                dihuan_imageset.style.display = 'none';
                largeImage.style.display = 'none';
            }
        }

        // 10. 注册地图事件
        // 地图缩放事件
        map.getView().on('change:resolution', startListening);
        
        // 地图点击事件
        mapContainer.addEventListener('click', function () {
            largeImage.style.display = 'none';
            dihuan_imageset.style.display = 'none';
        });
        
        // 鼠标移动事件
        mapContainer.addEventListener('mousemove', function (e) {
            currentMousePosition.x = e.clientX;
            currentMousePosition.y = e.clientY;
        });
        
        // 11. 监听地图鼠标移动，判断是否在指定范围内
        map.on('pointermove', function(evt) {
            // 获取鼠标当前位置的经纬度坐标
            const coordinate = evt.coordinate;
            const lonLat = toLonLat(coordinate);
            
            // 获取文本元素
            const textElement = document.getElementById('text');
            if (!textElement) return;
            
            // 定义地环院的经纬度范围
            const dihuanBounds = {
                minLon: 114.3020,
                maxLon: 114.3030,
                minLat: 34.8149,
                maxLat: 34.8154,
            };
            
            // 判断是否在范围内
            const isInDihuan = 
                lonLat[0] >= dihuanBounds.minLon && 
                lonLat[0] <= dihuanBounds.maxLon &&
                lonLat[1] >= dihuanBounds.minLat && 
                lonLat[1] <= dihuanBounds.maxLat;
            
            // 根据判断结果更新文本内容
            if (isInDihuan) {
                document.getElementById('header').innerHTML = "地环院新闻";
                document.getElementById('text').innerHTML = "请点击图片查看大图<br>或点击按钮查看下一条新闻<h2>4.22地球日</h2><h2>首届大会召开</h2><h2>23级年级大会召开</h2>";
            }
             else {
                document.getElementById('header').innerHTML = "";
                document.getElementById('text').innerHTML = "请将鼠标移动到地环院区域<br>放大可以查看图片<br>点击下方按钮查看新闻内容";
                document.getElementById('News').src = "";
            }
        });

        // 初始化地图状态
        startListening();
    },
    data() {
        return {
            //三个数组存储新闻信息和图片的url地址，初始化数组索引为0
            currentNewsIndex: 0,
            news_title: [
                "4.22地球日，地环院开展系列活动",
                "地理科学与工程学部首届大会召开",
                "2023级本科生年纪大会召开",
            ],
            news_text: [
                "春风拂绿野，万物竞芳华。在第56个世界地球日来临之际，4月21日上午，由河南大学相关单位主办，在金明校区马可广场举行。学校相关职能部门领导，地理科学与工程学部委员，地理科学学院全体班子成员和师生代表，河南省环保联合会工作人员，河南大学附属小学（金明校区）部分师生参加活动。开幕式由学院党委副书记徐小军主持......",
                 "2025年2月23日，河南大学地理科学与工程学部首届大会在河南大学金明校区锥形报告厅顺利召开。中国工程院院士、空间基准全国重点实验室学术带头人王家耀等职能部门有关领导，地理科学与工程学部委员，地理科学学院负责人，以及地理科学与工程学部全体教师和部分学生代表参会。开幕式由傅声雷主持......",
                "为助力我院2023级本科生厘清学术培养路径，系统提升科研素养与安全防范能力，树立科学的学术发展与职业规划意识，5月29日下午，我院于金明校区综合教学楼2306教室召开2023级本科生年级大会。学院2023级全体本科生积极参加，会议由2023级辅导员屈利铭主持......",
            ],
            news_image: [
                "images/地球日活动.jpg",
                "/images/学部大会.png",
                "images/年级大会.jpg",
            ],
            new_title_href: [
                "https://cep.henu.edu.cn/info/1022/13421.htm",
                "https://cep.henu.edu.cn/info/1022/12491.htm",
                "https://cep.henu.edu.cn/info/1022/14001.htm",
            ],   
        };
    },
    methods: {
        changeNews(){
            this.currentNewsIndex = (this.currentNewsIndex + 1) % this.news_title.length;//数组元素索引
            const nextHref = this.new_title_href[this.currentNewsIndex];//图片元素索引

            // 更新标题链接
            document.getElementById('header').innerHTML = `<a href="${nextHref}">${this.news_title[this.currentNewsIndex]}</a>`;
            
            // 更新文本内容
            document.getElementById('text').textContent = this.news_text[this.currentNewsIndex];
            
            // 更新图片
            document.getElementById('News').src = this.news_image[this.currentNewsIndex];
        }
    }
}
</script>

<style>
#map {
    width: 100%;
    height: 100%;
}
/*
图片集合样式
*/
.imageset {
    position: absolute;
    display: none;
    background-color: white;
    border: 1px solid #ccc;
    padding: 5px;
    width: 325px;
    height: 40px;
    z-index: 1000;
}
#large-image {
    position: absolute;
    display: none;
    width: 600px;
    height: 400px;
    border: 1px solid #ccc;
    z-index: 1001;
}
/* 图层切换器样式 */
#layer-switcher {
    position: absolute;
    top: 10px;
    right: 10px;
    background: white;
    padding: 5px;
    border-radius: 4px;
    box-shadow: 0 1px 4px rgba(0,0,0,0.2);
    z-index: 1000;
}
/*
url选择器样式
*/
#layer-select {
    padding: 5px;
    border: 2px solid #2cab54;
    border-radius: 3px;
    font-size: 14px;
    width: 150px;
}
/* 
经纬度样式
*/
#mouse-position {
    position: absolute;
    bottom: 5px;
    right: 5px;
    background: linear-gradient(to right, rgba(10, 121, 51, 0.9), rgba(8, 96, 41, 0.9)); /* 渐变背景 */
    color: white;
    padding: 8px 15px;
    border-radius: 6px;
    font-size: 18px;
    font-weight: bold;
    letter-spacing: 0.5px; /* 字母间距 */
    box-shadow: 0 3px 8px rgba(0,0,0,0.3);
    z-index: 1000;
    border: 1px solid rgba(255,255,255,0.2); /* 添加微妙的白色边框 */
    min-width: 150px;
    min-height: 15px;
    text-align: center;
}
/* ========================================================================================
    这是右侧文本新闻
*/
.top{
    display:flex;
    align-items: center;
    margin-bottom: 1px;
}
.logo {
    width: 80px;
    height: 80px;
    object-fit: contain;
    margin-bottom: 20px;
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
    font-size: 32px;
    color: #1f5eac;
}

#title {
    text-decoration: none;
    color: #1f5eac;
}
#text {
    font-size: 20px;
    color: #000000;
}
.header {
    font-size: 22px;
    color: #333333;
    margin-top: 10px;
    font-weight: bold;
}
.text {
    font-size: 16px;
    color: #666666;
    margin-top: 5px;
    line-height: 1.5;
}
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
.footer {
    position: absolute;

    color: rgb(34, 159, 231);
    font-size: 14px;
    bottom: 10px;
}
.footer a {
    color: rgb(28, 138, 228);
    text-decoration: underline;
}
</style>
