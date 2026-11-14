<template>
    <div class="view-content prefs-view">
        <section class="prefs-section" aria-labelledby="preferences-settings-title">
            <div class="section-head">
                <h4 id="preferences-settings-title" class="section-title">
                    {{ t('preferences.settingsTitle') }}
                </h4>
                <span class="section-state" :class="{ dirty: hasPreferenceChanges }">
                    <i
                        class="fas"
                        :class="preferenceSaving || preferenceLoading ? 'fa-spinner fa-spin' : hasPreferenceChanges ? 'fa-circle' : 'fa-check-circle'"
                    ></i>
                    {{ preferenceHint }}
                </span>
            </div>

            <div class="pref-list">
                <label class="pref-row">
                    <span class="pref-copy">
                        <span class="pref-title">
                            <i class="fas fa-map"></i>
                            {{ t('preferences.defaultBasemap') }}
                            <span v-if="isDirty('default_basemap')" class="dirty-dot"></span>
                        </span>
                        <span class="pref-desc">{{ t('preferences.defaultBasemapDesc') }}</span>
                    </span>
                    <select
                        class="pref-select"
                        :value="draftPreferences.default_basemap"
                        :disabled="preferenceSaving || preferenceLoading"
                        @change="handleSelectChange('default_basemap', $event)"
                    >
                        <option value="">{{ t('preferences.followSystem') }}</option>
                        <option
                            v-if="selectedBasemapUnavailable"
                            :value="draftPreferences.default_basemap"
                        >
                            {{ t('preferences.outsideList', { value: draftPreferences.default_basemap }) }}
                        </option>
                        <option
                            v-for="option in basemapOptions"
                            :key="option.value"
                            :value="option.value"
                        >
                            {{ option.label }}
                        </option>
                    </select>
                </label>

                <label class="pref-row">
                    <span class="pref-copy">
                        <span class="pref-title">
                            <i class="fas fa-language"></i>
                            {{ t('preferences.language') }}
                            <span v-if="isDirty('language')" class="dirty-dot"></span>
                        </span>
                        <span class="pref-desc">{{ t('preferences.languageDesc') }}</span>
                    </span>
                    <select
                        class="pref-select"
                        :value="draftPreferences.language"
                        :disabled="preferenceSaving || preferenceLoading"
                        @change="handleSelectChange('language', $event)"
                    >
                        <option
                            v-for="option in LANGUAGE_OPTIONS"
                            :key="option.value"
                            :value="option.value"
                        >
                            {{ t(option.labelKey) }}
                        </option>
                    </select>
                </label>

                <label class="pref-row">
                    <span class="pref-copy">
                        <span class="pref-title">
                            <i class="fas fa-ruler-combined"></i>
                            {{ t('preferences.unitSystem') }}
                            <span v-if="isDirty('unit_system')" class="dirty-dot"></span>
                        </span>
                        <span class="pref-desc">{{ t('preferences.unitSystemDesc') }}</span>
                    </span>
                    <select
                        class="pref-select"
                        :value="draftPreferences.unit_system"
                        :disabled="preferenceSaving || preferenceLoading"
                        @change="handleSelectChange('unit_system', $event)"
                    >
                        <option
                            v-for="option in UNIT_OPTIONS"
                            :key="option.value"
                            :value="option.value"
                        >
                            {{ t(option.labelKey) }}
                        </option>
                    </select>
                </label>

                <label class="pref-row">
                    <span class="pref-copy">
                        <span class="pref-title">
                            <i class="fas fa-robot"></i>
                            {{ t('preferences.agentModel') }}
                            <span v-if="isDirty('preferred_agent_model')" class="dirty-dot"></span>
                        </span>
                        <span class="pref-desc">{{ t('preferences.agentModelDesc') }}</span>
                    </span>
                    <select
                        class="pref-select"
                        :value="draftPreferences.preferred_agent_model"
                        :disabled="preferenceSaving || preferenceLoading"
                        @change="handleSelectChange('preferred_agent_model', $event)"
                    >
                        <option value="">{{ t('preferences.autoDispatch') }}</option>
                        <option
                            v-if="selectedModelUnavailable"
                            :value="draftPreferences.preferred_agent_model"
                        >
                            {{ t('preferences.outsideList', { value: draftPreferences.preferred_agent_model }) }}
                        </option>
                        <option
                            v-for="modelId in modelOptions"
                            :key="modelId"
                            :value="modelId"
                        >
                            {{ modelId }}
                        </option>
                    </select>
                </label>
            </div>

            <div class="action-row">
                <button
                    class="btn-plain"
                    type="button"
                    :disabled="preferenceSaving || preferenceLoading || !hasPreferenceChanges"
                    @click="handleResetPreferences"
                >
                    <i class="fas fa-undo-alt"></i>
                    {{ t('common.restore') }}
                </button>
                <button
                    class="btn-primary"
                    type="button"
                    :disabled="preferenceSaving || preferenceLoading || !hasPreferenceChanges"
                    @click="handleSavePreferences"
                >
                    <i
                        class="fas"
                        :class="preferenceSaving ? 'fa-spinner fa-spin' : 'fa-save'"
                    ></i>
                    {{ preferenceSaving ? t('preferences.saving') : t('preferences.savePrefs') }}
                </button>
            </div>
        </section>

        <section class="prefs-section" aria-labelledby="preferences-theme-title">
            <div class="section-head">
                <h4 id="preferences-theme-title" class="section-title">
                    {{ t('preferences.themeTitle') }}
                </h4>
                <span class="section-state instant">
                    <i class="fas fa-bolt"></i>
                    {{ t('preferences.status.instant') }}
                </span>
            </div>

            <div class="theme-list">
                <button
                    v-for="theme in THEME_OPTIONS"
                    :key="theme.value"
                    type="button"
                    class="theme-btn"
                    :class="{ selected: currentTheme === theme.value }"
                    :aria-pressed="currentTheme === theme.value"
                    @click="handleSetTheme(theme.value)"
                >
                    <span class="theme-preview" :class="theme.previewClass"></span>
                    <span class="theme-label">{{ t(theme.labelKey) }}</span>
                    <i v-if="currentTheme === theme.value" class="fas fa-check"></i>
                </button>
            </div>
        </section>

        <section class="prefs-section" aria-labelledby="preferences-avatar-title">
            <div class="section-head">
                <h4 id="preferences-avatar-title" class="section-title">
                    {{ t('preferences.avatarTitle') }}
                </h4>
                <span
                    class="section-state"
                    :class="{ dirty: avatarChanged || hasThirdPartyAvatar }"
                >
                    <i
                        class="fas"
                        :class="avatarSaving ? 'fa-spinner fa-spin' : (avatarChanged || hasThirdPartyAvatar) ? 'fa-circle' : 'fa-check-circle'"
                    ></i>
                    {{ avatarHint }}
                </span>
            </div>

            <div v-if="hasThirdPartyAvatar" class="third-party-note">
                <img :src="thirdPartyAvatarUrl" :alt="t('preferences.thirdPartyAlt')" />
                <span>{{ t('preferences.thirdPartyNote') }}</span>
            </div>

            <div class="avatar-grid" role="group" :aria-label="t('preferences.avatarGroupLabel')">
                <button
                    v-for="index in AVATAR_COUNT"
                    :key="index - 1"
                    type="button"
                    class="avatar-btn"
                    :class="{
                        selected: selectedAvatarIndex === index - 1,
                        current: !hasThirdPartyAvatar && currentAvatarIndex === index - 1,
                    }"
                    :disabled="avatarSaving"
                    :aria-pressed="selectedAvatarIndex === index - 1"
                    :aria-label="t('preferences.avatarSelectLabel', { index })"
                    @click="handleSelectAvatar(index - 1)"
                >
                    <img :src="getAvatarSrc(index - 1)" :alt="t('preferences.avatarAlt', { index })" />
                </button>
            </div>

            <div class="action-row">
                <button
                    class="btn-plain"
                    type="button"
                    :disabled="avatarSaving || !avatarChanged"
                    @click="handleResetAvatar"
                >
                    <i class="fas fa-undo-alt"></i>
                    {{ t('common.restore') }}
                </button>
                <button
                    class="btn-primary"
                    type="button"
                    :disabled="avatarSaving || !showAvatarSave"
                    @click="handleSaveAvatar"
                >
                    <i
                        class="fas"
                        :class="avatarSaving ? 'fa-spinner fa-spin' : 'fa-save'"
                    ></i>
                    {{ avatarSaving ? t('preferences.saving') : t('preferences.saveAvatar') }}
                </button>
            </div>
        </section>
    </div>
