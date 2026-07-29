import { BUNDLED_SHADERS } from "./shaders/bundledShaders.js";

/**
 * 加载 shader 源码：优先使用内联 bundle，否则 fetch 远程/本地 URL。
 * @param {string} name - 如 "bruneton/definitions.glsl"
 * @param {object} [options]
 * @param {Record<string, string>} [options.bundledShaders]
 * @param {string} [options.shaderBaseUrl]
 * @returns {Promise<string>}
 */
export function loadShaderSource(name, options = {}) {
  const bundled = options.bundledShaders ?? BUNDLED_SHADERS;

  const candidates = [name];
  if (!name.includes("/")) {
    candidates.push(`bruneton/${name}`);
  }

  for (const key of candidates) {
    if (bundled?.[key]) {
      return Promise.resolve(bundled[key]);
    }
  }

  const baseUrl = options.shaderBaseUrl;
  if (!baseUrl) {
    return Promise.reject(
      new Error(`Shader "${name}" not found in bundle and no shaderBaseUrl provided`)
    );
  }

  const url = baseUrl.replace(/\/?$/, "/") + name;
  return fetch(url).then((r) => {
    if (!r.ok) throw new Error(`Failed to load ${name}: ${r.status} (${url})`);
    return r.text();
  }).then((text) => {
    if (text.trimStart().startsWith("<!")) {
      throw new Error(`Shader ${name} returned HTML, not GLSL: ${url}`);
    }
    return text;
  });
}

export { BUNDLED_SHADERS };
