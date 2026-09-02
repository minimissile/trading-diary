/** Vite 开发态（渲染进程）。用于降低 HMR 重载时的重复请求与启动动画。 */
export const IS_RENDERER_DEV = import.meta.env.DEV;