</template>

<script lang="ts" src="./PreferencesTab.ts"></script>

<style scoped>
.prefs-view {
    display: flex;
    flex-direction: column;
    gap: 14px;
}

.prefs-section {
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.section-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
}

.section-title {
    margin: 0;
    color: var(--text-primary);
    font-size: 13px;
    font-weight: 700;
    display: inline-flex;
    align-items: center;
    gap: 8px;
}

.section-title::before {
    content: '';
    width: 3px;
    height: 14px;
    border-radius: 999px;
    background: var(--brand-primary);
}

.section-state {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    min-height: 22px;
    padding: 0 8px;
    border-radius: 999px;
    background: rgba(var(--brand-primary-rgb), 0.08);
    color: var(--text-brand-dark);
    font-size: 10.5px;
    font-weight: 700;
    white-space: nowrap;
}

.section-state i {
    color: var(--brand-primary);
    font-size: 10px;
}

.section-state.dirty {
    background: rgba(var(--warning-rgb), 0.12);
    color: #735100;
}

.section-state.dirty i {
    color: var(--warning);
    font-size: 7px;
}

.section-state.instant i {
    color: var(--brand-primary);
}

.pref-list {
    display: flex;
    flex-direction: column;
    gap: 7px;
}

.pref-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 166px;
    align-items: center;
    gap: 12px;
    min-height: 58px;
    padding: 9px 10px;
    border: 1px solid rgba(0, 0, 0, 0.06);
    border-radius: 8px;
    background: var(--bg-primary);
    box-shadow: 0 1px 3px rgba(34, 50, 38, 0.035);
}

