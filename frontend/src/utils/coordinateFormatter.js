/**
 * 坐标格式化与转换工具
 * 支持多种格式：十进制、度分秒、带方向后缀（N/S/E/W）
 */

/**
 * 坐标格式配置
 */
export const COORDINATE_FORMATS = {
  format_1: {
    id: 'format_1',
    label: 'Decimal (E, N)',
    description: '十进制，经度在前 (E, N)',
    example: '114.302400, 34.814600'
  },
  format_2: {
    id: 'format_2',
    label: 'Decimal (N, E)',
    description: '十进制，纬度在前 (N, E)',
    example: '34.814600, 114.302400'
  },
  format_3: {
    id: 'format_3',
    label: 'Decimal with Direction (E, N)',
    description: '十进制带方向 (114.302400E, 34.814600N)',
    example: '114.302400E, 34.814600N'
  },
  format_4: {
    id: 'format_4',
    label: 'Decimal with Direction (N, E)',
    description: '十进制带方向，纬度在前 (34.814600N, 114.302400E)',
    example: '34.814600N, 114.302400E'
  },
  format_5: {
    id: 'format_5',
    label: 'DMS (E, N)',
    description: '度分秒，经度在前 (114°18\'08.64"E, 34°48\'52.56"N)',
    example: "114°18'08.64\"E, 34°48'52.56\"N"
  },
  format_6: {
    id: 'format_6',
    label: 'DMS (N, E)',
    description: '度分秒，纬度在前 (34°48\'52.56"N, 114°18\'08.64"E)',
    example: "34°48'52.56\"N, 114°18'08.64\"E"
  }
};

/**
 * 小数位数配置
 */
export const DECIMAL_PLACES = {
  2: { label: '2位', value: 2, example: '114.30' },
  4: { label: '4位', value: 4, example: '114.3024' },
  6: { label: '6位', value: 6, example: '114.302400' },
  8: { label: '8位', value: 8, example: '114.30240000' }
};

/**
 * 获取方向后缀（基于坐标值）
 * @param {number} value - 坐标值
 * @param {string} axis - 轴类型: 'lon' (东西经) 或 'lat' (南北纬)
 * @returns {string} 方向后缀 (E/W/N/S)
 */
export function getDirectionSuffix(value, axis = 'lon') {
  if (axis === 'lon') {
    return value >= 0 ? 'E' : 'W';
  } else {
    return value >= 0 ? 'N' : 'S';
  }
}

/**
 * 将十进制坐标转换为度分秒格式
 * @param {number} decimal - 十进制坐标值
 * @returns {Object} { degrees, minutes, seconds }
 */
export function decimalToDMS(decimal) {
  const absValue = Math.abs(decimal);
  const degrees = Math.floor(absValue);
  const minutesFull = (absValue - degrees) * 60;
  const minutes = Math.floor(minutesFull);
  const seconds = (minutesFull - minutes) * 60;

  return {
    degrees,
    minutes,
    seconds: parseFloat(seconds.toFixed(2))
  };
}

/**
 * 将度分秒转换为十进制坐标
 * @param {number} degrees - 度
 * @param {number} minutes - 分
 * @param {number} seconds - 秒
 * @param {string} direction - 方向 (E/W/N/S)
 * @returns {number} 十进制坐标值
 */
export function dmsToDecimal(degrees, minutes, seconds, direction) {
  let decimal = degrees + minutes / 60 + seconds / 3600;
  if (direction === 'W' || direction === 'S') {
    decimal = -decimal;
  }
  return decimal;
}

/**
 * 格式化单个坐标值为字符串
 * @param {number} value - 坐标值
 * @param {string} format - 格式类型 ('decimal' 或 'dms')
 * @param {number} decimalPlaces - 小数位数
 * @param {string} axis - 轴类型 ('lon' 或 'lat')
 * @returns {string} 格式化后的字符串
 */
export function formatSingleCoordinate(value, format = 'decimal', decimalPlaces = 6, axis = 'lon') {
  if (!Number.isFinite(value)) return '';

  const absValue = Math.abs(value);
  const direction = getDirectionSuffix(value, axis);

  if (format === 'dms') {
    const { degrees, minutes, seconds } = decimalToDMS(absValue);
    return `${degrees}°${minutes}'${seconds.toFixed(2)}"${direction}`;
  } else {
    // decimal
    return `${absValue.toFixed(decimalPlaces)}${direction}`;
  }
}

/**
 * 格式化坐标对为字符串
 * @param {number} lng - 经度
 * @param {number} lat - 纬度
 * @param {string} formatId - 格式ID (format_1 到 format_6)
 * @param {number} decimalPlaces - 小数位数
 * @returns {string} 格式化后的坐标字符串
 */
