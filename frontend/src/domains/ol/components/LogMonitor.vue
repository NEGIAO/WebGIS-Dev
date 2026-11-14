<template>
    <div class="webgis-log-panel">
        <div class="panel-header">
            <div class="status-info">
                <Terminal
                    :size="14"
                    class="header-icon"
                />
                <div
                    v-if="displaySourceLabel === 'REMOTE'"
                    class="log-type-switcher"
                >
                    <button
                        :class="['type-btn', { active: currentType === 'run' }]"
                        @click="switchType('run')"
                    >
                        RUN
                    </button>
                    <button
                        :class="['type-btn', { active: currentType === 'build' }]"
                        @click="switchType('build')"
                    >
                        BUILD
                    </button>
                </div>
                <span class="title">TERMINAL</span>
                <div class="divider"></div>

                <div
                    class="lock-scroll-option"
                    @click="isLocked = !isLocked"
                >
                    <div :class="['custom-checkbox', { checked: isLocked }]">
                        <div
                            v-if="isLocked"
                            class="inner-check"
                        ></div>
                    </div>
                    <span class="lock-text">Lock scroll</span>
                </div>

                <div class="divider"></div>
                <span
                    :class="[
                        'status-dot',
                        { active: isConnected, pending: streamDesired && !isConnected },
                    ]"
                ></span>
                <span class="env-hint">{{ displaySourceLabel }}</span>
                <div class="color-legend-wrap">
                    <CircleHelp :size="13" class="legend-icon" />
                    <div class="color-legend">
                        <div class="legend-title">日志颜色说明</div>
                        <div class="legend-item"><span class="dot" style="background:#f87171"></span>ERROR / FAILED / 5xx 服务端错误</div>
                        <div class="legend-item"><span class="dot" style="background:#fbbf24"></span>WARN / 4xx 客户端错误</div>
                        <div class="legend-item"><span class="dot" style="background:#109942"></span>INFO 普通信息</div>
                        <div class="legend-item"><span class="dot" style="background:#4ade80"></span>SUCCESS / 2xx 成功</div>
                        <div class="legend-item"><span class="dot" style="background:#818cf8"></span>[BUILD] 构建流程</div>
                        <div class="legend-item"><span class="dot" style="background:#1ab142"></span>[RUN] 运行流程</div>
                    </div>
                </div>
            </div>
            <div class="header-actions">
                <button
                    type="button"
                    class="action-btn secondary"
                    :disabled="logEntries.length === 0"
                    @click="copyAllLogs"
                >
                    <component
                        :is="isCopiedAll ? Check : Copy"
                        :size="14"
                    />
                    <span class="btn-label">{{ isCopiedAll ? '已复制' : '复制全部' }}</span>
                </button>

                <button
                    type="button"
                    class="action-btn secondary"
                    :disabled="logEntries.length === 0"
                    @click="clearLogs"
                >
                    <Trash2 :size="14" />
                    清空
                </button>

                <button
                    type="button"
                    :class="['action-btn', streamDesired ? 'danger' : 'success']"
                    @click="toggleConnection"
                >
                    <component
                        :is="streamDesired ? Square : Play"
                        :size="14"
                    />
                    {{ streamDesired ? '停止' : '开启' }}
                </button>
            </div>
        </div>

        <div
            ref="scrollContainer"
            class="log-viewport"
        >
            <!-- key 用稳定自增 id：头部裁剪后 index 整体前移，index key 会导致全列表重 patch -->
            <div
                v-for="(log, index) in logEntries"
                :key="log.id"
                class="log-line"
                title="双击复制此行内容"
                @dblclick="copySingleLine(log.message)"
            >
                <span class="line-number">{{ index + 1 }}</span>
                <span class="timestamp">{{ log.time }}</span>
                <!-- 优化：改为直接从对象读取预计算好的类名 -->
                <span :class="['content', log.className]">{{ log.message }}</span>
            </div>
            <div
                v-if="logEntries.length === 0"
                class="empty-tip"
            >
                Waiting for logs...<span class="scan-line"></span>
            </div>
        </div>
    </div>
</template>

<script lang="ts" src="./LogMonitor.ts"></script>
<style scoped lang="scss" src="./styles/LogMonitor.scss"></style>