.pref-copy {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 3px;
}

.pref-title {
    min-width: 0;
    display: inline-flex;
    align-items: center;
    gap: 7px;
    color: var(--text-primary);
    font-size: 13px;
    font-weight: 700;
    line-height: 1.25;
}

.pref-title i {
    width: 14px;
    color: var(--brand-primary);
    font-size: 12px;
    text-align: center;
    flex-shrink: 0;
}

.dirty-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--warning);
    flex-shrink: 0;
}

.pref-desc {
    color: var(--text-muted);
    font-size: 11px;
    line-height: 1.35;
}

.pref-select {
    width: 100%;
    height: 32px;
    border: 1px solid var(--border-light);
    border-radius: 8px;
    background: var(--bg-secondary);
    color: var(--text-primary);
    font-size: 12px;
    padding: 0 8px;
    cursor: pointer;
    transition: border-color 0.15s ease, box-shadow 0.15s ease, background 0.15s ease;
}

.pref-select:hover:not(:disabled) {
    border-color: rgba(var(--brand-primary-rgb), 0.35);
}

.pref-select:focus {
    outline: none;
    border-color: var(--brand-primary);
    box-shadow: 0 0 0 3px rgba(var(--brand-primary-rgb), 0.1);
}

.pref-select:disabled {
    opacity: 0.6;
    cursor: not-allowed;
}

.theme-list {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
}

.theme-btn {
    min-width: 0;
    min-height: 48px;
    display: grid;
    grid-template-columns: 28px minmax(0, 1fr) 14px;
    align-items: center;
    gap: 8px;
    padding: 8px 10px;
    border: 1px solid var(--border-light);
    border-radius: 8px;
    background: var(--bg-primary);
    color: var(--text-primary);
    cursor: pointer;
    text-align: left;
    transition: border-color 0.15s ease, box-shadow 0.15s ease, background 0.15s ease;
}

.theme-btn:hover {
    border-color: rgba(var(--brand-primary-rgb), 0.35);
}

.theme-btn.selected {
    border-color: var(--brand-primary);
    background: rgba(var(--brand-primary-rgb), 0.06);
    box-shadow: 0 0 0 2px rgba(var(--brand-primary-rgb), 0.12);
}

.theme-preview {
    width: 28px;
    height: 28px;
    border-radius: 7px;
    box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.08);
}

