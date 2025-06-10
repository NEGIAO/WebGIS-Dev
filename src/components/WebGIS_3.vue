<template>
    <div class="map-container">
        <div id="map"></div>
        
        <div class="imageset" id="dihuan_imageset"></div>
        <!-- 图片集合容器 -->
        <img id="large-image" src="" alt="Large Image">
        <!-- 大图片展示 -->
        
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
        <!-- 图层选择器 -->

        <div id="mouse-position"></div><!-- 坐标信息显示 -->
    </div>
    <!-- 地图组件，实现了展示图片、经纬度信息、比例尺、切换图源、动态显示新闻内容等功能 -->
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
    emits: ['location-change', 'update-news-image'],
    data() {
        return {
            currentMousePosition: { x: 0, y: 0 },
            // 图片集合
            images: [
                'images/地理与环境学院标志牌.jpg',
                'images/地理与环境学院入口.jpg',
                'images/地学楼.jpg',
                'images/教育部重点实验室.jpg',
                'images/四楼逃生图.jpg',
                'images/学院楼单侧.jpg',
            ]
        };
    },
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

        // 5. 获取DOM元素，使用getelementById方法，响应事件，填充图片和图层切换功能
        const layerSelect = document.getElementById('layer-select');
        const dihuan_imageset = document.getElementById('dihuan_imageset');
        const largeImage = document.getElementById('large-image');
        const mapContainer = document.getElementById('map');
        let currentMousePosition = { x: 0, y: 0 };

        // 7. 渲染图片缩略图
        dihuan_imageset.innerHTML = '';
        this.images.forEach((imageSrc, index) => {
            const img = document.createElement('img');
            img.src = imageSrc;
            img.style.marginRight = '5px';
            img.style.maxWidth = '100px';
            img.style.maxHeight = '100px';

            if (index === this.images.length - 1) {
                img.style.marginRight = '0';
            }

            img.addEventListener('click', (event) => {
                largeImage.src = img.src;
                largeImage.style.display = 'block';
                largeImage.style.left = event.clientX + 'px';
                largeImage.style.top = event.clientY + 'px';
                
                // 将图片信息传递给父组件，$emit自定义事件
                this.$emit('update-news-image', img.src);
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
        const startListening = () => {
            const zoom = map.getView().getZoom();
            if (zoom >= 18) {
                dihuan_imageset.style.display = 'block';
                dihuan_imageset.style.left = currentMousePosition.x + 'px';
                dihuan_imageset.style.top = currentMousePosition.y + 'px';
            } else {
                dihuan_imageset.style.display = 'none';
                largeImage.style.display = 'none';
            }
        };

        // 10. 注册地图事件
        // 地图缩放事件
        map.getView().on('change:resolution', startListening);
        
        // 地图点击事件
        mapContainer.addEventListener('click', function () {
            largeImage.style.display = 'none';
            dihuan_imageset.style.display = 'none';
        });
        
        // 鼠标移动事件
        mapContainer.addEventListener('mousemove', (e) => {
            currentMousePosition.x = e.clientX;
            currentMousePosition.y = e.clientY;
        });
        
        // 11. 监听地图鼠标移动，判断是否在指定范围内
        map.on('pointermove', (evt) => {
            // 获取鼠标当前位置的经纬度坐标
            const coordinate = evt.coordinate;
            const lonLat = toLonLat(coordinate);
            
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
            
            // 通过事件向父组件发送位置信息
            this.$emit('location-change', { 
                isInDihuan,
                lonLat
            });
        });

        // 初始化地图状态
        startListening();
    },
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
    width: 315px;
    height: 150px;
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
</style>