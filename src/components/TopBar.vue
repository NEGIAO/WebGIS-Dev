<template>
    <div class="top-bar">
        <h1>
            <a href="#">
                <img :src="`${normalizedBase}images/icon.png`" alt="Icon" class="logo-icon">
                <span class="title-text">The science of where!</span>
            </a>
        </h1>
    </div>
</template>

<script setup>
const baseUrl = import.meta.env.BASE_URL || '/';
const normalizedBase = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
</script>

<style scoped>
.top-bar {
    width: 100%;
    height: 100%;
    background: linear-gradient(90deg, #4ac54e, #2E7D32);
    color: white;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0 20px;
    box-sizing: border-box;
}

.top-bar h1 {
    margin: 0;
    display: flex;
    align-items: center;
    font-family: 'Times New Roman', Times, serif;
    text-shadow: 1px 1px 2px rgba(0, 0, 0, 0.3);
}

.top-bar a {
    color: white;
    text-decoration: none;
    display: flex;
    align-items: center;
    gap: 10px;
}

.logo-icon {
    height: 40px;
    width: auto;
}

.title-text {
    font-size: 24px;
    font-weight: bold;
}

@media (max-width: 768px) {
    .title-text {
        font-size: 18px;
    }
    .logo-icon {
        height: 30px;
    }
}
</style>
