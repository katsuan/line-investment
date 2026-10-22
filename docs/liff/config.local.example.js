// 手元で確かめるときだけ使う設定の見本。config.local.js に複製して使う（config.local.js は git に入れない）。
// 公開した画面では読まれない（localhost で開いたときだけ）。
window.APP_CONFIG = Object.assign({}, window.APP_CONFIG || {}, {
  debugGroupId: 'C0000000000000000000000000000000',
  debugUserId: 'U0000000000000000000000000000000'
});
