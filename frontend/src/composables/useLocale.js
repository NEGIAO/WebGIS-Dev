import { computed, ref } from 'vue';

const LANGUAGE_STORAGE_KEY = 'webgis_pref_language';

const messages = {
    'zh-CN': {
        common: {
            user: '用户',
            save: '保存',
            restore: '恢复',
            saved: '已保存',
            saving: '保存中',
            syncing: '同步中',
            fullscreen: '全屏展开',
            exitFullscreen: '退出全屏',
            refresh: '刷新数据',
            logout: '退出系统',
            safeLogout: '安全退出',
        },
        account: {
            title: '账号中心',
            accountOf: '账号：{name}',
            tabs: {
                overview: '总览',
                security: '安全',
                admin: '管理',
                api: 'API',
                preferences: '偏好',
            },
            roles: {
                admin: '管理员',
                super_admin: '管理员',
                registered: '注册用户',
                guest: '游客',
                unknown: '未知角色',
            },
            quotaUnlimited: '已调用 {used} 次 / 不限额',
            quotaLimited: '已调用 {used}/{limit} 次',
            quotaShortUnlimited: '配额不限',
            quotaShortRemaining: '配额余 {remaining}',
            onlineFor: '在线 {duration}',
            usersOnline: '{count} 人在线',
            duration: {
                day: '{day}天 {hour}小时 {minute}分钟',
                hour: '{hour}小时 {minute}分钟 {second}秒',
                minute: '{minute}分钟 {second}秒',
                second: '{second}秒',
            },
            messages: {
                refreshed: '账号中心数据已刷新',
                centerLoadFailed: '用户中心数据加载失败',
                realtimeLoadFailed: '实时统计刷新失败',
                oauthLoadFailed: '第三方账号绑定状态加载失败',
                oauthEntryFailed: '第三方账号绑定入口生成失败',
                oauthUnlinked: '第三方账号已解绑',
                oauthUnlinkFailed: '第三方账号解绑失败',
                prefsLoadFailed: '偏好设置加载失败',
                modelsLoadFailed: '模型列表加载失败',
                prefsSaved: '偏好设置已保存',
                prefsSaveFailed: '偏好设置保存失败',
                loggedOut: '已退出登录',
                passwordRequired: '请完整填写密码信息',
                passwordChanged: '密码已修改，请重新登录',
                passwordChangeFailed: '密码修改失败，请稍后重试',
                displayNameRequired: '请填写昵称',
                displayNameUpdated: '昵称已更新',
                displayNameUpdateFailed: '昵称更新失败，请稍后重试',
                avatarUpdated: '头像已更新',
                avatarUpdateFailed: '头像更新失败，请稍后重试',
                messageRequired: '留言内容不能为空',
                messagePosted: '留言已发布',
                messagePostFailed: '留言发布失败',
            },
        },
        preferences: {
            languages: {
                zh: '简体中文',
                en: 'English',
            },
            units: {
                metric: '公制 (m / km)',
                imperial: '英制 (ft / mi)',
            },
            themes: {
                default: '默认绿',
                blue: '海洋蓝',
            },
            status: {
                dirty: '有未保存修改',
                thirdPartyAvatar: '第三方头像',
                avatarDirty: '头像未保存',
                currentAvatar: '当前头像',
                instant: '即时生效',
            },
            settingsTitle: '偏好设置',
            defaultBasemap: '默认底图',
            defaultBasemapDesc: '刷新或下次进入地图时应用。',
            followSystem: '跟随系统默认',
            outsideList: '{value}（当前列表外）',
            language: '界面语言',
            languageDesc: '切换后账号中心界面会立即更新。',
            unitSystem: '单位制',
            unitSystemDesc: '测量、路线和导航距离会读取它。',
            agentModel: 'Agent 模型',
            agentModelDesc: '可用时优先使用，不可用时自动回退。',
            autoDispatch: '自动调度',
            savePrefs: '保存偏好',
            saving: '保存中...',
            themeTitle: '外观主题',
            avatarTitle: '个人头像',
            thirdPartyNote: '当前显示第三方账号头像，保存预设头像后会替换。',
            thirdPartyAlt: '第三方账号头像',
            avatarGroupLabel: '选择预设头像',
            avatarSelectLabel: '选择头像 {index}',
            avatarAlt: '头像 {index}',
            saveAvatar: '保存头像',
        },
        security: {
            guestWarning: '游客账号不支持修改密码，请注册正式账号享受完整功能。',
            adminWarning: '管理员密码优先由 SUPER_USER 控制（本地未配置时默认 123456），不支持在线修改。',
            displayNameTitle: '账号昵称',
            displayNamePlaceholder: '输入新昵称',
            saveDisplayName: '保存昵称',
            submitting: '正在提交...',
            oauthTitle: '第三方账号绑定',
            oauthDesc: '已注册邮箱用户可绑定 Google 或 GitHub，后续可一键登录同一个 WebGIS 账号。',
            bindProvider: '绑定 {provider}',
            unlinkProvider: '解绑 {provider}',
            confirmUnlink: '再点一次确认解绑 {provider}',
            bound: '已绑定',
            passwordTitle: '修改密码',
            currentPassword: '当前密码',
            newPassword: '新密码 (至少6位)',
            confirmPassword: '确认新密码',
            hidePassword: '隐藏密码',
            showPassword: '显示密码',
            strength: '强度：{level}',
            strengthLevels: {
                weak: '弱',
                medium: '中',
                strong: '强',
            },
            savePassword: '保存新密码',
            errors: {
                required: '请完整填写密码信息',
                mismatch: '两次输入的新密码不一致',
                minLength: '新密码长度至少为 6 位',
            },
        },
        overview: {
            loginCount: '登录次数',
            visitCount: '访问次数',
            apiCalls: 'API 调用',
            quotaToday: '今日 AI 配额',
            myAccount: '我的账号',
            accompaniedDays: '已陪伴 {days} 天',
            registeredAt: '注册时间',
            lastLogin: '上次登录',
            currentSession: '本次在线',
            currentStatus: '当前状态',
            online: '在线',
            realtime: '全站实时',
            onlineUsers: '在线用户',
            registeredUsers: '注册用户',
            totalVisits: '总浏览量',
            totalApiCalls: '总 API 调用',
            adminContact: '管理员联系',
            copied: '已复制',
            clickToCopy: '点击复制',
            notConfigured: '未配置',
            messages: '用户留言',
            messagePlaceholder: '输入你的建议或反馈，发布后所有用户可见',
            posting: '发布中...',
            postMessage: '发布留言',
            emptyMessages: '暂无留言，来发第一条吧',
            anonymous: '匿名',
            anonymousInitial: '匿',
            justNow: '刚刚',
            minutesAgo: '{count} 分钟前',
            hoursAgo: '{count} 小时前',
            yesterday: '昨天',
        },
    },
    'en-US': {
        common: {
            user: 'User',
            save: 'Save',
            restore: 'Restore',
            saved: 'Saved',
            saving: 'Saving',
            syncing: 'Syncing',
            fullscreen: 'Fullscreen',
            exitFullscreen: 'Exit fullscreen',
            refresh: 'Refresh data',
            logout: 'Sign out',
            safeLogout: 'Sign out safely',
        },
        account: {
            title: 'Account Center',
            accountOf: 'Account: {name}',
            tabs: {
                overview: 'Overview',
                security: 'Security',
                admin: 'Admin',
                api: 'API',
                preferences: 'Preferences',
            },
            roles: {
                admin: 'Admin',
                super_admin: 'Admin',
                registered: 'Registered',
                guest: 'Guest',
                unknown: 'Unknown role',
            },
            quotaUnlimited: '{used} calls / unlimited',
            quotaLimited: '{used}/{limit} calls',
            quotaShortUnlimited: 'Unlimited quota',
            quotaShortRemaining: '{remaining} left',
            onlineFor: 'Online {duration}',
            usersOnline: '{count} online',
            duration: {
                day: '{day}d {hour}h {minute}m',
                hour: '{hour}h {minute}m {second}s',
                minute: '{minute}m {second}s',
                second: '{second}s',
            },
            messages: {
                refreshed: 'Account data refreshed',
                centerLoadFailed: 'Failed to load account center data',
                realtimeLoadFailed: 'Failed to refresh realtime stats',
                oauthLoadFailed: 'Failed to load linked account status',
                oauthEntryFailed: 'Failed to create linked account entry',
                oauthUnlinked: 'Third-party account unlinked',
                oauthUnlinkFailed: 'Failed to unlink third-party account',
                prefsLoadFailed: 'Failed to load preferences',
                modelsLoadFailed: 'Failed to load model list',
                prefsSaved: 'Preferences saved',
                prefsSaveFailed: 'Failed to save preferences',
                loggedOut: 'Signed out',
                passwordRequired: 'Please fill in all password fields',
                passwordChanged: 'Password changed. Please sign in again',
                passwordChangeFailed: 'Failed to change password. Please try again later',
                displayNameRequired: 'Please enter a display name',
                displayNameUpdated: 'Display name updated',
                displayNameUpdateFailed: 'Failed to update display name. Please try again later',
                avatarUpdated: 'Avatar updated',
                avatarUpdateFailed: 'Failed to update avatar. Please try again later',
                messageRequired: 'Message cannot be empty',
                messagePosted: 'Message posted',
                messagePostFailed: 'Failed to post message',
            },
        },
        preferences: {
            languages: {
                zh: '简体中文',
                en: 'English',
            },
            units: {
                metric: 'Metric (m / km)',
                imperial: 'Imperial (ft / mi)',
            },
            themes: {
                default: 'Default Green',
                blue: 'Ocean Blue',
            },
            status: {
                dirty: 'Unsaved changes',
                thirdPartyAvatar: 'Third-party avatar',
                avatarDirty: 'Avatar unsaved',
                currentAvatar: 'Current avatar',
                instant: 'Instant',
            },
            settingsTitle: 'Preferences',
            defaultBasemap: 'Default Basemap',
            defaultBasemapDesc: 'Applied after refresh or next map entry.',
            followSystem: 'Use system default',
            outsideList: '{value} (not in current list)',
            language: 'Interface Language',
            languageDesc: 'Used for the page language and translated account UI.',
            unitSystem: 'Units',
            unitSystemDesc: 'Used by measuring, routing, and navigation distance.',
            agentModel: 'Agent Model',
            agentModelDesc: 'Preferred when available; otherwise falls back automatically.',
            autoDispatch: 'Auto dispatch',
            savePrefs: 'Save preferences',
            saving: 'Saving...',
            themeTitle: 'Theme',
            avatarTitle: 'Avatar',
            thirdPartyNote: 'A third-party avatar is currently shown. Saving a preset avatar will replace it.',
            thirdPartyAlt: 'Third-party account avatar',
            avatarGroupLabel: 'Choose a preset avatar',
            avatarSelectLabel: 'Choose avatar {index}',
            avatarAlt: 'Avatar {index}',
            saveAvatar: 'Save avatar',
        },
        security: {
            guestWarning: 'Guest accounts cannot change passwords. Please register a full account.',
            adminWarning: 'Admin passwords are controlled by SUPER_USER first. Online password changes are not supported.',
            displayNameTitle: 'Display Name',
            displayNamePlaceholder: 'Enter a new display name',
            saveDisplayName: 'Save display name',
            submitting: 'Submitting...',
            oauthTitle: 'Linked Accounts',
            oauthDesc: 'Registered email users can link Google or GitHub and sign in to the same WebGIS account later.',
            bindProvider: 'Link {provider}',
            unlinkProvider: 'Unlink {provider}',
            confirmUnlink: 'Click again to unlink {provider}',
            bound: 'Linked',
            passwordTitle: 'Change Password',
            currentPassword: 'Current password',
            newPassword: 'New password (at least 6 characters)',
            confirmPassword: 'Confirm new password',
            hidePassword: 'Hide password',
            showPassword: 'Show password',
            strength: 'Strength: {level}',
            strengthLevels: {
                weak: 'Weak',
                medium: 'Medium',
                strong: 'Strong',
            },
            savePassword: 'Save new password',
            errors: {
                required: 'Please fill in all password fields',
                mismatch: 'The two new passwords do not match',
                minLength: 'New password must be at least 6 characters',
            },
        },
        overview: {
            loginCount: 'Logins',
            visitCount: 'Visits',
            apiCalls: 'API Calls',
            quotaToday: 'Today AI Quota',
            myAccount: 'My Account',
            accompaniedDays: '{days} days here',
            registeredAt: 'Registered',
            lastLogin: 'Last Login',
            currentSession: 'This Session',
            currentStatus: 'Status',
            online: 'Online',
            realtime: 'Realtime',
            onlineUsers: 'Online Users',
            registeredUsers: 'Registered Users',
            totalVisits: 'Total Visits',
            totalApiCalls: 'Total API Calls',
            adminContact: 'Admin Contact',
            copied: 'Copied',
            clickToCopy: 'Click to copy',
            notConfigured: 'Not configured',
            messages: 'Messages',
            messagePlaceholder: 'Enter suggestions or feedback. It will be visible to all users.',
            posting: 'Posting...',
            postMessage: 'Post message',
            emptyMessages: 'No messages yet. Be the first to post.',
            anonymous: 'Anonymous',
            anonymousInitial: 'A',
            justNow: 'Just now',
            minutesAgo: '{count} min ago',
            hoursAgo: '{count} h ago',
            yesterday: 'Yesterday',
        },
    },
};

