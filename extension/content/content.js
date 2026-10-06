'use strict';
/* EEO Audit 快检 内容脚本
 * 职责单一: 把页面的 og:site_name 与标题交给弹窗
 * 页面加载即上报 background 缓存 弹窗也可随时来问
 * 不注入任何界面 不改动页面
 */
(function () {
  if (self.__EEO_CONTENT__) return;
  self.__EEO_CONTENT__ = true;

  function siteName() {
    var m = document.querySelector('meta[property="og:site_name"]') ||
            document.querySelector('meta[name="og:site_name"]') ||
            document.querySelector('meta[property="site_name"]');
    var v = m && m.getAttribute('content');
    return v ? v.trim().slice(0, 60) : '';
  }

  try {
    var sn = siteName();
    if (sn) chrome.runtime.sendMessage({ type: 'eeoSiteName', siteName: sn }, function () { void chrome.runtime.lastError; });
  } catch (e) { /* 扩展重载后旧脚本失联 属正常 */ }

  chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
    if (msg && msg.type === 'eeoGetSiteInfo') {
      sendResponse({ ok: true, siteName: siteName(), title: (document.title || '').slice(0, 120) });
    }
  });
})();
