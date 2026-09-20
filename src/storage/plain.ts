/**
 * 写 IndexedDB 前的「纯对象化」
 *
 * 🔴 **这个函数不能省**（2026-09-20 实测踩坑）：
 * Vue 的 `ref` / `reactive` 会给对象套一层 **Proxy**，而 IndexedDB 用
 * 结构化克隆（structured clone）序列化 —— **Proxy 不可克隆**：
 *
 *     DataCloneError: Failed to execute 'put' on 'IDBObjectStore':
 *     #<Object> could not be cloned
 *
 * `toRaw()` 只解一层（嵌套的数组/对象仍然是 Proxy），所以这里用 JSON 往返做**深**拷贝。
 * 存进库的都是纯数据（字符串 / 数字 / 数组 / 普通对象），没有 Date、Map、函数，
 * JSON 往返不会丢东西。
 *
 * 放在存储层而不是调用方：这是**存储的边界**，不该让每个调用方都记得去 Proxy 化。
 */
export function plain<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}