.theme-preview-default {
    background: linear-gradient(135deg, #57b861, #2e7d32);
}

.theme-preview-blue {
    background: linear-gradient(135deg, #42a5f5, #0d47a1);
}

.theme-label {
    min-width: 0;
    color: var(--text-primary);
    font-size: 12.5px;
    font-weight: 700;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.theme-btn i {
    color: var(--brand-primary);
    font-size: 12px;
}

.third-party-note {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 38px;
    padding: 7px 9px;
    border: 1px solid rgba(var(--info-rgb), 0.2);
    border-radius: 8px;
    background: rgba(var(--info-rgb), 0.06);
    color: var(--text-secondary);
    font-size: 11px;
    line-height: 1.35;
}

.third-party-note img {
    width: 24px;
    height: 24px;
    border-radius: 50%;
    object-fit: cover;
    flex-shrink: 0;
    background: #fff;
}

.avatar-grid {
    display: grid;
    grid-template-columns: repeat(6, minmax(0, 1fr));
    gap: 7px;
}

.avatar-btn {
    position: relative;
    aspect-ratio: 1;
    padding: 2px;
    border: 2px solid transparent;
    border-radius: 50%;
    background: transparent;
    cursor: pointer;
    transition: border-color 0.15s ease, box-shadow 0.15s ease, transform 0.15s ease, opacity 0.15s ease;
}

.avatar-btn img {
    width: 100%;
    height: 100%;
    border-radius: 50%;
    object-fit: cover;
    display: block;
}

.avatar-btn:hover:not(:disabled) {
    border-color: rgba(var(--brand-primary-rgb), 0.35);
    transform: translateY(-1px);
}

.avatar-btn.selected {
    border-color: var(--brand-primary);
    box-shadow: 0 0 0 3px rgba(var(--brand-primary-rgb), 0.16);
}

.avatar-btn.current:not(.selected)::before {
    content: '';
    position: absolute;
    inset: -3px;
    border: 1px dashed rgba(var(--brand-primary-rgb), 0.48);
    border-radius: 50%;
}

.avatar-btn.selected::after {
    content: '\2713';
    position: absolute;
    right: -2px;
    bottom: -2px;
    width: 15px;
    height: 15px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    background: var(--brand-primary);
    color: #fff;
    font-size: 10px;
    font-weight: 700;
    box-shadow: 0 1px 4px rgba(var(--brand-primary-rgb), 0.35);
}

.avatar-btn:disabled {
    opacity: 0.55;
    cursor: not-allowed;
}

.action-row {
    display: grid;
    grid-template-columns: minmax(0, 0.75fr) minmax(0, 1.25fr);
    gap: 8px;
}

.btn-primary,
.btn-plain {
    min-width: 0;
    height: 36px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 7px;
    border-radius: 8px;
    font-size: 12.5px;
    font-weight: 700;
    cursor: pointer;
    transition: transform 0.15s ease, filter 0.15s ease, border-color 0.15s ease, background 0.15s ease;
}

.btn-primary {
    border: none;
    background: linear-gradient(135deg, var(--brand-primary), var(--brand-primary-dark));
    color: #fff;
    box-shadow: 0 3px 10px rgba(var(--brand-primary-rgb), 0.24);
}

.btn-plain {
    border: 1px solid rgba(var(--brand-primary-rgb), 0.2);
    background: var(--bg-primary);
    color: var(--text-brand-dark);
}

.btn-primary:hover:not(:disabled) {
    filter: brightness(1.05);
    transform: translateY(-1px);
}

.btn-plain:hover:not(:disabled) {
    border-color: rgba(var(--brand-primary-rgb), 0.4);
    background: rgba(var(--brand-primary-rgb), 0.06);
}

.btn-primary:disabled,
.btn-plain:disabled {
    opacity: 0.55;
    cursor: not-allowed;
    transform: none;
}

@media (max-width: 480px) {
    .pref-row {
        grid-template-columns: 1fr;
        gap: 8px;
    }

    .theme-list,
    .action-row {
        grid-template-columns: 1fr;
    }

    .avatar-grid {
        grid-template-columns: repeat(4, minmax(0, 1fr));
    }
}
</style>