function readInitialLanguage() {
    try {
        return normalizeLocaleLanguage(localStorage.getItem(LANGUAGE_STORAGE_KEY));
    } catch {
        return 'zh-CN';
    }
}

const currentLanguage = ref(readInitialLanguage());

export function normalizeLocaleLanguage(value) {
    const compact = String(value || '')
        .trim()
        .toLowerCase()
        .replace('_', '-');
    return compact === 'en-us' ? 'en-US' : 'zh-CN';
}

export function setLocaleLanguage(value) {
    currentLanguage.value = normalizeLocaleLanguage(value);
    if (typeof document !== 'undefined') {
        document.documentElement.lang = currentLanguage.value;
    }
    return currentLanguage.value;
}

function getMessage(path) {
    const keys = String(path || '').split('.').filter(Boolean);
    const pick = (lang) => keys.reduce((node, key) => node?.[key], messages[lang]);
    return pick(currentLanguage.value) ?? pick('zh-CN') ?? path;
}

function interpolate(template, params = {}) {
    return String(template).replace(/\{(\w+)\}/g, (_, key) => {
        return Object.prototype.hasOwnProperty.call(params, key) ? String(params[key]) : `{${key}}`;
    });
}

export function translate(path, params) {
    return interpolate(getMessage(path), params);
}

export function useLocale() {
    return {
        language: computed(() => currentLanguage.value),
        setLanguage: setLocaleLanguage,
        t: translate,
    };
}