export function formatCoordinate(lng, lat, formatId = 'format_1', decimalPlaces = 6) {
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return '';

  const absLng = Math.abs(lng);
  const absLat = Math.abs(lat);
  const lngDir = getDirectionSuffix(lng, 'lon');
  const latDir = getDirectionSuffix(lat, 'lat');

  switch (formatId) {
    case 'format_1': {
      // 十进制 (E, N)
      return `${absLng.toFixed(decimalPlaces)}, ${absLat.toFixed(decimalPlaces)}`;
    }
    case 'format_2': {
      // 十进制 (N, E)
      return `${absLat.toFixed(decimalPlaces)}, ${absLng.toFixed(decimalPlaces)}`;
    }
    case 'format_3': {
      // 十进制带方向 (E, N)
      return `${absLng.toFixed(decimalPlaces)}${lngDir}, ${absLat.toFixed(decimalPlaces)}${latDir}`;
    }
    case 'format_4': {
      // 十进制带方向 (N, E)
      return `${absLat.toFixed(decimalPlaces)}${latDir}, ${absLng.toFixed(decimalPlaces)}${lngDir}`;
    }
    case 'format_5': {
      // 度分秒 (E, N)
      const lngDms = decimalToDMS(absLng);
      const latDms = decimalToDMS(absLat);
      return `${lngDms.degrees}°${lngDms.minutes}'${lngDms.seconds.toFixed(2)}"${lngDir}, ${latDms.degrees}°${latDms.minutes}'${latDms.seconds.toFixed(2)}"${latDir}`;
    }
    case 'format_6': {
      // 度分秒 (N, E)
      const lngDms = decimalToDMS(absLng);
      const latDms = decimalToDMS(absLat);
      return `${latDms.degrees}°${latDms.minutes}'${latDms.seconds.toFixed(2)}"${latDir}, ${lngDms.degrees}°${lngDms.minutes}'${lngDms.seconds.toFixed(2)}"${lngDir}`;
    }
    default:
      return `${absLng.toFixed(decimalPlaces)}, ${absLat.toFixed(decimalPlaces)}`;
  }
}

/**
 * 解析坐标字符串，返回 { lng, lat }
 * 支持多种格式的自动识别：
 * - "114.302, 34.814" (十进制)
 * - "114.302E, 34.814N" (带方向)
 * - "114°18'08.64\"E, 34°48'52.56\"N" (度分秒)
 * - 以及纬度在前的各种格式
 * - 中文逗号
 * 
 * @param {string} input - 坐标字符串
 * @param {string} formatId - 当前显示格式ID，用于判断纯十进制坐标的顺序 (可选)
 *   - format_1, format_3, format_5: 经度在前
 *   - format_2, format_4, format_6: 纬度在前
 * @returns {Object|null} { lng, lat } 或 null (解析失败)
 */
