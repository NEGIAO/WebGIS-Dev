<template>
    <div class="top-bar">
        <h1>
            <a href="https://GIs.com">
                <img src="/images/icon.png" alt="Icon" style="width: 8vb; height: 7vh; vertical-align: middle;">
                ---The science of where!
            </a>
            <!-- 图片组合文字，作为标题 -->
        </h1>
    </div>
</template>


<script>

</script>


<style scoped>
.top-bar {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 9vh;
    background: linear-gradient(90deg, #4ac54e, #2E7D32); /* 渐变背景 */
    color: white;
    display: flex;
    align-items: center;
    justify-content: center; /* 改为 center */
    padding: 0 20px;
    box-shadow: 0 2px 5px rgba(0, 0, 0, 0.2); /* 添加阴影 */
}
.top-bar h1 {
    margin: 0;
    font-size: 6vb;
    font-weight: bold;
    font-family: 'Times New Roman', Times, serif;
    text-shadow: 1px 1px 2px rgba(0, 0, 0, 0.3); /* 添加文字阴影 */
}
.top-bar a {
    color: white;
    text-decoration: none; /* 去掉链接下划线 */
}
.top-bar a:hover {
    text-decoration: underline; /* 添加悬停效果 */
}
</style>