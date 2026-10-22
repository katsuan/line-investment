// だれが呼んでいるかを確かめる（docs/security.md の G3・G4）

// LIFF の画面のチャネル ID（LIFF ID の「-」より前）。LIFF ID は画面にも置いてある、公開してよい値
const DEFAULT_LIFF_CHANNEL_ID_ = '2011004889';
const LINE_GROUP_ID_PATTERN_ = /^C[0-9a-f]{32}$/;
// 銘柄コード（「7203」「AAPL」。画面の検索では「AAPL:NASDAQ」のように市場を付けてもよい）
const TICKER_CODE_PATTERN_ = /^[A-Z0-9.-]{1,10}(:[A-Z]{2,10})?$/;
const LIFF_AUTH_CACHE_SECONDS_ = 600;
const GROUP_MEMBER_CACHE_SECONDS_ = 600;

function getLiffChannelId_() {
  return String(getScriptProperty_('LIFF_CHANNEL_ID') || DEFAULT_LIFF_CHANNEL_ID_).trim();
}

// LINE の Webhook：WEBHOOK_KEY を決めているときは、URL の ?key= が同じものだけ受けつける
function isWebhookKeyAccepted_(request) {
  const expected = String(getScriptProperty_('WEBHOOK_KEY') || '');
  if (!expected) {
    return true; // まだ決めていない（使う前の確かめ qCheckAll で ❌ が出る）
  }
  const given = String((request && request.parameter && request.parameter.key) || '');
  return constantTimeEquals_(given, expected);
}

function constantTimeEquals_(a, b) {
  const x = String(a);
  const y = String(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i += 1) {
    diff |= (x.charCodeAt(i) || 0) ^ (y.charCodeAt(i) || 0);
  }
  return diff === 0;
}

// 画面からの呼び出しの本人を、LINE に確かめて決める。画面から送られた userId は使わない。
// わからないときは ''。
function resolveLiffRequestUserId_(params) {
  const idToken = String((params && params.idToken) || '').trim();
  const accessToken = String((params && params.accessToken) || '').trim();
  if (idToken && idToken.length <= 4096) {
    return rememberVerifiedToken_(idToken, verifyLiffIdToken_);
  }
  if (accessToken && accessToken.length <= 1024) {
    return rememberVerifiedToken_(accessToken, verifyLiffAccessToken_);
  }
  return '';
}

// 同じ印は10分のあいだ確かめなおさない（返事を速くする）。印そのものは残さず、ハッシュで覚える
function rememberVerifiedToken_(token, verify) {
  const cache = CacheService.getScriptCache();
  const cacheKey = 'liff_auth_' + sha256Hex_(token).slice(0, 40);
  const cached = cache.get(cacheKey);
  if (cached) {
    return cached;
  }
  const result = verify(token);
  if (!result || !result.userId) {
    return '';
  }
  const seconds = Math.max(0, Math.min(LIFF_AUTH_CACHE_SECONDS_, Math.floor(result.expiresIn || 0)));
  if (seconds > 30) {
    cache.put(cacheKey, result.userId, seconds);
  }
  return result.userId;
}

function verifyLiffIdToken_(idToken) {
  const response = UrlFetchApp.fetch('https://api.line.me/oauth2/v2.1/verify', {
    method: 'post',
    payload: { id_token: idToken, client_id: getLiffChannelId_() },
    muteHttpExceptions: true,
  });
  if (response.getResponseCode() !== 200) {
    return null;
  }
  const body = parseJsonSafely_(response.getContentText());
  if (!body || !body.sub || String(body.aud || getLiffChannelId_()) !== getLiffChannelId_()) {
    return null;
  }
  return { userId: String(body.sub), expiresIn: Number(body.exp || 0) - Date.now() / 1000 };
}

function verifyLiffAccessToken_(accessToken) {
  const verifyResponse = UrlFetchApp.fetch(
    'https://api.line.me/oauth2/v2.1/verify?access_token=' + encodeURIComponent(accessToken),
    { method: 'get', muteHttpExceptions: true }
  );
  if (verifyResponse.getResponseCode() !== 200) {
    return null;
  }
  const verified = parseJsonSafely_(verifyResponse.getContentText());
  if (!verified || String(verified.client_id || '') !== getLiffChannelId_() || !(Number(verified.expires_in) > 0)) {
    return null;
  }
  const profileResponse = UrlFetchApp.fetch('https://api.line.me/v2/profile', {
    method: 'get',
    headers: { Authorization: 'Bearer ' + accessToken },
    muteHttpExceptions: true,
  });
  if (profileResponse.getResponseCode() !== 200) {
    return null;
  }
  const profile = parseJsonSafely_(profileResponse.getContentText());
  if (!profile || !profile.userId) {
    return null;
  }
  return { userId: String(profile.userId), expiresIn: Number(verified.expires_in) };
}

// そのグループにいまいる人か（LINE に聞く。10分は覚える）
function isLineGroupMember_(groupId, userId) {
  if (!groupId || !userId) {
    return false;
  }
  const cache = CacheService.getScriptCache();
  const cacheKey = 'member_' + sha256Hex_(groupId + '|' + userId).slice(0, 40);
  if (cache.get(cacheKey) === '1') {
    return true;
  }
  try {
    getGroupMemberProfile_(groupId, userId);
  } catch (error) {
    return false;
  }
  cache.put(cacheKey, '1', GROUP_MEMBER_CACHE_SECONDS_);
  return true;
}

function isValidLineGroupId_(groupId) {
  return LINE_GROUP_ID_PATTERN_.test(String(groupId || ''));
}

function isValidTickerCode_(ticker) {
  return TICKER_CODE_PATTERN_.test(String(ticker || ''));
}

function parseJsonSafely_(text) {
  try {
    return JSON.parse(text);
  } catch (error) {
    return null;
  }
}

function sha256Hex_(text) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(text), Utilities.Charset.UTF_8)
    .map(function(byte) {
      const value = (byte + 256) % 256;
      return (value < 16 ? '0' : '') + value.toString(16);
    })
    .join('');
}

// 記録に残すときの LINE のユーザー ID（そのままは残さない。S2）
function maskLineUserId_(userId) {
  const text = String(userId || '');
  return text ? 'u:' + sha256Hex_(text).slice(0, 12) : '';
}

function maskLineUserIdsInText_(text) {
  return String(text || '').replace(/U[0-9a-f]{32}/g, function(matched) {
    return maskLineUserId_(matched);
  });
}