export function parseCoordinate(input, formatId = null) {
  if (!input || typeof input !== 'string') return null;

  // 标准化：中文逗号替换为英文逗号
  let normalized = String(input).trim().replace(/，/g, ',');

  // ========== 第一种格式：度分秒 ==========
  // 匹配格式如：114°18'08.64"E, 34°48'52.56"N
  const dmsPattern = /(\d+)°(\d+)'([\d.]+)"([EWNS])\s*,\s*(\d+)°(\d+)'([\d.]+)"([EWNS])/i;
  const dmsMatch = normalized.match(dmsPattern);
  if (dmsMatch) {
    const [, d1, m1, s1, dir1, d2, m2, s2, dir2] = dmsMatch;
    const value1 = dmsToDecimal(Number(d1), Number(m1), Number(s1), dir1.toUpperCase());
    const value2 = dmsToDecimal(Number(d2), Number(m2), Number(s2), dir2.toUpperCase());

    // 判断哪个是经度，哪个是纬度
    const isFirst1EW = ['E', 'W'].includes(dir1.toUpperCase());
    if (isFirst1EW) {
      return { lng: value1, lat: value2 };
    } else {
      return { lng: value2, lat: value1 };
    }
  }

  // ========== 第二种格式：十进制带方向 ==========
  // 匹配格式如：114.302E, 34.814N 或 34.814N, 114.302E
  const decimalDirPattern = /([-+]?[\d.]+)([EWNS])\s*,\s*([-+]?[\d.]+)([EWNS])/i;
  const decimalDirMatch = normalized.match(decimalDirPattern);
  if (decimalDirMatch) {
    const [, val1, dir1, val2, dir2] = decimalDirMatch;
    const num1 = Number(val1);
    const num2 = Number(val2);

    if (!Number.isFinite(num1) || !Number.isFinite(num2)) return null;

    const v1 = dmsToDecimal(0, 0, num1, dir1.toUpperCase());
    const v2 = dmsToDecimal(0, 0, num2, dir2.toUpperCase());

    // 判断哪个是经度，哪个是纬度（基于方向）
    const isFirst1EW = ['E', 'W'].includes(dir1.toUpperCase());
    if (isFirst1EW) {
      // 第一个是经度
      return { lng: v1, lat: v2 };
    } else {
      // 第一个是纬度
      return { lng: v2, lat: v1 };
    }
  }

  // ========== 第三种格式：纯十进制 ==========
  // 匹配格式如：114.302, 34.814
  const decimalPattern = /([-+]?[\d.]+)\s*,\s*([-+]?[\d.]+)/;
  const decimalMatch = normalized.match(decimalPattern);
  if (decimalMatch) {
    const [, val1, val2] = decimalMatch;
    const num1 = Number(val1);
    const num2 = Number(val2);

    if (!Number.isFinite(num1) || !Number.isFinite(num2)) return null;

    // 验证坐标的范围
    // 经度范围：-180 到 180
    // 纬度范围：-90 到 90
    const isValid1EW = Math.abs(num1) <= 180;
    const isValid1NS = Math.abs(num1) <= 90;
    const isValid2EW = Math.abs(num2) <= 180;
    const isValid2NS = Math.abs(num2) <= 90;

    // ===== 优先级 1：如果指定了格式，完全信任格式指示，不进行自动判断 =====
    if (formatId) {
      const isLatFirst = ['format_2', 'format_4', 'format_6'].includes(formatId);
      
      if (isLatFirst) {
        // 纬度-经度格式（N, E）：第一个数是纬度，第二个数是经度
        // 只要两个值都在各自的有效范围内，就返回
        if (isValid1NS && isValid2EW) {
          return { lng: num2, lat: num1 };
        }
      } else {
        // 经度-纬度格式（E, N）：第一个数是经度，第二个数是纬度
        // 只要两个值都在各自的有效范围内，就返回
        if (isValid1EW && isValid2NS) {
          return { lng: num1, lat: num2 };
        }
      }
      
      // 如果格式指示的范围检查失败，仍然尝试按格式返回
      // 这样可以处理 51.901927 > 90 但被指定为纬度第二项的情况
      // 原则：信任用户的格式选择
      return isLatFirst ? { lng: num2, lat: num1 } : { lng: num1, lat: num2 };
    }

    // ===== 优先级 2：没有格式指示时，进行自动判断 =====
    // 首选：num1 是经度(> 90)，num2 是纬度(<= 90)
    if (isValid1EW && isValid2NS && Math.abs(num1) > 90) {
      return { lng: num1, lat: num2 };
    }

    // 次选：num1 是纬度(<= 90)，num2 是经度(> 90)
    if (isValid1NS && isValid2EW && Math.abs(num2) > 90) {
      return { lng: num2, lat: num1 };
    }

    // 都在范围内：默认经度在前
    if (isValid1EW && isValid2NS) {
      return { lng: num1, lat: num2 };
    }

    return null;
  }

  return null;
}

/**
 * 验证经纬度是否在合法范围内
 * @param {number} lng - 经度
 * @param {number} lat - 纬度
 * @returns {boolean}
 */
export function isValidCoordinate(lng, lat) {
  return (
    Number.isFinite(lng) &&
    Number.isFinite(lat) &&
    lng >= -180 &&
    lng <= 180 &&
    lat >= -90 &&
    lat <= 90
  );
}

/**
 * 规范化坐标到合法范围
 * @param {number} lng - 经度
 * @param {number} lat - 纬度
 * @returns {Object} { lng, lat } 规范化后的坐标
 */
export function normalizeCoordinate(lng, lat) {
  // 纬度限制在 -90 到 90
  let normalizedLat = lat;
  if (normalizedLat > 90) {
    normalizedLat = 180 - normalizedLat;
  } else if (normalizedLat < -90) {
    normalizedLat = -180 - normalizedLat;
  }

  // 经度限制在 -180 到 180（通过循环移位）
  let normalizedLng = lng;
  while (normalizedLng > 180) {
    normalizedLng -= 360;
  }
  while (normalizedLng < -180) {
    normalizedLng += 360;
  }

  return { lng: normalizedLng, lat: normalizedLat };
}
