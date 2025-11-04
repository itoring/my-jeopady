(function () {
  // 右上にエラー表示用の小さなパネルを作る
  var box = document.createElement('div');
  box.id = 'debug-overlay';
  box.style.cssText = [
    'position:fixed','top:8px','right:8px','z-index:99999',
    'max-width:48vw','background:#ffe9e9','color:#900',
    'border:2px solid #900','border-radius:8px',
    'padding:8px 10px','font:13px/1.4 system-ui, -apple-system, Segoe UI, Roboto, "Noto Sans JP", sans-serif',
    'display:none','white-space:pre-wrap','word-break:break-word'
  ].join(';');
  document.addEventListener('DOMContentLoaded', function(){ document.body.appendChild(box); });

  function show(msg) {
    box.textContent = '[Error] ' + msg;
    box.style.display = 'block';
  }

  // 同期エラー
  window.addEventListener('error', function (e) {
    var where = e.filename ? (' @ ' + e.filename + ':' + e.lineno + ':' + e.colno) : '';
    show((e.message || 'Unknown error') + where);
  });

  // 非同期（Promise）エラー
  window.addEventListener('unhandledrejection', function (e) {
    var msg = (e.reason && (e.reason.message || e.reason)) || 'Unhandled rejection';
    show(String(msg));
  });

  // “スクリプト自体が読み込まれているか”の生存サイン
  console.info('[debug.js] loaded');
})();
